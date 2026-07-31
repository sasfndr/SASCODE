// FILE: sascode/project-space/SplitDivider.tsx
// Purpose: The resizable division between two sessions or two projects.
// Layer: Presentation.
//
// Pointer drag and keyboard both move it. The ARIA separator role plus arrow
// key handling is what keeps split mode usable without a trackpad, which the
// accessibility contract requires of every drag interaction.

import { useCallback, useRef } from "react";

export interface SplitDividerProps {
  ratio: number;
  onRatioChange: (ratio: number) => void;
  containerRef: React.RefObject<HTMLElement | null>;
  label: string;
  orientation?: "vertical" | "horizontal";
  /** Called when a drag starts and ends, so gestures can be suspended. */
  onInteractionChange?: (busy: boolean) => void;
}

const STEP = 0.02;
const COARSE_STEP = 0.1;

export function SplitDivider({
  ratio,
  onRatioChange,
  containerRef,
  label,
  orientation = "vertical",
  onInteractionChange,
}: SplitDividerProps) {
  const draggingRef = useRef(false);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      draggingRef.current = true;
      onInteractionChange?.(true);
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);

      const move = (moveEvent: PointerEvent) => {
        const container = containerRef.current;
        if (!container || !draggingRef.current) return;
        const bounds = container.getBoundingClientRect();
        const next =
          orientation === "vertical"
            ? (moveEvent.clientX - bounds.left) / bounds.width
            : (moveEvent.clientY - bounds.top) / bounds.height;
        onRatioChange(next);
      };

      const up = () => {
        draggingRef.current = false;
        onInteractionChange?.(false);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [containerRef, onInteractionChange, onRatioChange, orientation],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const decrease = orientation === "vertical" ? "ArrowLeft" : "ArrowUp";
      const increase = orientation === "vertical" ? "ArrowRight" : "ArrowDown";
      if (event.key === decrease) {
        event.preventDefault();
        onRatioChange(ratio - (event.shiftKey ? COARSE_STEP : STEP));
      } else if (event.key === increase) {
        event.preventDefault();
        onRatioChange(ratio + (event.shiftKey ? COARSE_STEP : STEP));
      } else if (event.key === "Home") {
        event.preventDefault();
        onRatioChange(0.5);
      }
    },
    [onRatioChange, orientation, ratio],
  );

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={22}
      aria-valuemax={78}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      data-sas-gesture-opaque="true"
      className="sas-focusable group relative flex shrink-0 items-center justify-center"
      style={{
        width: orientation === "vertical" ? 10 : undefined,
        height: orientation === "horizontal" ? 10 : undefined,
        cursor: orientation === "vertical" ? "col-resize" : "row-resize",
      }}
    >
      <span
        aria-hidden="true"
        className="sas-transition rounded-full"
        style={{
          width: orientation === "vertical" ? 2 : 34,
          height: orientation === "vertical" ? 34 : 2,
          backgroundColor: "var(--sas-line-strong)",
        }}
      />
    </div>
  );
}
