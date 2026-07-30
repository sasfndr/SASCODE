import { Schema } from "effect";

import {
  IsoDateTime,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "../baseSchemas";
import { ModuleInstanceId, SascodeStringMap } from "./core";
import { SascodePermissionCapability } from "./permissions";

export const SascodeWorkspaceMode = Schema.Literals([
  "focus",
  "dual-session",
  "dual-project",
  "edit-space",
  "project-overview",
]);
export type SascodeWorkspaceMode = typeof SascodeWorkspaceMode.Type;

export const SascodeLayoutMode = Schema.Literals([
  "freeform",
  "structured",
  "focus",
]);
export type SascodeLayoutMode = typeof SascodeLayoutMode.Type;

export const SascodeThemeDensity = Schema.Literals([
  "compact",
  "comfortable",
  "spacious",
]);
export type SascodeThemeDensity = typeof SascodeThemeDensity.Type;

export const SascodeThemeMotion = Schema.Literals([
  "reduced",
  "subtle",
  "expressive",
]);
export type SascodeThemeMotion = typeof SascodeThemeMotion.Type;

export const SascodeThemeSettings = Schema.Struct({
  spectrum: Schema.Number,
  projectAura: TrimmedNonEmptyString,
  glassOpacity: Schema.Number,
  contrast: Schema.Number,
  cornerRadius: Schema.Number,
  density: SascodeThemeDensity,
  motion: SascodeThemeMotion,
  backgroundDim: Schema.Number,
  statusIntensity: Schema.Number,
});
export type SascodeThemeSettings = typeof SascodeThemeSettings.Type;

export const SascodeModuleDock = Schema.Literals([
  "top",
  "left",
  "right",
  "bottom",
  "floating",
]);
export type SascodeModuleDock = typeof SascodeModuleDock.Type;

export const SascodeWorkspaceModulePlacement = Schema.Struct({
  id: TrimmedNonEmptyString,
  moduleType: TrimmedNonEmptyString,
  moduleInstanceId: Schema.optional(Schema.NullOr(ModuleInstanceId)),
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
  dock: Schema.optional(Schema.NullOr(SascodeModuleDock)),
  zIndex: Schema.Number,
  hiddenWhenInactive: Schema.Boolean,
  permissionScope: Schema.Array(SascodePermissionCapability).check(
    Schema.isMaxLength(64),
  ),
  configuration: SascodeStringMap,
});
export type SascodeWorkspaceModulePlacement =
  typeof SascodeWorkspaceModulePlacement.Type;

export const SascodeWorkspaceLayout = Schema.Struct({
  projectId: ProjectId,
  version: Schema.Number,
  revision: Schema.Number,
  presetKey: TrimmedNonEmptyString,
  theme: SascodeThemeSettings,
  mode: SascodeWorkspaceMode,
  layoutMode: SascodeLayoutMode,
  modules: Schema.Array(SascodeWorkspaceModulePlacement).check(
    Schema.isMaxLength(256),
  ),
  activeThreadIds: Schema.Array(ThreadId).check(Schema.isMaxLength(16)),
  secondaryProjectId: Schema.optional(Schema.NullOr(ProjectId)),
  snapToGrid: Schema.Boolean,
  hideInactiveModules: Schema.Boolean,
  updatedBy: TrimmedNonEmptyString,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type SascodeWorkspaceLayout = typeof SascodeWorkspaceLayout.Type;
