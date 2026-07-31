import {
  SascodeModuleInstance,
  SascodeModuleManifest,
  SascodeStringMap,
} from "@synara/contracts";
import { Effect, Layer, Option, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceSqlOrDecodeError } from "../../persistence/Errors.ts";
import {
  GetModuleInstanceInput,
  GetModuleManifestInput,
  InstallModuleManifestInput,
  ListModuleInstancesInput,
  ModuleRepository,
  UpdateModuleInstanceInput,
  type ModuleRepositoryShape,
} from "../Services/ModuleRepository.ts";

const ModuleManifestJsonRow = Schema.Struct({
  manifest: Schema.fromJsonString(SascodeModuleManifest),
});

const ModuleInstanceDbRow = Schema.Struct({
  id: SascodeModuleInstance.fields.id,
  moduleId: SascodeModuleInstance.fields.moduleId,
  moduleVersion: SascodeModuleInstance.fields.moduleVersion,
  projectId: SascodeModuleInstance.fields.projectId,
  status: SascodeModuleInstance.fields.status,
  placement: SascodeModuleInstance.fields.placement,
  configuration: Schema.fromJsonString(SascodeStringMap),
  state: Schema.fromJsonString(SascodeStringMap),
  createdAt: SascodeModuleInstance.fields.createdAt,
  updatedAt: SascodeModuleInstance.fields.updatedAt,
});

const makeModuleRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const installManifestRow = SqlSchema.findOneOption({
    Request: InstallModuleManifestInput,
    Result: Schema.Struct({ id: Schema.String }),
    execute: ({ manifest, installedAt }) =>
      sql`
        INSERT INTO sascode_module_manifests (
          module_id,
          version,
          manifest_json,
          origin,
          signature,
          installed_at,
          removed_at
        )
        VALUES (
          ${manifest.id},
          ${manifest.version},
          ${JSON.stringify(manifest)},
          ${manifest.origin},
          ${manifest.signature ?? null},
          ${installedAt},
          NULL
        )
        ON CONFLICT (module_id, version) DO NOTHING
        RETURNING module_id AS id
      `,
  });

  const getManifestRow = SqlSchema.findOneOption({
    Request: GetModuleManifestInput,
    Result: ModuleManifestJsonRow,
    execute: ({ moduleId, version }) =>
      sql`
        SELECT manifest_json AS manifest
        FROM sascode_module_manifests
        WHERE module_id = ${moduleId}
          AND version = ${version}
          AND removed_at IS NULL
      `,
  });

  const createInstanceRow = SqlSchema.findOneOption({
    Request: SascodeModuleInstance,
    Result: Schema.Struct({ id: Schema.String }),
    execute: (instance) =>
      sql`
        INSERT INTO sascode_module_instances (
          module_instance_id,
          module_id,
          module_version,
          project_id,
          status,
          placement,
          configuration_json,
          state_json,
          created_at,
          updated_at
        )
        VALUES (
          ${instance.id},
          ${instance.moduleId},
          ${instance.moduleVersion},
          ${instance.projectId ?? null},
          ${instance.status},
          ${instance.placement},
          ${JSON.stringify(instance.configuration)},
          ${JSON.stringify(instance.state)},
          ${instance.createdAt},
          ${instance.updatedAt}
        )
        ON CONFLICT (module_instance_id) DO NOTHING
        RETURNING module_instance_id AS id
      `,
  });

  const getInstanceRow = SqlSchema.findOneOption({
    Request: GetModuleInstanceInput,
    Result: ModuleInstanceDbRow,
    execute: ({ instanceId }) =>
      sql`
        SELECT
          module_instance_id AS id,
          module_id AS "moduleId",
          module_version AS "moduleVersion",
          project_id AS "projectId",
          status,
          placement,
          configuration_json AS configuration,
          state_json AS state,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM sascode_module_instances
        WHERE module_instance_id = ${instanceId}
      `,
  });

  const listInstanceRows = SqlSchema.findAll({
    Request: ListModuleInstancesInput,
    Result: ModuleInstanceDbRow,
    execute: ({ projectId }) =>
      sql`
        SELECT
          module_instance_id AS id,
          module_id AS "moduleId",
          module_version AS "moduleVersion",
          project_id AS "projectId",
          status,
          placement,
          configuration_json AS configuration,
          state_json AS state,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM sascode_module_instances
        WHERE (
          (${projectId} IS NULL AND project_id IS NULL) OR
          project_id = ${projectId}
        )
        ORDER BY updated_at DESC, module_instance_id ASC
      `,
  });

  const updateInstanceRow = SqlSchema.findOneOption({
    Request: UpdateModuleInstanceInput,
    Result: Schema.Struct({ id: Schema.String }),
    execute: ({ instance, expectedUpdatedAt }) =>
      sql`
        UPDATE sascode_module_instances
        SET
          status = ${instance.status},
          placement = ${instance.placement},
          configuration_json = ${JSON.stringify(instance.configuration)},
          state_json = ${JSON.stringify(instance.state)},
          updated_at = ${instance.updatedAt}
        WHERE module_instance_id = ${instance.id}
          AND module_id = ${instance.moduleId}
          AND module_version = ${instance.moduleVersion}
          AND updated_at = ${expectedUpdatedAt}
        RETURNING module_instance_id AS id
      `,
  });

  const mapError = (operation: string) =>
    toPersistenceSqlOrDecodeError(`${operation}:query`, `${operation}:decode`);

  const installManifest: ModuleRepositoryShape["installManifest"] = (manifest) =>
    installManifestRow(manifest).pipe(
      Effect.map(Option.isSome),
      Effect.mapError(mapError("ModuleRepository.installManifest")),
    );

  const getManifest: ModuleRepositoryShape["getManifest"] = (input) =>
    getManifestRow(input).pipe(
      Effect.map(Option.map((row) => row.manifest)),
      Effect.mapError(mapError("ModuleRepository.getManifest")),
    );

  const createInstance: ModuleRepositoryShape["createInstance"] = (instance) =>
    createInstanceRow(instance).pipe(
      Effect.map(Option.isSome),
      Effect.mapError(mapError("ModuleRepository.createInstance")),
    );

  const getInstance: ModuleRepositoryShape["getInstance"] = (input) =>
    getInstanceRow(input).pipe(
      Effect.mapError(mapError("ModuleRepository.getInstance")),
    );

  const listInstances: ModuleRepositoryShape["listInstances"] = (input) =>
    listInstanceRows(input).pipe(
      Effect.mapError(mapError("ModuleRepository.listInstances")),
    );

  const updateInstance: ModuleRepositoryShape["updateInstance"] = (input) =>
    updateInstanceRow(input).pipe(
      Effect.map(Option.isSome),
      Effect.mapError(mapError("ModuleRepository.updateInstance")),
    );

  return {
    installManifest,
    getManifest,
    createInstance,
    getInstance,
    listInstances,
    updateInstance,
  } satisfies ModuleRepositoryShape;
});

export const ModuleRepositoryLive = Layer.effect(
  ModuleRepository,
  makeModuleRepository,
);
