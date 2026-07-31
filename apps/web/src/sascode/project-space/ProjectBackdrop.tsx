// FILE: sascode/project-space/ProjectBackdrop.tsx
// Purpose: The atmosphere of a project space — environmental light, not wallpaper.
// Layer: Presentation.
//
// The Dusk reference is a source of qualities (depth, indirect light, mineral
// colour, calm geometry), not a required asset. This builds those qualities
// procedurally so every project has atmosphere without shipping a megabyte of
// image, without a decode cost for spaces that are off screen, and without the
// product breaking if a user replaces it.

import { memo } from "react";

/** A single tile of monochrome noise, inlined so there is no network request. */
const GRAIN_DATA_URI =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140">
      <filter id="n">
        <feTurbulence type="fractalNoise" baseFrequency="0.86" numOctaves="3" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
      </filter>
      <rect width="140" height="140" filter="url(#n)" opacity="0.5"/>
    </svg>`,
  );

export interface ProjectBackdropProps {
  /** Off-screen spaces render a flat fill so nothing paints or composites. */
  active: boolean;
  /** Accessibility escape hatch: replaces atmosphere with a flat surface. */
  flat?: boolean;
  /** Optional user-chosen background. Only decoded while the space is active. */
  imageUrl?: string | null;
}

export const ProjectBackdrop = memo(function ProjectBackdrop({
  active,
  flat,
  imageUrl,
}: ProjectBackdropProps) {
  if (flat) {
    return (
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "var(--sas-canvas)" }}
        aria-hidden="true"
      />
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0" style={{ backgroundColor: "var(--sas-canvas)" }} />

      {active && imageUrl ? (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${imageUrl})`,
            opacity: `calc(1 - var(--sas-background-dim) * 0.7)`,
          }}
        />
      ) : null}

      {active ? (
        <>
          {/* Sky: the upper third lifts toward the light, which is what gives
              the space a horizon instead of a flat fill. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, color-mix(in srgb, var(--sas-surface) 46%, transparent) 0%," +
                " color-mix(in srgb, var(--sas-surface) 12%, transparent) 30%," +
                " transparent 52%)",
            }}
          />
          {/* Floor: the space recedes toward the bottom, so the shelf reads as
              sitting on something rather than floating in a void. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, transparent 0%, transparent 40%, var(--sas-canvas-deep) 100%)",
              opacity: 0.82,
            }}
          />
          {/* Horizon: a wide, low-saturation band of the project aura sitting
              just above the floor line. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(90% 40% at 50% 74%, var(--sas-aura-soft) 0%, transparent 68%)",
              opacity: `calc(1 - var(--sas-background-dim) * 0.45)`,
            }}
          />
          {/* Key light: a single broad source high on the right, matching the
              way the Stillspace reference is lit. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(64% 52% at 78% 2%, color-mix(in srgb, var(--sas-aura) 22%, transparent) 0%, transparent 62%)",
              opacity: `calc(1 - var(--sas-background-dim) * 0.5)`,
            }}
          />
          {/* Fill light from the upper left, much quieter than the key. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(52% 40% at 4% 6%, color-mix(in srgb, var(--sas-rim) 16%, transparent) 0%, transparent 66%)",
            }}
          />
          {/* Grain. Barely there — it exists to stop large gradients banding. */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url("${GRAIN_DATA_URI}")`,
              backgroundRepeat: "repeat",
              opacity: 0.04,
              mixBlendMode: "overlay",
            }}
          />
        </>
      ) : null}
    </div>
  );
});
