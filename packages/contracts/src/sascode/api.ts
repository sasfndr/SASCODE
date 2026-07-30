import { Schema } from "effect";

import {
  IsoDateTime,
  ProjectId,
  ThreadId,
} from "../baseSchemas";
import {
  BrowserControlOwner,
  BrowserInstance,
  BrowserProfile,
} from "./browser";
import {
  DirectorCommandContext,
  DirectorEvent,
  DirectorEventCursor,
} from "./directorEvents";
import {
  SascodeModuleInstance,
  SascodeModuleManifest,
} from "./modules";
import { SascodeWorkspaceLayout } from "./layout";
import {
  SascodeAuthorizationDecision,
  SascodePermissionCapability,
  SascodePermissionGrant,
  SascodePermissionProfile,
} from "./permissions";
import {
  ProviderCapabilitySnapshot,
  ProviderCatalogRefreshResult,
} from "./capabilities";
import {
  AuditRecordId,
  BrowserInstanceId,
  StepUpRequestId,
  WorkflowId,
  WorkUnitAttemptId,
  WorkUnitId,
} from "./core";
import {
  WorkUnitExecutionBatch,
  WorkUnitExecutionResult,
  WorkUnitExecutionSpec,
  WorkUnitResultSubmission,
  WorkUnitResultSubmissionOutcome,
} from "./execution";
import {
  Workflow,
  WorkflowStatus,
  WorkUnit,
  WorkUnitAttempt,
  WorkUnitAttemptStatus,
  WorkUnitStatus,
} from "./workflow";
import {
  ContextArtifact,
} from "./context";
import {
  RoutingPolicy,
} from "./routing";
import {
  AttentionPreference,
  ProjectAttentionSnapshot,
  WorkspaceAttentionSnapshot,
} from "./attention";

export const SASCODE_WS_METHODS = {
  getWorkspaceSnapshot: "sascode.getWorkspaceSnapshot",
  getProjectSnapshot: "sascode.getProjectSnapshot",
  getWorkflow: "sascode.getWorkflow",
  listProviderCapabilities: "sascode.listProviderCapabilities",
  refreshProviderCapabilities: "sascode.refreshProviderCapabilities",
  listEvents: "sascode.listEvents",
  executeDirectorCommand: "sascode.executeDirectorCommand",
  scheduleWorkUnit: "sascode.scheduleWorkUnit",
  runWorkflow: "sascode.runWorkflow",
  submitResult: "sascode.submitResult",
  dispatchAttempt: "sascode.dispatchAttempt",
  subscribeEvents: "sascode.subscribeEvents",
  publishRoutingPolicy: "sascode.publishRoutingPolicy",
  upsertContextArtifact: "sascode.upsertContextArtifact",
  savePermissionGrant: "sascode.savePermissionGrant",
  saveBrowserProfile: "sascode.saveBrowserProfile",
  createBrowserInstance: "sascode.createBrowserInstance",
  acquireBrowserControl: "sascode.acquireBrowserControl",
  releaseBrowserControl: "sascode.releaseBrowserControl",
  updateBrowserInstance: "sascode.updateBrowserInstance",
  installModule: "sascode.installModule",
  instantiateModule: "sascode.instantiateModule",
  activateModule: "sascode.activateModule",
  updateModuleInstance: "sascode.updateModuleInstance",
  bootstrapProject: "sascode.bootstrapProject",
  startFeature: "sascode.startFeature",
  getWorkspaceLayout: "sascode.getWorkspaceLayout",
  saveWorkspaceLayout: "sascode.saveWorkspaceLayout",
  saveAttentionPreference: "sascode.saveAttentionPreference",
  resolveAttentionItem: "sascode.resolveAttentionItem",
} as const;

export const SascodeGetWorkspaceSnapshotInput = Schema.Struct({
  projectIds: Schema.Array(ProjectId),
  now: IsoDateTime,
});
export type SascodeGetWorkspaceSnapshotInput =
  typeof SascodeGetWorkspaceSnapshotInput.Type;

export const SascodeWorkspaceSnapshot = Schema.Struct({
  attention: WorkspaceAttentionSnapshot,
  providerCapabilities: Schema.Array(ProviderCapabilitySnapshot),
  generatedAt: IsoDateTime,
});
export type SascodeWorkspaceSnapshot =
  typeof SascodeWorkspaceSnapshot.Type;

export const SascodeGetProjectSnapshotInput = Schema.Struct({
  projectId: ProjectId,
  now: IsoDateTime,
});
export type SascodeGetProjectSnapshotInput =
  typeof SascodeGetProjectSnapshotInput.Type;

