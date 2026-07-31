import {
  DirectorCommandId,
  type ResolvedModelTarget,
  type TaskContract,
  type WorkUnitAttempt,
} from "@synara/contracts";
import { Effect, Layer, Option } from "effect";

import {
  DirectorDispatchInvariantError,
  DirectorEntityNotFoundError,
  type DirectorThreadLaunchError,
} from "../Errors.ts";
import { AttemptDispatcher, type AttemptDispatcherShape } from "../Services/AttemptDispatcher.ts";
import { ContextEvidenceRepository } from "../Services/ContextEvidenceRepository.ts";
import { DirectorCommands } from "../Services/DirectorCommands.ts";
import { DirectorThreadLauncher } from "../Services/DirectorThreadLauncher.ts";
import { DirectorWorkflowRepository } from "../Services/DirectorWorkflowRepository.ts";
import { RoutingRepository } from "../Services/RoutingRepository.ts";

const commandContext = (
  attemptId: WorkUnitAttempt["id"],
  operation: string,
  occurredAt: string,
) => ({
  commandId: DirectorCommandId.makeUnsafe(`director:${attemptId}:${operation}`),
  actorKind: "system" as const,
  actorId: "sascode-director",
  occurredAt,
  correlationId: `attempt:${attemptId}`,
  causationEventId: null,
});

const renderResources = (
  resources: ReadonlyArray<{ readonly kind: string; readonly uri: string }>,
): string =>
  resources.length === 0
    ? "- None declared."
    : resources.map((resource) => `- ${resource.kind}: ${resource.uri}`).join("\n");

const buildTaskPrompt = (
  attemptId: WorkUnitAttempt["id"],
  contract: TaskContract,
  target: ResolvedModelTarget,
): string => `# SASCODE Sealed Task Contract

You are the assigned execution session for one immutable SASCODE work unit.

## Identity
- Workflow: ${contract.workflowId}
- Work unit: ${contract.workUnitId}
- Attempt: ${attemptId}
- Task contract: ${contract.id}
- Contract digest: ${contract.digest}
- Assigned role: ${contract.roleId}
- Activity: ${contract.activity}
- Provider route: ${target.providerKey}/${target.modelSlug}

## Required outcome
${contract.outcome}

## Instructions
${contract.instructions}

## Acceptance criteria
${contract.acceptanceCriteria
  .map(
    (criterion) =>
      `- [${criterion.required ? "required" : "optional"}] ${criterion.statement}\n  Verification: ${criterion.verification}`,
  )
  .join("\n")}

## Allowed resources
${renderResources(contract.allowedResources)}

## Forbidden resources
${renderResources(contract.forbiddenResources)}

## Required evidence
${contract.requiredEvidenceKinds.map((kind) => `- ${kind}`).join("\n") || "- None."}

## Expected artifacts
${contract.expectedArtifacts.map((artifact) => `- ${artifact}`).join("\n") || "- None."}

## Execution protocol
- Work only inside the allowed resource and permission boundaries.
- Do not expand the task or modify unrelated user work.
- Treat dependency result packets and context artifact IDs as immutable inputs.
- Verify every required acceptance criterion.
- If the \`synara_submit_sascode_result\` MCP tool is available, call it exactly once with the structured result packet, evidence records, and quality-gate runs before your final response. Use the immutable identity values above.
- Finish with a structured handoff containing: summary, changed resources, commands run, evidence produced, risks, unresolved questions, and recommended next action.
- A textual claim does not complete this work unit. SASCODE will independently validate the result packet and required evidence.
`;

