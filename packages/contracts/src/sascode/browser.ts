import { Schema } from "effect";

import { IsoDateTime, ProjectId, ThreadId, TrimmedNonEmptyString } from "../baseSchemas";
import {
  BrowserInstanceId,
  BrowserProfileId,
  BrowserTabId,
  EvidenceRecordId,
  WorkflowId,
  WorkUnitId,
} from "./core";

export const BrowserExecutionBackend = Schema.Literals([
  "local-visible",
  "local-isolated",
  "remote-hosted",
]);
export type BrowserExecutionBackend = typeof BrowserExecutionBackend.Type;

export const BrowserProfile = Schema.Struct({
  id: BrowserProfileId,
  projectId: Schema.optional(Schema.NullOr(ProjectId)),
  name: TrimmedNonEmptyString,
  partitionKey: TrimmedNonEmptyString,
  persistent: Schema.Boolean,
  allowedHosts: Schema.Array(TrimmedNonEmptyString).check(Schema.isMaxLength(256)),
  blockedHosts: Schema.Array(TrimmedNonEmptyString).check(Schema.isMaxLength(256)),
  containsAuthenticatedState: Schema.Boolean,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type BrowserProfile = typeof BrowserProfile.Type;

export const BrowserInstanceStatus = Schema.Literals([
  "starting",
  "ready",
  "agent-controlled",
  "human-controlled",
  "paused",
  "error",
  "stopped",
]);
export type BrowserInstanceStatus = typeof BrowserInstanceStatus.Type;

export const BrowserControlOwner = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("human") }),
  Schema.Struct({
    kind: Schema.Literal("agent"),
    threadId: ThreadId,
    workflowId: Schema.optional(Schema.NullOr(WorkflowId)),
    workUnitId: Schema.optional(Schema.NullOr(WorkUnitId)),
  }),
  Schema.Struct({ kind: Schema.Literal("none") }),
]);
export type BrowserControlOwner = typeof BrowserControlOwner.Type;

export const BrowserTab = Schema.Struct({
  id: BrowserTabId,
  url: Schema.String,
  title: Schema.String,
  active: Schema.Boolean,
  lastNavigationAt: Schema.optional(Schema.NullOr(IsoDateTime)),
});
export type BrowserTab = typeof BrowserTab.Type;

export const BrowserInstance = Schema.Struct({
  id: BrowserInstanceId,
  projectId: ProjectId,
  profileId: BrowserProfileId,
  backend: BrowserExecutionBackend,
  status: BrowserInstanceStatus,
  controlOwner: BrowserControlOwner,
  tabs: Schema.Array(BrowserTab).check(Schema.isMaxLength(256)),
  assignedWorkflowId: Schema.optional(Schema.NullOr(WorkflowId)),
  assignedWorkUnitId: Schema.optional(Schema.NullOr(WorkUnitId)),
  evidenceIds: Schema.Array(EvidenceRecordId).check(Schema.isMaxLength(2_000)),
  recordingEnabled: Schema.Boolean,
  runtimeGeneration: Schema.Number,
  authorizationEpoch: Schema.Number,
  controlLeaseExpiresAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  lastError: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  stoppedAt: Schema.optional(Schema.NullOr(IsoDateTime)),
});
export type BrowserInstance = typeof BrowserInstance.Type;
