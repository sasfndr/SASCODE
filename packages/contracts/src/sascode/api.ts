import { Schema } from "effect";

import {
  IsoDateTime,
  ProjectId,
  ThreadId,
} from "../baseSchemas";
import {
  BrowserInstance,
  BrowserProfile,
} from "./browser";
import {
  DirectorCommandContext,
  DirectorEvent,
  DirectorEventCursor,
} from "./directorEvents";
import { SascodeModuleInstance } from "./modules";
import { SascodePermissionGrant } from "./permissions";
import { ProviderCapabilitySnapshot } from "./capabilities";
import {
  WorkflowId,
  WorkUnitAttemptId,
  WorkUnitId,
} from "./core";
import {
  Workflow,
  WorkflowStatus,
  WorkUnit,
  WorkUnitAttempt,
  WorkUnitAttemptStatus,
  WorkUnitStatus,
} from "./workflow";
import {
  ProjectAttentionSnapshot,
  WorkspaceAttentionSnapshot,
} from "./attention";

export const SASCODE_WS_METHODS = {
  getWorkspaceSnapshot: "sascode.getWorkspaceSnapshot",
  getProjectSnapshot: "sascode.getProjectSnapshot",
  getWorkflow: "sascode.getWorkflow",
  listProviderCapabilities: "sascode.listProviderCapabilities",
  listEvents: "sascode.listEvents",
  executeDirectorCommand: "sascode.executeDirectorCommand",
  dispatchAttempt: "sascode.dispatchAttempt",
  subscribeEvents: "sascode.subscribeEvents",
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
  activePermissionGrants: Schema.Array(SascodePermissionGrant),
  generatedAt: IsoDateTime,
});
export type SascodeProjectSnapshot = typeof SascodeProjectSnapshot.Type;

export const SascodeGetWorkflowInput = Schema.Struct({
  workflowId: WorkflowId,
});
export type SascodeGetWorkflowInput = typeof SascodeGetWorkflowInput.Type;

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
