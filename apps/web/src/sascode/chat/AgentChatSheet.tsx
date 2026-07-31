// FILE: sascode/chat/AgentChatSheet.tsx
// Purpose: The draggable, dockable agent chat sheet — the one surface that can
//          address more than one session at a time.
// Layer: Presentation + command dispatch.
//
// This is not a second transcript. Each session keeps its own full chat inside
// its work surface; this sheet exists for the thing no per-session composer can
// do: say one thing to two sessions, or to two projects, and see the recent
// cross-session activity in one calm feed.

import { useCallback, useMemo, useRef, useState } from "react";
import type { ThreadId } from "@synara/contracts";
import {
  IconArrowUp,
  IconGripHorizontal,
  IconMaximize,
  IconMessage,
  IconMinus,
  IconPlus,
} from "@tabler/icons-react";

import { cn } from "~/lib/utils";
import type { SidebarThreadSummary } from "~/types";
import type { ChatDock } from "../state/workspaceUiStore";
import { sendSessionTurnToMany } from "../sessions/sessionCommands";
import type { SessionCard } from "../sessions/sessionCards";
import { formatElapsed } from "../sessions/SessionCardView";

export interface ChatTarget {
  id: string;
  label: string;
  threadIds: ReadonlyArray<ThreadId>;
}

export interface AgentChatSheetProps {
  dock: ChatDock;
  onDockChange: (dock: ChatDock) => void;
  targets: ReadonlyArray<ChatTarget>;
  selectedTargetId: string;
  onSelectTarget: (id: string) => void;
  /** Recent cross-session activity, newest last. */
  cards: ReadonlyArray<SessionCard>;
  threadsById: ReadonlyMap<ThreadId, SidebarThreadSummary>;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onOpenSession: (threadId: ThreadId) => void;
  /** Starts a new delegated feature when no session is targeted. */
  onStartFeature: (request: string) => void;
  onDragStart?: (event: React.PointerEvent) => void;
}

const PROVIDER_DOT: Record<string, string> = {
  claudeAgent: "var(--sas-accent)",
  codex: "var(--sas-live)",
  cursor: "var(--sas-attention)",
};

