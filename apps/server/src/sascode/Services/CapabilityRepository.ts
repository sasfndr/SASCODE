import {
  AuditRecordId,
  ProjectId,
  SascodeAuditRecord,
  SascodePermissionGrant,
  SascodeSecretRef,
  SascodeStepUpRequest,
  StepUpRequestId,
} from "@synara/contracts";
import { Option, Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";

export const ListProjectCapabilitiesInput = Schema.Struct({
  projectId: ProjectId,
  now: Schema.String,
});
export type ListProjectCapabilitiesInput =
  typeof ListProjectCapabilitiesInput.Type;

export const GetStepUpRequestInput = Schema.Struct({
  requestId: StepUpRequestId,
});
export type GetStepUpRequestInput = typeof GetStepUpRequestInput.Type;

export const ResolveStepUpRequestInput = Schema.Struct({
  requestId: StepUpRequestId,
  expectedStatus: Schema.Literal("pending"),
  nextStatus: Schema.Literals(["approved", "denied", "expired", "cancelled"]),
  resolvedAt: Schema.String,
  resolvedBy: Schema.String,
  decisionReason: Schema.String,
});
export type ResolveStepUpRequestInput =
  typeof ResolveStepUpRequestInput.Type;

export const ListAuditRecordsInput = Schema.Struct({
  projectId: ProjectId,
  afterSequence: Schema.Number,
  limit: Schema.Number,
});
export type ListAuditRecordsInput = typeof ListAuditRecordsInput.Type;

export const PersistedAuditRecord = Schema.Struct({
  sequence: Schema.Number,
  record: SascodeAuditRecord,
});
export type PersistedAuditRecord = typeof PersistedAuditRecord.Type;

export interface CapabilityRepositoryShape {
  readonly saveGrant: (
    grant: SascodePermissionGrant,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  readonly listActiveGrants: (
    input: ListProjectCapabilitiesInput,
  ) => Effect.Effect<ReadonlyArray<SascodePermissionGrant>, ProjectionRepositoryError>;

  readonly saveStepUpRequest: (
    request: SascodeStepUpRequest,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  readonly getStepUpRequest: (
    input: GetStepUpRequestInput,
  ) => Effect.Effect<Option.Option<SascodeStepUpRequest>, ProjectionRepositoryError>;

  readonly resolveStepUpRequest: (
    input: ResolveStepUpRequestInput,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  readonly saveSecretRef: (
    secretRef: SascodeSecretRef,
  ) => Effect.Effect<void, ProjectionRepositoryError>;

  readonly appendAudit: (
    record: SascodeAuditRecord,
  ) => Effect.Effect<Option.Option<PersistedAuditRecord>, ProjectionRepositoryError>;

  readonly listAuditRecords: (
    input: ListAuditRecordsInput,
  ) => Effect.Effect<ReadonlyArray<PersistedAuditRecord>, ProjectionRepositoryError>;

  readonly hasAuditRecord: (
    auditRecordId: AuditRecordId,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;
}

export class CapabilityRepository extends ServiceMap.Service<
  CapabilityRepository,
  CapabilityRepositoryShape
>()("sascode/Services/CapabilityRepository") {}
