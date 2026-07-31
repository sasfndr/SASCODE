import { describe, expect, it } from "vitest";

import {
  DEFAULT_SPATIAL_GESTURE_CONFIG,
  feedSpatialGesture,
  initialSpatialGestureState,
  type SpatialGestureSample,
  type SpatialGestureState,
} from "./spatialGesture";

const sample = (overrides: Partial<SpatialGestureSample> = {}): SpatialGestureSample => ({
  deltaX: 0,
  deltaY: 0,
  timestamp: 0,
  consumedByContent: false,
  interactionBusy: false,
  overviewOpen: false,
  modifierHeld: false,
  ...overrides,
});

/** Feeds a run of identical deltas 16ms apart, as a trackpad would. */
function swipe(
  deltas: ReadonlyArray<Partial<SpatialGestureSample>>,
  start: SpatialGestureState = initialSpatialGestureState,
  startTime = 1_000,
) {
  let state = start;
  const commits = [] as Array<ReturnType<typeof feedSpatialGesture>["commit"]>;
  let lastPreventDefault = false;
  deltas.forEach((delta, index) => {
    const result = feedSpatialGesture(
      state,
      sample({ ...delta, timestamp: startTime + index * 16 }),
      DEFAULT_SPATIAL_GESTURE_CONFIG,
    );
    state = result.state;
    lastPreventDefault = result.preventDefault;
    if (result.commit) commits.push(result.commit);
  });
  return { state, commits, lastPreventDefault };
}

describe("feedSpatialGesture", () => {
  it("commits a project change after a deliberate horizontal run", () => {
    const { commits } = swipe(Array.from({ length: 8 }, () => ({ deltaX: 24 })));
    expect(commits).toEqual([{ kind: "project", direction: 1 }]);
  });

  it("commits the opposite direction for a leftward swipe", () => {
    const { commits } = swipe(Array.from({ length: 8 }, () => ({ deltaX: -24 })));
    expect(commits).toEqual([{ kind: "project", direction: -1 }]);
  });

  it("does not commit below the distance threshold", () => {
    const { commits } = swipe([{ deltaX: 20 }, { deltaX: 20 }, { deltaX: 15 }]);
    expect(commits).toHaveLength(0);
  });

  it("commits only once per flick, swallowing the momentum tail", () => {
    const { commits } = swipe(Array.from({ length: 40 }, () => ({ deltaX: 24 })));
    expect(commits).toHaveLength(1);
  });

  it("never commits while the pointer owns a drag or resize", () => {
    const { commits, state } = swipe(
      Array.from({ length: 12 }, () => ({ deltaX: 40, interactionBusy: true })),
    );
    expect(commits).toHaveLength(0);
    expect(state).toEqual(initialSpatialGestureState);
  });

  it("yields the whole run to content that can still scroll", () => {
    const { commits, lastPreventDefault } = swipe(
      Array.from({ length: 12 }, (_, index) => ({
        deltaX: 40,
        // Only the first sample reports the scrollable ancestor; the run must
        // still stay yielded so a diff cannot be paged out of mid-scroll.
        consumedByContent: index === 0,
      })),
    );
    expect(commits).toHaveLength(0);
    expect(lastPreventDefault).toBe(false);
  });

  it("ignores wheel events carrying a zoom modifier", () => {
    const { commits } = swipe(
      Array.from({ length: 12 }, () => ({ deltaX: 40, modifierHeld: true })),
    );
    expect(commits).toHaveLength(0);
  });

  it("locks to the vertical axis and leaves scrolling alone", () => {
    const { commits, lastPreventDefault } = swipe([
      { deltaX: 2, deltaY: 30 },
      { deltaX: 3, deltaY: 30 },
      { deltaX: 1, deltaY: 30 },
    ]);
    expect(commits).toHaveLength(0);
    expect(lastPreventDefault).toBe(true);
  });

  it("opens Project Overview on a sustained upward swipe", () => {
    const { commits } = swipe(Array.from({ length: 10 }, () => ({ deltaY: 30 })));
    expect(commits).toEqual([{ kind: "overview" }]);
  });

  it("closes Project Overview on a downward swipe while it is open", () => {
    const { commits } = swipe(
      Array.from({ length: 10 }, () => ({ deltaY: -30, overviewOpen: true })),
    );
    expect(commits).toEqual([{ kind: "exit-overview" }]);
  });

  it("does not reopen Overview with an upward swipe while it is already open", () => {
    const { commits } = swipe(
      Array.from({ length: 10 }, () => ({ deltaY: 30, overviewOpen: true })),
    );
    expect(commits).toHaveLength(0);
  });

  it("respects the overview gesture switch", () => {
    let state = initialSpatialGestureState;
    const config = { ...DEFAULT_SPATIAL_GESTURE_CONFIG, overviewGestureEnabled: false };
    const commits = [];
    for (let index = 0; index < 12; index += 1) {
      const result = feedSpatialGesture(
        state,
        sample({ deltaY: 40, timestamp: 1_000 + index * 16 }),
        config,
      );
      state = result.state;
      if (result.commit) commits.push(result.commit);
    }
    expect(commits).toHaveLength(0);
  });

  it("commits nothing at all when gestures are disabled", () => {
    let state = initialSpatialGestureState;
    const config = { ...DEFAULT_SPATIAL_GESTURE_CONFIG, enabled: false };
    for (let index = 0; index < 20; index += 1) {
      const result = feedSpatialGesture(
        state,
        sample({ deltaX: 60, timestamp: 1_000 + index * 16 }),
        config,
      );
      state = result.state;
      expect(result.commit).toBeNull();
      expect(result.preventDefault).toBe(false);
    }
  });

  it("starts a fresh run after the idle reset window", () => {
    const first = swipe([{ deltaX: 40 }, { deltaX: 40 }]);
    // A long pause means the next sample belongs to a new gesture.
    const resumed = feedSpatialGesture(
      first.state,
      sample({ deltaX: 40, timestamp: 5_000 }),
      DEFAULT_SPATIAL_GESTURE_CONFIG,
    );
    expect(resumed.state.accumulatedX).toBe(40);
  });

  it("lowers the distance bar for a fast flick", () => {
    const { commits } = swipe([{ deltaX: 70 }, { deltaX: 70 }]);
    expect(commits).toEqual([{ kind: "project", direction: 1 }]);
  });

  it("allows a second commit after the cooldown elapses", () => {
    const first = swipe(Array.from({ length: 8 }, () => ({ deltaX: 24 })));
    expect(first.commits).toHaveLength(1);
    let state = first.state;
    const commits = [];
    for (let index = 0; index < 8; index += 1) {
      const result = feedSpatialGesture(
        state,
        sample({ deltaX: 24, timestamp: 9_000 + index * 16 }),
        DEFAULT_SPATIAL_GESTURE_CONFIG,
      );
      state = result.state;
      if (result.commit) commits.push(result.commit);
    }
    expect(commits).toEqual([{ kind: "project", direction: 1 }]);
  });
});
