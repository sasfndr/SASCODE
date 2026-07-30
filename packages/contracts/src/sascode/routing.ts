import { Schema } from "effect";

import { IsoDateTime, ProjectId, TrimmedNonEmptyString } from "../baseSchemas";
import {
  AgentRoleId,
  CapabilitySnapshotId,
  RoutingDecisionId,
  RoutingPolicyId,
  SascodeActivityType,
  SascodeBoundedTextList,
  SascodeRiskLevel,
  SascodeStringMap,
  WorkflowId,
  WorkUnitId,
} from "./core";
import { QualityGateDefinition } from "./context";
import { SascodePermissionProfile } from "./permissions";
import { ResolvedModelTarget, SascodeToolCapability } from "./capabilities";

export const AgentRoleDefinition = Schema.Struct({
  id: AgentRoleId,
  key: TrimmedNonEmptyString,
  displayName: TrimmedNonEmptyString,
  description: TrimmedNonEmptyString,
  activities: Schema.Array(SascodeActivityType).check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  requiredTools: Schema.Array(SascodeToolCapability).check(Schema.isMaxLength(32)),
  preferredProviderKeys: Schema.Array(TrimmedNonEmptyString).check(Schema.isMaxLength(64)),
  preferredModelFamilies: Schema.Array(TrimmedNonEmptyString).check(Schema.isMaxLength(64)),
  forbiddenProviderKeys: Schema.Array(TrimmedNonEmptyString).check(Schema.isMaxLength(64)),
  fallbackRoleIds: Schema.Array(AgentRoleId).check(Schema.isMaxLength(32)),
  defaultPermissionProfile: SascodePermissionProfile,
  defaultRisk: SascodeRiskLevel,
});
export type AgentRoleDefinition = typeof AgentRoleDefinition.Type;

export const RoutingConstraint = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("requires-tool"),
    tool: SascodeToolCapability,
  }),
  Schema.Struct({
    type: Schema.Literal("requires-activity"),
    activity: SascodeActivityType,
  }),
  Schema.Struct({
    type: Schema.Literal("provider-allow-list"),
    providerKeys: Schema.Array(TrimmedNonEmptyString).check(Schema.isMinLength(1)),
  }),
  Schema.Struct({
    type: Schema.Literal("provider-deny-list"),
    providerKeys: Schema.Array(TrimmedNonEmptyString).check(Schema.isMinLength(1)),
  }),
  Schema.Struct({
    type: Schema.Literal("different-provider-from-work-unit"),
    workUnitId: WorkUnitId,
  }),
  Schema.Struct({
    type: Schema.Literal("requires-image-input"),
  }),
  Schema.Struct({
    type: Schema.Literal("requires-session-resume"),
  }),
  Schema.Struct({
    type: Schema.Literal("max-usage-fraction"),
    value: Schema.Number,
  }),
]);
export type RoutingConstraint = typeof RoutingConstraint.Type;

export const RoutingScoreWeights = Schema.Struct({
  capability: Schema.Number,
  preference: Schema.Number,
  availability: Schema.Number,
  quality: Schema.Number,
  cost: Schema.Number,
  latency: Schema.Number,
  continuity: Schema.Number,
});
export type RoutingScoreWeights = typeof RoutingScoreWeights.Type;

export const RoutingFallbackBehavior = Schema.Literals([
  "pause-and-request",
  "reroute-same-role",
  "reroute-fallback-role",
  "fail-work-unit",
]);
export type RoutingFallbackBehavior = typeof RoutingFallbackBehavior.Type;

export const RoutingPolicy = Schema.Struct({
  id: RoutingPolicyId,
  projectId: Schema.optional(Schema.NullOr(ProjectId)),
  name: TrimmedNonEmptyString,
  description: TrimmedNonEmptyString,
  revision: Schema.Number,
  roles: Schema.Array(AgentRoleDefinition).check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  scoreWeights: RoutingScoreWeights,
  qualityGates: Schema.Array(QualityGateDefinition).check(Schema.isMaxLength(128)),
  fallbackBehavior: RoutingFallbackBehavior,
  maxParallelWorkUnits: Schema.Number,
  requireDifferentProviderForIndependentReview: Schema.Boolean,
  userOverrides: SascodeStringMap,
  source: Schema.optional(Schema.String.check(Schema.isMaxLength(262_144))),
  digest: TrimmedNonEmptyString,
  publishedAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type RoutingPolicy = typeof RoutingPolicy.Type;

export const RoutingCandidate = Schema.Struct({
  target: ResolvedModelTarget,
  capabilitySnapshotId: CapabilitySnapshotId,
  eligible: Schema.Boolean,
  score: Schema.Number,
  scoreComponents: RoutingScoreWeights,
  rejectedReasons: SascodeBoundedTextList,
  warnings: SascodeBoundedTextList,
});
export type RoutingCandidate = typeof RoutingCandidate.Type;

export const RoutingDecision = Schema.Struct({
  id: RoutingDecisionId,
  workflowId: WorkflowId,
  workUnitId: WorkUnitId,
  policyId: RoutingPolicyId,
  policyRevision: Schema.Number,
  roleId: AgentRoleId,
  candidates: Schema.Array(RoutingCandidate).check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  selected: ResolvedModelTarget,
  fallbackOrder: Schema.Array(ResolvedModelTarget).check(Schema.isMaxLength(64)),
  rationale: TrimmedNonEmptyString,
  constraints: Schema.Array(RoutingConstraint).check(Schema.isMaxLength(128)),
  override: Schema.optional(
    Schema.Struct({
      actor: TrimmedNonEmptyString,
      reason: TrimmedNonEmptyString,
    }),
  ),
  decidedAt: IsoDateTime,
});
export type RoutingDecision = typeof RoutingDecision.Type;
