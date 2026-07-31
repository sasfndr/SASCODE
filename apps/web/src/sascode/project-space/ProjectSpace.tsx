// FILE: sascode/project-space/ProjectSpace.tsx
// Purpose: One project as a full spatial environment, composed around the four
//          anchors the design defines: ambient frame, Agent Chat, the preview
//          workbench, and the live session shelf.
// Layer: Shell.
//
// The proportions below are derived from `01-dusk-workspace-foundation.png` at
// its native 1487 × 1058 and expressed as viewport-relative clamps, so the
// composition holds at that size and degrades sensibly rather than being pinned
// to it. The numbers in the comments are what each clamp resolves to at the
// canonical viewport, which is what makes them checkable against the source.
//
// Two things here are deliberate and easy to undo by accident:
//
//  * The chat sheet is shorter than the workbench and top-aligned. It floats;
//    it does not fill its column. Stretching it to match destroys the depth the
//    whole scene depends on.
//  * The shelf is wider than the work row above it. That widening is what makes
//    the shelf read as the floor of the space rather than as a third panel.

import { useCallback, useMemo, useRef, useState } from "react";
import type { ThreadId } from "@synara/contracts";

import type { Project, SidebarThreadSummary } from "~/types";
import { AgentChatSheet, type ChatTarget } from "../chat/AgentChatSheet";
import type { TranscriptEntry } from "../chat/transcriptModel";
import type { SessionCard, SessionCardActionKind } from "../sessions/sessionCards";
import { SessionShelf, ShelfEmptyState } from "../sessions/SessionShelf";
import { SessionWorkbench } from "../workbench/SessionWorkbench";
import type { WorkbenchActivityItem } from "../workbench/WorkbenchActivityStrip";
import type { WorkbenchMode } from "../workbench/workbenchModes";
import { ContextLensRail } from "./ContextLensRail";
import { NeighbourReveal } from "./NeighbourReveal";
import { ProjectEnvironment } from "./ProjectEnvironment";
import { ProjectEmptyState } from "./ProjectEmptyState";
import type { ChatDock } from "../state/workspaceUiStore";
import { SplitDivider } from "./SplitDivider";

