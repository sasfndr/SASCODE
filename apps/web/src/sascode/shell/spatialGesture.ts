// FILE: sascode/shell/spatialGesture.ts
// Purpose: Trackpad heuristic for moving between project spaces and opening
//          Project Overview, without stealing ordinary scrolling.
// Layer: Pure state machine. The DOM adapter feeds it samples.
//
// Browsers do not report finger count, so this never claims to know a swipe was
// "three-finger". It recognises a *deliberate* trackpad swipe: a direction-
// locked, thresholded, velocity-aware run of wheel deltas that did not start
// inside something that could have consumed the scroll itself.

export type SpatialGestureCommit =
  | { kind: "project"; direction: -1 | 1 }
  | { kind: "overview" }
  | { kind: "exit-overview" };

export type SpatialGesturePhase =
  | "idle"
  /** Deltas are accumulating; no axis has won yet. */
  | "tracking"
  /** The user is scrolling content. Stay out of the way until the run ends. */
  | "yielded"
  /** A commit fired. Ignore the swipe's tail so one flick moves one space. */
  | "cooldown";

export interface SpatialGestureState {
  phase: SpatialGesturePhase;
  accumulatedX: number;
  accumulatedY: number;
  /** Timestamp of the first sample in the current run. */
  startedAt: number;
  lastSampleAt: number;
  /** Peak per-sample magnitude, used as a coarse velocity signal. */
  peakMagnitude: number;
}

export const initialSpatialGestureState: SpatialGestureState = {
  phase: "idle",
  accumulatedX: 0,
  accumulatedY: 0,
  startedAt: 0,
  lastSampleAt: 0,
  peakMagnitude: 0,
};

export interface SpatialGestureConfig {
  /** Master switch. When false the machine never commits and never preventsDefault. */
  enabled: boolean;
  /** Horizontal travel, in px, before a project change commits. */
  commitDistanceX: number;
  /** Vertical travel, in px, before Project Overview commits. Deliberately larger. */
  commitDistanceY: number;
  /**
   * How dominant one axis must be before the run locks to it. 1.6 means the
   * winning axis needs 60% more travel than the other.
   */
  axisRatio: number;
  /** A sample this far after the previous one starts a fresh run. */
  idleResetMs: number;
  /** Quiet period after a commit before another can fire. */
  cooldownMs: number;
  /** A single sample this large is treated as a flick and lowers the distance bar. */
  flickMagnitude: number;
  /** Multiplier applied to the distance threshold once a flick is detected. */
  flickDistanceFactor: number;
  /** Set false to keep the vertical gesture from opening Project Overview. */
  overviewGestureEnabled: boolean;
}

export const DEFAULT_SPATIAL_GESTURE_CONFIG: SpatialGestureConfig = {
  enabled: true,
  commitDistanceX: 140,
  commitDistanceY: 190,
  axisRatio: 1.6,
  idleResetMs: 140,
  cooldownMs: 420,
  flickMagnitude: 55,
  flickDistanceFactor: 0.55,
  overviewGestureEnabled: true,
};

export interface SpatialGestureSample {
  deltaX: number;
  deltaY: number;
  timestamp: number;
  /**
   * True when the event originated inside a region that could itself scroll
   * further in this direction — an editor, diff, timeline, carousel, or media
   * surface. Those events must never move the workspace.
   */
  consumedByContent: boolean;
  /** True while a drag, resize, or modal interaction owns the pointer. */
  interactionBusy: boolean;
  /** True while Project Overview is showing, which changes what a commit means. */
  overviewOpen: boolean;
  /** True when the wheel event carries a pinch/zoom modifier. */
  modifierHeld: boolean;
}

export interface SpatialGestureResult {
  state: SpatialGestureState;
  commit: SpatialGestureCommit | null;
  /**
   * True when the host should call `preventDefault()`. Only ever set once the
   * run has locked to an axis we own, so ordinary scrolling stays native.
   */
  preventDefault: boolean;
}

const settle = (state: SpatialGestureState, phase: SpatialGesturePhase, at: number) => ({
  ...initialSpatialGestureState,
  phase,
  startedAt: at,
  lastSampleAt: at,
});

/**
 * Folds one wheel sample into the machine.
 *
 * Ordering matters: bail-outs (disabled, modifier, busy, content-owned) are
 * checked before any accumulation so a scroll inside a diff can never build
 * toward a workspace change.
 */