const makeAttemptDispatcher = Effect.gen(function* () {
  const commands = yield* DirectorCommands;
  const launcher = yield* DirectorThreadLauncher;
  const workflows = yield* DirectorWorkflowRepository;
  const routing = yield* RoutingRepository;
  const context = yield* ContextEvidenceRepository;

  const requireAttempt = (attemptId: WorkUnitAttempt["id"]) =>
    workflows.getAttemptById({ attemptId }).pipe(
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

  const dispatch: AttemptDispatcherShape["dispatch"] = (input) =>
    Effect.gen(function* () {
      let attempt = yield* requireAttempt(input.attemptId);
      const recovered = attempt.status === "dispatching" || attempt.threadId != null;

      if (
        (attempt.status === "queued" || attempt.status === "running") &&
        attempt.threadId != null
      ) {
        return { attempt, recovered: true };
      }
      if (attempt.status !== "preparing" && attempt.status !== "dispatching") {
        return yield* new DirectorDispatchInvariantError({
          attemptId: attempt.id,
          detail: `Expected preparing or dispatching state, got ${attempt.status}.`,
        });
      }

      const workflowOption = yield* workflows.getById({
        workflowId: attempt.workflowId,
      });
      const decisionOption = yield* routing.getDecision({
        decisionId: attempt.routingDecisionId,
      });
      const contractOption = yield* context.getTaskContract({
        taskContractId: attempt.taskContractId,
      });
      if (Option.isNone(workflowOption)) {
        return yield* new DirectorEntityNotFoundError({
          entityKind: "workflow",
          entityId: attempt.workflowId,
        });
      }
      if (Option.isNone(decisionOption)) {
        return yield* new DirectorDispatchInvariantError({
          attemptId: attempt.id,
          detail: `Routing decision ${attempt.routingDecisionId} does not exist.`,
        });
      }
      if (Option.isNone(contractOption)) {
        return yield* new DirectorDispatchInvariantError({
          attemptId: attempt.id,
          detail: `Task contract ${attempt.taskContractId} does not exist.`,
        });
      }
      const workflow = workflowOption.value;
      const decision = decisionOption.value;
      const contract = contractOption.value;
      if (
        decision.workflowId !== attempt.workflowId ||
        decision.workUnitId !== attempt.workUnitId ||
        contract.workflowId !== attempt.workflowId ||
        contract.workUnitId !== attempt.workUnitId
      ) {
        return yield* new DirectorDispatchInvariantError({
          attemptId: attempt.id,
          detail:
            "Workflow, work unit, routing decision, and task contract identities do not match.",
        });
      }
      if (decision.selected.providerKind == null) {
        return yield* new DirectorDispatchInvariantError({
          attemptId: attempt.id,
          detail: `Provider ${decision.selected.providerKey} has no Synara runtime adapter.`,
        });
      }

      if (attempt.status === "preparing") {
        attempt = (yield* commands.advanceAttempt({
          context: commandContext(attempt.id, "mark-dispatching", input.occurredAt),
          attemptId: attempt.id,
          nextStatus: "dispatching",
        })).current;
      }

      if (attempt.threadId == null) {
        const launch = yield* launcher
          .launch({
            requestId: `sascode-attempt:${attempt.id}`,
            attemptId: attempt.id,
            projectId: workflow.projectId,
            title: `${workflow.title} · ${contract.outcome}`,
            prompt: buildTaskPrompt(attempt.id, contract, decision.selected),
            target: decision.selected,
            environment: "worktree",
            baseRef: contract.baselineGitRef ?? null,
            runtimeMode:
              contract.permissionProfile === "full-access-isolated" ||
              contract.permissionProfile === "trusted-build"
                ? "full-access"
                : "approval-required",
          })
          .pipe(
            Effect.catchTag("DirectorThreadLaunchError", (error: DirectorThreadLaunchError) =>
              error.operationMayHaveCommitted
                ? Effect.fail(error)
                : commands
                    .advanceAttempt({
                      context: commandContext(attempt.id, "mark-dispatch-failed", input.occurredAt),
                      attemptId: attempt.id,
                      nextStatus: "failed",
                      error: error.detail,
                    })
                    // Record the failed attempt, then surface the original
                    // launch error rather than the compensation's result.
                    .pipe(Effect.flatMap(() => Effect.fail(error))),
            ),
          );
        attempt = (yield* commands.attachThread({
          context: commandContext(attempt.id, "attach-thread", input.occurredAt),
          attemptId: attempt.id,
          threadId: launch.threadId,
          worktreePath: launch.worktreePath,
          baselineGitRef: launch.baselineGitRef ?? contract.baselineGitRef ?? null,
        })).current;
      }

      attempt = (yield* commands.advanceAttempt({
        context: commandContext(attempt.id, "mark-queued", input.occurredAt),
        attemptId: attempt.id,
        nextStatus: "queued",
      })).current;
      return { attempt, recovered };
    });

  return { dispatch } satisfies AttemptDispatcherShape;
});

export const AttemptDispatcherLive = Layer.effect(AttemptDispatcher, makeAttemptDispatcher);
