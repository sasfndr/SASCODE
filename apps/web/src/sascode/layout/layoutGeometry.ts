// FILE: sascode/layout/layoutGeometry.ts
// Purpose: Geometry for Edit Space — clamping, snapping, docking, z-order, and
//          off-screen recovery over the durable `SascodeWorkspaceLayout`.
// Layer: Pure. Percent-based so a layout saved on a 27" display still opens
//        sensibly on a laptop.
//
// Placement coordinates are stored as percentages of the project viewport
// (0-100). That is what makes the durable layout portable across machines, and
// it is why every helper here takes a viewport size rather than assuming px.

import type {
  SascodeModuleDock,
  SascodeWorkspaceLayout,
  SascodeWorkspaceModulePlacement,
} from "@synara/contracts";

export interface Viewport {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Percent-space minimums, tuned so a module always keeps a usable header. */
export const MIN_MODULE_WIDTH = 12;
export const MIN_MODULE_HEIGHT = 10;
export const GRID_STEP = 2;
/** A module must keep at least this much of itself on screen to stay reachable. */
export const MIN_VISIBLE_FRACTION = 0.25;

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

export const toPixels = (rect: Rect, viewport: Viewport): Rect => ({
  x: (rect.x / 100) * viewport.width,
  y: (rect.y / 100) * viewport.height,
  width: (rect.width / 100) * viewport.width,
  height: (rect.height / 100) * viewport.height,
});

export const toPercent = (rect: Rect, viewport: Viewport): Rect => ({
  x: viewport.width === 0 ? 0 : (rect.x / viewport.width) * 100,
  y: viewport.height === 0 ? 0 : (rect.y / viewport.height) * 100,
  width: viewport.width === 0 ? MIN_MODULE_WIDTH : (rect.width / viewport.width) * 100,
  height: viewport.height === 0 ? MIN_MODULE_HEIGHT : (rect.height / viewport.height) * 100,
});

export function snapToGrid(rect: Rect, step = GRID_STEP): Rect {
  const snap = (value: number) => Math.round(value / step) * step;
  return { x: snap(rect.x), y: snap(rect.y), width: snap(rect.width), height: snap(rect.height) };
}

/**
 * Keeps a module inside the viewport and above the minimum size.
 * Width/height are clamped before position so a resize can never push the
 * module's origin out of range.
 */
export function clampRect(rect: Rect): Rect {
  const width = clamp(rect.width, MIN_MODULE_WIDTH, 100);
  const height = clamp(rect.height, MIN_MODULE_HEIGHT, 100);
  return {
    width,
    height,
    x: clamp(rect.x, 0, 100 - width),
    y: clamp(rect.y, 0, 100 - height),
  };
}

/** True when too little of the module remains reachable to grab with a pointer. */
export function isOffScreen(rect: Rect): boolean {
  const visibleWidth = Math.min(rect.x + rect.width, 100) - Math.max(rect.x, 0);
  const visibleHeight = Math.min(rect.y + rect.height, 100) - Math.max(rect.y, 0);
  if (visibleWidth <= 0 || visibleHeight <= 0) return true;
  return (
    visibleWidth < rect.width * MIN_VISIBLE_FRACTION ||
    visibleHeight < rect.height * MIN_VISIBLE_FRACTION
  );
}

/**
 * Brings every unreachable module back into view.
 * Returns the same array reference when nothing moved so React can skip work.
 */
export function recoverOffScreenModules(
  modules: ReadonlyArray<SascodeWorkspaceModulePlacement>,
): ReadonlyArray<SascodeWorkspaceModulePlacement> {
  let changed = false;
  const recovered = modules.map((placement) => {
    const rect: Rect = {
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
    };
    if (!isOffScreen(rect)) return placement;
    changed = true;
    const clamped = clampRect(rect);
    return { ...placement, ...clamped };
  });
  return changed ? recovered : modules;
}

// ── Docking ──────────────────────────────────────────────────────────

/** Distance from an edge, in percent, that arms a dock preview. */
export const DOCK_AFFINITY = 6;

export interface DockPreview {
  dock: SascodeModuleDock;
  rect: Rect;
}

const DOCK_RECT: Record<Exclude<SascodeModuleDock, "floating">, Rect> = {
  top: { x: 0, y: 0, width: 100, height: 34 },
  bottom: { x: 0, y: 66, width: 100, height: 34 },
  left: { x: 0, y: 0, width: 30, height: 100 },
  right: { x: 70, y: 0, width: 30, height: 100 },
};

/**
 * Resolves which edge a dragged module would dock to.
 * Corners resolve to the nearer edge rather than an ambiguous both.
 */
export function resolveDockPreview(rect: Rect): DockPreview | null {
  const distances: Array<{ dock: Exclude<SascodeModuleDock, "floating">; distance: number }> = [
    { dock: "left", distance: rect.x },
    { dock: "top", distance: rect.y },
    { dock: "right", distance: 100 - (rect.x + rect.width) },
    { dock: "bottom", distance: 100 - (rect.y + rect.height) },
  ];
  const nearest = distances.toSorted((a, b) => a.distance - b.distance)[0]!;
  if (nearest.distance > DOCK_AFFINITY) return null;
  return { dock: nearest.dock, rect: DOCK_RECT[nearest.dock] };
}

export function applyDock(
  placement: SascodeWorkspaceModulePlacement,
  dock: SascodeModuleDock,
): SascodeWorkspaceModulePlacement {
  if (dock === "floating") {
    return { ...placement, dock: "floating" };
  }
  return { ...placement, dock, ...DOCK_RECT[dock] };
}

// ── Z-order ──────────────────────────────────────────────────────────

/** Raises one module above the rest without letting z-index drift upward forever. */
export function bringToFront(
  modules: ReadonlyArray<SascodeWorkspaceModulePlacement>,
  id: string,
): ReadonlyArray<SascodeWorkspaceModulePlacement> {
  const ordered = modules.toSorted((a, b) => a.zIndex - b.zIndex);
  const withoutTarget = ordered.filter((placement) => placement.id !== id);
  const target = ordered.find((placement) => placement.id === id);
  if (!target) return modules;
  const ordering = [...withoutTarget, target];
  const renumbered: SascodeWorkspaceModulePlacement[] = [];
  for (const [index, placement] of ordering.entries()) {
    renumbered.push({ ...placement, zIndex: index + 1 });
  }
  return renumbered;
}

// ── Collision-safe placement ─────────────────────────────────────────

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/**
 * Finds a free slot for a newly added module by walking a cascade offset.
 * Falls back to the requested rect once the cascade runs out of room, which is
 * fine — overlapping is legal in freeform, this only avoids exact stacking.
 */
export function findFreePlacement(
  desired: Rect,
  existing: ReadonlyArray<SascodeWorkspaceModulePlacement>,
): Rect {
  const rects = existing.map((placement) => ({
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
  }));
  const step = 3;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = clampRect({
      ...desired,
      x: desired.x + attempt * step,
      y: desired.y + attempt * step,
    });
    if (!rects.some((rect) => overlaps(candidate, rect))) return candidate;
  }
  return clampRect(desired);
}

