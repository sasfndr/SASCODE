import {
  DirectorCommandId,
  ResultPacketId,
  RoutingDecisionId,
  TaskContractId,
  WorkUnitAttemptId,
  type ResolvedModelTarget,
  type WorkUnitAttempt,
  type WorkUnitExecutionBatch,
  type WorkUnitExecutionResult,
  type WorkUnitExecutionSpec,
} from "@synara/contracts";
import { Effect, Layer, Option } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";
import { WorkUnitExecutionInvariantError } from "../Errors.ts";
import { AttemptDispatcher } from "../Services/AttemptDispatcher.ts";
import { ContextEvidenceRepository } from "../Services/ContextEvidenceRepository.ts";
import { DirectorCommands } from "../Services/DirectorCommands.ts";
import { DirectorWorkflowRepository } from "../Services/DirectorWorkflowRepository.ts";
import { ExecutionPlanRepository } from "../Services/ExecutionPlanRepository.ts";
import { ModelRouter } from "../Services/ModelRouter.ts";
import { RoutingRepository } from "../Services/RoutingRepository.ts";
import { TaskContracts } from "../Services/TaskContracts.ts";
import {
  WorkUnitOrchestrator,
  type WorkUnitOrchestratorError,
  type WorkUnitOrchestratorShape,
} from "../Services/WorkUnitOrchestrator.ts";

const ACTIVE_WORK_UNIT_STATUSES = new Set([
  "routing",
  "queued",
  "running",
  "waiting-approval",
  "verifying",
]);

const ACTIVE_ATTEMPT_STATUSES = new Set([
  "preparing",
  "dispatching",
  "queued",
  "running",
  "waiting-approval",
  "verifying",
]);

const commandContext = (
  workUnitId: string,
  operation: string,
  occurredAt: string,
  actorId = "sascode-director",
) => ({
  commandId: DirectorCommandId.makeUnsafe(
    `director:${workUnitId}:${operation}`,
  ),
  actorKind: "system" as const,
  actorId,
  occurredAt,
  correlationId: `work-unit:${workUnitId}`,
  causationEventId: null,
});

const summarize = (
  results: WorkUnitExecutionBatch["results"],
): WorkUnitExecutionBatch => ({
  scanned: results.length,
  scheduled: results.filter(
    ({ result }) => result.disposition === "scheduled",
  ).length,
  active: results.filter(
    ({ result }) => result.disposition === "already-active",
  ).length,
  exhausted: results.filter(
    ({ result }) => result.disposition === "retry-exhausted",
  ).length,
  deferred: results.filter(
    ({ result }) => result.disposition === "not-ready",
  ).length,
  results,
});

const latestAttempt = (
  attempts: ReadonlyArray<WorkUnitAttempt>,
): WorkUnitAttempt | null => attempts.at(-1) ?? null;

