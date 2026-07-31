import {
  IsoDateTime,
  ResolvedModelTarget,
  RoutingConstraint,
  RoutingDecision,
  RoutingDecisionId,
  WorkUnitId,
} from "@synara/contracts";
import { Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";
import type { ModelRouterDomainError } from "../Errors.ts";

export const PriorWorkUnitProvider = Schema.Struct({
  workUnitId: WorkUnitId,
  providerKey: Schema.String,
});
export type PriorWorkUnitProvider = typeof PriorWorkUnitProvider.Type;

export const RoutingOverride = Schema.Struct({
  actor: Schema.String,
  reason: Schema.String,
  target: ResolvedModelTarget,
});
export type RoutingOverride = typeof RoutingOverride.Type;

export const RouteWorkUnitInput = Schema.Struct({
  decisionId: RoutingDecisionId,
  workUnitId: WorkUnitId,
  constraints: Schema.Array(RoutingConstraint),
  priorProviders: Schema.Array(PriorWorkUnitProvider),
  override: Schema.optional(RoutingOverride),
  decidedAt: IsoDateTime,
});
export type RouteWorkUnitInput = typeof RouteWorkUnitInput.Type;

export type ModelRouterError = ModelRouterDomainError | ProjectionRepositoryError;

export interface ModelRouterShape {
  readonly routeWorkUnit: (
    input: RouteWorkUnitInput,
  ) => Effect.Effect<RoutingDecision, ModelRouterError>;
}

export class ModelRouter extends ServiceMap.Service<ModelRouter, ModelRouterShape>()(
  "sascode/Services/ModelRouter",
) {}
