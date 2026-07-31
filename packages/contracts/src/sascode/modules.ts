import { Schema } from "effect";

import { IsoDateTime, ProjectId, TrimmedNonEmptyString } from "../baseSchemas";
import {
  ModuleId,
  ModuleInstanceId,
  SascodeStringMap,
} from "./core";
import { SascodePermissionCapability } from "./permissions";

export const SascodeModuleCategory = Schema.Literals([
  "core-work",
  "product-building",
  "collaboration",
  "focus",
  "media",
  "custom",
]);
export type SascodeModuleCategory = typeof SascodeModuleCategory.Type;

export const SascodeModuleOrigin = Schema.Literals(["built-in", "signed-third-party", "local"]);
export type SascodeModuleOrigin = typeof SascodeModuleOrigin.Type;

export const SascodeModulePlacement = Schema.Literals([
  "canvas",
  "floating",
  "drawer",
  "edge",
  "fullscreen",
]);
export type SascodeModulePlacement = typeof SascodeModulePlacement.Type;

export const SascodeModuleManifest = Schema.Struct({
  id: ModuleId,
  version: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  description: TrimmedNonEmptyString,
  category: SascodeModuleCategory,
  origin: SascodeModuleOrigin,
  entrypoint: TrimmedNonEmptyString,
  placements: Schema.Array(SascodeModulePlacement).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(16),
  ),
  requiredPermissions: Schema.Array(SascodePermissionCapability).check(Schema.isMaxLength(64)),
  backgroundExecution: Schema.Boolean,
  singletonPerProject: Schema.Boolean,
  signature: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
});
export type SascodeModuleManifest = typeof SascodeModuleManifest.Type;

export const SascodeModuleInstanceStatus = Schema.Literals([
  "installed",
  "active",
  "suspended",
  "error",
  "removed",
]);
export type SascodeModuleInstanceStatus = typeof SascodeModuleInstanceStatus.Type;

export const SascodeModuleInstance = Schema.Struct({
  id: ModuleInstanceId,
  moduleId: ModuleId,
  moduleVersion: TrimmedNonEmptyString,
  projectId: Schema.optional(Schema.NullOr(ProjectId)),
  status: SascodeModuleInstanceStatus,
  placement: SascodeModulePlacement,
  configuration: SascodeStringMap,
  state: SascodeStringMap,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type SascodeModuleInstance = typeof SascodeModuleInstance.Type;