export function feedSpatialGesture(
  state: SpatialGestureState,
  sample: SpatialGestureSample,
  config: SpatialGestureConfig = DEFAULT_SPATIAL_GESTURE_CONFIG,
): SpatialGestureResult {
  const idle = { state: initialSpatialGestureState, commit: null, preventDefault: false };

  if (!config.enabled || sample.modifierHeld || sample.interactionBusy) {
    return idle;
  }

  const sinceLast = sample.timestamp - state.lastSampleAt;
  const continuing = state.lastSampleAt > 0 && sinceLast <= config.idleResetMs;

  if (state.phase === "cooldown") {
    if (continuing || sample.timestamp - state.startedAt < config.cooldownMs) {
      // Swallow the tail of the flick so momentum cannot page twice.
      return {
        state: { ...state, lastSampleAt: sample.timestamp },
        commit: null,
        preventDefault: true,
      };
    }
    return feedSpatialGesture(initialSpatialGestureState, sample, config);
  }

  if (state.phase === "yielded") {
    if (continuing) {
      return {
        state: { ...state, lastSampleAt: sample.timestamp },
        commit: null,
        preventDefault: false,
      };
    }
    return feedSpatialGesture(initialSpatialGestureState, sample, config);
  }

  if (sample.consumedByContent) {
    // The run belongs to the content under the pointer for its whole duration.
    return { state: settle(state, "yielded", sample.timestamp), commit: null, preventDefault: false };
  }

  const base = continuing ? state : initialSpatialGestureState;
  const accumulatedX = base.accumulatedX + sample.deltaX;
  const accumulatedY = base.accumulatedY + sample.deltaY;
  const magnitude = Math.max(Math.abs(sample.deltaX), Math.abs(sample.deltaY));
  const peakMagnitude = Math.max(base.peakMagnitude, magnitude);

  const next: SpatialGestureState = {
    phase: "tracking",
    accumulatedX,
    accumulatedY,
    startedAt: continuing && base.startedAt > 0 ? base.startedAt : sample.timestamp,
    lastSampleAt: sample.timestamp,
    peakMagnitude,
  };

  const absX = Math.abs(accumulatedX);
  const absY = Math.abs(accumulatedY);
  const flick = peakMagnitude >= config.flickMagnitude;
  const distanceFactor = flick ? config.flickDistanceFactor : 1;

  const horizontalDominant = absX > absY * config.axisRatio;
  const verticalDominant = absY > absX * config.axisRatio;

  if (horizontalDominant) {
    if (absX >= config.commitDistanceX * distanceFactor) {
      // Natural-direction trackpads report a rightward swipe as positive
      // deltaX; moving right means advancing to the next project space.
      const direction: -1 | 1 = accumulatedX > 0 ? 1 : -1;
      return {
        state: settle(next, "cooldown", sample.timestamp),
        commit: { kind: "project", direction },
        preventDefault: true,
      };
    }
    return { state: next, commit: null, preventDefault: true };
  }

  if (verticalDominant) {
    if (!config.overviewGestureEnabled) {
      return { state: settle(next, "yielded", sample.timestamp), commit: null, preventDefault: false };
    }
    if (absY >= config.commitDistanceY * distanceFactor) {
      // Swiping up (content moving away) pulls the camera back to Overview;
      // swiping down while it is open drops back into the project.
      const swipingUp = accumulatedY > 0;
      if (sample.overviewOpen && !swipingUp) {
        return {
          state: settle(next, "cooldown", sample.timestamp),
          commit: { kind: "exit-overview" },
          preventDefault: true,
        };
      }
      if (!sample.overviewOpen && swipingUp) {
        return {
          state: settle(next, "cooldown", sample.timestamp),
          commit: { kind: "overview" },
          preventDefault: true,
        };
      }
      return { state: settle(next, "yielded", sample.timestamp), commit: null, preventDefault: false };
    }
    return { state: next, commit: null, preventDefault: true };
  }

  // Ambiguous so far — keep watching but do not fight the browser yet.
  return { state: next, commit: null, preventDefault: false };
}

/**
 * Walks up from an event target looking for an ancestor that could still scroll
 * in the sampled direction. Lives here so the machine and its adapter share one
 * definition of "content owns this scroll".
 */
export function scrollCanConsume(
  start: Element | null,
  deltaX: number,
  deltaY: number,
  boundary: Element | null,
): boolean {
  let node: Element | null = start;
  const horizontal = Math.abs(deltaX) > Math.abs(deltaY);

  while (node && node !== boundary) {
    if (node instanceof HTMLElement) {
      if (node.dataset["sasGestureOpaque"] === "true") return true;
      const style = window.getComputedStyle(node);
      const overflow = horizontal ? style.overflowX : style.overflowY;
      const scrollable = overflow === "auto" || overflow === "scroll";
      if (scrollable) {
        const size = horizontal ? node.clientWidth : node.clientHeight;
        const scrollSize = horizontal ? node.scrollWidth : node.scrollHeight;
        if (scrollSize > size + 1) {
          const position = horizontal ? node.scrollLeft : node.scrollTop;
          const maxPosition = scrollSize - size;
          const delta = horizontal ? deltaX : deltaY;
          // Only claim the scroll when there is room left in that direction, so
          // a swipe past the end of a diff can still move the workspace.
          if (delta < 0 && position > 1) return true;
          if (delta > 0 && position < maxPosition - 1) return true;
        }
      }
    }
    node = node.parentElement;
  }
  return false;
}