export const SascodeProjectSnapshot = Schema.Struct({
  projectId: ProjectId,
  workflows: Schema.Array(Workflow),
  attention: ProjectAttentionSnapshot,
  browserProfiles: Schema.Array(BrowserProfile),
  browserInstances: Schema.Array(BrowserInstance),
  modules: Schema.Array(SascodeModuleInstance),
  layout: Schema.NullOr(SascodeWorkspaceLayout),
  activePermissionGrants: Schema.Array(SascodePermissionGrant),
  generatedAt: IsoDateTime,
});
export type SascodeProjectSnapshot = typeof SascodeProjectSnapshot.Type;

export const SascodeGetWorkflowInput = Schema.Struct({
  workflowId: WorkflowId,
});
export type SascodeGetWorkflowInput = typeof SascodeGetWorkflowInput.Type;

export const SascodeRefreshProviderCapabilitiesInput = Schema.Struct({
  occurredAt: IsoDateTime,
});
export type SascodeRefreshProviderCapabilitiesInput =
  typeof SascodeRefreshProviderCapabilitiesInput.Type;

export const SascodeDirectorCommand = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("workflow.propose"),
    context: DirectorCommandContext,
    workflow: Workflow,
  }),
  Schema.Struct({
    type: Schema.Literal("workflow.move"),
    context: DirectorCommandContext,
    workflowId: WorkflowId,
    nextStatus: WorkflowStatus,
  }),
  Schema.Struct({
    type: Schema.Literal("work-unit.move"),
    context: DirectorCommandContext,
    workUnitId: WorkUnitId,
    nextStatus: WorkUnitStatus,
  }),
  Schema.Struct({
    type: Schema.Literal("workflow.reconcile-ready"),
    context: DirectorCommandContext,
    workflowId: WorkflowId,
    passedGateKeys: Schema.Array(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal("attempt.begin"),
    context: DirectorCommandContext,
    attempt: WorkUnitAttempt,
  }),
  Schema.Struct({
    type: Schema.Literal("attempt.advance"),
    context: DirectorCommandContext,
    attemptId: WorkUnitAttemptId,
    nextStatus: WorkUnitAttemptStatus,
    error: Schema.optional(Schema.NullOr(Schema.String)),
  }),
  Schema.Struct({
    type: Schema.Literal("attempt.attach-thread"),
    context: DirectorCommandContext,
    attemptId: WorkUnitAttemptId,
    threadId: ThreadId,
    worktreePath: Schema.optional(Schema.NullOr(Schema.String)),
    baselineGitRef: Schema.optional(Schema.NullOr(Schema.String)),
  }),
]);
export type SascodeDirectorCommand = typeof SascodeDirectorCommand.Type;

const DirectorCommandResultBase = {
  event: DirectorEvent,
  replayed: Schema.Boolean,
};

export const SascodeDirectorCommandResult = Schema.Union([
  Schema.Struct({
    ...DirectorCommandResultBase,
    resultKind: Schema.Literal("workflow"),
    current: Workflow,
  }),
  Schema.Struct({
    ...DirectorCommandResultBase,
    resultKind: Schema.Literal("work-unit"),
    current: WorkUnit,
  }),
  Schema.Struct({
    ...DirectorCommandResultBase,
    resultKind: Schema.Literal("attempt"),
    current: WorkUnitAttempt,
  }),
  Schema.Struct({
    ...DirectorCommandResultBase,
    resultKind: Schema.Literal("work-unit-ids"),
    current: Schema.Array(WorkUnitId),
  }),
]);
export type SascodeDirectorCommandResult =
  typeof SascodeDirectorCommandResult.Type;

export const SascodeScheduleWorkUnitInput = Schema.Struct({
  spec: WorkUnitExecutionSpec,
  occurredAt: IsoDateTime,
});
export type SascodeScheduleWorkUnitInput =
  typeof SascodeScheduleWorkUnitInput.Type;

export const SascodeScheduleWorkUnitResult = WorkUnitExecutionResult;
export type SascodeScheduleWorkUnitResult =
  typeof SascodeScheduleWorkUnitResult.Type;

export const SascodeRunWorkflowInput = Schema.Struct({
  workflowId: WorkflowId,
  occurredAt: IsoDateTime,
  limit: Schema.Number,
});
export type SascodeRunWorkflowInput = typeof SascodeRunWorkflowInput.Type;

export const SascodeRunWorkflowResult = WorkUnitExecutionBatch;
export type SascodeRunWorkflowResult = typeof SascodeRunWorkflowResult.Type;

