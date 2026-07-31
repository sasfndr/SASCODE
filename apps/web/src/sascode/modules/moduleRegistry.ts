// FILE: sascode/modules/moduleRegistry.ts
// Purpose: The built-in module catalogue and the default Stillspace arrangement.
// Layer: Pure metadata. Renderers are resolved lazily in ModuleHost.
//
// Placement geometry is percent-of-viewport so a layout saved on a large
// display still opens sensibly on a laptop. In `structured` layout mode the
// shell computes geometry for the three core modules and only floating extras
// use their stored rect; in `freeform` every module uses its own.

import type {
  SascodePermissionCapability,
  SascodeWorkspaceModulePlacement,
} from "@synara/contracts";

export type SascodeModuleType =
  | "agent-chat"
  | "session-surface"
  | "session-shelf"
  | "files"
  | "terminal"
  | "diff"
  | "browser"
  | "preview"
  | "notes"
  | "timer"
  | "music"
  | "video"
  | "provider-usage"
  | "context-evidence";

export interface ModuleDefinition {
  type: SascodeModuleType;
  title: string;
  /** One line explaining what the module is for, shown in the library. */
  description: string;
  category: "core-work" | "product-building" | "focus" | "media";
  /** Core modules cannot be removed — the workspace would lose its purpose. */
  removable: boolean;
  singleton: boolean;
  /** Capabilities the module needs before it may be activated. */
  requiredPermissions: ReadonlyArray<SascodePermissionCapability>;
  /** Heavier modules mount lazily and suspend when hidden. */
  heavy: boolean;
  /** Modules that must never autoplay or hold audio when out of view. */
  media: boolean;
  defaultRect: { x: number; y: number; width: number; height: number };
  minWidth: number;
  minHeight: number;
}

