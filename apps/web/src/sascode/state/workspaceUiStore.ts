// FILE: sascode/state/workspaceUiStore.ts
// Purpose: Ephemeral interaction state for the SASCODE shell — which project
//          space is on screen, what is being dragged, which temporary layer is
//          open. Durable state lives in SascodeWorkspaceLayout, not here.
// Layer: Local UI state.
//
// The split is deliberate. Anything the user would expect to survive a restart
// (mode, module geometry, theme, active sessions) is backend-owned. Anything
// that is true only for this moment (a drag in flight, an open lens, the
// overview camera) stays here and is never persisted.

import { create } from "zustand";
import type { ProjectId, ThreadId } from "@synara/contracts";

export type ContextLensKind =
  | "preview"
  | "changes"
  | "terminal"
  | "files"
  | "agents"
  | "browser"
  | "evidence"
  | "usage";

export type ChatDock = "top" | "left" | "floating";

export interface DragState {
  kind: "session" | "module" | "project";
  id: string;
  /** Where the pointer currently is, in viewport percent. */
  x: number;
  y: number;
  /** Drop target the pointer is currently over, if any. */
  over: string | null;
}

interface WorkspaceUiState {
  /** Index into the ordered project list currently filling the viewport. */
  activeProjectIndex: number;
  /**
   * Project Overview is a temporary camera pull-back, never a home screen, so
   * it is intentionally not part of the durable layout.
   */
  overviewOpen: boolean;
  overviewQuery: string;
  overviewFocusIndex: number;

  /** Which side of a dual layout currently owns keyboard and command routing. */
  focusedSide: "primary" | "secondary";
  /** Divider position in percent for dual-session and dual-project modes. */
  splitRatio: number;

  contextLens: ContextLensKind | null;
  chatExpanded: boolean;
  drag: DragState | null;
  /** True while a drag or resize owns the pointer, which suspends gestures. */
  interactionBusy: boolean;

  editSpaceSelection: string | null;
  appearanceOpen: boolean;
  moduleLibraryOpen: boolean;

  /** Set while a project transition is animating, to suppress a second commit. */
  transitioning: boolean;

  setActiveProjectIndex: (index: number) => void;
  stepProject: (direction: -1 | 1, projectCount: number) => void;
  openOverview: () => void;
  closeOverview: () => void;
  setOverviewQuery: (query: string) => void;
  setOverviewFocusIndex: (index: number) => void;
  setFocusedSide: (side: "primary" | "secondary") => void;
  setSplitRatio: (ratio: number) => void;
  setContextLens: (lens: ContextLensKind | null) => void;
  toggleContextLens: (lens: ContextLensKind) => void;
  setChatExpanded: (expanded: boolean) => void;
  beginDrag: (drag: DragState) => void;
  updateDrag: (patch: Partial<DragState>) => void;
  endDrag: () => void;
  setInteractionBusy: (busy: boolean) => void;
  setEditSpaceSelection: (id: string | null) => void;
  setAppearanceOpen: (open: boolean) => void;
  setModuleLibraryOpen: (open: boolean) => void;
  setTransitioning: (transitioning: boolean) => void;
}

const clampRatio = (ratio: number) => Math.min(0.78, Math.max(0.22, ratio));

export const useWorkspaceUiStore = create<WorkspaceUiState>((set) => ({
  activeProjectIndex: 0,
  overviewOpen: false,
  overviewQuery: "",
  overviewFocusIndex: 0,
  focusedSide: "primary",
  splitRatio: 0.5,
  contextLens: null,
  chatExpanded: false,
  drag: null,
  interactionBusy: false,
  editSpaceSelection: null,
  appearanceOpen: false,
  moduleLibraryOpen: false,
  transitioning: false,

  setActiveProjectIndex: (index) => set({ activeProjectIndex: Math.max(0, index) }),
  stepProject: (direction, projectCount) =>
    set((state) => {
      if (projectCount <= 0) return state;
      // Spaces do not wrap: running off the end should feel like a wall, the
      // same way macOS Spaces does, so position stays legible.
      const next = Math.min(projectCount - 1, Math.max(0, state.activeProjectIndex + direction));
      if (next === state.activeProjectIndex) return state;
      return { activeProjectIndex: next, contextLens: null };
    }),
  openOverview: () => set({ overviewOpen: true, overviewQuery: "", contextLens: null }),
  closeOverview: () => set({ overviewOpen: false, overviewQuery: "" }),
  setOverviewQuery: (overviewQuery) => set({ overviewQuery, overviewFocusIndex: 0 }),
  setOverviewFocusIndex: (overviewFocusIndex) => set({ overviewFocusIndex }),
  setFocusedSide: (focusedSide) => set({ focusedSide }),
  setSplitRatio: (ratio) => set({ splitRatio: clampRatio(ratio) }),
  setContextLens: (contextLens) => set({ contextLens }),
  toggleContextLens: (lens) =>
    set((state) => ({ contextLens: state.contextLens === lens ? null : lens })),
  setChatExpanded: (chatExpanded) => set({ chatExpanded }),
  beginDrag: (drag) => set({ drag, interactionBusy: true }),
  updateDrag: (patch) =>
    set((state) => (state.drag ? { drag: { ...state.drag, ...patch } } : state)),
  endDrag: () => set({ drag: null, interactionBusy: false }),
  setInteractionBusy: (interactionBusy) => set({ interactionBusy }),
  setEditSpaceSelection: (editSpaceSelection) => set({ editSpaceSelection }),
  setAppearanceOpen: (appearanceOpen) => set({ appearanceOpen }),
  setModuleLibraryOpen: (moduleLibraryOpen) => set({ moduleLibraryOpen }),
  setTransitioning: (transitioning) => set({ transitioning }),
}));

/** Stable selectors so a token stream cannot rerender the whole shell. */
export const selectActiveProjectIndex = (state: WorkspaceUiState) => state.activeProjectIndex;
export const selectOverviewOpen = (state: WorkspaceUiState) => state.overviewOpen;
export const selectContextLens = (state: WorkspaceUiState) => state.contextLens;
export const selectInteractionBusy = (state: WorkspaceUiState) => state.interactionBusy;

/** Resolves which project a command should act on given the current focus. */
export function resolveCommandTarget(
  primaryProjectId: ProjectId | null,
  secondaryProjectId: ProjectId | null,
  focusedSide: "primary" | "secondary",
): ProjectId | null {
  return focusedSide === "secondary" ? (secondaryProjectId ?? primaryProjectId) : primaryProjectId;
}

/** Resolves the thread a command should act on for the focused side. */
export function resolveFocusedThread(
  activeThreadIds: ReadonlyArray<ThreadId>,
  focusedSide: "primary" | "secondary",
): ThreadId | null {
  if (activeThreadIds.length === 0) return null;
  if (focusedSide === "secondary") return activeThreadIds[1] ?? activeThreadIds[0] ?? null;
  return activeThreadIds[0] ?? null;
}