export const SascodeSubmitResultInput = WorkUnitResultSubmission;
export type SascodeSubmitResultInput =
  typeof SascodeSubmitResultInput.Type;

export const SascodeSubmitResultResult = WorkUnitResultSubmissionOutcome;
export type SascodeSubmitResultResult =
  typeof SascodeSubmitResultResult.Type;

export const SascodeDispatchAttemptInput = Schema.Struct({
  attemptId: WorkUnitAttemptId,
  occurredAt: IsoDateTime,
});
export type SascodeDispatchAttemptInput =
  typeof SascodeDispatchAttemptInput.Type;

export const SascodeDispatchAttemptResult = Schema.Struct({
  attempt: WorkUnitAttempt,
  recovered: Schema.Boolean,
});
export type SascodeDispatchAttemptResult =
  typeof SascodeDispatchAttemptResult.Type;

export const SascodeListEventsInput = DirectorEventCursor;
export type SascodeListEventsInput = typeof SascodeListEventsInput.Type;

export const SascodeSubscribeEventsInput = Schema.Struct({
  afterSequence: Schema.Number,
  projectId: Schema.optional(Schema.NullOr(ProjectId)),
});
export type SascodeSubscribeEventsInput =
  typeof SascodeSubscribeEventsInput.Type;

export const SascodePublishRoutingPolicyInput = RoutingPolicy;
export type SascodePublishRoutingPolicyInput =
  typeof SascodePublishRoutingPolicyInput.Type;

export const SascodeUpsertContextArtifactInput = ContextArtifact;
export type SascodeUpsertContextArtifactInput =
  typeof SascodeUpsertContextArtifactInput.Type;

export const SascodeSavePermissionGrantInput = SascodePermissionGrant;
export type SascodeSavePermissionGrantInput =
  typeof SascodeSavePermissionGrantInput.Type;

export const SascodeSaveBrowserProfileInput = BrowserProfile;
export type SascodeSaveBrowserProfileInput =
  typeof SascodeSaveBrowserProfileInput.Type;

export const SascodeCreateBrowserInstanceInput = BrowserInstance;
export type SascodeCreateBrowserInstanceInput =
  typeof SascodeCreateBrowserInstanceInput.Type;

export const SascodeAcquireBrowserControlInput = Schema.Struct({
  auditRecordId: AuditRecordId,
  stepUpRequestId: StepUpRequestId,
  instanceId: BrowserInstanceId,
  owner: BrowserControlOwner,
  expectedAuthorizationEpoch: Schema.Number,
  leaseExpiresAt: IsoDateTime,
  actorKind: Schema.Literals(["human", "agent", "system", "module"]),
  actorId: Schema.String,
  reason: Schema.String,
  consequence: Schema.String,
  correlationId: Schema.optional(Schema.NullOr(Schema.String)),
  occurredAt: IsoDateTime,
});
export type SascodeAcquireBrowserControlInput =
  typeof SascodeAcquireBrowserControlInput.Type;

export const SascodeAcquireBrowserControlResult = Schema.Struct({
  authorization: SascodeAuthorizationDecision,
  instance: BrowserInstance,
  acquired: Schema.Boolean,
});
export type SascodeAcquireBrowserControlResult =
  typeof SascodeAcquireBrowserControlResult.Type;

export const SascodeReleaseBrowserControlInput = Schema.Struct({
  instanceId: BrowserInstanceId,
  expectedAuthorizationEpoch: Schema.Number,
  now: IsoDateTime,
});
export type SascodeReleaseBrowserControlInput =
  typeof SascodeReleaseBrowserControlInput.Type;

export const SascodeUpdateBrowserInstanceInput = Schema.Struct({
  instance: BrowserInstance,
  expectedRuntimeGeneration: Schema.Number,
  expectedAuthorizationEpoch: Schema.Number,
});
export type SascodeUpdateBrowserInstanceInput =
  typeof SascodeUpdateBrowserInstanceInput.Type;

export const SascodeInstallModuleInput = Schema.Struct({
  manifest: SascodeModuleManifest,
  installedAt: IsoDateTime,
});
export type SascodeInstallModuleInput =
  typeof SascodeInstallModuleInput.Type;

export const SascodeInstantiateModuleInput = SascodeModuleInstance;
export type SascodeInstantiateModuleInput =
  typeof SascodeInstantiateModuleInput.Type;

