// FILE: sascode/project-space/NeighbourReveal.tsx
// Purpose: The narrow sliver of the adjacent project at each edge of a space.
// Layer: Presentation.
//
// The reveal is what makes a project feel like a place with neighbours rather
// than a page that swaps. It is deliberately thin and nameplate-only: enough to
// know the workspace continues in that direction, not enough to read as a
// second workspace or a navigation rail.

import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

export interface NeighbourRevealProps {
  side: "left" | "right";
  projectName: string;
  /** Low-saturation aura of the neighbouring project, when it has one. */
  aura?: string | null;
  onStep: () => void;
}

export function NeighbourReveal({ side, projectName, aura, onStep }: NeighbourRevealProps) {
  const Chevron = side === "left" ? IconChevronLeft : IconChevronRight;

  return (
    <button
      type="button"
      onClick={onStep}
      aria-label={`Go to ${projectName}`}
      className="sas-transition sas-focusable group absolute inset-y-0 z-10 flex w-[46px] flex-col items-center justify-center gap-3"
      style={{
        [side]: 0,
        // The sliver is lit by the neighbour, not filled by it: a soft inward
        // wash rather than a panel, so the active space keeps the whole stage.
        background:
          aura == null
            ? undefined
            : `linear-gradient(${side === "left" ? "90deg" : "270deg"}, ${aura} 0%, transparent 100%)`,
      }}
    >
      <Chevron
        size={15}
        stroke={1.7}
        aria-hidden="true"
        className="sas-transition opacity-60 group-hover:opacity-100"
        style={{ color: "var(--sas-text-on-canvas)" }}
      />
      <span
        aria-hidden="true"
        className="max-h-[46%] truncate text-[10.5px] tracking-[0.14em] uppercase"
        style={{
          color: "var(--sas-text-on-canvas-secondary)",
          writingMode: "vertical-rl",
          transform: side === "left" ? "rotate(180deg)" : undefined,
        }}
      >
        {projectName}
      </span>
    </button>
  );
}
