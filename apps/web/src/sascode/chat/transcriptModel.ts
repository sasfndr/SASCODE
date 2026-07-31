// FILE: sascode/chat/transcriptModel.ts
// Purpose: Derive the Agent Chat transcript — one project conversation in which
//          every delegated session speaks under its own model name.
// Layer: Pure derivation. Given threads, cards and a clock it is total.
//
// SASCODE's conversation is not per-session. The user says one thing and any
// number of models answer, so the transcript is a merge of every active
// session's messages attributed to the model that produced them. That is also
// why the workbench must not carry a second composer: there is one conversation
// in this product, and it lives here.
//
// Tool activity and file changes are folded into the agent turn that produced
// them rather than being emitted as separate rows. A transcript that gives a
// tool call the same visual weight as a sentence stops being readable at the
// exact moment the work gets interesting.

import type { ThreadId } from "@synara/contracts";

import type { ChatMessage, Thread } from "~/types";
import type { SessionCard } from "../sessions/sessionCards";

export type TranscriptAuthorKind = "user" | "agent";

export interface TranscriptChip {
  kind: "file" | "code" | "image" | "tool";
  label: string;
  /** Short qualifier: a file extension, a change count, a tool status. */
  detail?: string;
  /** Present for image attachments, which render as a real thumbnail. */
  thumbnailUrl?: string;
}

export interface TranscriptEntry {
  id: string;
  threadId: ThreadId | null;
  authorKind: TranscriptAuthorKind;
  /** "You", or the model actually running the session. */
  authorLabel: string;
  provider: string | null;
  text: string;
  chips: ReadonlyArray<TranscriptChip>;
  /** 0..1 while the session's workflow has countable progress. */
  progress: number | null;
  /** One short state word, only when it adds something the text does not. */
  status: string | null;
  streaming: boolean;
  createdAt: string;
}

/** Cap per session before merging, so one chatty agent cannot crowd out the rest. */
const PER_THREAD_LIMIT = 12;
const CHIPS_PER_ENTRY = 3;

function extensionLabel(path: string): string | null {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return null;
  return base.slice(dot + 1).toUpperCase();
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1) || path;
}

function attachmentChips(message: ChatMessage): TranscriptChip[] {
  const chips: TranscriptChip[] = [];
  for (const attachment of message.attachments ?? []) {
    if (attachment.type === "image") {
      chips.push({
        kind: "image",
        label: attachment.name,
        ...(attachment.previewUrl ? { thumbnailUrl: attachment.previewUrl } : {}),
      });
    } else if (attachment.type === "file") {
      const extension = extensionLabel(attachment.name);
      chips.push({
        kind: "file",
        label: attachment.name,
        ...(extension ? { detail: extension } : {}),
      });
    }
  }
  return chips;
}

/**
 * Chips for an assistant turn: the files it actually changed first, because a
 * changed file is the most concrete thing an agent can hand back, then whatever
 * tool it is currently inside if there is still room.
 */
function agentTurnChips(thread: Thread, turnId: string | null): TranscriptChip[] {
  const chips: TranscriptChip[] = [];

  if (turnId) {
    const diff = thread.turnDiffSummaries.find((summary) => summary.turnId === turnId);
    for (const file of diff?.files ?? []) {
      if (chips.length >= CHIPS_PER_ENTRY) break;
      const extension = extensionLabel(file.path);
      chips.push({
        kind: "code",
        label: basename(file.path),
        ...(extension ? { detail: extension } : {}),
      });
    }
  }

  if (chips.length < CHIPS_PER_ENTRY) {
    // Newest tool activity for this turn, which is the one still in flight.
    for (let index = thread.activities.length - 1; index >= 0; index -= 1) {
      const activity = thread.activities[index];
      if (!activity || activity.tone !== "tool") continue;
      if (turnId && activity.turnId !== turnId) continue;
      chips.push({ kind: "tool", label: activity.summary });
      break;
    }
  }

  return chips;
}

/**
 * The one-word state worth showing next to a model name. Deliberately narrow:
 * anything the transcript text already says is not repeated as a chip.
 */
function cardStatus(card: SessionCard | undefined): string | null {
  switch (card?.state) {
    case "waiting-dependency":
      return "Queued";
    case "needs-approval":
      return "Approval needed";
    case "needs-input":
      return "Needs input";
    case "ready-review":
      return "Ready for review";
    case "failed":
      return "Failed";
    case "paused":
      return "Paused";
    default:
      return null;
  }
}

function isRenderableMessage(message: ChatMessage): boolean {
  if (message.role === "system") return false;
  if (message.text.trim().length > 0) return true;
  // An empty assistant message that is still streaming is the "thinking" state
  // and must render, or the transcript looks frozen mid-turn.
  return message.role === "assistant" && message.streaming;
}

export interface DeriveTranscriptInput {
  /** Threads whose detail is currently hydrated, keyed by id. */
  threadsById: ReadonlyMap<ThreadId, Thread>;
  /** Live cards, which supply model attribution, progress and state. */
  cards: ReadonlyArray<SessionCard>;
  /** Newest entries to keep after merging every session. */
  limit: number;
}

export function deriveTranscript(input: DeriveTranscriptInput): TranscriptEntry[] {
  const cardByThreadId = new Map(input.cards.map((card) => [card.threadId, card]));
  const entries: TranscriptEntry[] = [];

  for (const [threadId, thread] of input.threadsById) {
    const card = cardByThreadId.get(threadId);
    const modelLabel = card?.modelLabel ?? thread.modelSelection.model ?? "Agent";
    const provider = card?.provider ?? thread.modelSelection.provider ?? null;
    const status = cardStatus(card);

    const renderable = thread.messages.filter(isRenderableMessage);
    const recent = renderable.slice(Math.max(0, renderable.length - PER_THREAD_LIMIT));

    for (const message of recent) {
      const isUser = message.role === "user";
      const chips = isUser
        ? attachmentChips(message)
        : agentTurnChips(thread, message.turnId ?? null);

      // Progress and state describe the session *now*, so they belong only on
      // its newest agent turn. Stamping them on older rows would claim the
      // session was at 62% an hour ago.
      const isNewestAgentTurn = !isUser && message === recent[recent.length - 1];

      entries.push({
        id: message.id,
        threadId,
        authorKind: isUser ? "user" : "agent",
        authorLabel: isUser ? "You" : modelLabel,
        provider: isUser ? null : provider,
        text: message.text,
        chips: chips.slice(0, CHIPS_PER_ENTRY),
        progress: isNewestAgentTurn ? (card?.progress ?? null) : null,
        status: isNewestAgentTurn ? status : null,
        streaming: message.streaming,
        createdAt: message.createdAt,
      });
    }

    // A session that has been delegated but has not spoken yet still belongs in
    // the conversation — the reference shows exactly this as a queued row.
    if (recent.length === 0 && card) {
      entries.push({
        id: `${threadId}:pending`,
        threadId,
        authorKind: "agent",
        authorLabel: modelLabel,
        provider,
        text: card.activity,
        chips: [],
        progress: card.progress,
        status: status ?? null,
        streaming: false,
        createdAt: card.updatedAt,
      });
    }
  }

  entries.sort((left, right) => {
    const byTime = Date.parse(left.createdAt) - Date.parse(right.createdAt);
    // Ids break ties so the merge is stable across renders when two sessions
    // record the same millisecond.
    return byTime !== 0 ? byTime : left.id.localeCompare(right.id);
  });

  return entries.slice(Math.max(0, entries.length - input.limit));
}
