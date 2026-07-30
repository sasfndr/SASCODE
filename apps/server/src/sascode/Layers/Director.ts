import {
  type Workflow,
  type WorkUnit,
  type WorkUnitAttempt,
  type WorkUnitAttemptStatus,
  type WorkUnitStatus,
} from "@synara/contracts";
import {
  canTransitionWorkflow,
  canTransitionWorkUnit,
  canTransitionWorkUnitAttempt,
  selectReadyWorkUnitIds,
  validateWorkflowGraph,
} from "@synara/shared/sascodeWorkflow";
import { Effect, Layer, Option } from "effect";

import {
  DirectorConcurrencyConflictError,
  DirectorEntityNotFoundError,
  DirectorIdentityConflictError,
  DirectorStateTransitionError,
  DirectorWorkflowValidationError,
} from "../Errors.ts";
import { Director, type DirectorShape } from "../Services/Director.ts";
import { DirectorWorkflowRepository } from "../Services/DirectorWorkflowRepository.ts";

const WORK_UNIT_STATUS_BY_ATTEMPT_STATUS: Readonly<
  Partial<Record<WorkUnitAttemptStatus, WorkUnitStatus>>
> = {
  dispatching: "queued",
  queued: "queued",
  running: "running",
  "waiting-approval": "waiting-approval",
  verifying: "verifying",
  succeeded: "succeeded",
  failed: "failed",
  cancelled: "cancelled",
  abandoned: "failed",
};

const isTerminalWorkUnitStatus = (status: WorkUnitStatus): boolean =>
  status === "succeeded" ||
  status === "failed" ||
  status === "cancelled" ||
  status === "skipped";

