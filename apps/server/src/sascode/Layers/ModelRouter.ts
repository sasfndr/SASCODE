import type {
  ResolvedModelTarget,
  RoutingCandidate,
  RoutingDecision,
} from "@synara/contracts";
import { evaluateRouting } from "@synara/shared/sascodeRouting";
import { Effect, Layer, Option } from "effect";

import {
  DirectorEntityNotFoundError,
  NoEligibleRoutingTargetError,
  RoutingDecisionConflictError,
  RoutingInvariantError,
  RoutingPolicyNotFoundError,
  RoutingRoleNotFoundError,
} from "../Errors.ts";
import { ModelRouter, type ModelRouterShape } from "../Services/ModelRouter.ts";
import { DirectorWorkflowRepository } from "../Services/DirectorWorkflowRepository.ts";
import { RoutingRepository } from "../Services/RoutingRepository.ts";

const sameTarget = (
  left: ResolvedModelTarget,
  right: ResolvedModelTarget,
): boolean =>
  left.connectionId === right.connectionId &&
  left.modelSlug === right.modelSlug;

const eligibleTargets = (
  candidates: ReadonlyArray<RoutingCandidate>,
): ReadonlyArray<ResolvedModelTarget> =>
  candidates
    .filter((candidate) => candidate.eligible)
    .map((candidate) => candidate.target);

const makeModelRouter = Effect.gen(function* () {
  const workflows = yield* DirectorWorkflowRepository;
  const routing = yield* RoutingRepository;

  const routeWorkUnit: ModelRouterShape["routeWorkUnit"] = (input) =>
    Effect.gen(function* () {
      const workUnitOption = yield* workflows.getWorkUnitById({
        workUnitId: input.workUnitId,
      });
      if (Option.isNone(workUnitOption)) {
        return yield* new DirectorEntityNotFoundError({
          entityKind: "work-unit",
          entityId: input.workUnitId,
        });
      }
      const workUnit = workUnitOption.value;
      if (workUnit.status !== "routing") {
        return yield* new RoutingInvariantError({
          workUnitId: workUnit.id,
          detail: `Expected routing state, received ${workUnit.status}.`,
        });
      }

      const workflowOption = yield* workflows.getById({
        workflowId: workUnit.workflowId,
      });
      if (Option.isNone(workflowOption)) {
        return yield* new DirectorEntityNotFoundError({
          entityKind: "workflow",
          entityId: workUnit.workflowId,
        });
      }
      const workflow = workflowOption.value;
      const policyOption = yield* routing.getPolicy({
        policyId: workflow.routingPolicyId,
        revision: workflow.routingPolicyRevision,
      });
      if (Option.isNone(policyOption)) {
        return yield* new RoutingPolicyNotFoundError({
          policyId: workflow.routingPolicyId,
          revision: workflow.routingPolicyRevision,
        });
      }
      const policy = policyOption.value;
      const snapshots = yield* routing.listCurrentCapabilitySnapshots();
      const evaluation = evaluateRouting({
        policy,
        roleId: workUnit.roleId,
        activity: workUnit.activity,
        snapshots,
        constraints: input.constraints,
        priorProviderByWorkUnitId: new Map(
          input.priorProviders.map(({ workUnitId, providerKey }) => [
            workUnitId,
            providerKey,
          ]),
        ),
        now: input.decidedAt,
      });

      if ("_tag" in evaluation) {
        if (evaluation._tag === "role-not-found") {
          return yield* new RoutingRoleNotFoundError({
            policyId: policy.id,
            revision: policy.revision,
            roleId: evaluation.roleId,
          });
        }
        return yield* new NoEligibleRoutingTargetError({
          workflowId: workflow.id,
          workUnitId: workUnit.id,
          reasons: evaluation.candidates.flatMap((candidate) =>
            candidate.rejectedReasons.map(
              (reason) =>
                `${candidate.target.providerKey}/${candidate.target.modelSlug}: ${reason}`,
            ),
          ),
        });
      }

      let selected = evaluation.selected;
      let fallbackOrder = evaluation.fallbackOrder;
      let rationale = evaluation.rationale;
      let override: RoutingDecision["override"];
      if (input.override !== undefined) {
        const overrideCandidate = evaluation.candidates.find(
          (candidate) =>
            candidate.eligible &&
            sameTarget(candidate.target, input.override!.target),
        );
        if (!overrideCandidate) {
          return yield* new RoutingInvariantError({
            workUnitId: workUnit.id,
            detail:
              "The requested override target is unavailable, ineligible, or absent from the current capability snapshots.",
          });
        }
        selected = overrideCandidate.target;
        fallbackOrder = eligibleTargets(evaluation.candidates).filter(
          (target) => !sameTarget(target, selected),
        );
        override = {
          actor: input.override.actor,
          reason: input.override.reason,
        };
        rationale =
          `User override selected ${selected.providerKey}/${selected.modelSlug}. ` +
          `Policy recommendation: ${evaluation.rationale}`;
      }

      const decision: RoutingDecision = {
        id: input.decisionId,
        workflowId: workflow.id,
        workUnitId: workUnit.id,
        policyId: policy.id,
        policyRevision: policy.revision,
        roleId: workUnit.roleId,
        candidates: [...evaluation.candidates],
        selected,
        fallbackOrder: [...fallbackOrder],
        rationale,
        constraints: [...input.constraints],
        ...(override === undefined ? {} : { override }),
        decidedAt: input.decidedAt,
      };
      if (!(yield* routing.saveDecision(decision))) {
        return yield* new RoutingDecisionConflictError({
          decisionId: input.decisionId,
        });
      }
      return decision;
    });

  return { routeWorkUnit } satisfies ModelRouterShape;
});

export const ModelRouterLive = Layer.effect(ModelRouter, makeModelRouter);
