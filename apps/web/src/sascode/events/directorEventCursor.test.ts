import type { DirectorEvent } from "@synara/contracts";
import { describe, expect, it } from "vitest";

import {
  collapseInvalidations,
  directorInvalidationFor,
  ingestDirectorEvent,
  ingestDirectorEvents,
  initialDirectorCursorState,
  MAX_BUFFERED_AHEAD,
  resetDirectorCursor,
} from "./directorEventCursor";

const event = (
  sequence: number,
  overrides: Record<string, unknown> = {},
): DirectorEvent =>
  ({
    sequence,
    id: `evt-${sequence}`,
    projectId: "project-a",
    aggregateKind: "workflow",
    aggregateId: "workflow-1",
    streamVersion: sequence,
    type: "workflow.status-changed",
    occurredAt: "2026-07-31T00:00:00.000Z",
    commandId: `cmd-${sequence}`,
    actorKind: "system",
    actorId: "director",
    payload: {},
    metadata: {},
    ...overrides,
  }) as unknown as DirectorEvent;

describe("ingestDirectorEvent", () => {
  it("applies the first contiguous event", () => {
    const result = ingestDirectorEvent(initialDirectorCursorState, event(1));
    expect(result.applied.map((e) => e.sequence)).toEqual([1]);
    expect(result.state.lastSequence).toBe(1);
    expect(result.state.gap).toBeNull();
    expect(result.duplicate).toBe(false);
  });

  it("ignores an event already behind the cursor", () => {
    const first = ingestDirectorEvent(initialDirectorCursorState, event(1));
    const replay = ingestDirectorEvent(first.state, event(1));
    expect(replay.duplicate).toBe(true);
    expect(replay.applied).toHaveLength(0);
    expect(replay.state).toBe(first.state);
  });

  it("is idempotent across a full replay after reconnect", () => {
    let state = initialDirectorCursorState;
    for (const sequence of [1, 2, 3]) {
      state = ingestDirectorEvent(state, event(sequence)).state;
    }
    let appliedAgain = 0;
    for (const sequence of [1, 2, 3]) {
      appliedAgain += ingestDirectorEvent(state, event(sequence)).applied.length;
    }
    expect(appliedAgain).toBe(0);
    expect(state.lastSequence).toBe(3);
  });

  it("buffers an out-of-order event and opens a gap", () => {
    const result = ingestDirectorEvent(initialDirectorCursorState, event(4));
    expect(result.applied).toHaveLength(0);
    expect(result.gapOpened).toBe(true);
    expect(result.state.gap).toEqual({ afterSequence: 0, throughSequence: 3 });
    expect(result.state.buffered.map((e) => e.sequence)).toEqual([4]);
  });

  it("drains buffered events once the hole is filled", () => {
    let state = ingestDirectorEvent(initialDirectorCursorState, event(3)).state;
    state = ingestDirectorEvent(state, event(2)).state;
    const filled = ingestDirectorEvent(state, event(1));
    expect(filled.applied.map((e) => e.sequence)).toEqual([1, 2, 3]);
    expect(filled.state.lastSequence).toBe(3);
    expect(filled.state.gap).toBeNull();
    expect(filled.state.buffered).toHaveLength(0);
  });

  it("keeps a partial gap open when only part of the hole is filled", () => {
    let state = ingestDirectorEvent(initialDirectorCursorState, event(5)).state;
    const filled = ingestDirectorEvent(state, event(1));
    expect(filled.applied.map((e) => e.sequence)).toEqual([1]);
    expect(filled.state.gap).toEqual({ afterSequence: 1, throughSequence: 4 });
  });

  it("keeps the ahead-buffer bounded while a wide hole stays open", () => {
    let state = initialDirectorCursorState;
    // Far more ahead-of-cursor events than the cap: memory must stay bounded
    // and the gap must remain recorded so a repair fetch still happens.
    for (let index = 0; index < MAX_BUFFERED_AHEAD * 3; index += 1) {
      state = ingestDirectorEvent(state, event(100 + index)).state;
      expect(state.buffered.length).toBeLessThanOrEqual(MAX_BUFFERED_AHEAD);
    }
    expect(state.gap).not.toBeNull();
    expect(state.lastSequence).toBe(0);
  });

  it("does not buffer the same sequence twice", () => {
    let state = ingestDirectorEvent(initialDirectorCursorState, event(7)).state;
    state = ingestDirectorEvent(state, event(7)).state;
    expect(state.buffered).toHaveLength(1);
  });
});

describe("ingestDirectorEvents", () => {
  it("repairs a gap from an unordered batch", () => {
    const opened = ingestDirectorEvent(initialDirectorCursorState, event(4));
    const repaired = ingestDirectorEvents(opened.state, [event(2), event(1), event(3)]);
    expect(repaired.applied.map((e) => e.sequence)).toEqual([1, 2, 3, 4]);
    expect(repaired.state.lastSequence).toBe(4);
    expect(repaired.state.gap).toBeNull();
  });

  it("treats an all-duplicate batch as duplicate", () => {
    const state = ingestDirectorEvents(initialDirectorCursorState, [event(1), event(2)]).state;
    const again = ingestDirectorEvents(state, [event(1), event(2)]);
    expect(again.duplicate).toBe(true);
    expect(again.applied).toHaveLength(0);
  });
});

describe("resetDirectorCursor", () => {
  it("clears buffered work and never goes negative", () => {
    expect(resetDirectorCursor(12)).toEqual({ lastSequence: 12, buffered: [], gap: null });
    expect(resetDirectorCursor(-4).lastSequence).toBe(0);
  });
});

describe("invalidation scoping", () => {
  it("reads the workflow id from the aggregate for workflow events", () => {
    expect(directorInvalidationFor(event(1)).workflowId).toBe("workflow-1");
  });

  it("reads the workflow id from the payload for attempt events", () => {
    const attempt = event(2, {
      aggregateKind: "attempt",
      aggregateId: "attempt-9",
      type: "attempt.thread-attached",
      payload: { workflowId: "workflow-7" },
    });
    const invalidation = directorInvalidationFor(attempt);
    expect(invalidation.workflowId).toBe("workflow-7");
    expect(invalidation.threads).toBe(true);
  });

  it("marks lifecycle events as attention-affecting", () => {
    expect(directorInvalidationFor(event(1)).attention).toBe(true);
    const dispatch = event(2, { type: "attempt.dispatch-requested" });
    expect(directorInvalidationFor(dispatch).attention).toBe(false);
  });

  it("collapses a burst into one plan", () => {
    const plan = collapseInvalidations([
      event(1),
      event(2, { projectId: "project-b" }),
      event(3, {
        aggregateKind: "attempt",
        aggregateId: "attempt-1",
        type: "attempt.thread-attached",
        payload: { workflowId: "workflow-2" },
      }),
    ]);
    expect(plan.projectIds).toHaveLength(2);
    expect([...plan.workflowIds].sort()).toEqual(["workflow-1", "workflow-2"]);
    expect(plan.attention).toBe(true);
    expect(plan.threads).toBe(true);
  });
});