export const SascodeUpdateModuleInstanceInput = Schema.Struct({
  instance: SascodeModuleInstance,
  expectedUpdatedAt: IsoDateTime,
});
export type SascodeUpdateModuleInstanceInput =
  typeof SascodeUpdateModuleInstanceInput.Type;

export const SascodeModuleAuthorizationEnvelope = Schema.Struct({
  capability: SascodePermissionCapability,
  auditRecordId: AuditRecordId,
  stepUpRequestId: StepUpRequestId,
  actorId: Schema.String,
  reason: Schema.String,
  consequence: Schema.String,
  correlationId: Schema.optional(Schema.NullOr(Schema.String)),
});
export type SascodeModuleAuthorizationEnvelope =
  typeof SascodeModuleAuthorizationEnvelope.Type;

export const SascodeActivateModuleInput = Schema.Struct({
  instanceId: SascodeModuleInstance.fields.id,
  expectedUpdatedAt: IsoDateTime,
  authorizations: Schema.Array(SascodeModuleAuthorizationEnvelope),
  isolatedExecution: Schema.Boolean,
  occurredAt: IsoDateTime,
});
export type SascodeActivateModuleInput =
  typeof SascodeActivateModuleInput.Type;

export const SascodeActivateModuleResult = Schema.Struct({
  instance: SascodeModuleInstance,
  authorizations: Schema.Array(SascodeAuthorizationDecision),
  activated: Schema.Boolean,
});
export type SascodeActivateModuleResult =
  typeof SascodeActivateModuleResult.Type;

export const SascodeBootstrapProjectInput = Schema.Struct({
  projectId: ProjectId,
  projectName: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  workspaceRoots: Schema.Array(
    Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(8_192)),
  ).check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  allowedHosts: Schema.Array(
    Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  ).check(Schema.isMaxLength(128)),
  permissionProfile: SascodePermissionProfile,
  policyRevision: Schema.Number,
  maxParallelWorkUnits: Schema.Number,
  projectCharter: Schema.optional(
    Schema.String.check(Schema.isMaxLength(1_000_000)),
  ),
  designContract: Schema.optional(
    Schema.String.check(Schema.isMaxLength(1_000_000)),
  ),
  globalTasteProfile: Schema.optional(
    Schema.String.check(Schema.isMaxLength(1_000_000)),
  ),
  occurredAt: IsoDateTime,
});
export type SascodeBootstrapProjectInput =
  typeof SascodeBootstrapProjectInput.Type;

export const SascodeBootstrapProjectResult = Schema.Struct({
  policy: RoutingPolicy,
  permissionGrant: SascodePermissionGrant,
  contextArtifacts: Schema.Array(ContextArtifact),
  layout: SascodeWorkspaceLayout,
  policyCreated: Schema.Boolean,
  permissionGrantCreated: Schema.Boolean,
  layoutCreated: Schema.Boolean,
});
export type SascodeBootstrapProjectResult =
  typeof SascodeBootstrapProjectResult.Type;

export const SascodeStartFeatureInput = Schema.Struct({
  requestId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  projectId: ProjectId,
  title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2_048)),
  outcome: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(8_192)),
  request: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(262_144)),
  workspaceRoot: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(8_192)),
  includeFrontend: Schema.Boolean,
  includeBackend: Schema.Boolean,
  includeBrowserValidation: Schema.Boolean,
  includeIndependentReview: Schema.Boolean,
  permissionProfile: SascodePermissionProfile,
  policyRevision: Schema.Number,
  concurrencyLimit: Schema.Number,
  maxAttempts: Schema.Number,
  baselineGitRef: Schema.optional(Schema.NullOr(Schema.String)),
  occurredAt: IsoDateTime,
});
export type SascodeStartFeatureInput =
  typeof SascodeStartFeatureInput.Type;

export const SascodeStartFeatureResult = Schema.Struct({
  workflow: Workflow,
  executionSpecs: Schema.Array(WorkUnitExecutionSpec),
  execution: WorkUnitExecutionBatch,
  replayed: Schema.Boolean,
});
export type SascodeStartFeatureResult =
  typeof SascodeStartFeatureResult.Type;

export const SascodeGetWorkspaceLayoutInput = Schema.Struct({
  projectId: ProjectId,
});
export type SascodeGetWorkspaceLayoutInput =
  typeof SascodeGetWorkspaceLayoutInput.Type;

export const SascodeSaveWorkspaceLayoutInput = Schema.Struct({
  layout: SascodeWorkspaceLayout,
  expectedRevision: Schema.Number,
});
export type SascodeSaveWorkspaceLayoutInput =
  typeof SascodeSaveWorkspaceLayoutInput.Type;

