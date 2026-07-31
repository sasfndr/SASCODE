// FILE: sascode/shell/SascodeShell.tsx
// Purpose: The primary SASCODE work shell. Projects are spatial screens moved
//          through horizontally; everything else is summoned.
// Layer: Shell root.
//
// There is no permanent project or session sidebar here. Project navigation is
// the viewport itself, session navigation is the shelf, and tools arrive as
// temporary lenses, drawers, or placed modules.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectId, ThreadId } from "@synara/contracts";
import { useNavigate } from "@tanstack/react-router";

import { useNowMs } from "~/hooks/useNowMs";
import type { DiffRouteSearch } from "~/diffRouteSearch";
import { useStore } from "~/store";
import { AmbientFrame } from "./AmbientFrame";
import { AttentionLayer } from "../attention/AttentionLayer";
import { DirectorEventProvider, useDirectorEventStatus } from "../events/DirectorEventProvider";
import { EditSpaceLayer } from "../editspace/EditSpaceLayer";
import { FirstRun } from "../onboarding/FirstRun";
import { ProjectOverview } from "../overview/ProjectOverview";
import { ProjectSpace } from "../project-space/ProjectSpace";
import { ProjectSpaceSkeleton } from "../sessions/SessionSurfaceSkeleton";
import { SpaceViewport } from "./SpaceViewport";
import { StartFeatureDialog } from "../feature/StartFeatureDialog";
import { buildDefaultLayout, useProjectLayout } from "../layout/useProjectLayout";
import { bootstrapProject, projectSnapshotQueryOptions } from "../queries/sascodeQueries";
import { useProjectSpaceData, useWorkspaceProjects } from "../state/useWorkspace";
import { useSpatialGestures, useWorkspaceShortcuts } from "./useSpatialGestures";
import { useStillspaceTheme } from "../theme/useStillspaceTheme";
import { useWorkspaceUiStore } from "../state/workspaceUiStore";
import type { SessionCard, SessionCardActionKind } from "../sessions/sessionCards";
import { interruptSession } from "../sessions/sessionCommands";
import { useQueryClient } from "@tanstack/react-query";
import { createSidebarThreadSummariesSelector } from "~/storeSelectors";
import { rememberSascodeThreadRoute } from "./threadRouteMemory";

const selectThreadSummaries = createSidebarThreadSummariesSelector();

export interface SascodeShellProps {
  /** Thread from the route, when the user deep-linked to one. */
  routeThreadId: ThreadId | null;
  search: DiffRouteSearch;
  splitViewId: string | null;
}

export function SascodeShell(props: SascodeShellProps) {
  return (
    <DirectorEventProvider>
      <SascodeShellInner {...props} />
    </DirectorEventProvider>
  );
}

