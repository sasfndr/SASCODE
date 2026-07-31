// FILE: sascode/events/directorEventCursor.ts
// Purpose: Cursor bookkeeping for the single workspace-level Director event
//          subscription: idempotent application, out-of-order buffering, and
//          gap detection that a caller repairs with listEvents.
// Layer: Pure reducer. No React, no transport, no query client.
//
// The backend replays persisted events before switching to live delivery, so a
// reconnect re-sends everything after our cursor. Application therefore has to
// be idempotent by sequence rather than by side effect.

import type { DirectorEvent } from "@synara/contracts";

/**
 * Events arriving ahead of the cursor are held here rather than dropped. A
 * short burst can legitimately interleave across the transport; anything beyond
 * this many held events is treated as a real gap worth repairing.
 */
export const MAX_BUFFERED_AHEAD = 64;

export interface DirectorCursorState {
  /** Highest contiguously applied sequence. 0 means "nothing applied yet". */
  lastSequence: number;
  /** Ahead-of-cursor events, ascending by sequence, deduplicated. */
  buffered: ReadonlyArray<DirectorEvent>;
  /**
   * Set when a hole is known to exist. The caller repairs it with `listEvents`
   * from `afterSequence` and then feeds the results back through `ingest`.
   */
  gap: { afterSequence: number; throughSequence: number } | null;
}

export const initialDirectorCursorState: DirectorCursorState = {
  lastSequence: 0,
  buffered: [],
  gap: null,
};

export interface DirectorIngestResult {
  state: DirectorCursorState;
  /** Newly applied events in ascending sequence order. Never contains repeats. */
  applied: ReadonlyArray<DirectorEvent>;
  /** True when the event was already behind the cursor. */
  duplicate: boolean;
  /** True when this ingest opened a gap that was not open before. */
  gapOpened: boolean;
}

function insertAscending(
  buffered: ReadonlyArray<DirectorEvent>,
  event: DirectorEvent,
): ReadonlyArray<DirectorEvent> {
  if (buffered.some((candidate) => candidate.sequence === event.sequence)) return buffered;
  const next = [...buffered, event];
  next.sort((a, b) => a.sequence - b.sequence);
  return next;
}

/**
 * Drains any buffered events that have become contiguous with the cursor.
 * Returns the events to apply plus the advanced cursor.
 */
function drain(
  lastSequence: number,
  buffered: ReadonlyArray<DirectorEvent>,
): { lastSequence: number; buffered: ReadonlyArray<DirectorEvent>; drained: DirectorEvent[] } {
  const drained: DirectorEvent[] = [];
  let sequence = lastSequence;
  let index = 0;
  while (index < buffered.length) {
    const candidate = buffered[index]!;
    if (candidate.sequence <= sequence) {
      // Already covered by a repair fetch; discard rather than reapply.
      index += 1;
      continue;
    }
    if (candidate.sequence !== sequence + 1) break;
    drained.push(candidate);
    sequence = candidate.sequence;
    index += 1;
  }
  return { lastSequence: sequence, buffered: buffered.slice(index), drained };
}

/**
 * Folds one event into the cursor.
 *
 * - Behind the cursor  -> ignored as a duplicate.
 * - Exactly next       -> applied, then any buffered followers drain.
 * - Ahead of cursor    -> buffered, and a gap is recorded so the caller can
 *                         repair it. Repair results feed back through here.
 */
export function ingestDirectorEvent(
  state: DirectorCursorState,
  event: DirectorEvent,
): DirectorIngestResult {
  if (event.sequence <= state.lastSequence) {
    return { state, applied: [], duplicate: true, gapOpened: false };
  }

  if (event.sequence === state.lastSequence + 1) {
    const { lastSequence, buffered, drained } = drain(
      event.sequence,
      state.buffered,
    );
    const applied = [event, ...drained];
    const stillMissing = buffered.length > 0;
    return {
      state: {
        lastSequence,
        buffered,
        gap: stillMissing
          ? { afterSequence: lastSequence, throughSequence: buffered[0]!.sequence - 1 }
          : null,
      },
      applied,
      duplicate: false,
      gapOpened: false,
    };
  }

  const buffered = insertAscending(state.buffered, event);
  const overflowed = buffered.length > MAX_BUFFERED_AHEAD;
  const gap = {
    afterSequence: state.lastSequence,
    throughSequence: buffered[0]!.sequence - 1,
  };
  return {
    state: {
      lastSequence: state.lastSequence,
      // An overflowing buffer means the hole is wide; drop the held events and
      // let the repair fetch supply an authoritative contiguous run instead.
      buffered: overflowed ? [] : buffered,
      gap,
    },
    applied: [],
    duplicate: false,
    gapOpened: state.gap === null,
  };
}

