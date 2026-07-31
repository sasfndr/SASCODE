// FILE: sascode/chat/useProjectConversation.ts
// Purpose: Hydrate the sessions Agent Chat speaks for and project them into one
//          merged transcript.
// Layer: Data adapter.
//
// Thread detail is subscription-backed and evictable, so a surface that wants
// messages must say so by retaining them. Retention is a client cache; the
// lease resolver still caps real subscriptions, which is why retaining the few
// sessions in the conversation is safe rather than a way to widen admission.

import { useEffect, useMemo } from "react";
import type { ThreadId } from "@synara/contracts";

import { useStore, type AppState } from "~/store";
import { getThreadFromState } from "~/threadDerivation";
import { retainThreadDetailSubscription } from "~/threadDetailSubscriptionRetention";
import type { Thread } from "~/types";
import type { SessionCard } from "../sessions/sessionCards";
import { deriveTranscript, type TranscriptEntry } from "./transcriptModel";

/** Sessions the conversation speaks for at once. Beyond this it stops being one conversation. */
const MAX_CONVERSATION_THREADS = 4;
const DEFAULT_TRANSCRIPT_LIMIT = 24;

const EMPTY_THREADS: ReadonlyMap<ThreadId, Thread> = new Map();

/**
 * Rebuilds the thread map only when a slice it reads actually changed, so a
 * store write elsewhere (projects, terminals, provider status) cannot re-render
 * the transcript.
 */
function createConversationThreadsSelector(
  threadIds: ReadonlyArray<ThreadId>,
): (state: AppState) => ReadonlyMap<ThreadId, Thread> {
  let previousThreadShellById = {} as AppState["threadShellById"];
  let previousThreadSessionById = {} as AppState["threadSessionById"];
  let previousThreadTurnStateById = {} as AppState["threadTurnStateById"];
  let previousMessageIdsByThreadId = {} as AppState["messageIdsByThreadId"];
  let previousMessageByThreadId = {} as AppState["messageByThreadId"];
  let previousActivityIdsByThreadId = {} as AppState["activityIdsByThreadId"];
  let previousActivityByThreadId = {} as AppState["activityByThreadId"];
  let previousTurnDiffIdsByThreadId = {} as AppState["turnDiffIdsByThreadId"];
  let previousTurnDiffSummaryByThreadId = {} as AppState["turnDiffSummaryByThreadId"];
  let previousThreads: ReadonlyMap<ThreadId, Thread> = EMPTY_THREADS;
  let hasResult = false;

  return (state) => {
    if (
      hasResult &&
      previousThreadShellById === state.threadShellById &&
      previousThreadSessionById === state.threadSessionById &&
      previousThreadTurnStateById === state.threadTurnStateById &&
      previousMessageIdsByThreadId === state.messageIdsByThreadId &&
      previousMessageByThreadId === state.messageByThreadId &&
      previousActivityIdsByThreadId === state.activityIdsByThreadId &&
      previousActivityByThreadId === state.activityByThreadId &&
      previousTurnDiffIdsByThreadId === state.turnDiffIdsByThreadId &&
      previousTurnDiffSummaryByThreadId === state.turnDiffSummaryByThreadId
    ) {
      return previousThreads;
    }

    previousThreadShellById = state.threadShellById;
    previousThreadSessionById = state.threadSessionById;
    previousThreadTurnStateById = state.threadTurnStateById;
    previousMessageIdsByThreadId = state.messageIdsByThreadId;
    previousMessageByThreadId = state.messageByThreadId;
    previousActivityIdsByThreadId = state.activityIdsByThreadId;
    previousActivityByThreadId = state.activityByThreadId;
    previousTurnDiffIdsByThreadId = state.turnDiffIdsByThreadId;
    previousTurnDiffSummaryByThreadId = state.turnDiffSummaryByThreadId;

    const next = new Map<ThreadId, Thread>();
    for (const threadId of threadIds) {
      const thread = getThreadFromState(state, threadId);
      if (thread) next.set(threadId, thread);
    }
    previousThreads = next;
    hasResult = true;
    return next;
  };
}

export interface ProjectConversationInput {
  cards: ReadonlyArray<SessionCard>;
  /** Kept first in the conversation and never dropped by the retention cap. */
  focusedThreadId: ThreadId | null;
  limit?: number;
  /** Pre-derived entries for the development visual fixture. */
  fixtureEntries?: ReadonlyArray<TranscriptEntry> | undefined;
}

export interface ProjectConversation {
  entries: ReadonlyArray<TranscriptEntry>;
  /** True while sessions exist but no detail has arrived, so the sheet can wait quietly. */
  hydrating: boolean;
}

export function useProjectConversation(input: ProjectConversationInput): ProjectConversation {
  const threadIds = useMemo(() => {
    const ordered: ThreadId[] = [];
    if (input.focusedThreadId) ordered.push(input.focusedThreadId);
    for (const card of input.cards) {
      if (ordered.length >= MAX_CONVERSATION_THREADS) break;
      if (!ordered.includes(card.threadId)) ordered.push(card.threadId);
    }
    return ordered;
  }, [input.cards, input.focusedThreadId]);

  // Joined into a primitive so the retention effect and the selector both key on
  // membership rather than on a fresh array identity every render.
  const threadKey = threadIds.join("|");

  useEffect(() => {
    if (threadKey.length === 0) return;
    const releases = threadKey
      .split("|")
      .map((threadId) => retainThreadDetailSubscription(threadId as ThreadId));
    return () => {
      for (const release of releases) release();
    };
  }, [threadKey]);

  const selector = useMemo(
    () => createConversationThreadsSelector(threadKey.length === 0 ? [] : threadIds),
    // `threadIds` is derived from `threadKey`; keying on the string keeps the
    // selector (and its memo cache) alive across renders with the same members.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [threadKey],
  );
  const threadsById = useStore(selector);

  const derived = useMemo(
    () =>
      deriveTranscript({
        threadsById,
        cards: input.cards,
        limit: input.limit ?? DEFAULT_TRANSCRIPT_LIMIT,
      }),
    [input.cards, input.limit, threadsById],
  );

  if (input.fixtureEntries) {
    return { entries: input.fixtureEntries, hydrating: false };
  }

  return {
    entries: derived,
    hydrating: derived.length === 0 && threadIds.length > 0 && threadsById.size === 0,
  };
}
