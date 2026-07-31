// FILE: sascode/chat/AgentChatSheet.tsx
// Purpose: The draggable, dockable Agent Chat sheet — the one conversation in
//          the workspace.
// Layer: Presentation + command dispatch.
//
// This sheet owns the whole conversation hierarchy: transcript, tool activity,
// file references, per-session progress, and the only composer. Sessions do not
// carry their own chat; the centre is work output. That is the structural point
// of SASCODE — one place to speak, many places where work becomes visible — and
// it is also the reason a session can be addressed without being focused.

import { useCallback, useMemo, useState } from "react";
import type { ThreadId } from "@synara/contracts";
import { IconArrowsDiagonal, IconMinus } from "@tabler/icons-react";

import type { SidebarThreadSummary } from "~/types";
import type { ChatDock } from "../state/workspaceUiStore";
import { sendSessionTurnToMany } from "../sessions/sessionCommands";
import type { SessionCard } from "../sessions/sessionCards";
import { AgentComposer } from "./AgentComposer";
import { AgentTranscript } from "./AgentTranscript";
import type { TranscriptEntry } from "./transcriptModel";
import { useProjectConversation } from "./useProjectConversation";

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
  cards: ReadonlyArray<SessionCard>;
  threadsById: ReadonlyMap<ThreadId, SidebarThreadSummary>;
  /** The session in the centre; its turns anchor the conversation. */
  focusedThreadId: ThreadId | null;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Starts a new delegated feature when there is nothing to continue. */
  onStartFeature: (request: string) => void;
  onDragStart?: (event: React.PointerEvent) => void;
  /** Development visual fixture only; never set in production. */
  fixtureEntries?: ReadonlyArray<TranscriptEntry> | undefined;
}

/** Only the two docked positions are offered inline; floating is a drag. */
const DOCKS = [
  { id: "top", label: "Top" },
  { id: "left", label: "Left" },
] as const satisfies ReadonlyArray<{ id: ChatDock; label: string }>;

export function AgentChatSheet(props: AgentChatSheetProps) {
  const [error, setError] = useState<string | null>(null);

  const target = useMemo(
    () => props.targets.find((entry) => entry.id === props.selectedTargetId) ?? props.targets[0],
    [props.selectedTargetId, props.targets],
  );

  const conversation = useProjectConversation({
    cards: props.cards,
    focusedThreadId: props.focusedThreadId,
    fixtureEntries: props.fixtureEntries,
  });

  const submit = useCallback(
    async (text: string) => {
      setError(null);
      if (!target || target.threadIds.length === 0) {
        // Nothing to continue — the message becomes the feature request and the
        // Director decides which models it is delegated to.
        props.onStartFeature(text);
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
        const message =
          result.sent > 0
            ? `Sent to ${result.sent}, but ${result.failed.length} could not be reached.`
            : (result.failed[0]?.error ?? "Could not send");
        // A total failure must keep the user's text in the box, so it throws;
        // a partial send already left the workspace, so it only reports.
        if (result.sent === 0) throw new Error(message);
        setError(message);
      }
    },
    [props, target],
  );

  return (
    <section
      aria-label="Agent chat"
      data-sas-gesture-opaque="true"
      className="sas-glass sas-rim sas-transition pointer-events-auto flex h-full min-h-0 flex-col overflow-hidden"
    >
      {/* The grab handle is the sheet's own affordance, centred at the top edge
          the way a physical panel would be lifted. It is the only chrome that
          appears before hover, because a floating surface that gives no hint it
          can be moved may as well be docked. */}
      <button
        type="button"
        aria-label="Move agent chat"
        onPointerDown={props.onDragStart}
        disabled={!props.onDragStart}
        className="sas-focusable mx-auto mt-2 h-[4px] w-[34px] shrink-0 rounded-full disabled:cursor-default"
        style={{ backgroundColor: "var(--sas-line-strong)", cursor: props.onDragStart ? "grab" : undefined }}
      />

      <header className="flex shrink-0 items-center gap-2 px-3.5 pt-2 pb-2.5">
        <h2 className="text-[13px] font-medium" style={{ color: "var(--sas-text)" }}>
          Agent chat
        </h2>

        <div
          className="ms-auto flex items-center rounded-full p-[3px]"
          role="radiogroup"
          aria-label="Chat position"
          style={{ backgroundColor: "var(--sas-surface-sunken)" }}
        >
          {DOCKS.map((dock) => (
            <button
              key={dock.id}
              type="button"
              role="radio"
              aria-checked={props.dock === dock.id}
              onClick={() => props.onDockChange(dock.id)}
              className="sas-transition sas-focusable rounded-full px-4 py-[5px] text-[11.5px]"
              style={{
                backgroundColor:
                  props.dock === dock.id ? "var(--sas-surface-raised)" : "transparent",
                color: props.dock === dock.id ? "var(--sas-text)" : "var(--sas-text-secondary)",
              }}
            >
              {dock.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-label={props.expanded ? "Collapse agent chat" : "Expand agent chat"}
          onClick={() => props.onExpandedChange(!props.expanded)}
          className="sas-transition sas-focusable flex size-[30px] shrink-0 items-center justify-center rounded-[var(--sas-radius-xs)]"
          style={{
            backgroundColor: "var(--sas-surface-sunken)",
            color: "var(--sas-text-secondary)",
          }}
        >
          {props.expanded ? (
            <IconMinus size={15} stroke={1.7} />
          ) : (
            <IconArrowsDiagonal size={15} stroke={1.7} />
          )}
        </button>
      </header>

      {props.targets.length > 1 ? (
        <div className="flex shrink-0 items-center gap-2 px-3 pb-2">
          <span className="shrink-0 text-[10.5px]" style={{ color: "var(--sas-text-muted)" }}>
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
                  color:
                    target?.id === entry.id ? "var(--sas-accent-ink)" : "var(--sas-text-muted)",
                }}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <AgentTranscript
        entries={conversation.entries}
        hydrating={conversation.hydrating}
        emptyHint="Say what you want built and SASCODE will plan it across models."
      />

      {error ? (
        <p
          className="shrink-0 px-4 pb-1 text-[11px]"
          role="status"
          style={{ color: "var(--sas-attention-ink)" }}
        >
          {error}
        </p>
      ) : null}

      <AgentComposer
        targetLabel={target?.label ?? "the agents"}
        hasTarget={(target?.threadIds.length ?? 0) > 0}
        onSubmit={submit}
      />
    </section>
  );
}