export const MODULE_DEFINITIONS: Record<SascodeModuleType, ModuleDefinition> = {
  "agent-chat": {
    type: "agent-chat",
    title: "Agent chat",
    description: "Talk to the sessions in this project.",
    category: "core-work",
    removable: false,
    singleton: true,
    requiredPermissions: [],
    heavy: false,
    media: false,
    defaultRect: { x: 2, y: 6, width: 28, height: 74 },
    minWidth: 18,
    minHeight: 24,
  },
  "session-surface": {
    type: "session-surface",
    title: "Session",
    description: "The active session's work surface.",
    category: "core-work",
    removable: false,
    singleton: true,
    requiredPermissions: [],
    heavy: true,
    media: false,
    defaultRect: { x: 32, y: 6, width: 66, height: 74 },
    minWidth: 30,
    minHeight: 30,
  },
  "session-shelf": {
    type: "session-shelf",
    title: "Sessions",
    description: "Live cards for every session in this project.",
    category: "core-work",
    removable: false,
    singleton: true,
    requiredPermissions: [],
    heavy: false,
    media: false,
    defaultRect: { x: 2, y: 82, width: 96, height: 14 },
    minWidth: 40,
    minHeight: 8,
  },
  files: {
    type: "files",
    title: "Files",
    description: "Browse the workspace tree.",
    category: "product-building",
    removable: true,
    singleton: true,
    requiredPermissions: ["read-files"],
    heavy: false,
    media: false,
    defaultRect: { x: 4, y: 12, width: 24, height: 60 },
    minWidth: 16,
    minHeight: 20,
  },
  terminal: {
    type: "terminal",
    title: "Terminal",
    description: "A shell in the session's working directory.",
    category: "product-building",
    removable: true,
    singleton: false,
    requiredPermissions: ["run-safe-commands"],
    heavy: true,
    media: false,
    defaultRect: { x: 30, y: 52, width: 46, height: 34 },
    minWidth: 24,
    minHeight: 16,
  },
  diff: {
    type: "diff",
    title: "Changes",
    description: "Review the diff for the active session.",
    category: "product-building",
    removable: true,
    singleton: true,
    requiredPermissions: ["read-files"],
    heavy: true,
    media: false,
    defaultRect: { x: 38, y: 10, width: 50, height: 66 },
    minWidth: 28,
    minHeight: 24,
  },
  browser: {
    type: "browser",
    title: "Browser",
    description: "A browser the agent and you can share.",
    category: "product-building",
    removable: true,
    singleton: true,
    requiredPermissions: ["control-browser", "use-network"],
    heavy: true,
    media: false,
    defaultRect: { x: 34, y: 8, width: 54, height: 68 },
    minWidth: 28,
    minHeight: 24,
  },
  preview: {
    type: "preview",
    title: "Preview",
    description: "The running product.",
    category: "product-building",
    removable: true,
    singleton: true,
    requiredPermissions: ["use-network"],
    heavy: true,
    media: false,
    defaultRect: { x: 32, y: 6, width: 62, height: 70 },
    minWidth: 26,
    minHeight: 22,
  },
  notes: {
    type: "notes",
    title: "Notes",
    description: "A scratchpad that stays with this project.",
    category: "focus",
    removable: true,
    singleton: true,
    requiredPermissions: [],
    heavy: false,
    media: false,
    defaultRect: { x: 68, y: 12, width: 24, height: 34 },
    minWidth: 14,
    minHeight: 14,
  },
  timer: {
    type: "timer",
    title: "Timer",
    description: "A quiet focus timer.",
    category: "focus",
    removable: true,
    singleton: true,
    requiredPermissions: [],
    heavy: false,
    media: false,
    defaultRect: { x: 72, y: 68, width: 18, height: 16 },
    minWidth: 12,
    minHeight: 10,
  },
  music: {
    type: "music",
    title: "Music",
    description: "Playback controls for a connected music provider.",
    category: "media",
    removable: true,
    singleton: true,
    requiredPermissions: ["use-network"],
    heavy: false,
    media: true,
    defaultRect: { x: 3, y: 58, width: 22, height: 22 },
    minWidth: 15,
    minHeight: 14,
  },
  video: {
    type: "video",
    title: "Video",
    description: "Watch a reference video beside the work.",
    category: "media",
    removable: true,
    singleton: true,
    requiredPermissions: ["use-network"],
    heavy: true,
    media: true,
    defaultRect: { x: 56, y: 8, width: 26, height: 26 },
    minWidth: 18,
    minHeight: 14,
  },
  "provider-usage": {
    type: "provider-usage",
    title: "Provider usage",
    description: "Live quota and health for every configured runtime.",
    category: "core-work",
    removable: true,
    singleton: true,
    requiredPermissions: [],
    heavy: false,
    media: false,
    defaultRect: { x: 66, y: 46, width: 28, height: 34 },
    minWidth: 18,
    minHeight: 18,
  },
  "context-evidence": {
    type: "context-evidence",
    title: "Context & evidence",
    description: "What the agents were given, and what they proved.",
    category: "core-work",
    removable: true,
    singleton: true,
    requiredPermissions: [],
    heavy: false,
    media: false,
    defaultRect: { x: 62, y: 14, width: 30, height: 56 },
    minWidth: 20,
    minHeight: 20,
  },
};

export const MODULE_LIBRARY_ORDER: ReadonlyArray<SascodeModuleType> = [
  "agent-chat",
  "session-shelf",
  "files",
  "terminal",
  "preview",
  "diff",
  "browser",
  "notes",
  "timer",
  "music",
  "video",
  "provider-usage",
  "context-evidence",
];

export function moduleDefinition(type: string): ModuleDefinition | null {
  return MODULE_DEFINITIONS[type as SascodeModuleType] ?? null;
}

function placement(
  type: SascodeModuleType,
  zIndex: number,
  dock: SascodeWorkspaceModulePlacement["dock"] = "floating",
): SascodeWorkspaceModulePlacement {
  const definition = MODULE_DEFINITIONS[type];
  return {
    id: type,
    moduleType: type,
    moduleInstanceId: null,
    ...definition.defaultRect,
    dock,
    zIndex,
    hiddenWhenInactive: false,
    permissionScope: [...definition.requiredPermissions],
    configuration: {},
  };
}

/**
 * The Stillspace preset: chat on the left, the session in the centre, the
 * shelf along the bottom. Deliberately only three modules — everything else is
 * summoned when it is needed rather than shipped as permanent chrome.
 */
export const DEFAULT_MODULE_PLACEMENTS: ReadonlyArray<SascodeWorkspaceModulePlacement> = [
  placement("agent-chat", 1, "left"),
  placement("session-surface", 2, "floating"),
  placement("session-shelf", 3, "bottom"),
];