/** Folds an ordered batch, typically the result of a `listEvents` repair. */
export function ingestDirectorEvents(
  state: DirectorCursorState,
  events: ReadonlyArray<DirectorEvent>,
): DirectorIngestResult {
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
  let current = state;
  const applied: DirectorEvent[] = [];
  let duplicate = ordered.length > 0;
  let gapOpened = false;

  for (const event of ordered) {
    const result = ingestDirectorEvent(current, event);
    current = result.state;
    applied.push(...result.applied);
    if (!result.duplicate) duplicate = false;
    if (result.gapOpened) gapOpened = true;
  }

  return { state: current, applied, duplicate, gapOpened };
}

/**
 * Resets the cursor to a known-good sequence, e.g. after a full snapshot
 * refetch made buffered deltas irrelevant.
 */
export function resetDirectorCursor(sequence: number): DirectorCursorState {
  return { lastSequence: Math.max(0, sequence), buffered: [], gap: null };
}

// ── Invalidation scoping ─────────────────────────────────────────────

export interface DirectorInvalidation {
  projectId: DirectorEvent["projectId"];
  /** The project snapshot always changes; workflow-level refetch is narrower. */
  workflowId: string | null;
  /** True for lifecycle events that change derived attention. */
  attention: boolean;
  /** True when a provider thread may have been attached or detached. */
  threads: boolean;
}

const ATTENTION_AFFECTING = new Set([
  "workflow.proposed",
  "workflow.status-changed",
  "work-unit.status-changed",
  "work-units.reconciled",
  "attempt.started",
  "attempt.status-changed",
  "attempt.result-attached",
  "attempt.dispatch-failed",
]);

const THREAD_AFFECTING = new Set([
  "attempt.thread-attached",
  "attempt.dispatch-completed",
  "attempt.started",
  "attempt.recovery-requested",
]);

const readWorkflowId = (event: DirectorEvent): string | null => {
  if (event.aggregateKind === "workflow") return event.aggregateId;
  const candidate = event.payload["workflowId"];
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
};

/**
 * Maps one event onto the narrowest set of caches that must be refreshed.
 * Keeping this pure means the invalidation policy is testable without a
 * query client or a live socket.
 */
export function directorInvalidationFor(event: DirectorEvent): DirectorInvalidation {
  return {
    projectId: event.projectId,
    workflowId: readWorkflowId(event),
    attention: ATTENTION_AFFECTING.has(event.type),
    threads: THREAD_AFFECTING.has(event.type),
  };
}

/** Collapses a batch into one invalidation plan so a burst causes one refetch. */
export function collapseInvalidations(
  events: ReadonlyArray<DirectorEvent>,
): {
  projectIds: ReadonlyArray<DirectorEvent["projectId"]>;
  workflowIds: ReadonlyArray<string>;
  attention: boolean;
  threads: boolean;
} {
  const projectIds = new Set<DirectorEvent["projectId"]>();
  const workflowIds = new Set<string>();
  let attention = false;
  let threads = false;

  for (const event of events) {
    const invalidation = directorInvalidationFor(event);
    projectIds.add(invalidation.projectId);
    if (invalidation.workflowId) workflowIds.add(invalidation.workflowId);
    attention ||= invalidation.attention;
    threads ||= invalidation.threads;
  }

  return {
    projectIds: [...projectIds],
    workflowIds: [...workflowIds],
    attention,
    threads,
  };
}
