// FILE: sascode/shell/SpaceViewport.tsx
// Purpose: The horizontal strip of project spaces and the camera that moves
//          across it.
// Layer: Shell.
//
// Motion here explains a spatial relationship: the whole environment travels,
// the way macOS Spaces does, rather than the content swapping in place. The
// neighbouring spaces stay mounted as thin edge reveals so the movement has
// somewhere to go, but they render nothing heavy.

import { forwardRef, type ReactNode } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

export interface SpaceViewportProps {
  /**
   * One entry per project space, identified by the project id. Taking ids
   * explicitly (rather than reading keys off children) means a reordered
   * project list can never recycle the wrong space's DOM.
   */
  spaces: ReadonlyArray<{ id: string; node: ReactNode }>;
  activeIndex: number;
  onStepProject: (direction: -1 | 1) => void;
}

export const SpaceViewport = forwardRef<HTMLDivElement, SpaceViewportProps>(function SpaceViewport(
  { spaces, activeIndex, onStepProject },
  ref,
) {
  const count = spaces.length;
  const canGoBack = activeIndex > 0;
  const canGoForward = activeIndex < count - 1;

  return (
    <div ref={ref} className="relative min-h-0 flex-1 overflow-hidden">
      <div
        className="sas-transition-spatial flex h-full"
        style={{
          width: `${Math.max(count, 1) * 100}%`,
          transform: `translate3d(-${activeIndex * (100 / Math.max(count, 1))}%, 0, 0)`,
        }}
      >
        {spaces.map((space, index) => (
          <div
            key={space.id}
            className="h-full min-w-0"
            style={{ width: `${100 / Math.max(count, 1)}%` }}
            aria-hidden={index !== activeIndex}
            // Off-screen spaces are inert to pointer and tab order, which is
            // what stops a hidden project stealing focus mid-swipe.
            inert={index !== activeIndex}
          >
            {space.node}
          </div>
        ))}
      </div>

      {canGoBack ? <EdgeButton side="left" onClick={() => onStepProject(-1)} /> : null}
      {canGoForward ? <EdgeButton side="right" onClick={() => onStepProject(1)} /> : null}
    </div>
  );
});

function EdgeButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous project space" : "Next project space"}
      className="sas-transition sas-focusable absolute top-1/2 z-20 flex size-8 -translate-y-1/2 items-center justify-center rounded-full opacity-0 hover:opacity-100 focus-visible:opacity-100"
      style={{
        [side]: 6,
        backgroundColor: "var(--sas-glass)",
        border: "1px solid var(--sas-line)",
        color: "var(--sas-text-on-canvas)",
      }}
    >
      {side === "left" ? (
        <IconChevronLeft size={16} stroke={1.8} />
      ) : (
        <IconChevronRight size={16} stroke={1.8} />
      )}
    </button>
  );
}
