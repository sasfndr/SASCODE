import type { SascodeWorkspaceLayout, SascodeWorkspaceModulePlacement } from "@synara/contracts";
import { describe, expect, it } from "vitest";

import {
  applyDock,
  bringToFront,
  clampRect,
  DOCK_AFFINITY,
  findFreePlacement,
  isOffScreen,
  MIN_MODULE_HEIGHT,
  MIN_MODULE_WIDTH,
  nudgeRect,
  recoverOffScreenModules,
  reconcileLayoutConflict,
  resizeRect,
  resolveDockPreview,
  snapToGrid,
  toPercent,
  toPixels,
} from "./layoutGeometry";

const place = (
  id: string,
  rect: { x: number; y: number; width: number; height: number },
  zIndex = 1,
): SascodeWorkspaceModulePlacement => ({
  id,
  moduleType: id,
  moduleInstanceId: null,
  ...rect,
  dock: "floating",
  zIndex,
  hiddenWhenInactive: false,
  permissionScope: [],
  configuration: {},
});

const layout = (
  modules: SascodeWorkspaceModulePlacement[],
  overrides: Partial<SascodeWorkspaceLayout> = {},
): SascodeWorkspaceLayout =>
  ({
    projectId: "project-a",
    version: 1,
    revision: 3,
    presetKey: "stillspace",
    theme: {
      spectrum: 0.5,
      projectAura: "#7775F6",
      glassOpacity: 0.68,
      contrast: 0,
      cornerRadius: 20,
      density: "comfortable",
      motion: "subtle",
      backgroundDim: 0.46,
      statusIntensity: 0.5,
    },
    mode: "focus",
    layoutMode: "freeform",
    modules,
    activeThreadIds: [],
    secondaryProjectId: null,
    snapToGrid: true,
    hideInactiveModules: false,
    updatedBy: "session-owner",
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
    ...overrides,
  }) as SascodeWorkspaceLayout;

describe("clampRect", () => {
  it("keeps a module inside the viewport", () => {
    expect(clampRect({ x: 120, y: -20, width: 30, height: 30 })).toEqual({
      x: 70,
      y: 0,
      width: 30,
      height: 30,
    });
  });

  it("enforces the minimum size", () => {
    const result = clampRect({ x: 10, y: 10, width: 1, height: 1 });
    expect(result.width).toBe(MIN_MODULE_WIDTH);
    expect(result.height).toBe(MIN_MODULE_HEIGHT);
  });

  it("clamps size before position so the origin cannot escape", () => {
    const result = clampRect({ x: 95, y: 95, width: 400, height: 400 });
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.width).toBe(100);
  });
});

describe("viewport conversion", () => {
  it("round-trips percent through pixels", () => {
    const viewport = { width: 1440, height: 900 };
    const rect = { x: 25, y: 10, width: 40, height: 30 };
    expect(toPercent(toPixels(rect, viewport), viewport)).toEqual(rect);
  });

  it("survives a zero-sized viewport", () => {
    const result = toPercent({ x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 0 });
    expect(Number.isFinite(result.width)).toBe(true);
    expect(Number.isFinite(result.height)).toBe(true);
  });
});

describe("snapToGrid", () => {
  it("rounds to the nearest step", () => {
    expect(snapToGrid({ x: 11, y: 5, width: 27, height: 33 }, 2)).toEqual({
      x: 12,
      y: 6,
      width: 28,
      height: 34,
    });
  });
});

describe("off-screen recovery", () => {
  it("detects a module dragged almost entirely out of view", () => {
    expect(isOffScreen({ x: 98, y: 10, width: 30, height: 30 })).toBe(true);
    expect(isOffScreen({ x: -28, y: 10, width: 30, height: 30 })).toBe(true);
  });

  it("leaves a mostly visible module alone", () => {
    expect(isOffScreen({ x: 60, y: 10, width: 30, height: 30 })).toBe(false);
  });

  it("brings unreachable modules back", () => {
    const recovered = recoverOffScreenModules([
      place("visible", { x: 10, y: 10, width: 20, height: 20 }),
      place("lost", { x: 240, y: 300, width: 20, height: 20 }),
    ]);
    expect(recovered[1]!.x).toBeLessThanOrEqual(80);
    expect(isOffScreen(recovered[1]!)).toBe(false);
  });

  it("returns the same reference when nothing moved", () => {
    const modules = [place("visible", { x: 10, y: 10, width: 20, height: 20 })];
    expect(recoverOffScreenModules(modules)).toBe(modules);
  });
});

