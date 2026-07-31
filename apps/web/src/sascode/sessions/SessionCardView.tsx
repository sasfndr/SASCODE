// FILE: sascode/sessions/SessionCardView.tsx
// Purpose: One live session card — a draggable working object, not a dashboard
//          tile.
// Layer: Presentation.
//
// Progressive disclosure rules this file enforces:
//  - state, model, and one line of current activity are always visible;
//  - actions appear when the card needs a human, or on hover/focus otherwise;
//  - nothing animates on a loop. Liveness comes from the content changing.

import { memo, useCallback, useState } from "react";
import { IconGripVertical } from "@tabler/icons-react";

import { cn } from "~/lib/utils";
import {
  SESSION_STATE_LABEL,
  SESSION_STATE_TONE,
  type SessionCard,
  type SessionCardActionKind,
} from "./sessionCards";

const TONE_INK: Record<string, string> = {
  live: "var(--sas-live-ink)",
  attention: "var(--sas-attention-ink)",
  blocked: "var(--sas-blocked-ink)",
  accent: "var(--sas-accent-ink)",
  resting: "var(--sas-resting-ink)",
};

const TONE_FILL: Record<string, string> = {
  live: "var(--sas-live-soft)",
  attention: "var(--sas-attention-soft)",
  blocked: "var(--sas-blocked-soft)",
  accent: "var(--sas-accent-soft)",
  resting: "var(--sas-resting-soft)",
};

const TONE_DOT: Record<string, string> = {
  live: "var(--sas-live)",
  attention: "var(--sas-attention)",
  blocked: "var(--sas-blocked)",
  accent: "var(--sas-accent)",
  resting: "var(--sas-resting)",
};

export function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export interface SessionCardViewProps {
  card: SessionCard;
  /** Compact cards are used in the collapsed shelf and in Project Overview. */
  variant?: "shelf" | "overview";
  onAction: (kind: SessionCardActionKind, card: SessionCard) => void;
  onDragStart?: (card: SessionCard, event: React.PointerEvent) => void;
  dragging?: boolean;
}

function StatusChip({ card }: { card: SessionCard }) {
  const tone = SESSION_STATE_TONE[card.state];
  return (
    <span
      className="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-[3px] text-[10.5px] font-medium"
      style={{ backgroundColor: TONE_FILL[tone], color: TONE_INK[tone] }}
    >
      {/* The dot is decoration; the label is what actually carries the state. */}
      <span
        aria-hidden="true"
        className="size-[5px] rounded-full"
        style={{ backgroundColor: TONE_DOT[tone] }}
      />
      {SESSION_STATE_LABEL[card.state]}
    </span>
  );
}

export const SessionCardView = memo(function SessionCardView({
  card,
  variant = "shelf",
  onAction,
  onDragStart,
  dragging,
}: SessionCardViewProps) {
  const [hovered, setHovered] = useState(false);
  const needsHuman = card.state === "needs-approval" || card.state === "needs-input";
  const showActions = needsHuman || hovered;

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onAction("focus", card);
      }
    },
    [card, onAction],
  );

  return (
    <div
      role="group"
      aria-label={`${card.title}. ${SESSION_STATE_LABEL[card.state]}. ${card.activity}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setHovered(false);
      }}
      onDoubleClick={() => onAction("focus", card)}
      data-session-card={card.threadId}
      className={cn(
        "sas-transition sas-glass-quiet sas-focusable group relative flex min-w-0 flex-col gap-2 p-3 text-left",
        variant === "shelf" ? "w-[300px] shrink-0" : "w-full",
        dragging && "opacity-60",
      )}
      style={{
        borderColor: card.active ? "var(--sas-accent-line)" : "var(--sas-line)",
        boxShadow: card.active ? "var(--sas-shadow-lift)" : undefined,
        cursor: onDragStart ? "grab" : "default",
      }}
    >
      <div className="flex items-start gap-2">
        {onDragStart ? (
          <button
            type="button"
            aria-label={`Drag ${card.title} into focus`}
            onPointerDown={(event) => onDragStart(card, event)}
            className="sas-transition sas-focusable -ms-1 mt-[1px] shrink-0 rounded p-0.5"
            style={{ color: "var(--sas-text-muted)", opacity: hovered ? 1 : 0.35 }}
          >
            <IconGripVertical size={13} stroke={1.6} />
          </button>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            <span
              className="min-w-0 flex-1 truncate text-[12.5px] font-medium"
              style={{ color: "var(--sas-text)" }}
              title={card.title}
            >
              {card.title}
            </span>
            <StatusChip card={card} />
          </div>
          <div
            className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10.5px]"
            style={{ color: "var(--sas-text-muted)" }}
          >
            <span className="truncate">{card.modelLabel}</span>
            {card.roleLabel ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">{card.roleLabel}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <p
        className="line-clamp-1 text-[11.5px]"
        style={{ color: "var(--sas-text-secondary)" }}
        title={card.activity}
      >
        {card.activity}
      </p>

      <div className="flex items-center gap-2">
        {card.progress !== null ? (
          <div
            className="h-[3px] min-w-0 flex-1 overflow-hidden rounded-full"
            style={{ backgroundColor: "var(--sas-line)" }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(card.progress * 100)}
            aria-label={`${card.title} workflow progress`}
          >
            <div
              className="sas-transition h-full rounded-full"
              style={{
                width: `${Math.round(card.progress * 100)}%`,
                backgroundColor: TONE_DOT[SESSION_STATE_TONE[card.state]],
              }}
            />
          </div>
        ) : (
          <span className="min-w-0 flex-1" />
        )}
        {card.progress !== null ? (
          <span className="sas-numeric text-[10.5px]" style={{ color: "var(--sas-text-muted)" }}>
            {Math.round(card.progress * 100)}%
          </span>
        ) : null}
        <span className="sas-numeric text-[10.5px]" style={{ color: "var(--sas-text-muted)" }}>
          {formatElapsed(card.elapsedMs)}
        </span>
      </div>

      {showActions ? (
        <div className="sas-settle flex flex-wrap items-center gap-1.5">
          {card.actions.map((action) => (
            <button
              key={action.kind}
              type="button"
              onClick={() => onAction(action.kind, card)}
              className="sas-transition sas-focusable rounded-[var(--sas-radius-xs)] px-2.5 py-1 text-[11px] font-medium"
              style={
                action.emphasis === "primary"
                  ? {
                      backgroundColor: "var(--sas-accent)",
                      color: "var(--sas-text-on-accent)",
                    }
                  : action.emphasis === "standard"
                    ? {
                        backgroundColor: "var(--sas-surface-raised)",
                        color: "var(--sas-text)",
                        border: "1px solid var(--sas-line-strong)",
                      }
                    : { color: "var(--sas-text-muted)" }
              }
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});