const makeDirector = Effect.gen(function* () {
  const repository = yield* DirectorWorkflowRepository;

  const requireWorkflow = (workflowId: Workflow["id"]) =>
    repository.getById({ workflowId }).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.fail(
              new DirectorEntityNotFoundError({
                entityKind: "workflow",
                entityId: workflowId,
              }),
            ),
          onSome: Effect.succeed,
        }),
      ),
    );

  const requireWorkUnit = (workUnitId: WorkUnit["id"]) =>
    repository.getWorkUnitById({ workUnitId }).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.fail(
              new DirectorEntityNotFoundError({
                entityKind: "work-unit",
                entityId: workUnitId,
              }),
            ),
          onSome: Effect.succeed,
        }),
      ),
    );

  const requireAttempt = (attemptId: WorkUnitAttempt["id"]) =>
    repository.getAttemptById({ attemptId }).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.fail(
              new DirectorEntityNotFoundError({
                entityKind: "attempt",
                entityId: attemptId,
              }),
            ),
          onSome: Effect.succeed,
        }),
      ),
    );

  const proposeWorkflow: DirectorShape["proposeWorkflow"] = (workflow) =>
    Effect.gen(function* () {
      const issues = validateWorkflowGraph(workflow);
      if (issues.length > 0) {
        return yield* new DirectorWorkflowValidationError({
          workflowId: workflow.id,
          issues: issues.map((issue) => ({
            code: issue.code,
            message: issue.message,
            workUnitIds: [...issue.workUnitIds],
          })),
        });
      }
      const inserted = yield* repository.createGraph(workflow);
      if (!inserted) {
        return yield* new DirectorIdentityConflictError({
          entityKind: "workflow",
          entityId: workflow.id,
        });
      }
      return workflow;
    });

  const moveWorkflow: DirectorShape["moveWorkflow"] = (input) =>
    Effect.gen(function* () {
      const workflow = yield* requireWorkflow(input.workflowId);
      if (!canTransitionWorkflow(workflow.status, input.nextStatus)) {
        return yield* new DirectorStateTransitionError({
          entityKind: "workflow",
          entityId: workflow.id,
          fromStatus: workflow.status,
          toStatus: input.nextStatus,
          detail: "The workflow lifecycle does not permit this transition.",
        });
      }
      const applied = yield* repository.transitionWorkflow({
        workflowId: workflow.id,
        expectedStatus: workflow.status,
        nextStatus: input.nextStatus,
        updatedAt: input.occurredAt,
        startedAt:
          input.nextStatus === "running" && workflow.startedAt == null
            ? input.occurredAt
            : undefined,
        completedAt:
          input.nextStatus === "completed" ? input.occurredAt : undefined,
      });
      if (!applied) {
        return yield* new DirectorConcurrencyConflictError({
          operation: "moveWorkflow",
          entityKind: "workflow",
          entityId: workflow.id,
        });
      }
      return yield* requireWorkflow(workflow.id);
    });

  const moveWorkUnit: DirectorShape["moveWorkUnit"] = (input) =>
    Effect.gen(function* () {
      const workUnit = yield* requireWorkUnit(input.workUnitId);
      if (!canTransitionWorkUnit(workUnit.status, input.nextStatus)) {
        return yield* new DirectorStateTransitionError({
          entityKind: "work-unit",
          entityId: workUnit.id,
          fromStatus: workUnit.status,
          toStatus: input.nextStatus,
          detail: "The work-unit lifecycle does not permit this transition.",
        });
      }
      const applied = yield* repository.transitionWorkUnit({
        workUnitId: workUnit.id,
        expectedStatus: workUnit.status,
        nextStatus: input.nextStatus,
        updatedAt: input.occurredAt,
        terminalAt: isTerminalWorkUnitStatus(input.nextStatus)
          ? input.occurredAt
          : null,
      });
      if (!applied) {
        return yield* new DirectorConcurrencyConflictError({
          operation: "moveWorkUnit",
          entityKind: "work-unit",
          entityId: workUnit.id,
        });
      }
      return yield* requireWorkUnit(workUnit.id);
    });

  const reconcileReadyWorkUnits: DirectorShape["reconcileReadyWorkUnits"] = (input) =>
    Effect.gen(function* () {
      const workflow = yield* requireWorkflow(input.workflowId);
      const readyIds = new Set(
        selectReadyWorkUnitIds(workflow, new Set(input.passedGateKeys)),
      );
      const applied = yield* Effect.forEach(
        workflow.workUnits.filter(
          (workUnit) =>
            readyIds.has(workUnit.id) &&
            (workUnit.status === "draft" ||
              workUnit.status === "waiting-dependency"),
        ),
        (workUnit) =>
          repository
            .transitionWorkUnit({
              workUnitId: workUnit.id,
              expectedStatus: workUnit.status,
              nextStatus: "ready",
              updatedAt: input.occurredAt,
              terminalAt: null,
            })
            .pipe(
              Effect.flatMap((didApply) =>
                didApply
                  ? Effect.succeed(workUnit.id)
                  : Effect.fail(
                      new DirectorConcurrencyConflictError({
                        operation: "reconcileReadyWorkUnits",
                        entityKind: "work-unit",
                        entityId: workUnit.id,
                      }),
                    ),
              ),
            ),
        { concurrency: 1 },
      );
      return applied;
    });

  const beginAttempt: DirectorShape["beginAttempt"] = (attempt) =>
    Effect.gen(function* () {
      const workUnit = yield* requireWorkUnit(attempt.workUnitId);
      if (
        workUnit.workflowId !== attempt.workflowId ||
        workUnit.status !== "routing" ||
        workUnit.activeAttemptId != null ||
        attempt.status !== "preparing"
      ) {
        return yield* new DirectorStateTransitionError({
          entityKind: "attempt",
          entityId: attempt.id,
          fromStatus: workUnit.status,
          toStatus: attempt.status,
          detail:
            "An attempt must begin in preparing state for a routing work unit with no active attempt.",
        });
      }
      const inserted = yield* repository.insertAttempt(attempt);
      if (!inserted) {
        return yield* new DirectorConcurrencyConflictError({
          operation: "beginAttempt",
          entityKind: "attempt",
          entityId: attempt.id,
        });
      }
      return yield* requireAttempt(attempt.id);
    });

  const advanceAttempt: DirectorShape["advanceAttempt"] = (input) =>
    Effect.gen(function* () {
      const attempt = yield* requireAttempt(input.attemptId);
      if (!canTransitionWorkUnitAttempt(attempt.status, input.nextStatus)) {
        return yield* new DirectorStateTransitionError({
          entityKind: "attempt",
          entityId: attempt.id,
          fromStatus: attempt.status,
          toStatus: input.nextStatus,
          detail: "The attempt lifecycle does not permit this transition.",
        });
      }
      const workUnit = yield* requireWorkUnit(attempt.workUnitId);
      const nextWorkUnitStatus = WORK_UNIT_STATUS_BY_ATTEMPT_STATUS[input.nextStatus];
      if (
        nextWorkUnitStatus !== undefined &&
        nextWorkUnitStatus !== workUnit.status &&
        !canTransitionWorkUnit(workUnit.status, nextWorkUnitStatus)
      ) {
        return yield* new DirectorStateTransitionError({
          entityKind: "work-unit",
          entityId: workUnit.id,
          fromStatus: workUnit.status,
          toStatus: nextWorkUnitStatus,
          detail: "The attempt transition cannot be mirrored into the work-unit lifecycle.",
        });
      }
      const applied = yield* repository.transitionAttempt({
        attemptId: attempt.id,
        expectedStatus: attempt.status,
        nextStatus: input.nextStatus,
        expectedWorkUnitStatus:
          nextWorkUnitStatus !== undefined && nextWorkUnitStatus !== workUnit.status
            ? workUnit.status
            : undefined,
        nextWorkUnitStatus:
          nextWorkUnitStatus !== undefined && nextWorkUnitStatus !== workUnit.status
            ? nextWorkUnitStatus
            : undefined,
        workUnitTerminalAt:
          nextWorkUnitStatus !== undefined && isTerminalWorkUnitStatus(nextWorkUnitStatus)
            ? input.occurredAt
            : null,
        startedAt:
          input.nextStatus === "running" && attempt.startedAt == null
            ? input.occurredAt
            : undefined,
        settledAt:
          input.nextStatus === "succeeded" ||
          input.nextStatus === "failed" ||
          input.nextStatus === "cancelled" ||
          input.nextStatus === "abandoned"
            ? input.occurredAt
            : null,
        error: input.error ?? null,
        updatedAt: input.occurredAt,
      });
      if (!applied) {
        return yield* new DirectorConcurrencyConflictError({
          operation: "advanceAttempt",
          entityKind: "attempt",
          entityId: attempt.id,
        });
      }
      return yield* requireAttempt(attempt.id);
    });

  const attachThread: DirectorShape["attachThread"] = (input) =>
    Effect.gen(function* () {
      yield* requireAttempt(input.attemptId);
      const attached = yield* repository.attachAttemptThread({
        attemptId: input.attemptId,
        threadId: input.threadId,
        worktreePath: input.worktreePath,
        baselineGitRef: input.baselineGitRef,
        updatedAt: input.occurredAt,
      });
      if (!attached) {
        return yield* new DirectorConcurrencyConflictError({
          operation: "attachThread",
          entityKind: "attempt",
          entityId: input.attemptId,
        });
      }
      return yield* requireAttempt(input.attemptId);
    });

  return {
    proposeWorkflow,
    getWorkflow: (workflowId) => repository.getById({ workflowId }),
    listProjectWorkflows: (projectId) => repository.listByProject({ projectId }),
    moveWorkflow,
    moveWorkUnit,
    reconcileReadyWorkUnits,
    beginAttempt,
    advanceAttempt,
    attachThread,
  } satisfies DirectorShape;
});

export const DirectorLive = Layer.effect(Director, makeDirector);
