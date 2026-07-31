// FILE: sascode/layout/useProjectLayout.ts
// Purpose: Durable Stillspace layout for one project — optimistic locally,
//          revision-safe on the wire, never lossy on conflict.
// Layer: Data adapter.
//
// Pointer moves are local-only. The RPC fires at meaningful boundaries (drag
// end, resize end, dock, mode change, explicit Done, short idle) so a drag
// never becomes a request per animation frame.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ProjectId,
  SascodeThemeSettings,
  SascodeWorkspaceLayout,
  ThreadId,
} from "@synara/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  sascodeQueryKeys,
  saveWorkspaceLayout,
  workspaceLayoutQueryOptions,
} from "../queries/sascodeQueries";
import { DEFAULT_THEME_SETTINGS } from "../theme/spectrum";
import { recoverOffScreenModules, reconcileLayoutConflict } from "./layoutGeometry";
import { DEFAULT_MODULE_PLACEMENTS } from "../modules/moduleRegistry";

/** Grouped settings (sliders, toggles) coalesce into one write. */
const IDLE_PERSIST_MS = 700;

export type LayoutSaveStatus = "idle" | "saving" | "saved" | "conflict" | "error";

export interface ProjectLayoutController {
  /** What the UI renders: the durable layout with unsaved local edits applied. */
  layout: SascodeWorkspaceLayout;
  /** False until the durable layout has been read at least once. */
  ready: boolean;
  /** True while this project has no persisted layout yet. */
  usingDefault: boolean;
  status: LayoutSaveStatus;
  error: string | null;
  /** Applies an edit locally without touching the network. */
  update: (
    recipe: (current: SascodeWorkspaceLayout) => SascodeWorkspaceLayout,
    options?: { persist?: "now" | "idle" | "never" },
  ) => void;
  /** Forces a write of whatever is pending. */
  commit: () => void;
  /** Discards local edits and returns to the durable layout. */
  revert: () => void;
  /** Restores the built-in Stillspace arrangement and theme. */
  reset: () => void;
  /** Brings any unreachable module back into view. */
  recoverModules: () => void;
  /** Set when the last save lost a race; the local edit is preserved. */
  conflict: { remote: SascodeWorkspaceLayout } | null;
  /** Keeps local edits and rebases them onto the winning revision. */
  keepLocalEdits: () => void;
  /** Abandons local edits in favour of the winning revision. */
  takeRemote: () => void;
}

export function buildDefaultLayout(
  projectId: ProjectId,
  theme: SascodeThemeSettings = DEFAULT_THEME_SETTINGS,
): SascodeWorkspaceLayout {
  const now = new Date().toISOString();
  return {
    projectId,
    version: 1,
    revision: 0,
    presetKey: "stillspace",
    theme,
    mode: "focus",
    layoutMode: "structured",
    modules: DEFAULT_MODULE_PLACEMENTS,
    activeThreadIds: [],
    secondaryProjectId: null,
    snapToGrid: true,
    hideInactiveModules: false,
    updatedBy: "session-owner",
    createdAt: now,
    updatedAt: now,
  };
}

