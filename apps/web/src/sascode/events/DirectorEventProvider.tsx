// FILE: sascode/events/DirectorEventProvider.tsx
// Purpose: The one workspace-level Director subscription. Replays, then goes
//          live, applies idempotently, repairs gaps, and invalidates narrowly.
// Layer: Data adapter. Mounted once, high in the SASCODE shell.
//
// There is exactly one subscription for the whole workspace (`projectId: null`)
// so cross-project attention keeps updating while a single project space is on
// screen. Components read state through TanStack Query, never from here.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { DirectorEvent } from "@synara/contracts";
import { useQueryClient } from "@tanstack/react-query";

import { ensureNativeApi } from "~/nativeApi";
import {
  collapseInvalidations,
  ingestDirectorEvent,
  ingestDirectorEvents,
  initialDirectorCursorState,
  type DirectorCursorState,
} from "./directorEventCursor";
import {
  invalidateSascodeProject,
  invalidateSascodeWorkflow,
  invalidateSascodeWorkspaceAttention,
} from "../queries/sascodeQueries";
import {
  applyAttemptEvents,
  emptyAttemptProjection,
  type AttemptProjection,
} from "./attemptProjection";

/** Bursts of lifecycle events are common; one flush per window keeps refetches sane. */
const FLUSH_WINDOW_MS = 120;
const GAP_REPAIR_LIMIT = 500;

export interface DirectorEventStatus {
  /** Highest contiguously applied sequence. */
  lastSequence: number;
  /** True once the first replay batch has been folded in. */
  live: boolean;
  /** Set while a detected gap is being repaired. */
  repairing: boolean;
  /** Last transport-level failure, surfaced by the shell's connection chip. */
  error: string | null;
}

const DirectorEventContext = createContext<DirectorEventStatus>({
  lastSequence: 0,
  live: false,
  repairing: false,
  error: null,
});

/**
 * The attempt -> thread join, rebuilt from the replayed event stream. Kept in a
 * separate context from status so a status tick cannot rerender every session
 * card, and vice versa.
 */
const AttemptProjectionContext = createContext<AttemptProjection>(emptyAttemptProjection);

export function useDirectorEventStatus(): DirectorEventStatus {
  return useContext(DirectorEventContext);
}

export function useAttemptProjection(): AttemptProjection {
  return useContext(AttemptProjectionContext);
}

export function DirectorEventProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<DirectorEventStatus>({
    lastSequence: 0,
    live: false,
    repairing: false,
    error: null,
  });

  const [attempts, setAttempts] = useState<AttemptProjection>(emptyAttemptProjection);
  const cursorRef = useRef<DirectorCursorState>(initialDirectorCursorState);
  const pendingRef = useRef<DirectorEvent[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repairingRef = useRef(false);

  const flush = useCallback(() => {
    flushTimerRef.current = null;
    const batch = pendingRef.current;
    if (batch.length === 0) return;
    pendingRef.current = [];

    setAttempts((current) => applyAttemptEvents(current, batch));

    const plan = collapseInvalidations(batch);
    for (const projectId of plan.projectIds) {
      void invalidateSascodeProject(queryClient, projectId);
    }
    for (const workflowId of plan.workflowIds) {
      void invalidateSascodeWorkflow(queryClient, workflowId as never);
    }
    if (plan.attention) {
      void invalidateSascodeWorkspaceAttention(queryClient);
    }
  }, [queryClient]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current !== null) return;
    flushTimerRef.current = setTimeout(flush, FLUSH_WINDOW_MS);
  }, [flush]);

  const repairGap = useCallback(
    async (afterSequence: number) => {
      if (repairingRef.current) return;
      repairingRef.current = true;
      setStatus((current) => ({ ...current, repairing: true }));
      try {
        const events = await ensureNativeApi().sascode.listEvents({
          afterSequence,
          limit: GAP_REPAIR_LIMIT,
          projectId: null,
        });
        const result = ingestDirectorEvents(cursorRef.current, events);
        cursorRef.current = result.state;
        if (result.applied.length > 0) {
          pendingRef.current.push(...result.applied);
          scheduleFlush();
        }
        setStatus((current) => ({
          ...current,
          lastSequence: result.state.lastSequence,
          repairing: false,
          error: null,
        }));
        // A repair can reveal that the hole was wider than one fetch.
        if (result.state.gap && result.state.gap.afterSequence > afterSequence) {
          repairingRef.current = false;
          void repairGap(result.state.gap.afterSequence);
          return;
        }
      } catch (error) {
        setStatus((current) => ({
          ...current,
          repairing: false,
          error: error instanceof Error ? error.message : "Event repair failed",
        }));
      } finally {
        repairingRef.current = false;
      }
    },
    [scheduleFlush],
  );

  useEffect(() => {
    let disposed = false;

    const handle = (event: DirectorEvent) => {
      if (disposed) return;
      const result = ingestDirectorEvent(cursorRef.current, event);
      cursorRef.current = result.state;

      if (result.applied.length > 0) {
        pendingRef.current.push(...result.applied);
        scheduleFlush();
      }

      setStatus((current) =>
        current.lastSequence === result.state.lastSequence && current.live
          ? current
          : { ...current, lastSequence: result.state.lastSequence, live: true, error: null },
      );

      if (result.state.gap) {
        void repairGap(result.state.gap.afterSequence);
      }
    };

    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = ensureNativeApi().sascode.subscribeEvents(
        { afterSequence: cursorRef.current.lastSequence, projectId: null },
        handle,
      );
      // Replay may legitimately be empty on a fresh workspace; treat a
      // successful subscribe as live so the shell stops showing "connecting".
      setStatus((current) => ({ ...current, live: true, error: null }));
    } catch (error) {
      setStatus((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Director stream unavailable",
      }));
    }

    return () => {
      disposed = true;
      unsubscribe?.();
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, [repairGap, scheduleFlush]);

  const value = useMemo(() => status, [status]);

  return (
    <DirectorEventContext.Provider value={value}>
      <AttemptProjectionContext.Provider value={attempts}>
        {children}
      </AttemptProjectionContext.Provider>
    </DirectorEventContext.Provider>
  );
}
