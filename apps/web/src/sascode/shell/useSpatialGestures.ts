// FILE: sascode/shell/useSpatialGestures.ts
// Purpose: Binds the trackpad heuristic and the keyboard equivalents to the
//          project-space navigation commands.
// Layer: Shell adapter.
//
// Every gesture here has a keyboard equivalent, and every keyboard equivalent
// works whether or not a trackpad exists. Gesture-only interaction is treated
// as a defect, not a feature.

import { useCallback, useEffect, useRef } from "react";

import {
  DEFAULT_SPATIAL_GESTURE_CONFIG,
  feedSpatialGesture,
  initialSpatialGestureState,
  scrollCanConsume,
  type SpatialGestureConfig,
  type SpatialGestureState,
} from "./spatialGesture";

export interface SpatialGestureHandlers {
  onStepProject: (direction: -1 | 1) => void;
  onOpenOverview: () => void;
  onCloseOverview: () => void;
}

export interface UseSpatialGesturesInput extends SpatialGestureHandlers {
  containerRef: React.RefObject<HTMLElement | null>;
  overviewOpen: boolean;
  /** True while a drag, resize, or modal owns the pointer. */
  interactionBusy: boolean;
  config?: Partial<SpatialGestureConfig>;
}

export function useSpatialGestures({
  containerRef,
  overviewOpen,
  interactionBusy,
  onStepProject,
  onOpenOverview,
  onCloseOverview,
  config,
}: UseSpatialGesturesInput): void {
  const stateRef = useRef<SpatialGestureState>(initialSpatialGestureState);
  // Read through refs so the wheel listener can stay passive-free and attached
  // for the lifetime of the shell instead of rebinding on every state change.
  const latest = useRef({ overviewOpen, interactionBusy });
  latest.current = { overviewOpen, interactionBusy };

  const handlers = useRef({ onStepProject, onOpenOverview, onCloseOverview });
  handlers.current = { onStepProject, onOpenOverview, onCloseOverview };

  const resolvedConfig = useRef<SpatialGestureConfig>({
    ...DEFAULT_SPATIAL_GESTURE_CONFIG,
    ...config,
  });
  resolvedConfig.current = { ...DEFAULT_SPATIAL_GESTURE_CONFIG, ...config };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (event: WheelEvent) => {
      const consumed = scrollCanConsume(
        event.target instanceof Element ? event.target : null,
        event.deltaX,
        event.deltaY,
        container,
      );

      const result = feedSpatialGesture(
        stateRef.current,
        {
          // Trackpads report scroll deltas in the direction content moves, which
          // is the opposite of the direction the workspace should travel.
          deltaX: -event.deltaX,
          deltaY: -event.deltaY,
          timestamp: event.timeStamp,
          consumedByContent: consumed,
          interactionBusy: latest.current.interactionBusy,
          overviewOpen: latest.current.overviewOpen,
          modifierHeld: event.ctrlKey || event.metaKey || event.altKey,
        },
        resolvedConfig.current,
      );

      stateRef.current = result.state;
      if (result.preventDefault && event.cancelable) event.preventDefault();

      if (!result.commit) return;
      if (result.commit.kind === "project") {
        handlers.current.onStepProject(result.commit.direction);
      } else if (result.commit.kind === "overview") {
        handlers.current.onOpenOverview();
      } else {
        handlers.current.onCloseOverview();
      }
    };

    // Not passive: a committed swipe must be able to stop the browser from also
    // scrolling or triggering back-navigation.
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [containerRef]);
}

/** True when a keyboard event should be ignored because the user is typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export interface WorkspaceShortcutHandlers extends SpatialGestureHandlers {
  onToggleOverview: () => void;
  onToggleEditSpace: () => void;
  onOpenCommand: () => void;
  onCloseLayer: () => boolean;
  onFocusShelf: () => void;
  onToggleChatDock: () => void;
}

/**
 * Keyboard equivalents for every spatial gesture.
 *
 * Registered in the capture phase so the shell sees the key before a focused
 * editor swallows it, but suppressed whenever the user is genuinely typing.
 */
export function useWorkspaceShortcuts(handlers: WorkspaceShortcutHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  const onKeyDown = useCallback((event: KeyboardEvent) => {
    const current = ref.current;

    if (event.key === "Escape") {
      if (current.onCloseLayer()) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    if (isTypingTarget(event.target)) return;

    const mod = event.metaKey || event.ctrlKey;

    // Cmd/Ctrl + Alt + Arrow moves between project spaces.
    if (mod && event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      current.onStepProject(event.key === "ArrowRight" ? 1 : -1);
      return;
    }

    if (mod && event.shiftKey && event.code === "Space") {
      event.preventDefault();
      current.onToggleOverview();
      return;
    }

    if (mod && event.shiftKey && (event.key === "E" || event.key === "e")) {
      event.preventDefault();
      current.onToggleEditSpace();
      return;
    }

    if (mod && !event.shiftKey && (event.key === "k" || event.key === "K")) {
      event.preventDefault();
      current.onOpenCommand();
      return;
    }

    if (mod && event.shiftKey && (event.key === "S" || event.key === "s")) {
      event.preventDefault();
      current.onFocusShelf();
      return;
    }

    if (mod && event.shiftKey && (event.key === "C" || event.key === "c")) {
      event.preventDefault();
      current.onToggleChatDock();
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [onKeyDown]);
}
