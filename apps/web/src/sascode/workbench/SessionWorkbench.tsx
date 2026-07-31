// FILE: sascode/workbench/SessionWorkbench.tsx
// Purpose: The centre of a project space — where a session's work becomes
//          visible. Preview by default; Changes, Terminal, Files and Agents
//          adjacent.
// Layer: Shell composition over the inherited work panels.
//
// This replaces the previous `SessionHost`, which mounted the entire inherited
// chat surface here and so put a second composer and a second environment UI in
// the middle of the workspace. The conversation belongs to Agent Chat. What
// belongs here is output: the running app, the diff, the terminal, the tree.
//
// Every mode below is the real inherited panel with its real state — the
// browser/preview panel, the diff panel with its worker pool, the dock terminal
// bound to the session's runtime, the file explorer rooted at the session's
// worktree. None of it is reimplemented and none of it is fed fixtures.

import { Suspense, lazy, useMemo } from "react";
import type {
  OrchestrationThreadActivity,
  ProjectId,
  ThreadId,
  WorkflowId,
} from "@synara/contracts";

import { PanelStateMessage } from "~/components/chat/PanelStateMessage";
import { LazyBrowserPanel, LazyDiffPanel } from "~/components/chat/ChatThreadSurfacePrimitives";
import { resolveFilePreviewWorkspaceRoot } from "~/routes/-chatThreadRoute.logic";
import { useStore } from "~/store";
import { createProjectSelector, createThreadWorkspaceMetadataSelector } from "~/storeSelectors";
import { WorkbenchActivityStrip, type WorkbenchActivityItem } from "./WorkbenchActivityStrip";
import { deriveWorkbenchActivity } from "./workbenchActivity";
import { WorkbenchModeSwitcher } from "./WorkbenchModeSwitcher";
import type { WorkbenchMode } from "./workbenchModes";
import { WorkbenchAgentsPane } from "./WorkbenchAgentsPane";

const EMPTY_ACTIVITY: ReadonlyArray<WorkbenchActivityItem> = [];

const DockTerminalPane = lazy(() => import("~/components/chat/DockTerminalPane"));
const DockExplorerPane = lazy(async () => ({
  default: (await import("~/components/chat/DockExplorerPane")).DockExplorerPane,
}));

export interface SessionWorkbenchProps {
  threadId: ThreadId;
  projectId: ProjectId | null;
  /** Session name, shown as the surface's own quiet identity line. */
  title: string;
  modelLabel: string;
  /** Workflow this session belongs to, for the Agents mode. */
  workflowId: WorkflowId | null;
  mode: WorkbenchMode;
  onModeChange: (mode: WorkbenchMode) => void;
  /** Marks which pane owns keyboard focus in a dual layout. */
  focused?: boolean;
  onFocus?: () => void;
  /** Development visual fixture only; replaces the derived activity strip. */
  activityOverride?: ReadonlyArray<WorkbenchActivityItem> | undefined;
  /** Development visual fixture only: a still stand-in for the current mode. */
  modeFixture?: React.ReactNode;
}

