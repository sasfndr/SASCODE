import {
  AuditRecordId,
  IsoDateTime,
  PermissionGrantId,
  ProjectId,
  SascodeAuditRecord,
  SascodePermissionBoundary,
  SascodePermissionCapability,
  SascodePermissionGrant,
  SascodeSecretRef,
  SascodeStepUpRequest,
  StepUpRequestId,
  ThreadId,
  WorkflowId,
  WorkUnitId,
} from "@synara/contracts";
import { Effect, Layer, Option, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceSqlOrDecodeError } from "../../persistence/Errors.ts";
import {
  CapabilityRepository,
  GetStepUpRequestInput,
  ListAuditRecordsInput,
  ListProjectCapabilitiesInput,
  ResolveStepUpRequestInput,
  type CapabilityRepositoryShape,
  type PersistedAuditRecord,
} from "../Services/CapabilityRepository.ts";

const InsertedIdRow = Schema.Struct({ id: Schema.String });
const SequenceRow = Schema.Struct({ sequence: Schema.Number });

const PermissionGrantDbRow = Schema.Struct({
  id: PermissionGrantId,
  projectId: ProjectId,
  threadId: Schema.NullOr(ThreadId),
  workflowId: Schema.NullOr(WorkflowId),
  workUnitId: Schema.NullOr(WorkUnitId),
  profile: SascodePermissionGrant.fields.profile,
  capabilities: Schema.fromJsonString(Schema.Array(SascodePermissionCapability)),
  boundary: Schema.fromJsonString(SascodePermissionBoundary),
  grantedBy: SascodePermissionGrant.fields.grantedBy,
  reason: SascodePermissionGrant.fields.reason,
  createdAt: IsoDateTime,
  revokedAt: Schema.NullOr(IsoDateTime),
});
type PermissionGrantDbRow = typeof PermissionGrantDbRow.Type;

const StepUpRequestDbRow = Schema.Struct({
  id: StepUpRequestId,
  projectId: ProjectId,
  threadId: Schema.NullOr(ThreadId),
  workflowId: Schema.NullOr(WorkflowId),
  workUnitId: Schema.NullOr(WorkUnitId),
  status: SascodeStepUpRequest.fields.status,
  requestedCapabilities: Schema.fromJsonString(
    SascodeStepUpRequest.fields.requestedCapabilities,
  ),
  risk: SascodeStepUpRequest.fields.risk,
  reason: SascodeStepUpRequest.fields.reason,
  consequence: SascodeStepUpRequest.fields.consequence,
  requestedAt: IsoDateTime,
  resolvedAt: Schema.NullOr(IsoDateTime),
  resolvedBy: Schema.NullOr(Schema.String),
  decisionReason: Schema.NullOr(Schema.String),
});
type StepUpRequestDbRow = typeof StepUpRequestDbRow.Type;

const AuditRecordDbRow = Schema.Struct({
  sequence: Schema.Number,
  id: AuditRecordId,
  projectId: ProjectId,
  threadId: Schema.NullOr(ThreadId),
  workflowId: Schema.NullOr(WorkflowId),
  workUnitId: Schema.NullOr(WorkUnitId),
  actorKind: SascodeAuditRecord.fields.actorKind,
  actorId: SascodeAuditRecord.fields.actorId,
  action: SascodeAuditRecord.fields.action,
  outcome: SascodeAuditRecord.fields.outcome,
  risk: SascodeAuditRecord.fields.risk,
  resources: Schema.fromJsonString(SascodeAuditRecord.fields.resources),
  reason: Schema.NullOr(Schema.String),
  correlationId: Schema.NullOr(Schema.String),
  occurredAt: IsoDateTime,
});
type AuditRecordDbRow = typeof AuditRecordDbRow.Type;

const scopeFromRow = (row: {
  readonly projectId: ProjectId;
  readonly threadId: ThreadId | null;
  readonly workflowId: WorkflowId | null;
  readonly workUnitId: WorkUnitId | null;
}) => ({
  projectId: row.projectId,
  ...(row.threadId === null ? {} : { threadId: row.threadId }),
  ...(row.workflowId === null ? {} : { workflowId: row.workflowId }),
  ...(row.workUnitId === null ? {} : { workUnitId: row.workUnitId }),
});

