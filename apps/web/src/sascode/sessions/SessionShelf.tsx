// FILE: sascode/sessions/SessionShelf.tsx
// Purpose: The live session shelf along the bottom of a project space.
// Layer: Presentation.
//
// Collapsed by default during focus — one line showing the active session and a
// count. It expands on demand, on hover near the edge, or automatically when a
// session needs a decision, then settles back.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { IconChevronUp } from "@tabler/icons-react";

import { cn } from "~/lib/utils";
import {
  SESSION_STATE_LABEL,
  SESSION_STATE_TONE,
  type SessionCard,
  type SessionCardActionKind,
} from "./sessionCards";
import { SessionCardView, formatElapsed } from "./SessionCardView";
import { NewSessionButton } from "../shell/WorkspaceActions";

const TONE_DOT: Record<string, string> = {
  live: "var(--sas-live)",
  attention: "var(--sas-attention)",
  blocked: "var(--sas-blocked)",
  accent: "var(--sas-accent)",
  resting: "var(--sas-resting)",
};

export interface SessionShelfProps {
  projectId: import("@synara/contracts").ProjectId | null;
  cards: ReadonlyArray<SessionCard>;
  activeCard: SessionCard | null;
  onAction: (kind: SessionCardActionKind, card: SessionCard) => void;
  onDragStart: (card: SessionCard, event: React.PointerEvent) => void;
  draggingThreadId: string | null;
  /** Edit Space keeps the shelf expanded so it can be arranged. */
  forceExpanded?: boolean;
}

export function SessionShelf({
  projectId,
  cards,
  activeCard,
  onAction,
  onDragStart,
  draggingThreadId,
  forceExpanded,
}: SessionShelfProps) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const scrollerRef = useRef<HTMLDivElement>(null);

  const actionable = cards.filter(
    (card) => card.state === "needs-approval" || card.state === "needs-input",
  );

  // A decision is the one thing worth interrupting focus for, so the shelf
  // opens itself. It never re-opens once the user has closed it.
  const dismissedRef = useRef(false);
  useEffect(() => {
    if (actionable.length > 0 && !dismissedRef.current) setExpanded(true);
  }, [actionable.length]);

  const isOpen = forceExpanded || expanded;
  const others = cards.filter((card) => card.threadId !== activeCard?.threadId);

  const handleToggle = useCallback(() => {
    setExpanded((current) => {
      if (current) dismissedRef.current = true;
      return !current;
    });
  }, []);

  const handleScrollKeys = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    event.preventDefault();
    scroller.scrollBy({ left: event.key === "ArrowRight" ? 284 : -284, behavior: "smooth" });
  }, []);

  if (cards.length === 0) return null;

  return (
    <section
      aria-label="Sessions"
      className="sas-glass sas-rim sas-transition pointer-events-auto flex flex-col overflow-hidden"
      data-sas-gesture-opaque="true"
    >
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        {activeCard ? (
          <>
            <span
              aria-hidden="true"
              className="size-[6px] shrink-0 rounded-full"
              style={{ backgroundColor: TONE_DOT[SESSION_STATE_TONE[activeCard.state]] }}
            />
            <span
              className="truncate text-[12px] font-medium"
              style={{ color: "var(--sas-text)" }}
            >
              {activeCard.title}
            </span>
            <span className="shrink-0 text-[11px]" style={{ color: "var(--sas-text-muted)" }}>
              · {activeCard.modelLabel}
            </span>
            <span
              className="hidden truncate text-[11px] sm:inline"
              style={{ color: "var(--sas-text-secondary)" }}
            >
              {activeCard.activity}
            </span>
            <span
              className="sas-numeric shrink-0 text-[10.5px]"
              style={{ color: "var(--sas-text-muted)" }}
            >
              {formatElapsed(activeCard.elapsedMs)}
            </span>
          </>
        ) : (
          <span className="text-[12px]" style={{ color: "var(--sas-text-secondary)" }}>
            No session in focus
          </span>
        )}

        <div className="ms-auto flex shrink-0 items-center gap-2">
          {actionable.length > 0 ? (
            <span
              className="rounded-full px-2 py-[3px] text-[10.5px] font-medium"
              style={{
                backgroundColor: "var(--sas-attention-soft)",
                color: "var(--sas-attention-ink)",
              }}
            >
              {actionable.length === 1 ? "1 decision ready" : `${actionable.length} decisions ready`}
            </span>
          ) : null}
          <button
            type="button"
            onClick={handleToggle}
            aria-expanded={isOpen}
            aria-controls={panelId}
            className="sas-transition sas-focusable flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]"
            style={{
              backgroundColor: "var(--sas-surface-raised)",
              color: "var(--sas-text-secondary)",
              border: "1px solid var(--sas-line)",
            }}
          >
            Sessions
            <IconChevronUp
              size={13}
              stroke={1.7}
              aria-hidden="true"
              className="sas-transition"
              style={{ transform: isOpen ? "rotate(180deg)" : undefined }}
            />
          </button>
          {others.length > 0 && !isOpen ? (
            <span className="text-[11px]" style={{ color: "var(--sas-text-muted)" }}>
              {others.length} more
            </span>
          ) : null}
          <NewSessionButton projectId={projectId} label="New" />
        </div>
      </div>

      <div
        id={panelId}
        className="sas-transition grid"
        style={{
          gridTemplateRows: isOpen ? "1fr" : "0fr",
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            ref={scrollerRef}
            role="list"
            onKeyDown={handleScrollKeys}
            className="sas-scroll flex gap-2.5 px-3.5 pb-3.5 pt-0.5"
            style={{ borderTop: "1px solid var(--sas-line)" }}
          >
            {cards.map((card) => (
              <div role="listitem" key={card.threadId}>
                <SessionCardView
                  card={card}
                  onAction={onAction}
                  onDragStart={onDragStart}
                  dragging={draggingThreadId === card.threadId}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Screen readers get the state changes without a visual notification feed. */}
      <p aria-live="polite" className="sas-sr-only">
        {actionable
          .map((card) => `${card.title}: ${SESSION_STATE_LABEL[card.state]}`)
          .join(". ")}
      </p>
    </section>
  );
}

/**
 * The shelf before anything exists. Deliberately a quiet single line rather
 * than a full-width panel: an empty project should feel calm, not unfinished.
 */
export function ShelfEmptyState({
  projectId,
  onNewSession,
}: {
  projectId: import("@synara/contracts").ProjectId | null;
  onNewSession: () => void;
}) {
  return (
    <div className={cn("flex items-center justify-center")}>
      <div
        className="sas-glass-quiet pointer-events-auto flex items-center gap-3 px-3.5 py-2"
        style={{ borderRadius: "999px" }}
      >
        <span className="text-[11.5px]" style={{ color: "var(--sas-text-secondary)" }}>
          No sessions running
        </span>
        <span aria-hidden="true" style={{ color: "var(--sas-line-strong)" }}>
          ·
        </span>
        <button
          type="button"
          onClick={onNewSession}
          className="sas-transition sas-focusable text-[11.5px] font-medium"
          style={{ color: "var(--sas-accent-ink)" }}
        >
          Start work
        </button>
        <span aria-hidden="true" style={{ color: "var(--sas-line-strong)" }}>
          ·
        </span>
        <NewSessionButton projectId={projectId} label="New session" />
      </div>
    </div>
  );
}