export function SessionWorkbench(props: SessionWorkbenchProps) {
  const activeProject = useStore(
    useMemo(() => createProjectSelector(props.projectId), [props.projectId]),
  );
  const threadWorkspaceMetadata = useStore(
    useMemo(() => createThreadWorkspaceMetadataSelector(props.threadId), [props.threadId]),
  );
  // Selected as the two stable slice references rather than as a derived array:
  // a selector that rebuilds the thread on every store read would never satisfy
  // zustand's identity check and would re-render this surface continuously.
  const activityIds = useStore((state) => state.activityIdsByThreadId?.[props.threadId]);
  const activityById = useStore((state) => state.activityByThreadId?.[props.threadId]);
  const activity = useMemo(() => {
    if (props.activityOverride) return props.activityOverride;
    if (!activityIds || !activityById) return EMPTY_ACTIVITY;
    const ordered = activityIds
      .map((id) => activityById[id])
      .filter((entry): entry is OrchestrationThreadActivity => entry !== undefined);
    return deriveWorkbenchActivity(ordered);
  }, [activityById, activityIds, props.activityOverride]);

  // File preview must follow the same cwd as the session's diffs and terminal:
  // a worktree-backed session resolves paths against its materialized worktree,
  // not the project root.
  const workspaceRoot = resolveFilePreviewWorkspaceRoot({
    projectCwd: activeProject?.cwd ?? null,
    threadEnvMode: threadWorkspaceMetadata.envMode ?? null,
    threadWorktreePath: threadWorkspaceMetadata.worktreePath ?? null,
    threadWorkingDirectory: threadWorkspaceMetadata.workingDirectory ?? null,
  });

  // Preview is a picture: it goes edge to edge and the chrome floats over it.
  // Every other mode is something to read, so it keeps its own space under a
  // real header band and is never overlapped by a floating title.
  const immersive = props.mode === "preview";

  const body = (() => {
    if (props.modeFixture !== undefined) return props.modeFixture;

    switch (props.mode) {
      case "preview":
        return (
          <Suspense fallback={<PanelStateMessage>Loading preview…</PanelStateMessage>}>
            {/* The workbench *is* the pane, so there is nothing to close it
                into — closing returns to the default mode instead. */}
            <LazyBrowserPanel
              mode="sidebar"
              threadId={props.threadId}
              runtimeMode="live"
              onRequestLive={() => {}}
              onClosePanel={() => props.onModeChange("preview")}
            />
          </Suspense>
        );
      case "changes":
        return (
          <LazyDiffPanel
            mode="sidebar"
            threadId={props.threadId}
            panelState={{ panel: "diff", diffTurnId: null, diffFilePath: null }}
            liveRefreshEnabled={props.focused !== false}
            queriesEnabled={props.focused !== false}
          />
        );
      case "terminal":
        return (
          <Suspense fallback={<PanelStateMessage>Loading terminal…</PanelStateMessage>}>
            <DockTerminalPane
              hostThreadId={props.threadId}
              projectId={props.projectId}
              isActive={props.focused !== false}
            />
          </Suspense>
        );
      case "files":
        return (
          <Suspense fallback={<PanelStateMessage>Loading files…</PanelStateMessage>}>
            <DockExplorerPane workspaceRoot={workspaceRoot} />
          </Suspense>
        );
      case "agents":
        return <WorkbenchAgentsPane workflowId={props.workflowId} />;
    }
  })();

  return (
    <section
      data-sas-workbench="true"
      data-sas-gesture-opaque="true"
      onPointerDownCapture={props.onFocus}
      onFocusCapture={props.onFocus}
      aria-label={`${props.title} workbench`}
      className="sas-token-bridge sas-transition relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      style={{
        // A matte plane rather than glass: this is a stable place to read, and
        // it is what gives the floating chat something to float above.
        backgroundColor: "var(--sas-surface)",
        borderRadius: "var(--sas-radius-lg)",
        border: `1px solid ${props.focused === false ? "var(--sas-line)" : "var(--sas-line-strong)"}`,
        boxShadow: props.focused === false ? "var(--sas-shadow-lift)" : "var(--sas-shadow-float)",
      }}
    >
      {immersive ? (
        <div className="absolute inset-0 flex min-h-0 min-w-0 flex-col overflow-hidden">{body}</div>
      ) : null}

      <header
        className={`pointer-events-none relative z-10 flex shrink-0 items-center gap-3 ${
          immersive ? "px-6 pt-4" : "px-4 pt-3 pb-2.5"
        }`}
      >
        <h2 className={`flex min-w-0 items-baseline gap-1.5 ${immersive ? "text-[15px]" : "text-[13px]"}`}>
          <span
            className="truncate font-semibold"
            style={{
              color: immersive ? "var(--sas-text-on-canvas)" : "var(--sas-text)",
              ...(immersive ? { textShadow: "0 1px 14px rgb(0 0 0 / 0.4)" } : {}),
            }}
          >
            {props.title}
          </span>
          <span
            aria-hidden="true"
            style={{
              color: immersive
                ? "var(--sas-text-on-canvas-secondary)"
                : "var(--sas-text-muted)",
            }}
          >
            ·
          </span>
          <span
            className="shrink-0"
            style={{
              color: immersive
                ? "var(--sas-text-on-canvas-secondary)"
                : "var(--sas-text-secondary)",
            }}
          >
            {props.modelLabel}
          </span>
        </h2>

        <div className="pointer-events-auto ms-auto shrink-0">
          <WorkbenchModeSwitcher mode={props.mode} onModeChange={props.onModeChange} />
        </div>
      </header>

      {immersive ? (
        <div className="pointer-events-none relative min-h-0 flex-1" />
      ) : (
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{body}</div>
      )}

      {activity.length > 0 ? <WorkbenchActivityStrip items={activity} /> : null}
    </section>
  );
}