const toGrant = (row: PermissionGrantDbRow): SascodePermissionGrant => ({
  id: row.id,
  scope: scopeFromRow(row),
  profile: row.profile,
  capabilities: row.capabilities,
  boundary: row.boundary,
  grantedBy: row.grantedBy,
  reason: row.reason,
  createdAt: row.createdAt,
  revokedAt: row.revokedAt,
});

const toStepUp = (row: StepUpRequestDbRow): SascodeStepUpRequest => ({
  id: row.id,
  scope: scopeFromRow(row),
  status: row.status,
  requestedCapabilities: row.requestedCapabilities,
  risk: row.risk,
  reason: row.reason,
  consequence: row.consequence,
  requestedAt: row.requestedAt,
  resolvedAt: row.resolvedAt,
  resolvedBy: row.resolvedBy,
  decisionReason: row.decisionReason,
});

const toPersistedAudit = (row: AuditRecordDbRow): PersistedAuditRecord => ({
  sequence: row.sequence,
  record: {
    id: row.id,
    scope: scopeFromRow(row),
    actorKind: row.actorKind,
    actorId: row.actorId,
    action: row.action,
    outcome: row.outcome,
    risk: row.risk,
    resources: row.resources,
    reason: row.reason,
    correlationId: row.correlationId,
    occurredAt: row.occurredAt,
  },
});

const makeCapabilityRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const insertGrantRow = SqlSchema.findOneOption({
    Request: SascodePermissionGrant,
    Result: InsertedIdRow,
    execute: (grant) =>
      sql`
        INSERT INTO sascode_permission_grants (
          grant_id,
          project_id,
          thread_id,
          workflow_id,
          work_unit_id,
          profile,
          capabilities_json,
          boundary_json,
          granted_by,
          reason,
          created_at,
          revoked_at
        )
        VALUES (
          ${grant.id},
          ${grant.scope.projectId},
          ${grant.scope.threadId ?? null},
          ${grant.scope.workflowId ?? null},
          ${grant.scope.workUnitId ?? null},
          ${grant.profile},
          ${JSON.stringify(grant.capabilities)},
          ${JSON.stringify(grant.boundary)},
          ${grant.grantedBy},
          ${grant.reason},
          ${grant.createdAt},
          ${grant.revokedAt ?? null}
        )
        ON CONFLICT (grant_id) DO NOTHING
        RETURNING grant_id AS id
      `,
  });

  const listActiveGrantRows = SqlSchema.findAll({
    Request: ListProjectCapabilitiesInput,
    Result: PermissionGrantDbRow,
    execute: ({ projectId, now }) =>
      sql`
        SELECT
          grant_id AS id,
          project_id AS "projectId",
          thread_id AS "threadId",
          workflow_id AS "workflowId",
          work_unit_id AS "workUnitId",
          profile,
          capabilities_json AS capabilities,
          boundary_json AS boundary,
          granted_by AS "grantedBy",
          reason,
          created_at AS "createdAt",
          revoked_at AS "revokedAt"
        FROM sascode_permission_grants
        WHERE project_id = ${projectId}
          AND revoked_at IS NULL
          AND (
            json_extract(boundary_json, '$.expiresAt') IS NULL OR
            json_extract(boundary_json, '$.expiresAt') > ${now}
          )
        ORDER BY created_at DESC, grant_id ASC
      `,
  });

  const insertStepUpRow = SqlSchema.findOneOption({
    Request: SascodeStepUpRequest,
    Result: InsertedIdRow,
    execute: (request) =>
      sql`
        INSERT INTO sascode_step_up_requests (
          request_id,
          project_id,
          thread_id,
          workflow_id,
          work_unit_id,
          status,
          requested_capabilities_json,
          risk,
          reason,
          consequence,
          requested_at,
          resolved_at,
          resolved_by,
          decision_reason
        )
        VALUES (
          ${request.id},
          ${request.scope.projectId},
          ${request.scope.threadId ?? null},
          ${request.scope.workflowId ?? null},
          ${request.scope.workUnitId ?? null},
          ${request.status},
          ${JSON.stringify(request.requestedCapabilities)},
          ${request.risk},
          ${request.reason},
          ${request.consequence},
          ${request.requestedAt},
          ${request.resolvedAt ?? null},
          ${request.resolvedBy ?? null},
          ${request.decisionReason ?? null}
        )
        ON CONFLICT (request_id) DO NOTHING
        RETURNING request_id AS id
      `,
  });

  const getStepUpRow = SqlSchema.findOneOption({
    Request: GetStepUpRequestInput,
    Result: StepUpRequestDbRow,
    execute: ({ requestId }) =>
      sql`
        SELECT
          request_id AS id,
          project_id AS "projectId",
          thread_id AS "threadId",
          workflow_id AS "workflowId",
          work_unit_id AS "workUnitId",
          status,
          requested_capabilities_json AS "requestedCapabilities",
          risk,
          reason,
          consequence,
          requested_at AS "requestedAt",
          resolved_at AS "resolvedAt",
          resolved_by AS "resolvedBy",
          decision_reason AS "decisionReason"
        FROM sascode_step_up_requests
        WHERE request_id = ${requestId}
      `,
  });

  const resolveStepUpRow = SqlSchema.findOneOption({
    Request: ResolveStepUpRequestInput,
    Result: InsertedIdRow,
    execute: (input) =>
      sql`
        UPDATE sascode_step_up_requests
        SET
          status = ${input.nextStatus},
          resolved_at = ${input.resolvedAt},
          resolved_by = ${input.resolvedBy},
          decision_reason = ${input.decisionReason}
        WHERE request_id = ${input.requestId}
          AND status = ${input.expectedStatus}
        RETURNING request_id AS id
      `,
  });

  const upsertSecretRefRow = SqlSchema.void({
    Request: SascodeSecretRef,
    execute: (secret) =>
      sql`
        INSERT INTO sascode_secret_refs (
          secret_ref,
          display_name,
          provider_key,
          project_id,
          vault_backend,
          vault_locator,
          created_at,
          updated_at,
          revoked_at
        )
        VALUES (
          ${secret.ref},
          ${secret.displayName},
          ${secret.providerKey ?? null},
          ${secret.projectId ?? null},
          ${secret.vaultBackend},
          ${secret.vaultLocator},
          ${secret.createdAt},
          ${secret.updatedAt},
          ${secret.revokedAt ?? null}
        )
        ON CONFLICT (secret_ref)
        DO UPDATE SET
          display_name = excluded.display_name,
          provider_key = excluded.provider_key,
          project_id = excluded.project_id,
          vault_backend = excluded.vault_backend,
          vault_locator = excluded.vault_locator,
          updated_at = excluded.updated_at,
          revoked_at = excluded.revoked_at
      `,
  });

  const insertAuditRow = SqlSchema.findOneOption({
    Request: SascodeAuditRecord,
    Result: SequenceRow,
    execute: (record) =>
      sql`
        INSERT INTO sascode_audit_records (
          audit_record_id,
          project_id,
          thread_id,
          workflow_id,
          work_unit_id,
          actor_kind,
          actor_id,
          action,
          outcome,
          risk,
          resources_json,
          reason,
          correlation_id,
          occurred_at
        )
        VALUES (
          ${record.id},
          ${record.scope.projectId},
          ${record.scope.threadId ?? null},
          ${record.scope.workflowId ?? null},
          ${record.scope.workUnitId ?? null},
          ${record.actorKind},
          ${record.actorId},
          ${record.action},
          ${record.outcome},
          ${record.risk},
          ${JSON.stringify(record.resources)},
          ${record.reason ?? null},
          ${record.correlationId ?? null},
          ${record.occurredAt}
        )
        ON CONFLICT (audit_record_id) DO NOTHING
        RETURNING sequence
      `,
  });

  const listAuditRows = SqlSchema.findAll({
    Request: ListAuditRecordsInput,
    Result: AuditRecordDbRow,
    execute: ({ projectId, afterSequence, limit }) =>
      sql`
        SELECT
          sequence,
          audit_record_id AS id,
          project_id AS "projectId",
          thread_id AS "threadId",
          workflow_id AS "workflowId",
          work_unit_id AS "workUnitId",
          actor_kind AS "actorKind",
          actor_id AS "actorId",
          action,
          outcome,
          risk,
          resources_json AS resources,
          reason,
          correlation_id AS "correlationId",
          occurred_at AS "occurredAt"
        FROM sascode_audit_records
        WHERE project_id = ${projectId}
          AND sequence > ${afterSequence}
        ORDER BY sequence ASC
        LIMIT ${Math.max(0, Math.floor(limit))}
      `,
  });

  const findAuditRow = SqlSchema.findOneOption({
    Request: Schema.Struct({ id: AuditRecordId }),
    Result: SequenceRow,
    execute: ({ id }) =>
      sql`
        SELECT sequence
        FROM sascode_audit_records
        WHERE audit_record_id = ${id}
      `,
  });

  const mapError = (operation: string) =>
    toPersistenceSqlOrDecodeError(`${operation}:query`, `${operation}:decode`);

  const saveGrant: CapabilityRepositoryShape["saveGrant"] = (grant) =>
    insertGrantRow(grant).pipe(
      Effect.map(Option.isSome),
      Effect.mapError(mapError("CapabilityRepository.saveGrant")),
    );

  const listActiveGrants: CapabilityRepositoryShape["listActiveGrants"] = (input) =>
    listActiveGrantRows(input).pipe(
      Effect.map((rows) => rows.map(toGrant)),
      Effect.mapError(mapError("CapabilityRepository.listActiveGrants")),
    );

  const saveStepUpRequest: CapabilityRepositoryShape["saveStepUpRequest"] = (request) =>
    insertStepUpRow(request).pipe(
      Effect.map(Option.isSome),
      Effect.mapError(mapError("CapabilityRepository.saveStepUpRequest")),
    );

  const getStepUpRequest: CapabilityRepositoryShape["getStepUpRequest"] = (input) =>
    getStepUpRow(input).pipe(
      Effect.map(Option.map(toStepUp)),
      Effect.mapError(mapError("CapabilityRepository.getStepUpRequest")),
    );

  const resolveStepUpRequest: CapabilityRepositoryShape["resolveStepUpRequest"] = (input) =>
    resolveStepUpRow(input).pipe(
      Effect.map(Option.isSome),
      Effect.mapError(mapError("CapabilityRepository.resolveStepUpRequest")),
    );

  const saveSecretRef: CapabilityRepositoryShape["saveSecretRef"] = (secret) =>
    upsertSecretRefRow(secret).pipe(
      Effect.mapError(mapError("CapabilityRepository.saveSecretRef")),
    );

  const appendAudit: CapabilityRepositoryShape["appendAudit"] = (record) =>
    insertAuditRow(record).pipe(
      Effect.map(
        Option.map(
          (row): PersistedAuditRecord => ({
            sequence: row.sequence,
            record,
          }),
        ),
      ),
      Effect.mapError(mapError("CapabilityRepository.appendAudit")),
    );

  const listAuditRecords: CapabilityRepositoryShape["listAuditRecords"] = (input) =>
    listAuditRows(input).pipe(
      Effect.map((rows) => rows.map(toPersistedAudit)),
      Effect.mapError(mapError("CapabilityRepository.listAuditRecords")),
    );

  const hasAuditRecord: CapabilityRepositoryShape["hasAuditRecord"] = (id) =>
    findAuditRow({ id }).pipe(
      Effect.map(Option.isSome),
      Effect.mapError(mapError("CapabilityRepository.hasAuditRecord")),
    );

  return {
    saveGrant,
    listActiveGrants,
    saveStepUpRequest,
    getStepUpRequest,
    resolveStepUpRequest,
    saveSecretRef,
    appendAudit,
    listAuditRecords,
    hasAuditRecord,
  } satisfies CapabilityRepositoryShape;
});

export const CapabilityRepositoryLive = Layer.effect(
  CapabilityRepository,
  makeCapabilityRepository,
);
