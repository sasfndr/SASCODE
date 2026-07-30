import { Schema } from "effect";

import {
  IsoDateTime,
  NonNegativeInt,
  PositiveInt,
  ProjectId,
  TrimmedNonEmptyString,
} from "../baseSchemas";
import {
  DirectorCommandId,
  DirectorEventId,
  WorkflowId,
  WorkUnitAttemptId,
  WorkUnitId,
} from "./core";

export const DirectorAggregateKind = Schema.Literals([
  "workflow",
  "work-unit",
  "attempt",
]);
export type DirectorAggregateKind = typeof DirectorAggregateKind.Type;

export const DirectorAggregateId = Schema.Union([
  WorkflowId,
  WorkUnitId,
  WorkUnitAttemptId,
]);
export type DirectorAggregateId = typeof DirectorAggregateId.Type;

export const DirectorEventType = Schema.Literals([
  "workflow.proposed",
  "workflow.status-changed",
  "work-unit.status-changed",
  "work-units.reconciled",
  "attempt.started",
  "attempt.status-changed",
  "attempt.thread-attached",
  "attempt.result-attached",
  "attempt.dispatch-requested",
  "attempt.dispatch-completed",
  "attempt.dispatch-failed",
  "attempt.recovery-requested",
]);
export type DirectorEventType = typeof DirectorEventType.Type;

export const DirectorActorKind = Schema.Literals([
  "human",
  "agent",
  "system",
  "module",
]);
export type DirectorActorKind = typeof DirectorActorKind.Type;

export const DirectorCommandContext = Schema.Struct({
  commandId: DirectorCommandId,
  actorKind: DirectorActorKind,
  actorId: TrimmedNonEmptyString,
  occurredAt: IsoDateTime,
  correlationId: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  causationEventId: Schema.optional(Schema.NullOr(DirectorEventId)),
});
export type DirectorCommandContext = typeof DirectorCommandContext.Type;

export const DirectorEventPayload = Schema.Record(
  TrimmedNonEmptyString,
  Schema.Unknown,
);
export type DirectorEventPayload = typeof DirectorEventPayload.Type;

export const DirectorEventMetadata = Schema.Record(
  TrimmedNonEmptyString,
  Schema.String,
);
export type DirectorEventMetadata = typeof DirectorEventMetadata.Type;

export const DirectorEvent = Schema.Struct({
  sequence: PositiveInt,
  id: DirectorEventId,
  projectId: ProjectId,
  aggregateKind: DirectorAggregateKind,
  aggregateId: DirectorAggregateId,
  streamVersion: PositiveInt,
  type: DirectorEventType,
  occurredAt: IsoDateTime,
  commandId: DirectorCommandId,
  causationEventId: Schema.optional(Schema.NullOr(DirectorEventId)),
  correlationId: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  actorKind: DirectorActorKind,
  actorId: TrimmedNonEmptyString,
  payload: DirectorEventPayload,
  metadata: DirectorEventMetadata,
});
export type DirectorEvent = typeof DirectorEvent.Type;

export const DirectorCommandReceiptStatus = Schema.Literals([
  "accepted",
  "rejected",
]);
export type DirectorCommandReceiptStatus =
  typeof DirectorCommandReceiptStatus.Type;

export const DirectorCommandReceipt = Schema.Struct({
  commandId: DirectorCommandId,
  aggregateKind: DirectorAggregateKind,
  aggregateId: DirectorAggregateId,
  acceptedAt: IsoDateTime,
  resultSequence: PositiveInt,
  status: DirectorCommandReceiptStatus,
  fingerprintVersion: PositiveInt,
  commandFingerprint: TrimmedNonEmptyString,
});
export type DirectorCommandReceipt = typeof DirectorCommandReceipt.Type;

export const DirectorEventCursor = Schema.Struct({
  afterSequence: NonNegativeInt,
  limit: PositiveInt,
  projectId: Schema.optional(Schema.NullOr(ProjectId)),
});
export type DirectorEventCursor = typeof DirectorEventCursor.Type;