const makeWorkUnitOrchestrator = Effect.gen(function* () {
  const dispatcher = yield* AttemptDispatcher;
  const context = yield* ContextEvidenceRepository;
  const commands = yield* DirectorCommands;
  const executionPlans = yield* ExecutionPlanRepository;
  const modelRouter = yield* ModelRouter;
  const routing = yield* RoutingRepository;
  const taskContracts = yield* TaskContracts;
  const workflows = yield* DirectorWorkflowRepository;

  const requireExecutionContext = (spec: WorkUnitExecutionSpec) =>
    Effect.gen(function* () {
      const unitOption = yield* workflows.getWorkUnitById({
        workUnitId: spec.workUnitId,
      });
      if (Option.isNone(unitOption)) {
        return yield* new WorkUnitExecutionInvariantError({
          workUnitId: spec.workUnitId,
          detail: "The work unit does not exist.",
        });
      }
      const unit = unitOption.value;
      if (unit.workflowId !== spec.workflowId) {
        return yield* new WorkUnitExecutionInvariantError({
          workUnitId: spec.workUnitId,
          detail: "The execution spec belongs to a different workflow.",
        });
      }
      const workflowOption = yield* workflows.getById({
        workflowId: unit.workflowId,
      });
      if (Option.isNone(workflowOption)) {
        return yield* new WorkUnitExecutionInvariantError({
          workUnitId: spec.workUnitId,
          detail: "The parent workflow does not exist.",
        });
      }
      return { unit, workflow: workflowOption.value };
    });

  const dependencyInputs = (spec: WorkUnitExecutionSpec) =>
    Effect.gen(function* () {
      const { workflow } = yield* requireExecutionContext(spec);
      const sourceIds = workflow.dependencies
        .filter((dependency) => dependency.toWorkUnitId === spec.workUnitId)
        .map((dependency) => dependency.fromWorkUnitId);
      const packetIds: ResultPacketId[] = [];
      const priorProviders: Array<{
        workUnitId: (typeof sourceIds)[number];
        providerKey: string;
      }> = [];

      for (const sourceId of sourceIds) {
        const sourceAttempts = yield* workflows.listAttemptsByWorkUnit({
          workUnitId: sourceId,
        });
        const settled = sourceAttempts
          .filter((attempt) => attempt.status === "succeeded")
          .at(-1);
        if (!settled) continue;
        const packet = yield* context.getResultPacketByAttempt({
          attemptId: settled.id,
        });
        if (Option.isSome(packet) && packet.value.status === "complete") {
          packetIds.push(packet.value.id);
        }
        const decision = yield* routing.getDecision({
          decisionId: settled.routingDecisionId,
        });
        if (Option.isSome(decision)) {
          priorProviders.push({
            workUnitId: sourceId,
            providerKey: decision.value.selected.providerKey,
          });
        }
      }
      return { packetIds, priorProviders };
    });

  const resolveRetryOverride = (
    attempts: ReadonlyArray<WorkUnitAttempt>,
  ): Effect.Effect<
    | {
        actor: string;
        reason: string;
        target: ResolvedModelTarget;
      }
    | undefined,
    ProjectionRepositoryError
  > =>
    Effect.gen(function* () {
      const previous = latestAttempt(attempts);
      if (previous == null || previous.status !== "failed") return undefined;
      const triedTargets = new Set<string>();
      for (const attempt of attempts) {
        const decision = yield* routing.getDecision({
          decisionId: attempt.routingDecisionId,
        });
        if (Option.isSome(decision)) {
          triedTargets.add(
            `${decision.value.selected.connectionId}\u0000${decision.value.selected.modelSlug}`,
          );
        }
      }
      const previousDecision = yield* routing.getDecision({
        decisionId: previous.routingDecisionId,
      });
      if (Option.isNone(previousDecision)) return undefined;
      const fallback = previousDecision.value.fallbackOrder.find(
        (target) =>
          !triedTargets.has(
            `${target.connectionId}\u0000${target.modelSlug}`,
          ),
      );
      return fallback === undefined
        ? undefined
        : {
            actor: "sascode-director",
            reason: `Automatic fallback after attempt ${previous.attemptNumber} failed.`,
            target: fallback,
          };
    });

  const executePersistedSpec = (
    spec: WorkUnitExecutionSpec,
    occurredAt: string,
    actorId = "sascode-director",
  ): Effect.Effect<WorkUnitExecutionResult, WorkUnitOrchestratorError> =>
    Effect.gen(function* () {
      let { unit, workflow } = yield* requireExecutionContext(spec);
      if (workflow.status === "queued") {
        workflow = (
          yield* commands.moveWorkflow({
            context: commandContext(
              spec.workUnitId,
              "workflow-start",
              occurredAt,
              actorId,
            ),
            workflowId: workflow.id,
            nextStatus: "running",
          })
        ).current;
      }
      if (workflow.status !== "running") {
        return {
          disposition: "not-ready",
          attempt: null,
        } as const;
      }

      let attempts = yield* workflows.listAttemptsByWorkUnit({
        workUnitId: unit.id,
      });
      const active = attempts.find((attempt) =>
        ACTIVE_ATTEMPT_STATUSES.has(attempt.status),
      );
      if (active) {
        if (
          active.status === "preparing" ||
          active.status === "dispatching"
        ) {
          const dispatched = yield* dispatcher.dispatch({
            attemptId: active.id,
            occurredAt,
          });
          return {
            disposition: "already-active",
            attempt: dispatched.attempt,
          } as const;
        }
        return {
          disposition: "already-active",
          attempt: active,
        } as const;
      }

      if (unit.status === "failed") {
        if (attempts.length >= spec.maxAttempts) {
          return {
            disposition: "retry-exhausted",
            attempt: latestAttempt(attempts),
          } as const;
        }
        unit = (
          yield* commands.moveWorkUnit({
            context: commandContext(
              unit.id,
              `retry-${attempts.length + 1}`,
              occurredAt,
              actorId,
            ),
            workUnitId: unit.id,
            nextStatus: "ready",
          })
        ).current;
      }

      if (unit.status === "ready") {
        const activePeerCount = workflow.workUnits.filter(
          (candidate) =>
            candidate.id !== unit.id &&
            ACTIVE_WORK_UNIT_STATUSES.has(candidate.status),
        ).length;
        if (activePeerCount >= Math.max(1, workflow.concurrencyLimit)) {
          return {
            disposition: "not-ready",
            attempt: null,
          } as const;
        }
        unit = (
          yield* commands.moveWorkUnit({
            context: commandContext(
              unit.id,
              `route-${attempts.length + 1}`,
              occurredAt,
              actorId,
            ),
            workUnitId: unit.id,
            nextStatus: "routing",
          })
        ).current;
      }
      if (unit.status !== "routing") {
        return {
          disposition: "not-ready",
          attempt: latestAttempt(attempts),
        } as const;
      }

      attempts = yield* workflows.listAttemptsByWorkUnit({
        workUnitId: unit.id,
      });
      const attemptNumber = attempts.length + 1;
      const contractId = TaskContractId.makeUnsafe(
        `task:${unit.id}:r${spec.revision}`,
      );
      const decisionId = RoutingDecisionId.makeUnsafe(
        `route:${unit.id}:r${spec.revision}:a${attemptNumber}`,
      );
      const attemptId = WorkUnitAttemptId.makeUnsafe(
        `attempt:${unit.id}:a${attemptNumber}`,
      );
      const dependencies = yield* dependencyInputs(spec);

      const contractOption = yield* context.getTaskContract({
        taskContractId: contractId,
      });
      const contract = Option.isSome(contractOption)
        ? contractOption.value
        : yield* taskContracts.seal({
            taskContractId: contractId,
            workUnitId: unit.id,
            version: spec.revision,
            instructions: spec.instructions,
            acceptanceCriteria: [...spec.acceptanceCriteria],
            allowedResources: [...spec.allowedResources],
            forbiddenResources: [...spec.forbiddenResources],
            contextArtifactIds: [...spec.contextArtifactIds],
            dependencyResultPacketIds: dependencies.packetIds,
            baselineGitRef: spec.baselineGitRef ?? null,
            permissionProfile: spec.permissionProfile,
            permissionGrantIds: [...spec.permissionGrantIds],
            expectedArtifacts: [...spec.expectedArtifacts],
            occurredAt,
          });

      const decisionOption = yield* routing.getDecision({ decisionId });
      const decision = Option.isSome(decisionOption)
        ? decisionOption.value
        : yield* Effect.gen(function* () {
            const fallbackOverride = yield* resolveRetryOverride(attempts);
            return yield* modelRouter.routeWorkUnit({
              decisionId,
              workUnitId: unit.id,
              constraints: [...spec.routingConstraints],
              priorProviders: dependencies.priorProviders,
              ...(fallbackOverride === undefined
                ? {}
                : { override: fallbackOverride }),
              decidedAt: occurredAt,
            });
          });

      const existingAttempt = yield* workflows.getAttemptById({ attemptId });
      let attempt: WorkUnitAttempt;
      if (Option.isSome(existingAttempt)) {
        attempt = existingAttempt.value;
      } else {
        attempt = (
          yield* commands.beginAttempt({
            context: commandContext(
              unit.id,
              `begin-attempt-${attemptNumber}`,
              occurredAt,
              actorId,
            ),
            attempt: {
              id: attemptId,
              workflowId: workflow.id,
              workUnitId: unit.id,
              attemptNumber,
              status: "preparing",
              routingDecisionId: decision.id,
              taskContractId: contract.id,
              resultPacketId: null,
              threadId: null,
              worktreePath: null,
              baselineGitRef: spec.baselineGitRef ?? null,
              startedAt: null,
              settledAt: null,
              error: null,
              createdAt: occurredAt,
              updatedAt: occurredAt,
            },
          })
        ).current;
      }
      const dispatched = yield* dispatcher.dispatch({
        attemptId: attempt.id,
        occurredAt,
      });
      return {
        disposition: "scheduled",
        attempt: dispatched.attempt,
      } as const;
    });

  const schedule: WorkUnitOrchestratorShape["schedule"] = (input) =>
    executionPlans
      .saveSpec(input.spec)
      .pipe(
        Effect.flatMap((spec) =>
          executePersistedSpec(spec, input.occurredAt, input.actorId),
        ),
      );

  const runSpecs = (
    specs: ReadonlyArray<WorkUnitExecutionSpec>,
    occurredAt: string,
  ) =>
    Effect.forEach(
      specs,
      (spec) =>
        executePersistedSpec(spec, occurredAt).pipe(
          Effect.map((result) => ({ workUnitId: spec.workUnitId, result })),
        ),
      { concurrency: 1 },
    ).pipe(Effect.map(summarize));

  const runWorkflow: WorkUnitOrchestratorShape["runWorkflow"] = (input) =>
    executionPlans
      .listRunnableSpecs({ limit: input.limit })
      .pipe(
        Effect.map((specs) =>
          specs.filter((spec) => spec.workflowId === input.workflowId),
        ),
        Effect.flatMap((specs) => runSpecs(specs, input.occurredAt)),
      );

  const recover: WorkUnitOrchestratorShape["recover"] = (input) =>
    executionPlans
      .listRunnableSpecs({ limit: input.limit })
      .pipe(
        Effect.flatMap((specs) => runSpecs(specs, input.occurredAt)),
      );

  return {
    schedule,
    runWorkflow,
    recover,
  } satisfies WorkUnitOrchestratorShape;
});

export const WorkUnitOrchestratorLive = Layer.effect(
  WorkUnitOrchestrator,
  makeWorkUnitOrchestrator,
);
