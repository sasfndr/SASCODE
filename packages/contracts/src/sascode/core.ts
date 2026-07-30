import { Schema } from "effect";

import {
  IsoDateTime,
  NonNegativeInt,
  PositiveInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "../baseSchemas";

const makeSascodeEntityId = <Brand extends string>(brand: Brand) =>
  TrimmedNonEmptyString.pipe(Schema.brand(brand));

export const ProviderConnectionId = makeSascodeEntityId("ProviderConnectionId");
export type ProviderConnectionId = typeof ProviderConnectionId.Type;

export const CapabilitySnapshotId = makeSascodeEntityId("CapabilitySnapshotId");
export type CapabilitySnapshotId = typeof CapabilitySnapshotId.Type;

export const AgentRoleId = makeSascodeEntityId("AgentRoleId");
export type AgentRoleId = typeof AgentRoleId.Type;

export const RoutingPolicyId = makeSascodeEntityId("RoutingPolicyId");
export type RoutingPolicyId = typeof RoutingPolicyId.Type;

export const RoutingDecisionId = makeSascodeEntityId("RoutingDecisionId");
export type RoutingDecisionId = typeof RoutingDecisionId.Type;

export const WorkflowId = makeSascodeEntityId("WorkflowId");
export type WorkflowId = typeof WorkflowId.Type;

export const WorkUnitId = makeSascodeEntityId("WorkUnitId");
export type WorkUnitId = typeof WorkUnitId.Type;

export const WorkUnitAttemptId = makeSascodeEntityId("WorkUnitAttemptId");
export type WorkUnitAttemptId = typeof WorkUnitAttemptId.Type;

export const TaskContractId = makeSascodeEntityId("TaskContractId");
export type TaskContractId = typeof TaskContractId.Type;

export const ResultPacketId = makeSascodeEntityId("ResultPacketId");
export type ResultPacketId = typeof ResultPacketId.Type;

export const ContextArtifactId = makeSascodeEntityId("ContextArtifactId");
export type ContextArtifactId = typeof ContextArtifactId.Type;

export const DecisionRecordId = makeSascodeEntityId("DecisionRecordId");
export type DecisionRecordId = typeof DecisionRecordId.Type;

export const EvidenceRecordId = makeSascodeEntityId("EvidenceRecordId");
export type EvidenceRecordId = typeof EvidenceRecordId.Type;

export const QualityGateRunId = makeSascodeEntityId("QualityGateRunId");
export type QualityGateRunId = typeof QualityGateRunId.Type;

export const BrowserProfileId = makeSascodeEntityId("BrowserProfileId");
export type BrowserProfileId = typeof BrowserProfileId.Type;

export const BrowserInstanceId = makeSascodeEntityId("BrowserInstanceId");
export type BrowserInstanceId = typeof BrowserInstanceId.Type;

export const BrowserTabId = makeSascodeEntityId("BrowserTabId");
export type BrowserTabId = typeof BrowserTabId.Type;

export const ModuleId = makeSascodeEntityId("ModuleId");
export type ModuleId = typeof ModuleId.Type;

export const ModuleInstanceId = makeSascodeEntityId("ModuleInstanceId");
export type ModuleInstanceId = typeof ModuleInstanceId.Type;

export const PermissionGrantId = makeSascodeEntityId("PermissionGrantId");
export type PermissionGrantId = typeof PermissionGrantId.Type;

export const StepUpRequestId = makeSascodeEntityId("StepUpRequestId");
export type StepUpRequestId = typeof StepUpRequestId.Type;

export const AuditRecordId = makeSascodeEntityId("AuditRecordId");
export type AuditRecordId = typeof AuditRecordId.Type;

export const DirectorCommandId = makeSascodeEntityId("DirectorCommandId");
export type DirectorCommandId = typeof DirectorCommandId.Type;

export const DirectorEventId = makeSascodeEntityId("DirectorEventId");
export type DirectorEventId = typeof DirectorEventId.Type;

export const SascodeActivityType = Schema.Literals([
  "product-strategy",
  "ux-planning",
  "visual-design",
  "frontend-implementation",
  "backend-implementation",
  "infrastructure",
  "data",
  "browser-operation",
  "testing",
  "code-review",
  "security-review",
  "documentation",
  "integration",
  "release",
]);
export type SascodeActivityType = typeof SascodeActivityType.Type;

export const SascodeRiskLevel = Schema.Literals(["low", "medium", "high", "critical"]);
export type SascodeRiskLevel = typeof SascodeRiskLevel.Type;

export const SascodePriority = Schema.Literals(["background", "normal", "high", "urgent"]);
export type SascodePriority = typeof SascodePriority.Type;

export const SascodeScope = Schema.Struct({
  projectId: ProjectId,
  threadId: Schema.optional(Schema.NullOr(ThreadId)),
  workflowId: Schema.optional(Schema.NullOr(WorkflowId)),
  workUnitId: Schema.optional(Schema.NullOr(WorkUnitId)),
});
export type SascodeScope = typeof SascodeScope.Type;

export const SascodeResourceRef = Schema.Struct({
  kind: Schema.Literals([
    "file",
    "directory",
    "git-ref",
    "url",
    "browser",
    "thread",
    "context",
    "artifact",
  ]),
  uri: TrimmedNonEmptyString,
  label: Schema.optional(TrimmedNonEmptyString),
  contentHash: Schema.optional(TrimmedNonEmptyString),
});
export type SascodeResourceRef = typeof SascodeResourceRef.Type;

export const SascodeTimestampedVersion = Schema.Struct({
  version: PositiveInt,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type SascodeTimestampedVersion = typeof SascodeTimestampedVersion.Type;

export const SascodeBoundedTextList = Schema.Array(
  TrimmedNonEmptyString.check(Schema.isMaxLength(8_192)),
).check(Schema.isMaxLength(256));
export type SascodeBoundedTextList = typeof SascodeBoundedTextList.Type;

export const SascodeStringMap = Schema.Record(
  TrimmedNonEmptyString.check(Schema.isMaxLength(128)),
  Schema.String.check(Schema.isMaxLength(32_768)),
).check(Schema.isMaxProperties(256));
export type SascodeStringMap = typeof SascodeStringMap.Type;

export const SascodeUsage = Schema.Struct({
  inputTokens: Schema.optional(NonNegativeInt),
  outputTokens: Schema.optional(NonNegativeInt),
  cachedInputTokens: Schema.optional(NonNegativeInt),
  costMicros: Schema.optional(NonNegativeInt),
  durationMs: Schema.optional(NonNegativeInt),
});
export type SascodeUsage = typeof SascodeUsage.Type;
