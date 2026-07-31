import {
  BrowserControlOwner,
  BrowserInstance,
  BrowserProfile,
  BrowserTab,
  EvidenceRecordId,
} from "@synara/contracts";
import { Effect, Layer, Option, Schema, Struct } from "effect";
import * as SchemaGetter from "effect/SchemaGetter";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceSqlOrDecodeError } from "../../persistence/Errors.ts";
import {
  AcquireBrowserControlInput,
  BrowserWorkspaceRepository,
  GetBrowserInstanceInput,
  GetBrowserProfileInput,
  ListBrowserInstancesInput,
  ListBrowserProfilesInput,
  ReleaseBrowserControlInput,
  UpdateBrowserInstanceInput,
  type BrowserWorkspaceRepositoryShape,
} from "../Services/BrowserWorkspaceRepository.ts";

const SqliteBoolean = Schema.Number.pipe(
  Schema.decodeTo(Schema.Boolean, {
    decode: SchemaGetter.transform((value) => value !== 0),
    encode: SchemaGetter.transform((value) => (value ? 1 : 0)),
  }),
);

const BrowserProfileDbRow = BrowserProfile.mapFields(
  Struct.assign({
    persistent: SqliteBoolean,
    allowedHosts: Schema.fromJsonString(BrowserProfile.fields.allowedHosts),
    blockedHosts: Schema.fromJsonString(BrowserProfile.fields.blockedHosts),
    containsAuthenticatedState: SqliteBoolean,
  }),
);

const BrowserInstanceDbRow = BrowserInstance.mapFields(
  Struct.assign({
    controlOwner: Schema.fromJsonString(BrowserControlOwner),
    tabs: Schema.fromJsonString(Schema.Array(BrowserTab)),
    evidenceIds: Schema.fromJsonString(Schema.Array(EvidenceRecordId)),
    recordingEnabled: SqliteBoolean,
  }),
);

const makeBrowserWorkspaceRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const saveProfileRow = SqlSchema.findOneOption({
    Request: BrowserProfile,
    Result: Schema.Struct({ id: Schema.String }),
    execute: (profile) =>
      sql`
        INSERT INTO sascode_browser_profiles (
          browser_profile_id,
          project_id,
          name,
          partition_key,
          persistent,
          allowed_hosts_json,
          blocked_hosts_json,
          contains_authenticated_state,
          created_at,
          updated_at
        )
        VALUES (
          ${profile.id},
          ${profile.projectId ?? null},
          ${profile.name},
          ${profile.partitionKey},
          ${profile.persistent ? 1 : 0},
          ${JSON.stringify(profile.allowedHosts)},
          ${JSON.stringify(profile.blockedHosts)},
          ${profile.containsAuthenticatedState ? 1 : 0},
          ${profile.createdAt},
          ${profile.updatedAt}
        )
        ON CONFLICT (browser_profile_id)
        DO UPDATE SET
          project_id = excluded.project_id,
          name = excluded.name,
          persistent = excluded.persistent,
          allowed_hosts_json = excluded.allowed_hosts_json,
          blocked_hosts_json = excluded.blocked_hosts_json,
          contains_authenticated_state = excluded.contains_authenticated_state,
          updated_at = excluded.updated_at
        RETURNING browser_profile_id AS id
      `,
  });

  const getProfileRow = SqlSchema.findOneOption({
    Request: GetBrowserProfileInput,
    Result: BrowserProfileDbRow,
    execute: ({ profileId }) =>
      sql`
        SELECT
          browser_profile_id AS id,
          project_id AS "projectId",
          name,
          partition_key AS "partitionKey",
          persistent,
          allowed_hosts_json AS "allowedHosts",
          blocked_hosts_json AS "blockedHosts",
          contains_authenticated_state AS "containsAuthenticatedState",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM sascode_browser_profiles
        WHERE browser_profile_id = ${profileId}
      `,
  });

  const listProfileRows = SqlSchema.findAll({
    Request: ListBrowserProfilesInput,
    Result: BrowserProfileDbRow,
    execute: ({ projectId }) =>
      sql`
        SELECT
          browser_profile_id AS id,
          project_id AS "projectId",
          name,
          partition_key AS "partitionKey",
          persistent,
          allowed_hosts_json AS "allowedHosts",
          blocked_hosts_json AS "blockedHosts",
          contains_authenticated_state AS "containsAuthenticatedState",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM sascode_browser_profiles
        WHERE project_id IS NULL OR project_id = ${projectId}
        ORDER BY project_id IS NULL DESC, name ASC, browser_profile_id ASC
      `,
  });

  const createInstanceRow = SqlSchema.findOneOption({
    Request: BrowserInstance,
    Result: Schema.Struct({ id: Schema.String }),
    execute: (instance) =>
      sql`
        INSERT INTO sascode_browser_instances (
          browser_instance_id,
          project_id,
          browser_profile_id,
          backend,
          status,
          control_owner_json,
          tabs_json,
          assigned_workflow_id,
          assigned_work_unit_id,
          evidence_ids_json,
          recording_enabled,
          last_error,
          runtime_generation,
          authorization_epoch,
          control_lease_expires_at,
          created_at,
          updated_at,
          stopped_at
        )
        VALUES (
          ${instance.id},
          ${instance.projectId},
          ${instance.profileId},
          ${instance.backend},
          ${instance.status},
          ${JSON.stringify(instance.controlOwner)},
          ${JSON.stringify(instance.tabs)},
          ${instance.assignedWorkflowId ?? null},
          ${instance.assignedWorkUnitId ?? null},
          ${JSON.stringify(instance.evidenceIds)},
          ${instance.recordingEnabled ? 1 : 0},
          ${instance.lastError ?? null},
          ${instance.runtimeGeneration},
          ${instance.authorizationEpoch},
          ${instance.controlLeaseExpiresAt ?? null},
          ${instance.createdAt},
          ${instance.updatedAt},
          ${instance.stoppedAt ?? null}
        )
        ON CONFLICT (browser_instance_id) DO NOTHING
        RETURNING browser_instance_id AS id
      `,
  });

  const getInstanceRow = SqlSchema.findOneOption({
    Request: GetBrowserInstanceInput,
    Result: BrowserInstanceDbRow,
    execute: ({ instanceId }) =>
      sql`
        SELECT
          browser_instance_id AS id,
          project_id AS "projectId",
          browser_profile_id AS "profileId",
          backend,
          status,
          control_owner_json AS "controlOwner",
          tabs_json AS tabs,
          assigned_workflow_id AS "assignedWorkflowId",
          assigned_work_unit_id AS "assignedWorkUnitId",
          evidence_ids_json AS "evidenceIds",
          recording_enabled AS "recordingEnabled",
          runtime_generation AS "runtimeGeneration",
          authorization_epoch AS "authorizationEpoch",
          control_lease_expires_at AS "controlLeaseExpiresAt",
          last_error AS "lastError",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          stopped_at AS "stoppedAt"
        FROM sascode_browser_instances
        WHERE browser_instance_id = ${instanceId}
      `,
  });

  const listInstanceRows = SqlSchema.findAll({
    Request: ListBrowserInstancesInput,
    Result: BrowserInstanceDbRow,
    execute: ({ projectId }) =>
      sql`
        SELECT
          browser_instance_id AS id,
          project_id AS "projectId",
          browser_profile_id AS "profileId",
          backend,
          status,
          control_owner_json AS "controlOwner",
          tabs_json AS tabs,
          assigned_workflow_id AS "assignedWorkflowId",
          assigned_work_unit_id AS "assignedWorkUnitId",
          evidence_ids_json AS "evidenceIds",
          recording_enabled AS "recordingEnabled",
          runtime_generation AS "runtimeGeneration",
          authorization_epoch AS "authorizationEpoch",
          control_lease_expires_at AS "controlLeaseExpiresAt",
          last_error AS "lastError",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          stopped_at AS "stoppedAt"
        FROM sascode_browser_instances
        WHERE project_id = ${projectId}
        ORDER BY updated_at DESC, browser_instance_id ASC
      `,
  });

  const acquireControlRow = SqlSchema.findOneOption({
    Request: AcquireBrowserControlInput,
    Result: BrowserInstanceDbRow,
    execute: (input) => {
      const ownerJson = JSON.stringify(input.owner);
      const status =
        input.owner.kind === "human"
          ? "human-controlled"
          : input.owner.kind === "agent"
            ? "agent-controlled"
            : "ready";
      return sql`
        UPDATE sascode_browser_instances
        SET
          status = ${status},
          control_owner_json = ${ownerJson},
          authorization_epoch = authorization_epoch + 1,
          control_lease_expires_at = ${input.leaseExpiresAt},
          updated_at = ${input.now}
        WHERE browser_instance_id = ${input.instanceId}
          AND authorization_epoch = ${input.expectedAuthorizationEpoch}
          AND status NOT IN ('stopped', 'error')
          AND (
            control_lease_expires_at IS NULL OR
            control_lease_expires_at <= ${input.now} OR
            control_owner_json = '{"kind":"none"}' OR
            control_owner_json = ${ownerJson}
          )
        RETURNING
          browser_instance_id AS id,
          project_id AS "projectId",
          browser_profile_id AS "profileId",
          backend,
          status,
          control_owner_json AS "controlOwner",
          tabs_json AS tabs,
          assigned_workflow_id AS "assignedWorkflowId",
          assigned_work_unit_id AS "assignedWorkUnitId",
          evidence_ids_json AS "evidenceIds",
          recording_enabled AS "recordingEnabled",
          runtime_generation AS "runtimeGeneration",
          authorization_epoch AS "authorizationEpoch",
          control_lease_expires_at AS "controlLeaseExpiresAt",
          last_error AS "lastError",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          stopped_at AS "stoppedAt"
      `;
    },
  });

  const releaseControlRow = SqlSchema.findOneOption({
    Request: ReleaseBrowserControlInput,
    Result: BrowserInstanceDbRow,
    execute: (input) =>
      sql`
        UPDATE sascode_browser_instances
        SET
          status = 'ready',
          control_owner_json = '{"kind":"none"}',
          authorization_epoch = authorization_epoch + 1,
          control_lease_expires_at = NULL,
          updated_at = ${input.now}
        WHERE browser_instance_id = ${input.instanceId}
          AND authorization_epoch = ${input.expectedAuthorizationEpoch}
          AND status NOT IN ('stopped', 'error')
        RETURNING
          browser_instance_id AS id,
          project_id AS "projectId",
          browser_profile_id AS "profileId",
          backend,
          status,
          control_owner_json AS "controlOwner",
          tabs_json AS tabs,
          assigned_workflow_id AS "assignedWorkflowId",
          assigned_work_unit_id AS "assignedWorkUnitId",
          evidence_ids_json AS "evidenceIds",
          recording_enabled AS "recordingEnabled",
          runtime_generation AS "runtimeGeneration",
          authorization_epoch AS "authorizationEpoch",
          control_lease_expires_at AS "controlLeaseExpiresAt",
          last_error AS "lastError",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          stopped_at AS "stoppedAt"
      `,
  });

  const updateInstanceRow = SqlSchema.findOneOption({
    Request: UpdateBrowserInstanceInput,
    Result: Schema.Struct({ id: Schema.String }),
    execute: ({ instance, expectedRuntimeGeneration, expectedAuthorizationEpoch }) =>
      sql`
        UPDATE sascode_browser_instances
        SET
          backend = ${instance.backend},
          status = ${instance.status},
          tabs_json = ${JSON.stringify(instance.tabs)},
          assigned_workflow_id = ${instance.assignedWorkflowId ?? null},
          assigned_work_unit_id = ${instance.assignedWorkUnitId ?? null},
          evidence_ids_json = ${JSON.stringify(instance.evidenceIds)},
          recording_enabled = ${instance.recordingEnabled ? 1 : 0},
          last_error = ${instance.lastError ?? null},
          runtime_generation = ${instance.runtimeGeneration},
          updated_at = ${instance.updatedAt},
          stopped_at = ${instance.stoppedAt ?? null}
        WHERE browser_instance_id = ${instance.id}
          AND runtime_generation = ${expectedRuntimeGeneration}
          AND authorization_epoch = ${expectedAuthorizationEpoch}
        RETURNING browser_instance_id AS id
      `,
  });

  const mapError = (operation: string) =>
    toPersistenceSqlOrDecodeError(`${operation}:query`, `${operation}:decode`);

  const saveProfile: BrowserWorkspaceRepositoryShape["saveProfile"] = (profile) =>
    saveProfileRow(profile).pipe(
      Effect.map(Option.isSome),
      Effect.mapError(mapError("BrowserWorkspaceRepository.saveProfile")),
    );

  const getProfile: BrowserWorkspaceRepositoryShape["getProfile"] = (input) =>
    getProfileRow(input).pipe(
      Effect.mapError(mapError("BrowserWorkspaceRepository.getProfile")),
    );

  const listProfiles: BrowserWorkspaceRepositoryShape["listProfiles"] = (input) =>
    listProfileRows(input).pipe(
      Effect.mapError(mapError("BrowserWorkspaceRepository.listProfiles")),
    );

  const createInstance: BrowserWorkspaceRepositoryShape["createInstance"] = (instance) =>
    createInstanceRow(instance).pipe(
      Effect.map(Option.isSome),
      Effect.mapError(mapError("BrowserWorkspaceRepository.createInstance")),
    );

  const getInstance: BrowserWorkspaceRepositoryShape["getInstance"] = (input) =>
    getInstanceRow(input).pipe(
      Effect.mapError(mapError("BrowserWorkspaceRepository.getInstance")),
    );

  const listInstances: BrowserWorkspaceRepositoryShape["listInstances"] = (input) =>
    listInstanceRows(input).pipe(
      Effect.mapError(mapError("BrowserWorkspaceRepository.listInstances")),
    );

  const acquireControl: BrowserWorkspaceRepositoryShape["acquireControl"] = (input) =>
    acquireControlRow(input).pipe(
      Effect.mapError(mapError("BrowserWorkspaceRepository.acquireControl")),
    );

  const releaseControl: BrowserWorkspaceRepositoryShape["releaseControl"] = (input) =>
    releaseControlRow(input).pipe(
      Effect.mapError(mapError("BrowserWorkspaceRepository.releaseControl")),
    );

  const updateInstance: BrowserWorkspaceRepositoryShape["updateInstance"] = (input) =>
    updateInstanceRow(input).pipe(
      Effect.map(Option.isSome),
      Effect.mapError(mapError("BrowserWorkspaceRepository.updateInstance")),
    );

  return {
    saveProfile,
    getProfile,
    listProfiles,
    createInstance,
    getInstance,
    listInstances,
    acquireControl,
    releaseControl,
    updateInstance,
  } satisfies BrowserWorkspaceRepositoryShape;
});

export const BrowserWorkspaceRepositoryLive = Layer.effect(
  BrowserWorkspaceRepository,
  makeBrowserWorkspaceRepository,
);