/** Left/right margin of the work row: 6vw → 89px at 1487. */
const WORK_EDGE = "clamp(20px, 6vw, 90px)";
/** The shelf reaches wider than the work row: 3.4vw → 51px at 1487. */
const SHELF_EDGE = "clamp(12px, 3.4vw, 51px)";
/** Gap under the ambient frame: 1.6vh → 17px at 1058. */
const TOP_GAP = "clamp(8px, 1.6vh, 17px)";
/** Environment left visible below the shelf: 10.4vh → 110px at 1058. */
const FLOOR_GAP = "clamp(24px, 10.4vh, 110px)";
/** Chat column width inside the work row: 31.4% → 410px of 1307. */
const CHAT_WIDTH = "clamp(280px, 31.4%, 440px)";
/** Chat height against the workbench: 573 of 695. */
const CHAT_HEIGHT = "82%";

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
  workbenchMode: WorkbenchMode;
  onWorkbenchModeChange: (mode: WorkbenchMode) => void;
  onSessionAction: (kind: SessionCardActionKind, card: SessionCard) => void;
  onFocusSide: (side: "primary" | "secondary") => void;
  onStartFeature: (request?: string) => void;
  onBootstrapProject: () => void;
  needsBootstrap: boolean;
  editSpaceActive: boolean;
  flatBackground: boolean;
  backgroundImageUrl: string | null;
  backgroundDim: number;
  /** Adjacent spaces, for the edge reveals. */
  previousProject?: { name: string; aura: string | null } | null;
  nextProject?: { name: string; aura: string | null } | null;
  onStepProject?: (direction: -1 | 1) => void;
  /** Development visual fixture only; never set in production. */
  fixture?:
    | {
        transcript: ReadonlyArray<TranscriptEntry>;
        activity: ReadonlyArray<WorkbenchActivityItem>;
        renderMode: (mode: WorkbenchMode) => React.ReactNode | null;
      }
    | undefined;
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

  const cardByThreadId = useMemo(
    () => new Map(props.cards.map((card) => [card.threadId, card])),
    [props.cards],
  );
  const activeCard = primaryThreadId ? (cardByThreadId.get(primaryThreadId) ?? null) : null;
  const secondaryCard = secondaryThreadId ? (cardByThreadId.get(secondaryThreadId) ?? null) : null;

  const chatTargets = useMemo<ChatTarget[]>(() => {
    if (!primaryThreadId) return [{ id: "new", label: "New work", threadIds: [] }];
    const targets: ChatTarget[] = [
      {
        id: "focused",
        label: activeCard?.title ?? "Active session",
        threadIds: [primaryThreadId],
      },
    ];
    if (secondaryThreadId) {
      targets.push({
        id: "secondary",
        label: secondaryCard?.title ?? "Second session",
        threadIds: [secondaryThreadId],
      });
      targets.push({ id: "both", label: "Both", threadIds: [primaryThreadId, secondaryThreadId] });
    }
    return targets;
  }, [activeCard, primaryThreadId, secondaryCard, secondaryThreadId]);

  // Dragging a card onto the centre focuses it; onto the right of an occupied
  // centre opens dual-session. The intent resolves from pointer position so the
  // drop target is legible before release.
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

  const chatSheet = (
    <AgentChatSheet
      dock={props.chatDock}
      onDockChange={props.onChatDockChange}
      targets={chatTargets}
      selectedTargetId={chatTargetId}
      onSelectTarget={setChatTargetId}
      cards={props.cards}
      threadsById={props.threadsById}
      focusedThreadId={primaryThreadId}
      expanded={props.chatExpanded}
      onExpandedChange={props.onChatExpandedChange}
      onStartFeature={(request) => props.onStartFeature(request)}
      fixtureEntries={props.fixture?.transcript}
    />
  );

  const workbenchFor = (
    threadId: ThreadId,
    card: SessionCard | null,
    side: "primary" | "secondary",
  ) => {
    const fixtureBody =
      side === "primary" && props.fixture ? props.fixture.renderMode(props.workbenchMode) : null;
    return (
      <SessionWorkbench
        threadId={threadId}
        projectId={props.project.id}
        title={card?.title ?? props.project.name}
        modelLabel={card?.modelLabel ?? "Session"}
        workflowId={card?.workflowId ?? null}
        mode={props.workbenchMode}
        onModeChange={props.onWorkbenchModeChange}
        focused={props.focusedSide === side}
        onFocus={() => props.onFocusSide(side)}
        activityOverride={side === "primary" ? props.fixture?.activity : undefined}
        {...(fixtureBody === null ? {} : { modeFixture: fixtureBody })}
      />
    );
  };

  const stage = (
    <div ref={stageRef} className="relative flex min-h-0 min-w-0 flex-1 gap-2" data-sas-stage="true">
      {primaryThreadId ? (
        <>
          <div
            className="flex min-h-0 min-w-0 flex-col"
            style={{ flexBasis: dualSession ? `${props.splitRatio * 100}%` : "100%", flexGrow: 1 }}
          >
            {workbenchFor(primaryThreadId, activeCard, "primary")}
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
                {workbenchFor(secondaryThreadId, secondaryCard, "secondary")}
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
            style={{ backgroundColor: "var(--sas-surface-raised)", color: "var(--sas-text)" }}
          >
            {dropIntent === "split" ? "Drop for dual session" : "Drop to focus"}
          </span>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <ProjectEnvironment
        active={props.active}
        flat={props.flatBackground}
        imageUrl={props.backgroundImageUrl}
        dim={props.backgroundDim}
      />

      {/* Edit Space renders every module as a movable frame over this space, so
          the live composition is hidden while arranging. Leaving both on screen
          shows each module twice. */}
      {props.active && !props.editSpaceActive ? (
        <>
          {props.previousProject && props.onStepProject ? (
            <NeighbourReveal
              side="left"
              projectName={props.previousProject.name}
              aura={props.previousProject.aura}
              onStep={() => props.onStepProject?.(-1)}
            />
          ) : null}
          {props.nextProject && props.onStepProject ? (
            <NeighbourReveal
              side="right"
              projectName={props.nextProject.name}
              aura={props.nextProject.aura}
              onStep={() => props.onStepProject?.(1)}
            />
          ) : null}

          <div
            className="relative flex min-h-0 flex-1 flex-col"
            style={{ paddingTop: TOP_GAP, paddingBottom: FLOOR_GAP }}
          >
            <div
              className="flex min-h-0 flex-1 items-stretch gap-[10px]"
              style={{ paddingInline: WORK_EDGE }}
            >
              {props.chatDock === "left" ? (
                <div
                  className="shrink-0 self-start"
                  style={{ width: CHAT_WIDTH, height: CHAT_HEIGHT }}
                >
                  {chatSheet}
                </div>
              ) : null}

              <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-[10px]">
                {props.chatDock === "top" ? (
                  <div className="h-[clamp(160px,30%,320px)] shrink-0">{chatSheet}</div>
                ) : null}

                {stage}

                {/* The lens hangs off the workbench's right edge, in the margin
                    the environment already occupies. Attached, not docked: it
                    belongs to the surface it changes, not to the window. */}
                {primaryThreadId ? (
                  <div
                    className="pointer-events-none absolute top-[45%] -translate-y-1/2"
                    // Straddling the workbench edge rather than clearing it:
                    // the rail belongs to that surface, and a gap would make it
                    // read as a free-floating toolbar owned by the window.
                    // 45%, not 50%: the activity strip weights the lower half of
                    // the surface, so a mathematically centred rail sits low.
                    style={{ left: "calc(100% - 23px)" }}
                  >
                    <ContextLensRail
                      mode={props.workbenchMode}
                      onSelect={props.onWorkbenchModeChange}
                      orientation="vertical"
                    />
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-[12px] shrink-0" style={{ paddingInline: SHELF_EDGE }}>
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

            {/* Floating chat is anchored to the space, not the viewport, so an
                expanding shelf can never end up underneath it. */}
            {props.chatDock === "floating" ? (
              <div className="pointer-events-none absolute inset-0 z-20 p-6 pb-[calc(var(--sas-space-6)*3)]">
                <div className="pointer-events-auto h-[min(62%,440px)] w-[clamp(268px,27%,384px)]">
                  {chatSheet}
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : props.active ? null : (
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
