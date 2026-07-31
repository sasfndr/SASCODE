// FILE: sascode/project-space/ProjectEnvironment.tsx
// Purpose: The inhabited environment a project space sits inside.
// Layer: Presentation.
//
// This replaces the earlier procedural backdrop. The Stillspace Dusk render is
// not decoration and cannot be paraphrased with gradients: it supplies the
// scene's depth, the warm/cool light that makes the glass above it believable,
// and the anchor the preview surface reads against. Without a real image behind
// them, translucent panels have nothing to refract and collapse into flat dark
// plastic — which is exactly how the previous build failed.
//
// Procedural light and scrim still layer *over* the image; they never replace it.

import { memo } from "react";

/** The shipped Dusk asset, byte-identical to the branding reference. */
export const DUSK_BACKGROUND_URL = "/stillspace/dusk-background.png";

export interface ProjectEnvironmentProps {
  /** Inactive neighbour spaces skip every paint and decode. */
  active: boolean;
  /**
   * Accessibility escape hatch. Replaces the photograph with a flat surface for
   * users who asked to reduce background imagery.
   */
  flat?: boolean;
  /** Per-project override; falls back to the canonical Dusk environment. */
  imageUrl?: string | null;
  /** 0..1 from the durable theme. Dims the scene without erasing it. */
  dim: number;
}

export const ProjectEnvironment = memo(function ProjectEnvironment({
  active,
  flat,
  imageUrl,
  dim,
}: ProjectEnvironmentProps) {
  if (flat) {
    return (
      <div
        className="absolute inset-0"
        aria-hidden="true"
        style={{ backgroundColor: "var(--sas-canvas)" }}
      />
    );
  }

  const source = imageUrl ?? DUSK_BACKGROUND_URL;
  // The environment is the room, not the subject. Left at full brightness it
  // competes with the preview — which is the same scene, lit — and the whole
  // screen flattens into one pale field with panels floating on it. A standing
  // veil holds it back; the user's dim setting deepens it from there, and the
  // ceiling stops it going so far that the glass has nothing left to refract.
  const veil = Math.min(0.8, 0.68 + Math.max(0, dim) * 0.24);

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0" style={{ backgroundColor: "var(--sas-canvas-deep)" }} />

      {active ? (
        <>
          <img
            src={source}
            alt=""
            decoding="async"
            fetchPriority="high"
            className="absolute inset-0 size-full"
            style={{
              objectFit: "cover",
              // The architecture and horizon sit right-of-centre and low in the
              // frame; anchoring there keeps them composed at any aspect ratio
              // instead of drifting off the edge on wide displays.
              objectPosition: "62% 62%",
            }}
          />

          {/* Readability veil. Flat rather than a gradient so the horizon keeps
              its own tonal range instead of being crushed at top and bottom. */}
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "var(--sas-canvas-deep)", opacity: veil }}
          />

          {/* Stillspace is a mineral atmosphere, not a grey one. A neutral veil
              alone leaves the held-back scene reading as desaturated haze; this
              cool wash is what keeps it looking like evening air. */}
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "rgb(38 58 96)", opacity: 0.17 }}
          />

          {/* Chrome legibility only: the very top and bottom strips carry the
              ambient frame and the shelf. The middle of the scene is left alone. */}
          <div
            className="absolute inset-x-0 top-0 h-[140px]"
            style={{
              background:
                "linear-gradient(180deg, color-mix(in srgb, var(--sas-canvas-deep) 62%, transparent) 0%, transparent 100%)",
            }}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-[220px]"
            style={{
              background:
                "linear-gradient(0deg, color-mix(in srgb, var(--sas-canvas-deep) 52%, transparent) 0%, transparent 100%)",
            }}
          />

          {/* A breath of the project aura, picked up from the scene's own edge
              lighting rather than imposed over it. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(58% 44% at 78% 34%, var(--sas-aura-glow) 0%, transparent 62%)",
              mixBlendMode: "screen",
              opacity: 0.5,
            }}
          />
        </>
      ) : null}
    </div>
  );
});
