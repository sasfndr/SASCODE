import { Schema } from "effect";

import { IsoDateTime, ProjectId, TrimmedNonEmptyString } from "../baseSchemas";
import {
  ContextArtifactId,
  DecisionRecordId,
  EvidenceRecordId,
  QualityGateRunId,
  SascodeBoundedTextList,
  SascodeResourceRef,
  SascodeScope,
  SascodeUsage,
} from "./core";

export const ContextArtifactKind = Schema.Literals([
  "global-taste-profile",
  "project-charter",
  "design-contract",
  "architecture",
  "decision-ledger",
  "session-working-set",
  "evidence-ledger",
  "resume-capsule",
  "custom",
]);
export type ContextArtifactKind = typeof ContextArtifactKind.Type;

export const ContextArtifact = Schema.Struct({
  id: ContextArtifactId,
  projectId: ProjectId,
  kind: ContextArtifactKind,
  title: TrimmedNonEmptyString,
  version: Schema.Number,
  content: Schema.String.check(Schema.isMaxLength(1_000_000)),
  contentHash: TrimmedNonEmptyString,
  source: Schema.optional(SascodeResourceRef),
  tags: Schema.Array(TrimmedNonEmptyString).check(Schema.isMaxLength(128)),
  active: Schema.Boolean,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ContextArtifact = typeof ContextArtifact.Type;

export const DecisionRecordStatus = Schema.Literals(["proposed", "accepted", "superseded"]);
export type DecisionRecordStatus = typeof DecisionRecordStatus.Type;

export const DecisionRecord = Schema.Struct({
  id: DecisionRecordId,
  scope: SascodeScope,
  status: DecisionRecordStatus,
  question: TrimmedNonEmptyString,
  decision: TrimmedNonEmptyString,
  rationale: TrimmedNonEmptyString,
  alternatives: SascodeBoundedTextList,
  consequences: SascodeBoundedTextList,
  supersedesId: Schema.optional(Schema.NullOr(DecisionRecordId)),
  decidedBy: TrimmedNonEmptyString,
  decidedAt: IsoDateTime,
});
export type DecisionRecord = typeof DecisionRecord.Type;

export const EvidenceKind = Schema.Literals([
  "test",
  "typecheck",
  "lint",
  "build",
  "security-scan",
  "diff-review",
  "code-review",
  "browser-check",
  "visual-comparison",
  "accessibility-check",
  "performance-check",
  "deployment",
  "approval",
  "manual-observation",
  "artifact",
]);
export type EvidenceKind = typeof EvidenceKind.Type;

export const EvidenceStatus = Schema.Literals([
  "passed",
  "failed",
  "inconclusive",
  "not-run",
]);
export type EvidenceStatus = typeof EvidenceStatus.Type;

export const EvidenceRecord = Schema.Struct({
  id: EvidenceRecordId,
  scope: SascodeScope,
  kind: EvidenceKind,
  status: EvidenceStatus,
  summary: TrimmedNonEmptyString,
  command: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  resources: Schema.Array(SascodeResourceRef).check(Schema.isMaxLength(256)),
  details: Schema.optional(Schema.String.check(Schema.isMaxLength(262_144))),
  producer: TrimmedNonEmptyString,
  usage: Schema.optional(SascodeUsage),
  createdAt: IsoDateTime,
  expiresAt: Schema.optional(Schema.NullOr(IsoDateTime)),
});
export type EvidenceRecord = typeof EvidenceRecord.Type;

export const QualityGateDefinition = Schema.Struct({
  key: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  evidenceKinds: Schema.Array(EvidenceKind).check(Schema.isMinLength(1), Schema.isMaxLength(32)),
  required: Schema.Boolean,
  blockOnFailure: Schema.Boolean,
  freshnessSeconds: Schema.optional(Schema.Number),
});
export type QualityGateDefinition = typeof QualityGateDefinition.Type;

export const QualityGateRunStatus = Schema.Literals([
  "pending",
  "running",
  "passed",
  "failed",
  "cancelled",
]);
export type QualityGateRunStatus = typeof QualityGateRunStatus.Type;

export const QualityGateRun = Schema.Struct({
  id: QualityGateRunId,
  scope: SascodeScope,
  gate: QualityGateDefinition,
  status: QualityGateRunStatus,
  evidenceIds: Schema.Array(EvidenceRecordId).check(Schema.isMaxLength(256)),
  startedAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  completedAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  failureReason: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
});
export type QualityGateRun = typeof QualityGateRun.Type;
