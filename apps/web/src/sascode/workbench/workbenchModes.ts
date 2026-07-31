// FILE: sascode/workbench/workbenchModes.ts
// Purpose: The modes the centre surface can be in, and their shared identity.
// Layer: Pure definition.
//
// Preview is first and is the default. The rest are adjacent, not equal: the
// order below is the order the switcher and the edge rail both use, so the two
// controls never disagree about where a mode lives.

export type WorkbenchMode = "preview" | "changes" | "terminal" | "files" | "agents";

export const WORKBENCH_MODES = [
  "preview",
  "changes",
  "terminal",
  "files",
  "agents",
] as const satisfies ReadonlyArray<WorkbenchMode>;

export const WORKBENCH_MODE_LABEL: Record<WorkbenchMode, string> = {
  preview: "Preview",
  changes: "Changes",
  terminal: "Terminal",
  files: "Files",
  agents: "Agents",
};

/**
 * Narrows a context-lens selection onto the workbench. Lenses that are not a
 * centre mode (evidence, usage, a detached browser) return null and stay
 * temporary layers, which is what keeps the lens from becoming a tab bar.
 */
export function workbenchModeFromLens(lens: string | null): WorkbenchMode | null {
  return WORKBENCH_MODES.includes(lens as WorkbenchMode) ? (lens as WorkbenchMode) : null;
}
