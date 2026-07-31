// FILE: sascode/state/useWorkspace.ts
// Purpose: One hook that assembles everything a project space needs from the
//          two sources of truth: the Synara orchestration store and the SASCODE
//          control plane.
// Layer: Composition. All derivation is delegated to pure modules.

import { useMemo } from "react";
import type { ProjectId, ThreadId } from "@synara/contracts";
import { useQuery } from "@tanstack/react-query";

import { useStore } from "~/store";
import { createSidebarThreadSummariesSelector } from "~/storeSelectors";
import type { Project } from "~/types";
import { useAttemptProjection } from "../events/DirectorEventProvider";
import { attemptsByWorkUnitForCards } from "../events/attemptProjection";
import {
  presentWorkspaceAttention,
  type WorkspaceAttentionPresentation,
} from "../attention/attentionPresentation";
import {
  projectSnapshotQueryOptions,
  providerCapabilitiesQueryOptions,
  workspaceSnapshotQueryOptions,
} from "../queries/sascodeQueries";
import { buildSessionCards, type SessionCard } from "../sessions/sessionCards";

const selectSidebarThreadSummaries = createSidebarThreadSummariesSelector();

export interface WorkspaceProjects {
  projects: ReadonlyArray<Project>;
  hydrated: boolean;
  attention: WorkspaceAttentionPresentation;
}

/**
 * Ordered project spaces plus live cross-project attention.
 *
 * Attention stays subscribed for every project, not just the visible one — that
 * is what makes another space's approval reach the ambient frame while the user
 * is heads-down somewhere else.
 */
export function useWorkspaceProjects(): WorkspaceProjects {
  const projects = useStore((state) => state.projects);
  const hydrated = useStore((state) => state.threadsHydrated);

  const projectIds = useMemo(() => projects.map((project) => project.id), [projects]);
  const snapshot = useQuery(workspaceSnapshotQueryOptions(projectIds));

  const attention = useMemo(
    () => presentWorkspaceAttention(snapshot.data?.attention),
    [snapshot.data?.attention],
  );

  return { projects, hydrated, attention };
}

export interface ProjectSpaceData {
  projectId: ProjectId | null;
  cards: ReadonlyArray<SessionCard>;
  /** Number of sessions blocked on a human decision. */
  actionableCount: number;
  snapshotReady: boolean;
  snapshotError: Error | null;
}

/**
 * Everything one project space renders from.
 *
 * `nowMs` is passed in rather than read here so the elapsed chip ticks on a
 * single shared clock instead of every card owning a timer.
 */
export function useProjectSpaceData(
  projectId: ProjectId | null,
  activeThreadIds: ReadonlyArray<ThreadId>,
  nowMs: number,
): ProjectSpaceData {
  const threads = useStore(selectSidebarThreadSummaries);
  const projection = useAttemptProjection();
  const snapshot = useQuery(projectSnapshotQueryOptions(projectId));

  const attemptsByWorkUnit = useMemo(() => attemptsByWorkUnitForCards(projection), [projection]);

  const cards = useMemo(() => {
    if (!projectId) return [];
    return buildSessionCards({
      projectId,
      threads,
      snapshot: snapshot.data ?? null,
      attemptsByWorkUnit,
      activeThreadIds,
      nowMs,
    });
  }, [activeThreadIds, attemptsByWorkUnit, nowMs, projectId, snapshot.data, threads]);

  return {
    projectId,
    cards,
    actionableCount: cards.filter(
      (card) => card.state === "needs-approval" || card.state === "needs-input",
    ).length,
    snapshotReady: snapshot.isSuccess,
    snapshotError: snapshot.error as Error | null,
  };
}

/** Live provider/model discovery, shared by routing UI and the usage module. */
export function useProviderCapabilities() {
  return useQuery(providerCapabilitiesQueryOptions());
}

/** Threads for one project, used by the shelf and the session pickers. */
export function useProjectThreads(projectId: ProjectId | null) {
  const threads = useStore(selectSidebarThreadSummaries);
  return useMemo(
    () =>
      projectId
        ? threads.filter((thread) => thread.projectId === projectId && !thread.archivedAt)
        : [],
    [projectId, threads],
  );
}