function SascodeShellInner({ routeThreadId, search, splitViewId }: SascodeShellProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const viewportRef = useRef<HTMLDivElement>(null);
  const nowMs = useNowMs(true, 1000);

  const { projects, hydrated, attention } = useWorkspaceProjects();
  const connection = useDirectorEventStatus();
  const threads = useStore(selectThreadSummaries);

  const ui = useWorkspaceUiStore();
  const activeIndex = Math.min(ui.activeProjectIndex, Math.max(projects.length - 1, 0));
  const activeProject = projects[activeIndex] ?? null;
  const secondaryProjectIdRef = useRef<ProjectId | null>(null);

  const layoutController = useProjectLayout(activeProject?.id ?? null);
  const { layout } = layoutController;
  const theme = useStillspaceTheme(layout.theme);

  const [startFeatureOpen, setStartFeatureOpen] = useState(false);
  const [startFeatureRequest, setStartFeatureRequest] = useState<string>("");
  const [bootstrapping, setBootstrapping] = useState(false);

  // The route is the source of truth for which session is open, so a deep link,
  // a refresh, and a shelf drag all converge on the same place.
  const activeThreadIds = useMemo<ThreadId[]>(() => {
    const fromLayout = layout.activeThreadIds.filter((threadId) =>
      threads.some((thread) => thread.id === threadId && thread.projectId === activeProject?.id),
    );
    if (routeThreadId && !fromLayout.includes(routeThreadId)) {
      return [routeThreadId, ...fromLayout].slice(0, 2);
    }
    return fromLayout.slice(0, 2);
  }, [activeProject?.id, layout.activeThreadIds, routeThreadId, threads]);

  const spaceData = useProjectSpaceData(activeProject?.id ?? null, activeThreadIds, nowMs);

  const threadsById = useMemo(
    () => new Map(threads.map((thread) => [thread.id, thread])),
    [threads],
  );

  // Follow the active project when a deep-linked thread belongs elsewhere.
  useEffect(() => {
    if (!routeThreadId) return;
    const thread = threadsById.get(routeThreadId);
    if (!thread) return;
    const index = projects.findIndex((project) => project.id === thread.projectId);
    if (index >= 0 && index !== activeIndex) ui.setActiveProjectIndex(index);
  }, [activeIndex, projects, routeThreadId, threadsById, ui]);

  // Cold-start restoration depends on this being remembered, and the SASCODE
  // shell does not mount the inherited sidebar that used to write it.
  useEffect(() => {
    if (routeThreadId) rememberSascodeThreadRoute(routeThreadId, splitViewId);
  }, [routeThreadId, splitViewId]);

  const openThread = useCallback(
    (threadId: ThreadId) => {
      void navigate({
        to: "/$threadId",
        params: { threadId },
        search: () => ({ ...(splitViewId ? { splitViewId } : {}) }),
      });
    },
    [navigate, splitViewId],
  );

  const setActiveThreads = useCallback(
    (next: ReadonlyArray<ThreadId>) => {
      layoutController.update(
        (current) => ({
          ...current,
          activeThreadIds: [...next].slice(0, 2),
          mode: next.length > 1 ? "dual-session" : "focus",
        }),
        { persist: "idle" },
      );
      const primary = next[0];
      if (primary) openThread(primary);
    },
    [layoutController, openThread],
  );

  const handleSessionAction = useCallback(
    (kind: SessionCardActionKind, card: SessionCard) => {
      const threadId = card.threadId as ThreadId;
      switch (kind) {
        case "focus":
        case "open":
        case "resume":
          setActiveThreads([threadId]);
          break;
        case "split":
          setActiveThreads(
            activeThreadIds[0] && activeThreadIds[0] !== threadId
              ? [activeThreadIds[0], threadId]
              : [threadId],
          );
          break;
        case "return-to-shelf":
          setActiveThreads(activeThreadIds.filter((id) => id !== threadId));
          break;
        case "review":
        case "approve":
        case "respond":
          // Approvals and input requests are answered inside the session's own
          // surface, which owns the request payload and its lifecycle
          // generation. Focusing is the honest action here.
          setActiveThreads([threadId]);
          break;
        case "retry":
          setActiveThreads([threadId]);
          break;
        case "route":
          setActiveThreads([threadId]);
          break;
        default:
          break;
      }
    },
    [activeThreadIds, setActiveThreads],
  );

  const handleStepProject = useCallback(
    (direction: -1 | 1) => {
      ui.stepProject(direction, projects.length);
    },
    [projects.length, ui],
  );

  useSpatialGestures({
    containerRef: viewportRef,
    overviewOpen: ui.overviewOpen,
    interactionBusy: ui.interactionBusy,
    onStepProject: handleStepProject,
    onOpenOverview: ui.openOverview,
    onCloseOverview: ui.closeOverview,
    config: { overviewGestureEnabled: theme.motionScale > 0 },
  });

  const closeTopLayer = useCallback((): boolean => {
    if (startFeatureOpen) {
      setStartFeatureOpen(false);
      return true;
    }
    if (ui.overviewOpen) {
      ui.closeOverview();
      return true;
    }
    if (layout.mode === "edit-space") {
      layoutController.update((current) => ({ ...current, mode: "focus" }), { persist: "now" });
      ui.setAppearanceOpen(false);
      return true;
    }
    if (ui.appearanceOpen) {
      ui.setAppearanceOpen(false);
      return true;
    }
    if (ui.contextLens) {
      ui.setContextLens(null);
      return true;
    }
    return false;
  }, [layout.mode, layoutController, startFeatureOpen, ui]);

  const toggleEditSpace = useCallback(() => {
    layoutController.update(
      (current) => ({ ...current, mode: current.mode === "edit-space" ? "focus" : "edit-space" }),
      { persist: "now" },
    );
    ui.setAppearanceOpen(layout.mode !== "edit-space");
  }, [layout.mode, layoutController, ui]);

  useWorkspaceShortcuts({
    onStepProject: handleStepProject,
    onOpenOverview: ui.openOverview,
    onCloseOverview: ui.closeOverview,
    onToggleOverview: () => (ui.overviewOpen ? ui.closeOverview() : ui.openOverview()),
    onToggleEditSpace: toggleEditSpace,
    onOpenCommand: () => ui.openOverview(),
    onCloseLayer: closeTopLayer,
    onFocusShelf: () => {
      const first = document.querySelector<HTMLElement>("[data-session-card]");
      first?.focus();
    },
    onToggleChatDock: () =>
      layoutController.update(
        (current) => ({
          ...current,
          modules: current.modules.map((placement) =>
            placement.moduleType === "agent-chat"
              ? { ...placement, dock: placement.dock === "top" ? "left" : "top" }
              : placement,
          ),
        }),
        { persist: "idle" },
      ),
  });

  const chatDock = useMemo(() => {
    const placement = layout.modules.find((entry) => entry.moduleType === "agent-chat");
    const dock = placement?.dock;
    return dock === "top" || dock === "left" || dock === "floating" ? dock : "left";
  }, [layout.modules]);

  const handleBootstrap = useCallback(async () => {
    if (!activeProject || bootstrapping) return;
    setBootstrapping(true);
    try {
      await bootstrapProject({
        projectId: activeProject.id,
        projectName: activeProject.name,
        workspaceRoots: [activeProject.cwd],
        allowedHosts: ["*"],
        permissionProfile: "full-access-isolated",
        policyRevision: 1,
        maxParallelWorkUnits: 4,
        occurredAt: new Date().toISOString(),
      });
      await queryClient.invalidateQueries({
        queryKey: projectSnapshotQueryOptions(activeProject.id).queryKey,
      });
      await queryClient.invalidateQueries({ queryKey: ["sascode", "layout", activeProject.id] });
    } finally {
      setBootstrapping(false);
    }
  }, [activeProject, bootstrapping, queryClient]);

  const activeSessionTitle = useMemo(() => {
    const primary = activeThreadIds[0];
    if (!primary) return null;
    return spaceData.cards.find((card) => card.threadId === primary)?.title ?? null;
  }, [activeThreadIds, spaceData.cards]);

  const cardsByProject = useMemo(() => {
    const map = new Map<ProjectId, ReadonlyArray<SessionCard>>();
    if (activeProject) map.set(activeProject.id, spaceData.cards);
    return map;
  }, [activeProject, spaceData.cards]);

  if (!hydrated) return <ProjectSpaceSkeleton />;

  // A workspace with no projects has nothing to be spatial about yet. First run
  // still lives inside the shell so the frame, theme, and connection health are
  // already true before the first project exists.
  if (projects.length === 0) {
    return (
      <div className="sas-root relative flex h-dvh min-h-0 w-full flex-col overflow-hidden">
        <AmbientFrame
          projects={projects}
          activeIndex={0}
          activeProject={null}
          activeSessionTitle={null}
          attention={attention}
          connection={connection}
          editSpaceActive={false}
          onOpenOverview={ui.openOverview}
          onOpenCommand={ui.openOverview}
          onToggleAppearance={() => ui.setAppearanceOpen(!ui.appearanceOpen)}
          onToggleEditSpace={toggleEditSpace}
          onSelectProject={ui.setActiveProjectIndex}
          onFocusAttention={() => undefined}
        />
        <div className="min-h-0 flex-1">
          <FirstRun />
        </div>
      </div>
    );
  }

  return (
    <div
      className="sas-root relative flex h-dvh min-h-0 w-full flex-col overflow-hidden"
      data-sas-shell="true"
    >
      <AmbientFrame
        projects={projects}
        activeIndex={activeIndex}
        activeProject={activeProject}
        activeSessionTitle={activeSessionTitle}
        attention={attention}
        connection={connection}
        editSpaceActive={layout.mode === "edit-space"}
        onOpenOverview={ui.openOverview}
        onOpenCommand={ui.openOverview}
        onToggleAppearance={() => ui.setAppearanceOpen(!ui.appearanceOpen)}
        onToggleEditSpace={toggleEditSpace}
        onSelectProject={ui.setActiveProjectIndex}
        onFocusAttention={(projectId) => {
          const index = projects.findIndex((project) => project.id === projectId);
          if (index >= 0) ui.setActiveProjectIndex(index);
        }}
      />

      <SpaceViewport
        ref={viewportRef}
        count={projects.length}
        activeIndex={activeIndex}
        onStepProject={handleStepProject}
      >
        {projects.map((project, index) => (
          <ProjectSpace
            key={project.id}
            project={project}
            active={index === activeIndex}
            cards={index === activeIndex ? spaceData.cards : []}
            threadsById={threadsById}
            activeThreadIds={index === activeIndex ? activeThreadIds : []}
            focusedSide={ui.focusedSide}
            splitRatio={ui.splitRatio}
            onSplitRatioChange={ui.setSplitRatio}
            chatDock={chatDock}
            onChatDockChange={(dock) =>
              layoutController.update(
                (current) => ({
                  ...current,
                  modules: current.modules.map((placement) =>
                    placement.moduleType === "agent-chat" ? { ...placement, dock } : placement,
                  ),
                }),
                { persist: "idle" },
              )
            }
            chatExpanded={ui.chatExpanded}
            onChatExpandedChange={ui.setChatExpanded}
            contextLens={ui.contextLens}
            onContextLensChange={ui.setContextLens}
            onSessionAction={handleSessionAction}
            onFocusSide={ui.setFocusedSide}
            onStartFeature={(request) => {
              setStartFeatureRequest(request ?? "");
              setStartFeatureOpen(true);
            }}
            onBootstrapProject={() => void handleBootstrap()}
            needsBootstrap={layoutController.usingDefault && spaceData.snapshotReady}
            search={search}
            splitViewId={splitViewId}
            editSpaceActive={layout.mode === "edit-space"}
            flatBackground={theme.opaquePanels}
            backgroundImageUrl={null}
          />
        ))}
      </SpaceViewport>

      {layout.mode === "edit-space" || ui.appearanceOpen ? (
        <EditSpaceLayer
          controller={layoutController}
          editing={layout.mode === "edit-space"}
          appearanceOpen={ui.appearanceOpen}
          accessibility={theme.accessibility}
          effective={theme.effective}
          onCloseAppearance={() => ui.setAppearanceOpen(false)}
          onExit={() => {
            layoutController.update((current) => ({ ...current, mode: "focus" }), {
              persist: "now",
            });
            ui.setAppearanceOpen(false);
          }}
          onEnterEditing={toggleEditSpace}
          projectSnapshotProjectId={activeProject?.id ?? null}
          onInteractionChange={ui.setInteractionBusy}
        />
      ) : null}

      {ui.overviewOpen ? (
        <ProjectOverview
          projects={projects}
          activeIndex={activeIndex}
          attention={attention}
          cardsByProject={cardsByProject}
          query={ui.overviewQuery}
          onQueryChange={ui.setOverviewQuery}
          focusIndex={ui.overviewFocusIndex}
          onFocusIndexChange={ui.setOverviewFocusIndex}
          onOpenProject={(index) => {
            ui.setActiveProjectIndex(index);
            ui.closeOverview();
          }}
          onOpenSession={(projectId, threadId) => {
            const index = projects.findIndex((project) => project.id === projectId);
            if (index >= 0) ui.setActiveProjectIndex(index);
            ui.closeOverview();
            openThread(threadId);
          }}
          onSplitWith={(projectId) => {
            secondaryProjectIdRef.current = projectId;
            layoutController.update(
              (current) => ({
                ...current,
                mode: "dual-project",
                secondaryProjectId: projectId,
              }),
              { persist: "now" },
            );
            ui.closeOverview();
          }}
          onClose={ui.closeOverview}
        />
      ) : null}

      {startFeatureOpen && activeProject ? (
        <StartFeatureDialog
          projectId={activeProject.id}
          projectName={activeProject.name}
          workspaceRoot={activeProject.cwd}
          policyRevision={1}
          initialRequest={startFeatureRequest}
          onClose={() => setStartFeatureOpen(false)}
          onStarted={() => {
            void queryClient.invalidateQueries({ queryKey: ["sascode"] });
          }}
        />
      ) : null}

      <AttentionLayer
        projectId={activeProject?.id ?? null}
        onOpenSession={(threadId) => setActiveThreads([threadId])}
      />
    </div>
  );
}

export { buildDefaultLayout, interruptSession };
