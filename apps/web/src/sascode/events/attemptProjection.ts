// FILE: sascode/events/attemptProjection.ts
// Purpose: Rebuilds the attempt -> provider-thread join from the Director event
//          stream, which is the only place that relationship is published.
// Layer: Pure reducer.
//
// `getProjectSnapshot` returns workflows and work units but not attempts, so the
// attempt lifecycle is read from events. Because the subscription replays from
// sequence 0 before going live, a cold start reconstructs the full projection —
// this is what the replay is for.

import type { DirectorEvent, ThreadId, WorkUnitAttempt } from "@synara/contracts";

export interface AttemptRecord {
  attemptId: string;
  workflowId: string;
  workUnitId: string;
  attemptNumber: number;
  status: WorkUnitAttempt["status"];
  threadId: ThreadId | null;
  worktreePath: string | null;
  baselineGitRef: string | null;
  error: string | null;
  routingDecisionId: string | null;
  updatedAt: string;
}

export interface AttemptProjection {
  byAttemptId: ReadonlyMap<string, AttemptRecord>;
  /** Attempts grouped by work unit, newest attempt number last. */
  byWorkUnitId: ReadonlyMap<string, ReadonlyArray<AttemptRecord>>;
  byThreadId: ReadonlyMap<ThreadId, AttemptRecord>;
}

export const emptyAttemptProjection: AttemptProjection = {
  byAttemptId: new Map(),
  byWorkUnitId: new Map(),
  byThreadId: new Map(),
};

const readString = (payload: DirectorEvent["payload"], key: string): string | null => {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
};

const readNumber = (payload: DirectorEvent["payload"], key: string): number | null => {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const ATTEMPT_EVENTS = new Set([
  "attempt.started",
  "attempt.status-changed",
  "attempt.thread-attached",
  "attempt.result-attached",
  "attempt.dispatch-failed",
]);

function rebuildIndexes(byAttemptId: Map<string, AttemptRecord>): AttemptProjection {
  const byWorkUnitId = new Map<string, AttemptRecord[]>();
  const byThreadId = new Map<ThreadId, AttemptRecord>();

  for (const record of byAttemptId.values()) {
    const group = byWorkUnitId.get(record.workUnitId);
    if (group) group.push(record);
    else byWorkUnitId.set(record.workUnitId, [record]);

    if (record.threadId) {
      const existing = byThreadId.get(record.threadId);
      // A retry can reuse a thread; the newest attempt owns the join.
      if (!existing || existing.attemptNumber <= record.attemptNumber) {
        byThreadId.set(record.threadId, record);
      }
    }
  }

  for (const group of byWorkUnitId.values()) {
    group.sort((a, b) => a.attemptNumber - b.attemptNumber);
  }

  return { byAttemptId, byWorkUnitId, byThreadId };
}

/**
 * Folds one event into the projection.
 *
 * Returns the same projection reference when the event changes nothing, so the
 * provider can skip a re-render for the many events that do not touch attempts.
 */
export function applyAttemptEvent(
  projection: AttemptProjection,
  event: DirectorEvent,
): AttemptProjection {
  if (!ATTEMPT_EVENTS.has(event.type)) return projection;

  const attemptId = readString(event.payload, "attemptId") ?? event.aggregateId;
  const workUnitId = readString(event.payload, "workUnitId");
  const workflowId = readString(event.payload, "workflowId");
  if (!attemptId || !workUnitId || !workflowId) return projection;

  const previous = projection.byAttemptId.get(attemptId);
  const next: AttemptRecord = {
    attemptId,
    workflowId,
    workUnitId,
    attemptNumber:
      readNumber(event.payload, "attemptNumber") ?? previous?.attemptNumber ?? 1,
    status:
      (readString(event.payload, "nextStatus") as WorkUnitAttempt["status"] | null) ??
      previous?.status ??
      (event.type === "attempt.started" ? "preparing" : "running"),
    threadId:
      (readString(event.payload, "threadId") as ThreadId | null) ?? previous?.threadId ?? null,
    worktreePath: readString(event.payload, "worktreePath") ?? previous?.worktreePath ?? null,
    baselineGitRef:
      readString(event.payload, "baselineGitRef") ?? previous?.baselineGitRef ?? null,
    error:
      event.type === "attempt.dispatch-failed"
        ? (readString(event.payload, "error") ?? "Dispatch failed")
        : (readString(event.payload, "error") ?? previous?.error ?? null),
    routingDecisionId:
      readString(event.payload, "routingDecisionId") ?? previous?.routingDecisionId ?? null,
    updatedAt: event.occurredAt,
  };

  if (
    previous &&
    previous.status === next.status &&
    previous.threadId === next.threadId &&
    previous.error === next.error &&
    previous.attemptNumber === next.attemptNumber &&
    previous.worktreePath === next.worktreePath
  ) {
    return projection;
  }

  const byAttemptId = new Map(projection.byAttemptId);
  byAttemptId.set(attemptId, next);
  return rebuildIndexes(byAttemptId);
}

export function applyAttemptEvents(
  projection: AttemptProjection,
  events: ReadonlyArray<DirectorEvent>,
): AttemptProjection {
  let current = projection;
  for (const event of events) current = applyAttemptEvent(current, event);
  return current;
}

/** Shapes the projection for `buildSessionCards`, which wants contract types. */
export function attemptsByWorkUnitForCards(
  projection: AttemptProjection,
): ReadonlyMap<string, ReadonlyArray<WorkUnitAttempt>> {
  const result = new Map<string, WorkUnitAttempt[]>();
  for (const [workUnitId, records] of projection.byWorkUnitId) {
    result.set(
      workUnitId,
      records.map(
        (record) =>
          ({
            id: record.attemptId,
            workflowId: record.workflowId,
            workUnitId: record.workUnitId,
            attemptNumber: record.attemptNumber,
            status: record.status,
            routingDecisionId: record.routingDecisionId ?? "",
            taskContractId: "",
            threadId: record.threadId,
            worktreePath: record.worktreePath,
            baselineGitRef: record.baselineGitRef,
            error: record.error,
            createdAt: record.updatedAt,
            updatedAt: record.updatedAt,
          }) as unknown as WorkUnitAttempt,
      ),
    );
  }
  return result;
}
