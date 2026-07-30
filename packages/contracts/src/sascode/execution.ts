import { Schema } from "effect";

import { IsoDateTime, PositiveInt } from "../baseSchemas";
import {
  ContextArtifactId,
  PermissionGrantId,
  SascodeBoundedTextList,
  SascodeResourceRef,
  WorkflowId,
  WorkUnitId,
} from "./core";
import { SascodePermissionProfile } from "./permissions";
import { RoutingConstraint } from "./routing";
import {
  AcceptanceCriterion,
  ResultPacket,
  ResultPacketVerification,
  WorkUnitAttempt,
} from "./workflow";
import { EvidenceRecord, QualityGateRun } from "./context";

/**
 * Durable, user-authored execution intent for one work unit.
 *
 * The Director persists this before changing lifecycle state. That makes a
 * partially scheduled work unit restartable without asking the UI or the
 * originating model to reconstruct its prompt and safety boundaries.
 */
export const WorkUnitExecutionSpec = Schema.Struct({
  workflowId: WorkflowId,
  workUnitId: WorkUnitId,
  revision: PositiveInt,
  instructions: Schema.String.check(Schema.isMaxLength(262_144)),
  acceptanceCriteria: Schema.Array(AcceptanceCriterion).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(256),
  ),
  allowedResources: Schema.Array(SascodeResourceRef).check(
    Schema.isMaxLength(512),
  ),
  forbiddenResources: Schema.Array(SascodeResourceRef).check(
    Schema.isMaxLength(512),
  ),
  contextArtifactIds: Schema.Array(ContextArtifactId).check(
    Schema.isMaxLength(256),
  ),
  permissionProfile: SascodePermissionProfile,
  permissionGrantIds: Schema.Array(PermissionGrantId).check(
    Schema.isMaxLength(128),
  ),
  expectedArtifacts: SascodeBoundedTextList,
  routingConstraints: Schema.Array(RoutingConstraint).check(
    Schema.isMaxLength(128),
  ),
  baselineGitRef: Schema.optional(Schema.NullOr(Schema.String)),
  maxAttempts: PositiveInt,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type WorkUnitExecutionSpec = typeof WorkUnitExecutionSpec.Type;

export const WorkUnitExecutionDisposition = Schema.Literals([
  "scheduled",
  "already-active",
  "retry-exhausted",
  "not-ready",
]);
export type WorkUnitExecutionDisposition =
  typeof WorkUnitExecutionDisposition.Type;

export const WorkUnitExecutionResult = Schema.Struct({
  disposition: WorkUnitExecutionDisposition,
  attempt: Schema.NullOr(WorkUnitAttempt),
});
export type WorkUnitExecutionResult = typeof WorkUnitExecutionResult.Type;

export const WorkUnitExecutionBatch = Schema.Struct({
  scanned: Schema.Number,
  scheduled: Schema.Number,
  active: Schema.Number,
  exhausted: Schema.Number,
  deferred: Schema.Number,
  results: Schema.Array(
    Schema.Struct({
      workUnitId: WorkUnitId,
      result: WorkUnitExecutionResult,
    }),
  ),
});
export type WorkUnitExecutionBatch = typeof WorkUnitExecutionBatch.Type;

export const WorkUnitResultSubmission = Schema.Struct({
  packet: ResultPacket,
  evidence: Schema.Array(EvidenceRecord).check(Schema.isMaxLength(1_000)),
  qualityGateRuns: Schema.Array(QualityGateRun).check(
    Schema.isMaxLength(128),
  ),
  verifiedAt: IsoDateTime,
});
export type WorkUnitResultSubmission =
  typeof WorkUnitResultSubmission.Type;

export const WorkUnitResultSubmissionOutcome = Schema.Struct({
  verification: ResultPacketVerification,
  attempt: WorkUnitAttempt,
  downstream: WorkUnitExecutionBatch,
  replayed: Schema.Boolean,
});
export type WorkUnitResultSubmissionOutcome =
  typeof WorkUnitResultSubmissionOutcome.Type;
