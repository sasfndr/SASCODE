import {
  CapabilitySnapshotId,
  ProjectId,
  ProviderCapabilitySnapshot,
  ProviderConnection,
  RoutingDecision,
  RoutingDecisionId,
  RoutingPolicy,
  RoutingPolicyId,
  WorkUnitId,
} from "@synara/contracts";
import { Option, Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";

export const SaveCapabilitySnapshotInput = Schema.Struct({
  snapshot: ProviderCapabilitySnapshot,
  digest: Schema.String,
});
export type SaveCapabilitySnapshotInput = typeof SaveCapabilitySnapshotInput.Type;

export const GetCapabilitySnapshotInput = Schema.Struct({
  snapshotId: CapabilitySnapshotId,
});
export type GetCapabilitySnapshotInput = typeof GetCapabilitySnapshotInput.Type;

export const GetRoutingPolicyInput = Schema.Struct({
  policyId: RoutingPolicyId,
  revision: Schema.Number,
});
export type GetRoutingPolicyInput = typeof GetRoutingPolicyInput.Type;

export const ListRoutingPoliciesInput = Schema.Struct({
  projectId: Schema.NullOr(ProjectId),
});
export type ListRoutingPoliciesInput = typeof ListRoutingPoliciesInput.Type;

export const GetRoutingDecisionInput = Schema.Struct({
  decisionId: RoutingDecisionId,
});
export type GetRoutingDecisionInput = typeof GetRoutingDecisionInput.Type;

export const ListWorkUnitRoutingDecisionsInput = Schema.Struct({
  workUnitId: WorkUnitId,
});
export type ListWorkUnitRoutingDecisionsInput =
  typeof ListWorkUnitRoutingDecisionsInput.Type;

export interface RoutingRepositoryShape {
  readonly upsertConnection: (
    connection: ProviderConnection,
  ) => Effect.Effect<void, ProjectionRepositoryError>;

  readonly saveCapabilitySnapshot: (
    input: SaveCapabilitySnapshotInput,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  readonly getCapabilitySnapshot: (
    input: GetCapabilitySnapshotInput,
  ) => Effect.Effect<Option.Option<ProviderCapabilitySnapshot>, ProjectionRepositoryError>;

  readonly listCurrentCapabilitySnapshots: () => Effect.Effect<
    ReadonlyArray<ProviderCapabilitySnapshot>,
    ProjectionRepositoryError
  >;

  readonly publishPolicy: (
    policy: RoutingPolicy,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  readonly getPolicy: (
    input: GetRoutingPolicyInput,
  ) => Effect.Effect<Option.Option<RoutingPolicy>, ProjectionRepositoryError>;

  readonly listPolicies: (
    input: ListRoutingPoliciesInput,
  ) => Effect.Effect<ReadonlyArray<RoutingPolicy>, ProjectionRepositoryError>;

  readonly saveDecision: (
    decision: RoutingDecision,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  readonly getDecision: (
    input: GetRoutingDecisionInput,
  ) => Effect.Effect<Option.Option<RoutingDecision>, ProjectionRepositoryError>;

  readonly listDecisionsByWorkUnit: (
    input: ListWorkUnitRoutingDecisionsInput,
  ) => Effect.Effect<ReadonlyArray<RoutingDecision>, ProjectionRepositoryError>;
}

export class RoutingRepository extends ServiceMap.Service<
  RoutingRepository,
  RoutingRepositoryShape
>()("sascode/Services/RoutingRepository") {}
