// FILE: sascode/project-space/ProjectSpace.tsx
// Purpose: One project as a full spatial environment: atmosphere, the active
//          session work surface, a dockable chat sheet, and the live shelf.
// Layer: Shell.
//
// Everything else — files, diff, terminal, browser, evidence, routing — arrives
// as a temporary lens or a placed module. The default state is quiet.

import { useCallback, useMemo, useRef, useState } from "react";
import type { ProjectId, ThreadId } from "@synara/contracts";

import type { DiffRouteSearch } from "~/diffRouteSearch";
import type { Project, SidebarThreadSummary } from "~/types";
import { AgentChatSheet, type ChatTarget } from "../chat/AgentChatSheet";
import type { SessionCard, SessionCardActionKind } from "../sessions/sessionCards";
import { SessionHost } from "../sessions/SessionHost";
import { SessionShelf, ShelfEmptyState } from "../sessions/SessionShelf";
import { ContextLensRail } from "./ContextLensRail";
import { ProjectBackdrop } from "./ProjectBackdrop";
import { ProjectEmptyState } from "./ProjectEmptyState";
import type { ChatDock, ContextLensKind } from "../state/workspaceUiStore";
import { SplitDivider } from "./SplitDivider";

export interface ProjectSpaceProps {
  project: Project;
  /** False for the neighbouring spaces rendered only as an edge reveal. */
  active: boolean;
  cards: ReadonlyArray<SessionCard>;
  threadsById: ReadonlyMap<ThreadId, SidebarThreadSummary>;
  activeThreadIds: ReadonlyArray<ThreadId>;
  focusedSide: "primary" | "secondary";
  splitRatio: number;
  onSplitRatioChange: (ratio: number) => void;
  chatDock: ChatDock;
  onChatDockChange: (dock: ChatDock) => void;
  chatExpanded: boolean;
  onChatExpandedChange: (expanded: boolean) => void;
  contextLens: ContextLensKind | null;
  onContextLensChange: (lens: ContextLensKind | null) => void;
  onSessionAction: (kind: SessionCardActionKind, card: SessionCard) => void;
  onFocusSide: (side: "primary" | "secondary") => void;
  onStartFeature: (request?: string) => void;
  onBootstrapProject: () => void;
  needsBootstrap: boolean;
  search: DiffRouteSearch;
  splitViewId: string | null;
  editSpaceActive: boolean;
  flatBackground: boolean;
  backgroundImageUrl: string | null;
}

