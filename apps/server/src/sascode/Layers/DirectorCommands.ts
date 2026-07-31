import type {
  Workflow,
  WorkUnit,
  WorkUnitAttempt,
} from "@synara/contracts";
import { Effect, Layer, Option } from "effect";

import { DirectorEntityNotFoundError } from "../Errors.ts";
import {
  DirectorCommands,
  type DirectorCommandsShape,
  type DirectorCommandServiceError,
  type DirectorCommandResult,
} from "../Services/DirectorCommands.ts";
import { Director } from "../Services/Director.ts";
import {
  DirectorEventStore,
  type DirectorCommandCommit,
} from "../Services/DirectorEventStore.ts";
import { DirectorWorkflowRepository } from "../Services/DirectorWorkflowRepository.ts";

const makeDirectorCommands = Effect.gen(function* () {
  const director = yield* Director;
  const events = yield* DirectorEventStore;
  const repository = yield* DirectorWorkflowRepository;

  const requireWorkflow = (workflowId: Workflow["id"]) =>
    director.getWorkflow(workflowId).pipe(
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

  const result = <A>(
    committed: DirectorCommandCommit<A>,
    loadCurrent: Effect.Effect<A, DirectorCommandServiceError>,
  ): Effect.Effect<DirectorCommandResult<A>, DirectorCommandServiceError> =>
    committed.kind === "committed"
      ? Effect.succeed({
          current: committed.value,
          event: committed.event,
          replayed: false,
        })
      : loadCurrent.pipe(
          Effect.map((current) => ({
            current,
            event: committed.event,
            replayed: true,
          })),
        );

  const proposeWorkflow: DirectorCommandsShape["proposeWorkflow"] = (input) =>
    events
      .commitCommand(
        {
          context: input.context,
          projectId: input.workflow.projectId,
          aggregateKind: "workflow",
          aggregateId: input.workflow.id,
          eventType: "workflow.proposed",
          fingerprintPayload: input.workflow,
          payload: {
            workflowId: input.workflow.id,
            graphRevision: input.workflow.graphRevision,
            routingPolicyId: input.workflow.routingPolicyId,
            routingPolicyRevision: input.workflow.routingPolicyRevision,
            workUnitIds: input.workflow.workUnits.map((unit) => unit.id),
          },
        },
        director.proposeWorkflow(input.workflow),
      )
      .pipe(
        Effect.flatMap((committed) =>
          result(committed, requireWorkflow(input.workflow.id)),
        ),
      );

  const moveWorkflow: DirectorCommandsShape["moveWorkflow"] = (input) =>
    Effect.gen(function* () {
      const workflow = yield* requireWorkflow(input.workflowId);
      const committed = yield* events.commitCommand(
        {
          context: input.context,
          projectId: workflow.projectId,
          aggregateKind: "workflow",
          aggregateId: workflow.id,
          eventType: "workflow.status-changed",
          payload: {
            workflowId: workflow.id,
            nextStatus: input.nextStatus,
          },
        },
        director.moveWorkflow({
          workflowId: workflow.id,
          nextStatus: input.nextStatus,
          occurredAt: input.context.occurredAt,
        }),
      );
      return yield* result(committed, requireWorkflow(workflow.id));
    });

  const moveWorkUnit: DirectorCommandsShape["moveWorkUnit"] = (input) =>
    Effect.gen(function* () {
      const unit = yield* requireWorkUnit(input.workUnitId);
      const workflow = yield* requireWorkflow(unit.workflowId);
      const committed = yield* events.commitCommand(
        {
          context: input.context,
          projectId: workflow.projectId,
          aggregateKind: "work-unit",
          aggregateId: unit.id,
          eventType: "work-unit.status-changed",
          payload: {
            workflowId: unit.workflowId,
            workUnitId: unit.id,
            nextStatus: input.nextStatus,
          },
        },
        director.moveWorkUnit({
          workUnitId: unit.id,
          nextStatus: input.nextStatus,
          occurredAt: input.context.occurredAt,
        }),
      );
      return yield* result(committed, requireWorkUnit(unit.id));
    });

  const reconcileReadyWorkUnits: DirectorCommandsShape["reconcileReadyWorkUnits"] =
    (input) =>
      Effect.gen(function* () {
        const workflow = yield* requireWorkflow(input.workflowId);
        const committed = yield* events.commitCommand(
          {
            context: input.context,
            projectId: workflow.projectId,
            aggregateKind: "workflow",
            aggregateId: workflow.id,
            eventType: "work-units.reconciled",
            payload: {
              workflowId: workflow.id,
              passedGateKeys: [...input.passedGateKeys],
            },
          },
          director.reconcileReadyWorkUnits({
            workflowId: workflow.id,
            passedGateKeys: [...input.passedGateKeys],
            occurredAt: input.context.occurredAt,
          }),
        );
        return yield* result(
          committed,
          requireWorkflow(workflow.id).pipe(
            Effect.map((current) =>
              current.workUnits
                .filter((unit) => unit.status === "ready")
                .map((unit) => unit.id),
            ),
          ),
        );
      });

  const beginAttempt: DirectorCommandsShape["beginAttempt"] = (input) =>
    Effect.gen(function* () {
      const workflow = yield* requireWorkflow(input.attempt.workflowId);
      const committed = yield* events.commitCommand(
        {
          context: input.context,
          projectId: workflow.projectId,
          aggregateKind: "attempt",
          aggregateId: input.attempt.id,
          eventType: "attempt.started",
          fingerprintPayload: input.attempt,
          payload: {
            workflowId: input.attempt.workflowId,
            workUnitId: input.attempt.workUnitId,
            attemptId: input.attempt.id,
            attemptNumber: input.attempt.attemptNumber,
            routingDecisionId: input.attempt.routingDecisionId,
            taskContractId: input.attempt.taskContractId,
          },
        },
        director.beginAttempt(input.attempt),
      );
      return yield* result(committed, requireAttempt(input.attempt.id));
    });

  const advanceAttempt: DirectorCommandsShape["advanceAttempt"] = (input) =>
    Effect.gen(function* () {
      const attempt = yield* requireAttempt(input.attemptId);
      const workflow = yield* requireWorkflow(attempt.workflowId);
      const committed = yield* events.commitCommand(
        {
          context: input.context,
          projectId: workflow.projectId,
          aggregateKind: "attempt",
          aggregateId: attempt.id,
          eventType: "attempt.status-changed",
          payload: {
            workflowId: attempt.workflowId,
            workUnitId: attempt.workUnitId,
            attemptId: attempt.id,
            nextStatus: input.nextStatus,
            error: input.error ?? null,
          },
        },
        director.advanceAttempt({
          attemptId: attempt.id,
          nextStatus: input.nextStatus,
          error: input.error ?? null,
          occurredAt: input.context.occurredAt,
        }),
      );
      return yield* result(committed, requireAttempt(attempt.id));
    });

  const attachThread: DirectorCommandsShape["attachThread"] = (input) =>
    Effect.gen(function* () {
      const attempt = yield* requireAttempt(input.attemptId);
      const workflow = yield* requireWorkflow(attempt.workflowId);
      const committed = yield* events.commitCommand(
        {
          context: input.context,
          projectId: workflow.projectId,
          aggregateKind: "attempt",
          aggregateId: attempt.id,
          eventType: "attempt.thread-attached",
          payload: {
            workflowId: attempt.workflowId,
            workUnitId: attempt.workUnitId,
            attemptId: attempt.id,
            threadId: input.threadId,
            worktreePath: input.worktreePath ?? null,
            baselineGitRef: input.baselineGitRef ?? null,
          },
        },
        director.attachThread({
          attemptId: attempt.id,
          threadId: input.threadId,
          worktreePath: input.worktreePath ?? null,
          baselineGitRef: input.baselineGitRef ?? null,
          occurredAt: input.context.occurredAt,
        }),
      );
      return yield* result(committed, requireAttempt(attempt.id));
    });

  return {
    proposeWorkflow,
    moveWorkflow,
    moveWorkUnit,
    reconcileReadyWorkUnits,
    beginAttempt,
    advanceAttempt,
    attachThread,
  } satisfies DirectorCommandsShape;
});

export const DirectorCommandsLive = Layer.effect(
  DirectorCommands,
  makeDirectorCommands,
);