describe("docking", () => {
  it("previews the nearest edge inside the affinity band", () => {
    const preview = resolveDockPreview({ x: 1, y: 40, width: 20, height: 20 });
    expect(preview?.dock).toBe("left");
  });

  it("does not preview when the module is nowhere near an edge", () => {
    expect(
      resolveDockPreview({ x: DOCK_AFFINITY + 6, y: 40, width: 20, height: 20 }),
    ).toBeNull();
  });

  it("resolves a corner to a single edge rather than both", () => {
    const preview = resolveDockPreview({ x: 1, y: 3, width: 20, height: 20 });
    expect(preview?.dock).toBe("left");
  });

  it("applies the dock rect", () => {
    const docked = applyDock(place("chat", { x: 10, y: 10, width: 20, height: 20 }), "top");
    expect(docked.dock).toBe("top");
    expect(docked.width).toBe(100);
    expect(docked.y).toBe(0);
  });

  it("keeps geometry when returning to floating", () => {
    const floating = applyDock(place("chat", { x: 10, y: 10, width: 20, height: 20 }), "floating");
    expect(floating.x).toBe(10);
    expect(floating.dock).toBe("floating");
  });
});

describe("z-order", () => {
  it("raises the target above the rest and renumbers densely", () => {
    const result = bringToFront(
      [
        place("a", { x: 0, y: 0, width: 20, height: 20 }, 1),
        place("b", { x: 0, y: 0, width: 20, height: 20 }, 2),
        place("c", { x: 0, y: 0, width: 20, height: 20 }, 3),
      ],
      "a",
    );
    const byId = new Map(result.map((entry) => [entry.id, entry.zIndex]));
    expect(byId.get("a")).toBe(3);
    expect(Math.max(...result.map((entry) => entry.zIndex))).toBe(3);
  });

  it("is a no-op for an unknown id", () => {
    const modules = [place("a", { x: 0, y: 0, width: 20, height: 20 })];
    expect(bringToFront(modules, "missing")).toBe(modules);
  });
});

describe("findFreePlacement", () => {
  it("cascades away from an exact overlap", () => {
    const existing = [place("a", { x: 10, y: 10, width: 20, height: 20 })];
    const result = findFreePlacement({ x: 10, y: 10, width: 20, height: 20 }, existing);
    expect(result).not.toEqual({ x: 10, y: 10, width: 20, height: 20 });
  });

  it("keeps the requested rect when nothing is in the way", () => {
    const result = findFreePlacement({ x: 10, y: 10, width: 20, height: 20 }, []);
    expect(result).toEqual({ x: 10, y: 10, width: 20, height: 20 });
  });
});

describe("keyboard manipulation", () => {
  it("nudges within bounds", () => {
    expect(nudgeRect({ x: 0, y: 10, width: 20, height: 20 }, "left").x).toBe(0);
    expect(nudgeRect({ x: 10, y: 10, width: 20, height: 20 }, "right").x).toBe(12);
  });

  it("resizes within bounds", () => {
    expect(resizeRect({ x: 10, y: 10, width: 20, height: 20 }, "right").width).toBe(22);
    expect(
      resizeRect({ x: 10, y: 10, width: MIN_MODULE_WIDTH, height: 20 }, "left").width,
    ).toBe(MIN_MODULE_WIDTH);
  });
});

describe("reconcileLayoutConflict", () => {
  it("keeps the user's geometry on top of the winning revision", () => {
    const local = layout([place("chat", { x: 40, y: 40, width: 30, height: 30 })], {
      revision: 3,
    });
    const remote = layout([place("chat", { x: 5, y: 5, width: 20, height: 20 })], {
      revision: 4,
    });
    const { merged } = reconcileLayoutConflict(local, remote);
    expect(merged.revision).toBe(4);
    expect(merged.modules[0]!.x).toBe(40);
  });

  it("keeps a module only the remote knows about", () => {
    const local = layout([place("chat", { x: 40, y: 40, width: 30, height: 30 })]);
    const remote = layout(
      [
        place("chat", { x: 5, y: 5, width: 20, height: 20 }),
        place("music", { x: 60, y: 60, width: 20, height: 20 }),
      ],
      { revision: 9 },
    );
    const { merged, divergentModuleIds } = reconcileLayoutConflict(local, remote);
    expect(merged.modules).toHaveLength(2);
    expect(divergentModuleIds).toContain("music");
  });

  it("keeps a module only the local edit knows about", () => {
    const local = layout([
      place("chat", { x: 40, y: 40, width: 30, height: 30 }),
      place("notes", { x: 10, y: 10, width: 20, height: 20 }),
    ]);
    const remote = layout([place("chat", { x: 5, y: 5, width: 20, height: 20 })], {
      revision: 9,
    });
    const { merged, divergentModuleIds } = reconcileLayoutConflict(local, remote);
    expect(merged.modules.map((entry) => entry.id).sort()).toEqual(["chat", "notes"]);
    expect(divergentModuleIds).toContain("notes");
  });

  it("preserves the local theme and mode, which the user just chose", () => {
    const local = layout([], {
      mode: "edit-space",
      theme: { ...layout([]).theme, spectrum: 0.9 },
    });
    const remote = layout([], { revision: 12, mode: "focus" });
    const { merged } = reconcileLayoutConflict(local, remote);
    expect(merged.mode).toBe("edit-space");
    expect(merged.theme.spectrum).toBe(0.9);
  });
});
