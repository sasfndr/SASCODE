import { Schema } from "effect";

import {
  IsoDateTime,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "../baseSchemas";
import {
  AgentRoleId,
  ContextArtifactId,
  DecisionRecordId,
  EvidenceRecordId,
  ResultPacketId,
  RoutingDecisionId,
  RoutingPolicyId,
  SascodeActivityType,
  SascodeBoundedTextList,
  SascodePriority,
  SascodeResourceRef,
  SascodeRiskLevel,
  SascodeUsage,
  TaskContractId,
  WorkflowId,
  WorkUnitId,
  WorkUnitAttemptId,
} from "./core";
import { SascodePermissionGrant, SascodePermissionProfile } from "./permissions";

export const WorkflowStatus = Schema.Literals([
  "proposed",
  "awaiting-approval",
  "queued",
  "running",
  "paused",
  "blocked",
  "verifying",
  "integrating",
  "completed",
  "failed",
  "cancelled",
]);
export type WorkflowStatus = typeof WorkflowStatus.Type;

export const WorkUnitStatus = Schema.Literals([
  "draft",
  "waiting-dependency",
  "ready",
  "routing",
  "queued",
  "running",
  "waiting-approval",
  "blocked",
  "verifying",
  "succeeded",
  "failed",
  "cancelled",
  "skipped",
]);
export type WorkUnitStatus = typeof WorkUnitStatus.Type;

export const WorkUnitDependencyCondition = Schema.Literals(["success", "failure", "always", "gate"]);
export type WorkUnitDependencyCondition = typeof WorkUnitDependencyCondition.Type;

export const WorkUnitDependency = Schema.Struct({
  fromWorkUnitId: WorkUnitId,
  toWorkUnitId: WorkUnitId,
  condition: WorkUnitDependencyCondition,
  gateKey: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
});
export type WorkUnitDependency = typeof WorkUnitDependency.Type;

export const AcceptanceCriterion = Schema.Struct({
  id: TrimmedNonEmptyString,
  statement: TrimmedNonEmptyString,
  verification: TrimmedNonEmptyString,
  required: Schema.Boolean,
});
export type AcceptanceCriterion = typeof AcceptanceCriterion.Type;

export const TaskContract = Schema.Struct({
  id: TaskContractId,
  workflowId: WorkflowId,
  workUnitId: WorkUnitId,
  version: Schema.Number,
  digest: TrimmedNonEmptyString,
  activity: SascodeActivityType,
  roleId: AgentRoleId,
  outcome: TrimmedNonEmptyString,
  instructions: Schema.String.check(Schema.isMaxLength(262_144)),
  acceptanceCriteria: Schema.Array(AcceptanceCriterion).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(256),
  ),
  allowedResources: Schema.Array(SascodeResourceRef).check(Schema.isMaxLength(512)),
  forbiddenResources: Schema.Array(SascodeResourceRef).check(Schema.isMaxLength(512)),
  contextArtifactIds: Schema.Array(ContextArtifactId).check(Schema.isMaxLength(256)),
  dependencyResultPacketIds: Schema.Array(ResultPacketId).check(Schema.isMaxLength(256)),
  requiredEvidenceKinds: Schema.Array(TrimmedNonEmptyString).check(Schema.isMaxLength(128)),
  baselineGitRef: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  permissionProfile: SascodePermissionProfile,
  permissionGrantIds: Schema.Array(SascodePermissionGrant.fields.id).check(Schema.isMaxLength(128)),
  risk: SascodeRiskLevel,
  expectedArtifacts: SascodeBoundedTextList,
  sealedAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  createdAt: IsoDateTime,
});
export type TaskContract = typeof TaskContract.Type;

export const WorkUnitAttemptStatus = Schema.Literals([
  "preparing",
  "dispatching",
  "queued",
  "running",
  "waiting-approval",
  "verifying",
  "succeeded",
  "failed",
  "cancelled",
  "abandoned",
]);
export type WorkUnitAttemptStatus = typeof WorkUnitAttemptStatus.Type;

export const WorkUnitAttempt = Schema.Struct({
  id: WorkUnitAttemptId,
  workflowId: WorkflowId,
  workUnitId: WorkUnitId,
  attemptNumber: Schema.Number,
  status: WorkUnitAttemptStatus,
  routingDecisionId: RoutingDecisionId,
  taskContractId: TaskContractId,
  resultPacketId: Schema.optional(Schema.NullOr(ResultPacketId)),
  threadId: Schema.optional(Schema.NullOr(ThreadId)),
  worktreePath: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  baselineGitRef: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  startedAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  settledAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  error: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type WorkUnitAttempt = typeof WorkUnitAttempt.Type;

export const WorkUnit = Schema.Struct({
  id: WorkUnitId,
  workflowId: WorkflowId,
  key: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  outcome: TrimmedNonEmptyString,
  activity: SascodeActivityType,
  roleId: AgentRoleId,
  status: WorkUnitStatus,
  priority: SascodePriority,
  risk: SascodeRiskLevel,
  sortOrder: Schema.Number,
  declaredResources: Schema.Array(SascodeResourceRef).check(Schema.isMaxLength(512)),
  requiredEvidenceKinds: Schema.Array(TrimmedNonEmptyString).check(Schema.isMaxLength(128)),
  activeAttemptId: Schema.optional(Schema.NullOr(WorkUnitAttempt.fields.id)),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  terminalAt: Schema.optional(Schema.NullOr(IsoDateTime)),
});
export type WorkUnit = typeof WorkUnit.Type;

export const Workflow = Schema.Struct({
  id: WorkflowId,
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  outcome: TrimmedNonEmptyString,
  status: WorkflowStatus,
  routingPolicyId: RoutingPolicyId,
  routingPolicyRevision: Schema.Number,
  graphRevision: Schema.Number,
  workUnits: Schema.Array(WorkUnit).check(Schema.isMinLength(1), Schema.isMaxLength(2_000)),
  dependencies: Schema.Array(WorkUnitDependency).check(Schema.isMaxLength(8_000)),
  concurrencyLimit: Schema.Number,
  createdBy: TrimmedNonEmptyString,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  startedAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  completedAt: Schema.optional(Schema.NullOr(IsoDateTime)),
});
export type Workflow = typeof Workflow.Type;

export const ResultPacketStatus = Schema.Literals(["complete", "partial", "failed", "blocked"]);
export type ResultPacketStatus = typeof ResultPacketStatus.Type;

export const ResultPacket = Schema.Struct({
  id: ResultPacketId,
  workflowId: WorkflowId,
  workUnitId: WorkUnitId,
  attemptId: WorkUnitAttempt.fields.id,
  taskContractId: TaskContractId,
  taskContractDigest: TrimmedNonEmptyString,
  status: ResultPacketStatus,
  summary: TrimmedNonEmptyString,
  changedResources: Schema.Array(SascodeResourceRef).check(Schema.isMaxLength(2_000)),
  decisionIds: Schema.Array(DecisionRecordId).check(Schema.isMaxLength(256)),
  evidenceIds: Schema.Array(EvidenceRecordId).check(Schema.isMaxLength(1_000)),
  commandsRun: SascodeBoundedTextList,
  risks: SascodeBoundedTextList,
  unresolvedQuestions: SascodeBoundedTextList,
  nextAction: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  usage: Schema.optional(SascodeUsage),
  producedAt: IsoDateTime,
});
export type ResultPacket = typeof ResultPacket.Type;
