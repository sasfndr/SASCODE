import {
  AcceptanceCriterion,
  ContextArtifactId,
  IsoDateTime,
  PermissionGrantId,
  ResultPacket,
  ResultPacketId,
  ResultPacketVerification,
  SascodePermissionProfile,
  SascodeResourceRef,
  TaskContract,
  TaskContractId,
  WorkUnitId,
} from "@synara/contracts";
import { Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";
import type { TaskContractDomainError } from "../Errors.ts";

export const SealTaskContractInput = Schema.Struct({
  taskContractId: TaskContractId,
  workUnitId: WorkUnitId,
  version: Schema.Number,
  instructions: Schema.String,
  acceptanceCriteria: Schema.Array(AcceptanceCriterion),
  allowedResources: Schema.Array(SascodeResourceRef),
  forbiddenResources: Schema.Array(SascodeResourceRef),
  contextArtifactIds: Schema.Array(ContextArtifactId),
  dependencyResultPacketIds: Schema.Array(ResultPacketId),
  baselineGitRef: Schema.optional(Schema.NullOr(Schema.String)),
  permissionProfile: SascodePermissionProfile,
  permissionGrantIds: Schema.Array(PermissionGrantId),
  expectedArtifacts: Schema.Array(Schema.String),
  occurredAt: IsoDateTime,
});
export type SealTaskContractInput = typeof SealTaskContractInput.Type;

export const RecordResultPacketInput = Schema.Struct({
  packet: ResultPacket,
  verifiedAt: IsoDateTime,
});
export type RecordResultPacketInput = typeof RecordResultPacketInput.Type;

export type TaskContractServiceError =
  | TaskContractDomainError
  | ProjectionRepositoryError;

export interface TaskContractsShape {
  readonly seal: (
    input: SealTaskContractInput,
  ) => Effect.Effect<TaskContract, TaskContractServiceError>;

  readonly recordAndVerifyResult: (
    input: RecordResultPacketInput,
  ) => Effect.Effect<ResultPacketVerification, TaskContractServiceError>;
}

export class TaskContracts extends ServiceMap.Service<
  TaskContracts,
  TaskContractsShape
>()("sascode/Services/TaskContracts") {}