export const SascodeSaveAttentionPreferenceInput = AttentionPreference;
export type SascodeSaveAttentionPreferenceInput =
  typeof SascodeSaveAttentionPreferenceInput.Type;

export const SascodeResolveAttentionItemInput = Schema.Struct({
  fingerprint: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2_048)),
  resolvedAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type SascodeResolveAttentionItemInput =
  typeof SascodeResolveAttentionItemInput.Type;

/**
 * Stable renderer-facing client surface for the SASCODE control plane.
 *
 * The WebSocket transport implements this interface directly. Keeping the
 * surface beside the schemas means UI code consumes the same typed contract as
 * the server rather than duplicating request and result shapes.
 */
export interface SascodeClientApi {
  getWorkspaceSnapshot: (
    input: SascodeGetWorkspaceSnapshotInput,
  ) => Promise<SascodeWorkspaceSnapshot>;
  getProjectSnapshot: (
    input: SascodeGetProjectSnapshotInput,
  ) => Promise<SascodeProjectSnapshot>;
  getWorkflow: (input: SascodeGetWorkflowInput) => Promise<Workflow | null>;
  listProviderCapabilities: () => Promise<ReadonlyArray<ProviderCapabilitySnapshot>>;
  refreshProviderCapabilities: (
    input: SascodeRefreshProviderCapabilitiesInput,
  ) => Promise<ProviderCatalogRefreshResult>;
  listEvents: (input: SascodeListEventsInput) => Promise<ReadonlyArray<DirectorEvent>>;
  executeDirectorCommand: (
    input: SascodeDirectorCommand,
  ) => Promise<SascodeDirectorCommandResult>;
  scheduleWorkUnit: (
    input: SascodeScheduleWorkUnitInput,
  ) => Promise<SascodeScheduleWorkUnitResult>;
  runWorkflow: (input: SascodeRunWorkflowInput) => Promise<SascodeRunWorkflowResult>;
  submitResult: (input: SascodeSubmitResultInput) => Promise<SascodeSubmitResultResult>;
  dispatchAttempt: (
    input: SascodeDispatchAttemptInput,
  ) => Promise<SascodeDispatchAttemptResult>;
  subscribeEvents: (
    input: SascodeSubscribeEventsInput,
    listener: (event: DirectorEvent) => void,
  ) => () => void;
  publishRoutingPolicy: (input: SascodePublishRoutingPolicyInput) => Promise<boolean>;
  upsertContextArtifact: (input: SascodeUpsertContextArtifactInput) => Promise<void>;
  savePermissionGrant: (input: SascodeSavePermissionGrantInput) => Promise<boolean>;
  saveBrowserProfile: (input: SascodeSaveBrowserProfileInput) => Promise<BrowserProfile>;
  createBrowserInstance: (
    input: SascodeCreateBrowserInstanceInput,
  ) => Promise<BrowserInstance>;
  acquireBrowserControl: (
    input: SascodeAcquireBrowserControlInput,
  ) => Promise<SascodeAcquireBrowserControlResult>;
  releaseBrowserControl: (
    input: SascodeReleaseBrowserControlInput,
  ) => Promise<BrowserInstance>;
  updateBrowserInstance: (
    input: SascodeUpdateBrowserInstanceInput,
  ) => Promise<BrowserInstance>;
  installModule: (input: SascodeInstallModuleInput) => Promise<SascodeModuleManifest>;
  instantiateModule: (
    input: SascodeInstantiateModuleInput,
  ) => Promise<SascodeModuleInstance>;
  activateModule: (
    input: SascodeActivateModuleInput,
  ) => Promise<SascodeActivateModuleResult>;
  updateModuleInstance: (
    input: SascodeUpdateModuleInstanceInput,
  ) => Promise<SascodeModuleInstance>;
  bootstrapProject: (
    input: SascodeBootstrapProjectInput,
  ) => Promise<SascodeBootstrapProjectResult>;
  startFeature: (input: SascodeStartFeatureInput) => Promise<SascodeStartFeatureResult>;
  getWorkspaceLayout: (
    input: SascodeGetWorkspaceLayoutInput,
  ) => Promise<SascodeWorkspaceLayout | null>;
  saveWorkspaceLayout: (
    input: SascodeSaveWorkspaceLayoutInput,
  ) => Promise<SascodeWorkspaceLayout>;
  saveAttentionPreference: (input: SascodeSaveAttentionPreferenceInput) => Promise<void>;
  resolveAttentionItem: (input: SascodeResolveAttentionItemInput) => Promise<boolean>;
}