export function useProjectLayout(projectId: ProjectId | null): ProjectLayoutController {
  const queryClient = useQueryClient();
  const query = useQuery(workspaceLayoutQueryOptions(projectId));

  const [draft, setDraft] = useState<SascodeWorkspaceLayout | null>(null);
  const [status, setStatus] = useState<LayoutSaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ remote: SascodeWorkspaceLayout } | null>(null);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const pendingRef = useRef<SascodeWorkspaceLayout | null>(null);

  const durable = query.data ?? null;

  const fallback = useMemo(
    () => (projectId ? buildDefaultLayout(projectId) : null),
    [projectId],
  );

  const layout = draft ?? durable ?? fallback ?? buildDefaultLayout("unknown" as ProjectId);

  // A durable layout arriving after a local edit must not silently discard it.
  useEffect(() => {
    if (!durable || !draft) return;
    if (durable.revision > draft.revision && !conflict) {
      setDraft(null);
    }
  }, [conflict, draft, durable]);

  const persist = useCallback(
    async (next: SascodeWorkspaceLayout) => {
      if (!projectId) return;
      if (inFlightRef.current) {
        pendingRef.current = next;
        return;
      }
      inFlightRef.current = true;
      setStatus("saving");
      setError(null);
      try {
        const saved = await saveWorkspaceLayout({
          layout: next,
          expectedRevision: next.revision,
        });
        queryClient.setQueryData(sascodeQueryKeys.layout(projectId), saved);
        setDraft(null);
        setConflict(null);
        setStatus("saved");
      } catch (cause) {
        // A rejected save means another window (or tab) won the race. Fetch the
        // winner, keep the user's geometry, and offer an explicit choice.
        try {
          const remote = await queryClient.fetchQuery({
            ...workspaceLayoutQueryOptions(projectId),
            staleTime: 0,
          });
          if (remote) {
            setConflict({ remote });
            setStatus("conflict");
          } else {
            setStatus("error");
            setError(cause instanceof Error ? cause.message : "Could not save layout");
          }
        } catch {
          setStatus("error");
          setError(cause instanceof Error ? cause.message : "Could not save layout");
        }
      } finally {
        inFlightRef.current = false;
        const queued = pendingRef.current;
        pendingRef.current = null;
        if (queued) void persist(queued);
      }
    },
    [projectId, queryClient],
  );

  const scheduleIdlePersist = useCallback(
    (next: SascodeWorkspaceLayout) => {
      if (idleTimerRef.current !== null) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        idleTimerRef.current = null;
        void persist(next);
      }, IDLE_PERSIST_MS);
    },
    [persist],
  );

  const update = useCallback<ProjectLayoutController["update"]>(
    (recipe, options) => {
      setDraft((current) => {
        const base = current ?? durable ?? fallback;
        if (!base) return current;
        const next = {
          ...recipe(base),
          updatedAt: new Date().toISOString(),
        };
        const mode = options?.persist ?? "never";
        if (mode === "now") {
          void persist(next);
        } else if (mode === "idle") {
          scheduleIdlePersist(next);
        }
        return next;
      });
    },
    [durable, fallback, persist, scheduleIdlePersist],
  );

  const commit = useCallback(() => {
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (draft) void persist(draft);
  }, [draft, persist]);

  const revert = useCallback(() => {
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    setDraft(null);
    setConflict(null);
    setStatus("idle");
  }, []);

  const reset = useCallback(() => {
    if (!projectId) return;
    const base = durable ?? fallback;
    const fresh: SascodeWorkspaceLayout = {
      ...buildDefaultLayout(projectId),
      revision: base?.revision ?? 0,
      createdAt: base?.createdAt ?? new Date().toISOString(),
    };
    setDraft(fresh);
    void persist(fresh);
  }, [durable, fallback, persist, projectId]);

  const recoverModules = useCallback(() => {
    update(
      (current) => ({ ...current, modules: [...recoverOffScreenModules(current.modules)] }),
      { persist: "now" },
    );
  }, [update]);

  const keepLocalEdits = useCallback(() => {
    if (!conflict || !draft) return;
    const resolution = reconcileLayoutConflict(draft, conflict.remote);
    setConflict(null);
    setDraft(resolution.merged);
    void persist(resolution.merged);
  }, [conflict, draft, persist]);

  const takeRemote = useCallback(() => {
    if (!conflict || !projectId) return;
    queryClient.setQueryData(sascodeQueryKeys.layout(projectId), conflict.remote);
    setConflict(null);
    setDraft(null);
    setStatus("idle");
  }, [conflict, projectId, queryClient]);

  useEffect(
    () => () => {
      if (idleTimerRef.current !== null) clearTimeout(idleTimerRef.current);
    },
    [],
  );

  return {
    layout,
    ready: query.isSuccess || query.isError,
    usingDefault: durable === null,
    status,
    error,
    update,
    commit,
    revert,
    reset,
    recoverModules,
    conflict,
    keepLocalEdits,
    takeRemote,
  };
}

/** Convenience for the very common "swap the active sessions" edit. */
export function withActiveThreads(
  layout: SascodeWorkspaceLayout,
  activeThreadIds: ReadonlyArray<ThreadId>,
): SascodeWorkspaceLayout {
  return {
    ...layout,
    activeThreadIds: [...activeThreadIds].slice(0, 2),
    mode: activeThreadIds.length > 1 ? "dual-session" : layout.mode === "dual-session"
      ? "focus"
      : layout.mode,
  };
}