export function AgentChatSheet(props: AgentChatSheetProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const target = useMemo(
    () => props.targets.find((entry) => entry.id === props.selectedTargetId) ?? props.targets[0],
    [props.selectedTargetId, props.targets],
  );

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (text.length === 0 || sending) return;
    setSending(true);
    setError(null);
    try {
      if (!target || target.threadIds.length === 0) {
        // Nothing to talk to yet — the message becomes the feature request.
        props.onStartFeature(text);
        setDraft("");
        return;
      }
      const result = await sendSessionTurnToMany(
        target.threadIds.map((threadId) => {
          const thread = props.threadsById.get(threadId);
          return {
            threadId,
            text,
            ...(thread?.modelSelection ? { modelSelection: thread.modelSelection } : {}),
            runtimeMode: "full-access",
            interactionMode: thread?.interactionMode ?? "chat",
          };
        }),
      );
      if (result.failed.length > 0) {
        setError(
          result.sent > 0
            ? `Sent to ${result.sent}, but ${result.failed.length} could not be reached.`
            : (result.failed[0]?.error ?? "Could not send"),
        );
        if (result.sent === 0) return;
      }
      setDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send");
    } finally {
      setSending(false);
    }
  }, [draft, props, sending, target]);

  const recent = useMemo(() => props.cards.slice(0, 4), [props.cards]);

  return (
    <section
      aria-label="Agent chat"
      data-sas-gesture-opaque="true"
      className="sas-glass sas-rim sas-transition pointer-events-auto flex h-full min-h-0 flex-col overflow-hidden"
    >
      <header className="flex shrink-0 items-center gap-2 px-3.5 pb-2 pt-3">
        {props.onDragStart ? (
          <button
            type="button"
            aria-label="Move agent chat"
            onPointerDown={props.onDragStart}
            className="sas-focusable -ms-1 rounded p-0.5"
            style={{ color: "var(--sas-text-muted)", cursor: "grab" }}
          >
            <IconGripHorizontal size={14} stroke={1.6} />
          </button>
        ) : null}
        <h2 className="text-[12.5px] font-medium" style={{ color: "var(--sas-text)" }}>
          Agent chat
        </h2>

        <div
          className="ms-auto flex items-center gap-0.5 rounded-full p-0.5"
          role="radiogroup"
          aria-label="Chat position"
          style={{ backgroundColor: "var(--sas-surface-sunken)" }}
        >
          {(["top", "left", "floating"] as const).map((dock) => (
            <button
              key={dock}
              type="button"
              role="radio"
              aria-checked={props.dock === dock}
              onClick={() => props.onDockChange(dock)}
              className="sas-transition sas-focusable rounded-full px-2.5 py-[3px] text-[10.5px] capitalize"
              style={{
                backgroundColor: props.dock === dock ? "var(--sas-surface-raised)" : "transparent",
                color: props.dock === dock ? "var(--sas-text)" : "var(--sas-text-muted)",
              }}
            >
              {dock}
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-label={props.expanded ? "Collapse agent chat" : "Expand agent chat"}
          onClick={() => props.onExpandedChange(!props.expanded)}
          className="sas-transition sas-focusable rounded-[var(--sas-radius-xs)] p-1"
          style={{ color: "var(--sas-text-muted)" }}
        >
          {props.expanded ? <IconMinus size={14} stroke={1.7} /> : <IconMaximize size={14} stroke={1.7} />}
        </button>
      </header>

      {props.targets.length > 1 ? (
        <div className="flex shrink-0 items-center gap-2 px-3.5 pb-2">
          <span className="text-[10.5px]" style={{ color: "var(--sas-text-muted)" }}>
            Send to
          </span>
          <div
            className="flex min-w-0 items-center gap-0.5 overflow-hidden rounded-full p-0.5"
            role="radiogroup"
            aria-label="Message target"
            style={{ backgroundColor: "var(--sas-surface-sunken)" }}
          >
            {props.targets.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={target?.id === entry.id}
                onClick={() => props.onSelectTarget(entry.id)}
                className="sas-transition sas-focusable truncate rounded-full px-2.5 py-[3px] text-[10.5px]"
                style={{
                  backgroundColor:
                    target?.id === entry.id ? "var(--sas-accent-soft)" : "transparent",
                  color: target?.id === entry.id ? "var(--sas-accent-ink)" : "var(--sas-text-muted)",
                }}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="sas-scroll min-h-0 flex-1 space-y-2 px-3.5 pb-2">
        {recent.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <IconMessage
              size={20}
              stroke={1.3}
              aria-hidden="true"
              style={{ color: "var(--sas-text-muted)", opacity: 0.55 }}
            />
            <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--sas-text-muted)" }}>
              Nothing running yet.
              <br />
              Say what you want built and SASCODE will plan it.
            </p>
          </div>
        ) : (
          recent.map((card) => {
            const thread = props.threadsById.get(card.threadId as ThreadId);
            const provider = card.provider ?? "";
            return (
              <button
                key={card.threadId}
                type="button"
                onClick={() => props.onOpenSession(card.threadId as ThreadId)}
                className="sas-transition sas-focusable block w-full rounded-[var(--sas-radius-sm)] p-2.5 text-left"
                style={{ backgroundColor: "var(--sas-surface-sunken)" }}
              >
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-[6px] shrink-0 rounded-full"
                    style={{ backgroundColor: PROVIDER_DOT[provider] ?? "var(--sas-resting)" }}
                  />
                  <span
                    className="truncate text-[11.5px] font-medium"
                    style={{ color: "var(--sas-text)" }}
                  >
                    {card.modelLabel}
                  </span>
                  <span
                    className="sas-numeric ms-auto shrink-0 text-[10.5px]"
                    style={{ color: "var(--sas-text-muted)" }}
                  >
                    {formatElapsed(card.elapsedMs)}
                  </span>
                </div>
                <p
                  className="mt-1 line-clamp-2 text-[11.5px]"
                  style={{ color: "var(--sas-text-secondary)" }}
                >
                  {card.activity}
                </p>
                {thread?.branch ? (
                  <p className="mt-1 truncate text-[10.5px]" style={{ color: "var(--sas-text-muted)" }}>
                    {thread.branch}
                  </p>
                ) : null}
              </button>
            );
          })
        )}
      </div>

      <div className="shrink-0 px-3 pb-3">
        {error ? (
          <p
            className="mb-1.5 px-1 text-[11px]"
            role="status"
            style={{ color: "var(--sas-blocked-ink)" }}
          >
            {error}
          </p>
        ) : null}
        <div
          className={cn("flex items-end gap-2 rounded-[var(--sas-radius-md)] p-2")}
          style={{
            backgroundColor: "var(--sas-surface-raised)",
            border: "1px solid var(--sas-line-strong)",
          }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              const element = event.target;
              element.style.height = "auto";
              element.style.height = `${Math.min(element.scrollHeight, 132)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder={
              target && target.threadIds.length > 0
                ? `Message ${target.label}…`
                : "Describe what you want built…"
            }
            aria-label="Message the agents"
            className="sas-focusable max-h-[132px] min-h-[22px] w-full resize-none bg-transparent text-[12.5px] outline-none"
            style={{ color: "var(--sas-text)" }}
          />
          <button
            type="button"
            aria-label="Attach"
            className="sas-transition sas-focusable shrink-0 rounded-full p-1"
            style={{ color: "var(--sas-text-muted)" }}
            onClick={() => inputRef.current?.focus()}
          >
            <IconPlus size={15} stroke={1.7} />
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={draft.trim().length === 0 || sending}
            aria-label="Send"
            className="sas-transition sas-focusable shrink-0 rounded-full p-1.5 disabled:opacity-40"
            style={{
              backgroundColor: "var(--sas-accent)",
              color: "var(--sas-text-on-accent)",
            }}
          >
            <IconArrowUp size={14} stroke={2} />
          </button>
        </div>
      </div>
    </section>
  );
}
