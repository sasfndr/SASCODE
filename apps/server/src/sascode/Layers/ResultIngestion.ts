import {
  DirectorCommandId,
  type DirectorCommandContext,
  type DirectorEventId,
  type EvidenceRecord,
  type ProjectId,
  type QualityGateRun,
  type ThreadId,
  type WorkUnitAttempt,
  type WorkflowId,
  type WorkUnitId,
} from "@synara/contracts";
import { Effect, Layer, Option } from "effect";

import { WorkUnitExecutionInvariantError } from "../Errors.ts";
import { ContextEvidenceRepository } from "../Services/ContextEvidenceRepository.ts";
import { DirectorCommands } from "../Services/DirectorCommands.ts";
import { DirectorEventStore } from "../Services/DirectorEventStore.ts";
import { DirectorExecutionCoordinator } from "../Services/DirectorExecutionCoordinator.ts";
import type { DirectorResultCommit } from "../Services/DirectorExecutionCoordinator.ts";
import { DirectorWorkflowRepository } from "../Services/DirectorWorkflowRepository.ts";
import {
  ResultIngestion,
  type ResultIngestionShape,
} from "../Services/ResultIngestion.ts";
import { WorkUnitOrchestrator } from "../Services/WorkUnitOrchestrator.ts";

const commandContext = (
  attempt: WorkUnitAttempt,
  operation: string,
  occurredAt: string,
  actorKind: DirectorCommandContext["actorKind"],
  actorId: string,
): DirectorCommandContext => ({
  commandId: DirectorCommandId.makeUnsafe(
    `director:${attempt.id}:${operation}`,
  ),
  actorKind,
  actorId,
  occurredAt,
  correlationId: `attempt:${attempt.id}`,
  causationEventId: null,
});

