import {
  IsoDateTime,
  ModuleId,
  ModuleInstanceId,
  ProjectId,
  SascodeModuleInstance,
  SascodeModuleManifest,
} from "@synara/contracts";
import { Option, Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";

export const GetModuleManifestInput = Schema.Struct({
  moduleId: ModuleId,
  version: Schema.String,
});
export type GetModuleManifestInput = typeof GetModuleManifestInput.Type;

export const InstallModuleManifestInput = Schema.Struct({
  manifest: SascodeModuleManifest,
  installedAt: IsoDateTime,
});
export type InstallModuleManifestInput =
  typeof InstallModuleManifestInput.Type;

export const GetModuleInstanceInput = Schema.Struct({
  instanceId: ModuleInstanceId,
});
export type GetModuleInstanceInput = typeof GetModuleInstanceInput.Type;

export const ListModuleInstancesInput = Schema.Struct({
  projectId: Schema.NullOr(ProjectId),
});
export type ListModuleInstancesInput = typeof ListModuleInstancesInput.Type;

export const UpdateModuleInstanceInput = Schema.Struct({
  instance: SascodeModuleInstance,
  expectedUpdatedAt: Schema.String,
});
export type UpdateModuleInstanceInput = typeof UpdateModuleInstanceInput.Type;

export interface ModuleRepositoryShape {
  readonly installManifest: (
    input: InstallModuleManifestInput,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  readonly getManifest: (
    input: GetModuleManifestInput,
  ) => Effect.Effect<Option.Option<SascodeModuleManifest>, ProjectionRepositoryError>;

  readonly createInstance: (
    instance: SascodeModuleInstance,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  readonly getInstance: (
    input: GetModuleInstanceInput,
  ) => Effect.Effect<Option.Option<SascodeModuleInstance>, ProjectionRepositoryError>;

  readonly listInstances: (
    input: ListModuleInstancesInput,
  ) => Effect.Effect<ReadonlyArray<SascodeModuleInstance>, ProjectionRepositoryError>;

  readonly updateInstance: (
    input: UpdateModuleInstanceInput,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;
}

export class ModuleRepository extends ServiceMap.Service<
  ModuleRepository,
  ModuleRepositoryShape
>()("sascode/Services/ModuleRepository") {}