export function ProjectSpace(props: ProjectSpaceProps) {
  const [draggingThreadId, setDraggingThreadId] = useState<string | null>(null);
  const dragCardRef = useRef<SessionCard | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [dropIntent, setDropIntent] = useState<"focus" | "split" | null>(null);
  const [chatTargetId, setChatTargetId] = useState("focused");

  const primaryThreadId = props.activeThreadIds[0] ?? null;
  const secondaryThreadId = props.activeThreadIds[1] ?? null;
  const dualSession = secondaryThreadId !== null;

  const activeCard = useMemo(
    () => props.cards.find((card) => card.threadId === primaryThreadId) ?? null,
    [props.cards, primaryThreadId],
  );

  const chatTargets = useMemo<ChatTarget[]>(() => {
    if (!primaryThreadId) return [{ id: "new", label: "New work", threadIds: [] }];
    const primaryCard = props.cards.find((card) => card.threadId === primaryThreadId);
    const targets: ChatTarget[] = [
      {
        id: "focused",
        label: primaryCard?.title ?? "Active session",
        threadIds: [primaryThreadId],
      },
    ];
    if (secondaryThreadId) {
      const secondaryCard = props.cards.find((card) => card.threadId === secondaryThreadId);
      targets.push({
        id: "secondary",
        label: secondaryCard?.title ?? "Second session",
        threadIds: [secondaryThreadId],
      });
      targets.push({
        id: "both",
        label: "Both",
        threadIds: [primaryThreadId, secondaryThreadId],
      });
    }
    return targets;
  }, [props.cards, primaryThreadId, secondaryThreadId]);

  // Dragging a card onto the centre focuses it; onto an occupied centre while a
  // session is already there opens dual-session. The intent is resolved from
  // pointer position so the drop target is legible before release.
  const handleDragStart = useCallback(
    (card: SessionCard, event: React.PointerEvent) => {
      event.preventDefault();
      dragCardRef.current = card;
      setDraggingThreadId(card.threadId);

      const move = (moveEvent: PointerEvent) => {
        const stage = stageRef.current;
        if (!stage) return;
        const bounds = stage.getBoundingClientRect();
        const inside =
          moveEvent.clientX >= bounds.left &&
          moveEvent.clientX <= bounds.right &&
          moveEvent.clientY >= bounds.top &&
          moveEvent.clientY <= bounds.bottom;
        if (!inside) {
          setDropIntent(null);
          return;
        }
        const rightHalf = moveEvent.clientX > bounds.left + bounds.width * 0.55;
        setDropIntent(primaryThreadId && rightHalf ? "split" : "focus");
      };

      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        const dragged = dragCardRef.current;
        setDraggingThreadId(null);
        dragCardRef.current = null;
        setDropIntent((intent) => {
          if (dragged && intent) {
            props.onSessionAction(intent === "split" ? "split" : "focus", dragged);
          }
          return null;
        });
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [primaryThreadId, props],
  );

  const chatSheet = primaryThreadId || props.cards.length > 0 || props.needsBootstrap === false ? (
    <AgentChatSheet
      dock={props.chatDock}
      onDockChange={props.onChatDockChange}
      targets={chatTargets}
      selectedTargetId={chatTargetId}
      onSelectTarget={setChatTargetId}
      cards={props.cards}
      threadsById={props.threadsById}
      expanded={props.chatExpanded}
      onExpandedChange={props.onChatExpandedChange}
      onOpenSession={(threadId) => {
        const card = props.cards.find((entry) => entry.threadId === threadId);
        if (card) props.onSessionAction("focus", card);
      }}
      onStartFeature={(request) => props.onStartFeature(request)}
    />
  ) : null;

  const stage = (
    <div
      ref={stageRef}
      className="relative flex min-h-0 min-w-0 flex-1 gap-2"
      data-sas-stage="true"
    >
      {primaryThreadId ? (
        <>
          <div
            className="flex min-h-0 min-w-0 flex-col"
            style={{ flexBasis: dualSession ? `${props.splitRatio * 100}%` : "100%", flexGrow: 1 }}
          >
            <SessionHost
              threadId={primaryThreadId}
              projectId={props.project.id}
              search={props.search}
              splitViewId={dualSession ? null : props.splitViewId}
              focused={props.focusedSide === "primary"}
              onFocus={() => props.onFocusSide("primary")}
            />
          </div>

          {dualSession ? (
            <>
              <SplitDivider
                ratio={props.splitRatio}
                onRatioChange={props.onSplitRatioChange}
                containerRef={stageRef}
                label="Resize sessions"
              />
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <SessionHost
                  threadId={secondaryThreadId}
                  projectId={props.project.id}
                  search={props.search}
                  focused={props.focusedSide === "secondary"}
                  onFocus={() => props.onFocusSide("secondary")}
                />
              </div>
            </>
          ) : null}
        </>
      ) : (
        <ProjectEmptyState
          projectName={props.project.name}
          needsBootstrap={props.needsBootstrap}
          onBootstrap={props.onBootstrapProject}
          onStartFeature={() => props.onStartFeature()}
        />
      )}

      {dropIntent ? (
        <div
          aria-hidden="true"
          className="sas-transition pointer-events-none absolute inset-0 flex items-center justify-center rounded-[var(--sas-radius-lg)]"
          style={{
            border: "1px dashed var(--sas-accent-line)",
            backgroundColor: "var(--sas-accent-soft)",
          }}
        >
          <span
            className="rounded-full px-3 py-1.5 text-[12px]"
            style={{
              backgroundColor: "var(--sas-surface-raised)",
              color: "var(--sas-text)",
            }}
          >
            {dropIntent === "split" ? "Drop for dual session" : "Drop to focus"}
          </span>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <ProjectBackdrop
        active={props.active}
        flat={props.flatBackground}
        imageUrl={props.backgroundImageUrl}
      />
      <div className="sas-scrim" aria-hidden="true" />

      {props.active ? (
        <div className="relative flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4 pt-1">
          <div className="flex min-h-0 flex-1 gap-3">
            {props.chatDock === "left" && chatSheet ? (
              <div className="flex w-[clamp(256px,25%,380px)] shrink-0 flex-col">{chatSheet}</div>
            ) : null}

            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
              {props.chatDock === "top" && chatSheet ? (
                <div className="h-[clamp(190px,32%,360px)] shrink-0">{chatSheet}</div>
              ) : null}

              {/* The stage is always a plane. Even with nothing running it is a
                  surface the space is arranged around, not a hole in the middle
                  of the composition. */}
              <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                {primaryThreadId ? null : (
                  <div
                    className="sas-glass sas-rim absolute inset-0"
                    aria-hidden="true"
                    style={{ borderRadius: "var(--sas-radius-lg)" }}
                  />
                )}

                {/* Lens tabs float over the stage, top-right, the way the
                    reference places them. */}
                <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-end p-2.5">
                  <ContextLensRail
                    threadId={primaryThreadId}
                    active={props.contextLens}
                    onSelect={props.onContextLensChange}
                  />
                </div>

                {stage}
              </div>
            </div>
          </div>

          <div className="shrink-0">
            {props.cards.length === 0 ? (
              <ShelfEmptyState
                projectId={props.project.id}
                onNewSession={() => props.onStartFeature()}
              />
            ) : (
              <SessionShelf
                projectId={props.project.id}
                cards={props.cards}
                activeCard={activeCard}
                onAction={props.onSessionAction}
                onDragStart={handleDragStart}
                draggingThreadId={draggingThreadId}
                forceExpanded={props.editSpaceActive}
              />
            )}
          </div>

          {props.chatDock === "floating" && chatSheet ? (
            <div className="absolute bottom-28 left-7 z-20 h-[min(54%,440px)] w-[clamp(268px,27%,384px)]">
              {chatSheet}
            </div>
          ) : null}
        </div>
      ) : (
        // Neighbouring spaces are only an edge reveal. Nothing heavy mounts,
        // which is what keeps cross-project presence cheap.
        <div className="relative flex h-full items-center justify-center">
          <span
            className="rotate-180 text-[11px] tracking-[0.18em] uppercase"
            style={{ color: "var(--sas-text-on-canvas-secondary)", writingMode: "vertical-rl" }}
          >
            {props.project.name}
          </span>
        </div>
      )}
    </div>
  );
}