const sameJson = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const makeResultIngestion = Effect.gen(function* () {
  const commands = yield* DirectorCommands;
  const context = yield* ContextEvidenceRepository;
  const coordinator = yield* DirectorExecutionCoordinator;
  const events = yield* DirectorEventStore;
  const orchestrator = yield* WorkUnitOrchestrator;
  const workflows = yield* DirectorWorkflowRepository;

  const requireAttempt = (
    attemptId: WorkUnitAttempt["id"],
    workUnitId: WorkUnitId,
  ) =>
    workflows.getAttemptById({ attemptId }).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.fail(
              new WorkUnitExecutionInvariantError({
                workUnitId,
                detail: `Attempt ${attemptId} does not exist.`,
              }),
            ),
          onSome: Effect.succeed,
        }),
      ),
    );

  const validateEvidenceScope = (
    input: {
      readonly workflowId: WorkflowId;
      readonly workUnitId: WorkUnitId;
      readonly projectId: ProjectId;
      readonly threadId: ThreadId | null;
    },
    evidence: EvidenceRecord,
  ) => {
    const scope = evidence.scope;
    if (
      scope.projectId !== input.projectId ||
      scope.workflowId !== input.workflowId ||
      scope.workUnitId !== input.workUnitId ||
      (scope.threadId != null &&
        input.threadId != null &&
        scope.threadId !== input.threadId)
    ) {
      return new WorkUnitExecutionInvariantError({
        workUnitId: input.workUnitId,
        detail: `Evidence ${evidence.id} is outside the attempt scope.`,
      });
    }
    return null;
  };

  const validateGateScope = (
    input: {
      readonly workflowId: WorkflowId;
      readonly workUnitId: WorkUnitId;
      readonly projectId: ProjectId;
      readonly threadId: ThreadId | null;
    },
    run: QualityGateRun,
  ) => {
    const scope = run.scope;
    if (
      scope.projectId !== input.projectId ||
      scope.workflowId !== input.workflowId ||
      scope.workUnitId !== input.workUnitId ||
      (scope.threadId != null &&
        input.threadId != null &&
        scope.threadId !== input.threadId)
    ) {
      return new WorkUnitExecutionInvariantError({
        workUnitId: input.workUnitId,
        detail: `Quality gate ${run.id} is outside the attempt scope.`,
      });
    }
    return null;
  };

  const normalizeToVerifying = (
    attempt: WorkUnitAttempt,
    input: Parameters<ResultIngestionShape["submit"]>[0],
  ) =>
    Effect.gen(function* () {
      let current = attempt;
      if (
        current.status === "dispatching" ||
        current.status === "queued"
      ) {
        current = (
          yield* commands.advanceAttempt({
            context: commandContext(
              current,
              "result-mark-running",
              input.submission.verifiedAt,
              input.actorKind,
              input.actorId,
            ),
            attemptId: current.id,
            nextStatus: "running",
          })
        ).current;
      }
      if (current.status === "running") {
        current = (
          yield* commands.advanceAttempt({
            context: commandContext(
              current,
              "result-mark-verifying",
              input.submission.verifiedAt,
              input.actorKind,
              input.actorId,
            ),
            attemptId: current.id,
            nextStatus: "verifying",
          })
        ).current;
      }
      if (current.status !== "verifying") {
        return yield* new WorkUnitExecutionInvariantError({
          workUnitId: current.workUnitId,
          detail:
            `Attempt ${current.id} cannot accept a result while ` +
            `its status is ${current.status}.`,
        });
      }
      return current;
    });

  const settleCompletedWorkflow = (
    workflowId: WorkUnitAttempt["workflowId"],
    occurredAt: string,
  ) =>
    Effect.gen(function* () {
      let workflowOption = yield* workflows.getById({ workflowId });
      if (Option.isNone(workflowOption)) return;
      let workflow = workflowOption.value;
      if (
        !workflow.workUnits.every((unit) =>
          unit.status === "succeeded" || unit.status === "skipped"
        )
      ) {
        return;
      }
      if (workflow.status === "completed") return;
      const remainingStatuses =
        workflow.status === "running"
          ? (["verifying", "integrating", "completed"] as const)
          : workflow.status === "verifying"
            ? (["integrating", "completed"] as const)
            : workflow.status === "integrating"
              ? (["completed"] as const)
              : [];
      for (const nextStatus of remainingStatuses) {
        workflow = (
          yield* commands.moveWorkflow({
            context: {
              commandId: DirectorCommandId.makeUnsafe(
                `director:${workflow.id}:auto-${nextStatus}`,
              ),
              actorKind: "system",
              actorId: "sascode-director",
              occurredAt,
              correlationId: `workflow:${workflow.id}`,
              causationEventId: null,
            },
            workflowId: workflow.id,
            nextStatus,
          })
        ).current;
      }
    });

  const submit: ResultIngestionShape["submit"] = (input) =>
    Effect.gen(function* () {
      const packet = input.submission.packet;
      let attempt = yield* requireAttempt(
        packet.attemptId,
        packet.workUnitId,
      );
      if (
        attempt.workflowId !== packet.workflowId ||
        attempt.workUnitId !== packet.workUnitId ||
        attempt.taskContractId !== packet.taskContractId
      ) {
        return yield* new WorkUnitExecutionInvariantError({
          workUnitId: packet.workUnitId,
          detail: "The result packet does not match its attempt identity.",
        });
      }
      if (
        input.expectedThreadId != null &&
        attempt.threadId !== input.expectedThreadId
      ) {
        return yield* new WorkUnitExecutionInvariantError({
          workUnitId: packet.workUnitId,
          detail:
            `Thread ${input.expectedThreadId} is not authorized to settle ` +
            `attempt ${attempt.id}.`,
        });
      }
      const workflowOption = yield* workflows.getById({
        workflowId: attempt.workflowId,
      });
      if (Option.isNone(workflowOption)) {
        return yield* new WorkUnitExecutionInvariantError({
          workUnitId: packet.workUnitId,
          detail: "The parent workflow does not exist.",
        });
      }
      const scope = {
        workflowId: attempt.workflowId,
        workUnitId: attempt.workUnitId,
        projectId: workflowOption.value.projectId,
        threadId: attempt.threadId ?? null,
      };
      for (const evidence of input.submission.evidence) {
        const error = validateEvidenceScope(scope, evidence);
        if (error) return yield* error;
      }
      for (const run of input.submission.qualityGateRuns) {
        const error = validateGateScope(scope, run);
        if (error) return yield* error;
      }

      const existingVerification = yield* context.getResultVerification({
        resultPacketId: packet.id,
      });
      let result: DirectorResultCommit;
      let replayed: boolean;
      let causationEventId: DirectorEventId | null = null;
      if (Option.isSome(existingVerification)) {
        const currentAttempt = yield* requireAttempt(
          packet.attemptId,
          packet.workUnitId,
        );
        result = {
          verification: existingVerification.value,
          attempt: currentAttempt,
        };
        replayed = true;
      } else {
        attempt = yield* normalizeToVerifying(attempt, input);
        const commit = yield* events.commitCommand(
          {
            context: commandContext(
              attempt,
              `result-${packet.id}`,
              input.submission.verifiedAt,
              input.actorKind,
              input.actorId,
            ),
            projectId: workflowOption.value.projectId,
            aggregateKind: "attempt",
            aggregateId: attempt.id,
            eventType: "attempt.result-attached",
            fingerprintPayload: input.submission,
            payload: {
              workflowId: attempt.workflowId,
              workUnitId: attempt.workUnitId,
              attemptId: attempt.id,
              resultPacketId: packet.id,
            },
          },
          Effect.gen(function* () {
            const existingEvidence =
              yield* context.listEvidenceByWorkUnit({
                workUnitId: attempt.workUnitId,
              });
            const evidenceById = new Map(
              existingEvidence.map((evidence) => [
                evidence.id,
                evidence,
              ]),
            );
            for (const evidence of input.submission.evidence) {
              const saved = yield* context.saveEvidenceRecord({
                evidence,
                links: [
                  {
                    subjectKind: "work-unit",
                    subjectId: attempt.workUnitId,
                  },
                  { subjectKind: "attempt", subjectId: attempt.id },
                  {
                    subjectKind: "result-packet",
                    subjectId: packet.id,
                  },
                ],
                contentHash: null,
              });
              if (
                !saved &&
                !sameJson(evidenceById.get(evidence.id), evidence)
              ) {
                return yield* new WorkUnitExecutionInvariantError({
                  workUnitId: attempt.workUnitId,
                  detail: `Evidence ${evidence.id} conflicts with an existing record.`,
                });
              }
            }
            const existingRuns =
              yield* context.listQualityGateRunsByWorkUnit({
                workUnitId: attempt.workUnitId,
              });
            const runsById = new Map(
              existingRuns.map((run) => [run.id, run]),
            );
            for (const run of input.submission.qualityGateRuns) {
              const saved = yield* context.saveQualityGateRun(run);
              if (!saved && !sameJson(runsById.get(run.id), run)) {
                return yield* new WorkUnitExecutionInvariantError({
                  workUnitId: attempt.workUnitId,
                  detail: `Quality gate ${run.id} conflicts with an existing run.`,
                });
              }
            }
            return yield* coordinator.commitResult({
              packet,
              verifiedAt: input.submission.verifiedAt,
            });
          }),
        );
        causationEventId = commit.event.id;
        if (commit.kind === "committed") {
          result = commit.value;
          replayed = false;
        } else {
          const [verification, currentAttempt] = yield* Effect.all([
            context.getResultVerification({ resultPacketId: packet.id }),
            workflows.getAttemptById({ attemptId: attempt.id }),
          ]);
          if (
            Option.isNone(verification) ||
            Option.isNone(currentAttempt)
          ) {
            return yield* new WorkUnitExecutionInvariantError({
              workUnitId: attempt.workUnitId,
              detail:
                "The replayed result is missing its durable projection.",
            });
          }
          result = {
            verification: verification.value,
            attempt: currentAttempt.value,
          };
          replayed = true;
        }
      }

      yield* commands.reconcileReadyWorkUnits({
        context: {
          commandId: DirectorCommandId.makeUnsafe(
            `director:${attempt.workflowId}:reconcile:${packet.id}`,
          ),
          actorKind: "system",
          actorId: "sascode-director",
          occurredAt: input.submission.verifiedAt,
          correlationId: `workflow:${attempt.workflowId}`,
          causationEventId,
        },
        workflowId: attempt.workflowId,
        passedGateKeys: [...result.verification.passedGateKeys],
      });
      const downstream = yield* orchestrator.runWorkflow({
        workflowId: attempt.workflowId,
        occurredAt: input.submission.verifiedAt,
        limit: 1_000,
      });
      yield* settleCompletedWorkflow(
        attempt.workflowId,
        input.submission.verifiedAt,
      );
      return {
        ...result,
        downstream,
        replayed,
      };
    });

  return { submit } satisfies ResultIngestionShape;
});

export const ResultIngestionLive = Layer.effect(
  ResultIngestion,
  makeResultIngestion,
);
