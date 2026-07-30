import { Schema } from "effect";

import { IsoDateTime, ProjectId, TrimmedNonEmptyString } from "../baseSchemas";
import {
  SascodePriority,
  WorkflowId,
  WorkUnitId,
} from "./core";

export const AttentionState = Schema.Literals([
  "quiet",
  "working",
  "observing",
  "waiting-dependency",
  "needs-input",
  "needs-approval",
  "ready-review",
  "failed",
  "complete",
]);
export type AttentionState = typeof AttentionState.Type;

export const AttentionInterruptionClass = Schema.Literals([
  "silent",
  "ambient",
  "in-app",
  "system",
]);
export type AttentionInterruptionClass = typeof AttentionInterruptionClass.Type;

export const FocusMode = Schema.Literals([
  "deep-focus",
  "balanced",
  "supervision",
  "do-not-disturb",
]);
export type FocusMode = typeof FocusMode.Type;

export const AttentionItem = Schema.Struct({
  fingerprint: TrimmedNonEmptyString,
  projectId: ProjectId,
  workflowId: Schema.optional(Schema.NullOr(WorkflowId)),
  workUnitId: Schema.optional(Schema.NullOr(WorkUnitId)),
  state: AttentionState,
  priority: SascodePriority,
  interruptionClass: AttentionInterruptionClass,
  reasonCode: TrimmedNonEmptyString,
  summary: TrimmedNonEmptyString,
  recommendedAction: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  resolvedAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  snoozedUntil: Schema.optional(Schema.NullOr(IsoDateTime)),
});
export type AttentionItem = typeof AttentionItem.Type;

export const ProjectAttentionSummary = Schema.Struct({
  projectId: ProjectId,
  state: AttentionState,
  highestPriority: SascodePriority,
  activeWorkflowCount: Schema.Number,
  activeWorkUnitCount: Schema.Number,
  needsInputCount: Schema.Number,
  needsApprovalCount: Schema.Number,
  failedCount: Schema.Number,
  updatedAt: IsoDateTime,
});
export type ProjectAttentionSummary = typeof ProjectAttentionSummary.Type;

export const AttentionPreference = Schema.Struct({
  projectId: Schema.optional(Schema.NullOr(ProjectId)),
  focusMode: FocusMode,
  mutedReasonCodes: Schema.Array(TrimmedNonEmptyString).check(Schema.isMaxLength(128)),
  systemNotificationsEnabled: Schema.Boolean,
  updatedAt: IsoDateTime,
});
export type AttentionPreference = typeof AttentionPreference.Type;