// ── Keyboard manipulation ────────────────────────────────────────────

export type NudgeDirection = "left" | "right" | "up" | "down";

/** Keyboard move step. Shift multiplies it so coarse placement stays fast. */
export const NUDGE_STEP = 2;

export function nudgeRect(rect: Rect, direction: NudgeDirection, step = NUDGE_STEP): Rect {
  const delta = { left: [-step, 0], right: [step, 0], up: [0, -step], down: [0, step] }[
    direction
  ] as [number, number];
  return clampRect({ ...rect, x: rect.x + delta[0], y: rect.y + delta[1] });
}

export function resizeRect(rect: Rect, direction: NudgeDirection, step = NUDGE_STEP): Rect {
  switch (direction) {
    case "left":
      return clampRect({ ...rect, width: rect.width - step });
    case "right":
      return clampRect({ ...rect, width: rect.width + step });
    case "up":
      return clampRect({ ...rect, height: rect.height - step });
    case "down":
      return clampRect({ ...rect, height: rect.height + step });
  }
}

// ── Revision-safe merge ──────────────────────────────────────────────

export interface LayoutConflictResolution {
  /** The layout to persist next, carrying the user's edits onto the new base. */
  merged: SascodeWorkspaceLayout;
  /** Placement ids that existed locally but not remotely, or vice versa. */
  divergentModuleIds: ReadonlyArray<string>;
}

/**
 * Reconciles a rejected save against the layout that actually won.
 *
 * The user's unsaved geometry is never discarded: local placements are
 * reapplied on top of the server's revision, and anything the server added
 * that the user never saw is kept. Callers may still offer an explicit choice,
 * but the safe default must not lose work.
 */
export function reconcileLayoutConflict(
  local: SascodeWorkspaceLayout,
  remote: SascodeWorkspaceLayout,
): LayoutConflictResolution {
  const localById = new Map(local.modules.map((placement) => [placement.id, placement]));
  const remoteById = new Map(remote.modules.map((placement) => [placement.id, placement]));

  const divergentModuleIds: string[] = [];
  const merged: SascodeWorkspaceModulePlacement[] = [];

  for (const remotePlacement of remote.modules) {
    const localPlacement = localById.get(remotePlacement.id);
    if (!localPlacement) {
      divergentModuleIds.push(remotePlacement.id);
      merged.push(remotePlacement);
      continue;
    }
    // Local geometry wins because it is what the user just dragged.
    merged.push({ ...remotePlacement, ...localPlacement });
  }

  for (const localPlacement of local.modules) {
    if (remoteById.has(localPlacement.id)) continue;
    divergentModuleIds.push(localPlacement.id);
    merged.push(localPlacement);
  }

  return {
    merged: {
      ...remote,
      theme: local.theme,
      mode: local.mode,
      layoutMode: local.layoutMode,
      snapToGrid: local.snapToGrid,
      hideInactiveModules: local.hideInactiveModules,
      activeThreadIds: local.activeThreadIds,
      secondaryProjectId: local.secondaryProjectId ?? null,
      modules: merged,
      updatedAt: new Date(
        Math.max(Date.parse(remote.updatedAt) || 0, Date.parse(local.updatedAt) || 0),
      ).toISOString(),
    },
    divergentModuleIds,
  };
}
