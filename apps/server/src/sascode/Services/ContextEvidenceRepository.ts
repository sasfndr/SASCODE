import {
  ContextArtifact,
  DecisionRecord,
  EvidenceRecord,
  ProjectId,
  QualityGateRun,
  ResultPacket,
  ResultPacketId,
  ResultPacketVerification,
  TaskContract,
  TaskContractId,
  WorkUnitAttemptId,
  WorkUnitId,
} from "@synara/contracts";
import { Option, Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";

export const EvidenceSubjectLink = Schema.Struct({
  subjectKind: Schema.Literals([
    "workflow",
    "work-unit",
    "attempt",
    "task-contract",
    "result-packet",
    "quality-gate",
    "artifact",
  ]),
  subjectId: Schema.String,
});
export type EvidenceSubjectLink = typeof EvidenceSubjectLink.Type;

export const SaveEvidenceRecordInput = Schema.Struct({
  evidence: EvidenceRecord,
  links: Schema.Array(EvidenceSubjectLink),
  contentHash: Schema.optional(Schema.NullOr(Schema.String)),
});
export type SaveEvidenceRecordInput = typeof SaveEvidenceRecordInput.Type;

export const GetTaskContractInput = Schema.Struct({
  taskContractId: TaskContractId,
});
export type GetTaskContractInput = typeof GetTaskContractInput.Type;

export const GetResultPacketInput = Schema.Struct({
  resultPacketId: ResultPacketId,
});
export type GetResultPacketInput = typeof GetResultPacketInput.Type;

export const GetResultPacketByAttemptInput = Schema.Struct({
  attemptId: WorkUnitAttemptId,
});
export type GetResultPacketByAttemptInput =
  typeof GetResultPacketByAttemptInput.Type;

export const ListProjectContextInput = Schema.Struct({
  projectId: ProjectId,
});
export type ListProjectContextInput = typeof ListProjectContextInput.Type;

export const ListWorkUnitEvidenceInput = Schema.Struct({
  workUnitId: WorkUnitId,
});
export type ListWorkUnitEvidenceInput = typeof ListWorkUnitEvidenceInput.Type;

export interface ContextEvidenceRepositoryShape {
  readonly upsertContextArtifact: (
    artifact: ContextArtifact,
  ) => Effect.Effect<void, ProjectionRepositoryError>;

  readonly listActiveContextArtifacts: (
    input: ListProjectContextInput,
  ) => Effect.Effect<ReadonlyArray<ContextArtifact>, ProjectionRepositoryError>;

  readonly saveDecisionRecord: (
    decision: DecisionRecord,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  readonly saveTaskContract: (
    contract: TaskContract,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  readonly getTaskContract: (
    input: GetTaskContractInput,
  ) => Effect.Effect<Option.Option<TaskContract>, ProjectionRepositoryError>;

  readonly saveResultPacket: (
    packet: ResultPacket,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  readonly getResultPacket: (
    input: GetResultPacketInput,
  ) => Effect.Effect<Option.Option<ResultPacket>, ProjectionRepositoryError>;

  readonly getResultPacketByAttempt: (
    input: GetResultPacketByAttemptInput,
  ) => Effect.Effect<Option.Option<ResultPacket>, ProjectionRepositoryError>;

  readonly saveResultVerification: (
    verification: ResultPacketVerification,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  readonly getResultVerification: (
    input: GetResultPacketInput,
  ) => Effect.Effect<
    Option.Option<ResultPacketVerification>,
    ProjectionRepositoryError
  >;

  readonly saveEvidenceRecord: (
    input: SaveEvidenceRecordInput,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  readonly listEvidenceByWorkUnit: (
    input: ListWorkUnitEvidenceInput,
  ) => Effect.Effect<ReadonlyArray<EvidenceRecord>, ProjectionRepositoryError>;

  readonly saveQualityGateRun: (
    gateRun: QualityGateRun,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  readonly listQualityGateRunsByWorkUnit: (
    input: ListWorkUnitEvidenceInput,
  ) => Effect.Effect<ReadonlyArray<QualityGateRun>, ProjectionRepositoryError>;
}

export class ContextEvidenceRepository extends ServiceMap.Service<
  ContextEvidenceRepository,
  ContextEvidenceRepositoryShape
>()("sascode/Services/ContextEvidenceRepository") {}
