// FILE: sascode/theme/spectrum.ts
// Purpose: The Stillspace appearance spectrum. Turns durable theme settings into
//          the flat CSS custom-property set the whole SASCODE shell paints from.
// Layer: Pure derivation. No React, no DOM, no backend access.
//
// Daylight (0) -> Dusk (0.5) -> Nightfall (1) are three hand-authored anchors.
// Everything between them is interpolated perceptually so the slider never
// passes through a muddy grey. Everything else on a stop (raised/sunken
// surfaces, rim light, status fills) is derived from the anchor so a future
// fourth stop only needs the same handful of values.

import type { SascodeThemeSettings } from "@synara/contracts";

import {
  avoidDeadLuminanceBand,
  ensureContrast,
  formatHex,
  formatRgba,
  mixOkLab,
  parseHex,
  relativeLuminance,
  type Rgb,
  scaleChroma,
  shiftLightness,
} from "./oklab";

export const DAYLIGHT = 0;
export const DUSK = 0.5;
export const NIGHTFALL = 1;

export type SpectrumStopKey = "daylight" | "dusk" | "nightfall";

export const SPECTRUM_STOPS: ReadonlyArray<{
  key: SpectrumStopKey;
  label: string;
  value: number;
}> = [
  { key: "daylight", label: "Daylight", value: DAYLIGHT },
  { key: "dusk", label: "Dusk", value: DUSK },
  { key: "nightfall", label: "Nightfall", value: NIGHTFALL },
];

/** One hand-authored appearance anchor. */
interface ThemeAnchor {
  /** True while the canvas is lighter than the text sitting on it. */
  light: boolean;
  canvasDeep: string;
  canvas: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  /** Tint mixed into translucent panels. */
  glassTint: string;
  glassAlpha: number;
  /** Inner light along a glass edge. */
  rimAlpha: number;
  lineAlpha: number;
  lineStrongAlpha: number;
  /** Colour the hairlines and rims are drawn in before alpha. */
  lineInk: string;
  blurPx: number;
  codeSurface: string;
  scrim: string;
  shadowInk: string;
  shadowAlpha: number;
  accent: string;
  live: string;
  attention: string;
  blocked: string;
  resting: string;
}

const DAYLIGHT_ANCHOR: ThemeAnchor = {
  light: true,
  canvasDeep: "#E3E6EB",
  canvas: "#F4F5F7",
  surface: "#FCFCFD",
  surfaceRaised: "#FFFFFF",
  surfaceSunken: "#EDEFF3",
  text: "#191B20",
  textSecondary: "#6C727E",
  textMuted: "#8B919B",
  glassTint: "#FFFFFF",
  glassAlpha: 0.66,
  rimAlpha: 0.9,
  lineAlpha: 0.09,
  lineStrongAlpha: 0.17,
  lineInk: "#191B20",
  blurPx: 20,
  codeSurface: "#F6F7FA",
  scrim: "#141822",
  shadowInk: "#161C28",
  shadowAlpha: 0.1,
  accent: "#5C59E6",
  live: "#2E9C75",
  attention: "#A9701B",
  blocked: "#C24E4C",
  resting: "#767D89",
};

const DUSK_ANCHOR: ThemeAnchor = {
  light: false,
  canvasDeep: "#171D27",
  canvas: "#27303D",
  surface: "#303A49",
  surfaceRaised: "#3A4556",
  surfaceSunken: "#222A36",
  text: "#F0F2F5",
  textSecondary: "#AEB5C0",
  textMuted: "#848C99",
  glassTint: "#49566B",
  glassAlpha: 0.46,
  rimAlpha: 0.15,
  lineAlpha: 0.09,
  lineStrongAlpha: 0.16,
  lineInk: "#FFFFFF",
  blurPx: 24,
  codeSurface: "#1D242F",
  scrim: "#080B10",
  shadowInk: "#05070B",
  shadowAlpha: 0.34,
  accent: "#7775F6",
  live: "#5BCB9A",
  attention: "#E3AF5F",
  blocked: "#E57876",
  resting: "#7E8590",
};

const NIGHTFALL_ANCHOR: ThemeAnchor = {
  light: false,
  canvasDeep: "#050609",
  canvas: "#0D0F12",
  surface: "#15181D",
  surfaceRaised: "#1D2128",
  surfaceSunken: "#0F1216",
  text: "#F2F3F5",
  textSecondary: "#989EA8",
  textMuted: "#6F757F",
  glassTint: "#272C34",
  glassAlpha: 0.54,
  rimAlpha: 0.11,
  lineAlpha: 0.08,
  lineStrongAlpha: 0.15,
  lineInk: "#FFFFFF",
  blurPx: 26,
  codeSurface: "#101317",
  scrim: "#000000",
  shadowInk: "#000000",
  shadowAlpha: 0.5,
  accent: "#8886F8",
  live: "#62D6A4",
  attention: "#E8B96E",
  blocked: "#EA8583",
  resting: "#868D98",
};

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const mixAnchorColour = (from: string, to: string, t: number): Rgb =>
  mixOkLab(parseHex(from), parseHex(to), t);

/**
 * Resolves the two bracketing anchors and the local progress between them.
 * Exported so tests can assert the bracket without reaching into the blend.
 */
export function resolveAnchorBracket(spectrum: number): {
  from: ThemeAnchor;
  to: ThemeAnchor;
  t: number;
} {
  const value = clamp(spectrum, 0, 1);
  if (value <= DUSK) {
    return { from: DAYLIGHT_ANCHOR, to: DUSK_ANCHOR, t: value / DUSK };
  }
  return { from: DUSK_ANCHOR, to: NIGHTFALL_ANCHOR, t: (value - DUSK) / (1 - DUSK) };
}

/**
 * Luminance window in which neither black nor white ink reaches a 7:1 ratio.
 * Text-bearing surfaces step across it instead of settling inside it.
 */
const DEAD_BAND_LOW = 0.1;
const DEAD_BAND_HIGH = 0.3;

/** Ratios the derived ink is solved for. Primary is AAA; secondary is AA. */
const PRIMARY_TEXT_RATIO = 7;
const SECONDARY_TEXT_RATIO = 4.6;
const MUTED_TEXT_RATIO = 3.4;

/**
 * Steep S-curve used for text-bearing surfaces so the light/dark crossover is
 * traversed in a narrow slider region rather than lingering in mid-grey.
 * `smootherstep` is flat at both ends and steep through the middle — exactly
 * the shape wanted here.
 */
const smootherstep = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * Gentler curve for atmosphere (canvas, glass tint, shadow, aura). The world
 * dims continuously even while the panels step.
 */
const easeAtmosphere = (t: number): number => t * t * (3 - 2 * t);

export function isLightSpectrum(spectrum: number): boolean {
  return resolveTheme({ ...DEFAULT_THEME_SETTINGS, spectrum }).light;
}

export function nearestSpectrumStop(spectrum: number): SpectrumStopKey {
  const value = clamp(spectrum, 0, 1);
  let best = SPECTRUM_STOPS[0]!;
  for (const stop of SPECTRUM_STOPS) {
    if (Math.abs(stop.value - value) < Math.abs(best.value - value)) best = stop;
  }
  return best.key;
}

export interface ThemeAccessibilityOverrides {
  /** Replaces every translucent panel with its opaque equivalent. */
  reducedTransparency?: boolean;
  /** Pushes text/line contrast to the top of the supported range. */
  highContrast?: boolean;
  /** Collapses motion durations to near-zero and disables spatial easing. */
  reducedMotion?: boolean;
}

export interface ResolvedTheme {
  /** Flat map ready to write onto an element's inline style. */
  variables: Record<string, string>;
  light: boolean;
  /** Effective blur in px after the reduced-transparency override. */
  blurPx: number;
  /** True while panels paint opaque instead of translucent. */
  opaquePanels: boolean;
  motionScale: number;
  radiusPx: number;
  densityScale: number;
}

const DENSITY_SCALE: Record<SascodeThemeSettings["density"], number> = {
  compact: 0.86,
  comfortable: 1,
  spacious: 1.16,
};

const MOTION_SCALE: Record<SascodeThemeSettings["motion"], number> = {
  reduced: 0,
  subtle: 1,
  expressive: 1.28,
};

/**
 * Builds the full custom-property set for one appearance configuration.
 *
 * `settings` comes straight from the durable layout, so a saved workspace
 * reproduces byte-identical colours on another machine.
 */
export function resolveTheme(
  settings: SascodeThemeSettings,
  overrides: ThemeAccessibilityOverrides = {},
): ResolvedTheme {
  const { from, to, t } = resolveAnchorBracket(settings.spectrum);

  // Two curves, deliberately: atmosphere glides, text-bearing planes step.
  const atmosphereT = easeAtmosphere(t);
  const surfaceT = smootherstep(t);

  const blendAt = (pick: (anchor: ThemeAnchor) => string, ratio: number): Rgb =>
    mixAnchorColour(pick(from), pick(to), ratio);
  const blend = (pick: (anchor: ThemeAnchor) => string): Rgb => blendAt(pick, atmosphereT);
  const blendNumber = (pick: (anchor: ThemeAnchor) => number): number =>
    lerp(pick(from), pick(to), atmosphereT);

  // `contrast` arrives as a signed nudge (roughly -40..+40 in the UI). High
  // contrast mode pins it to the top so users never have to find the slider.
  const contrastNudge = overrides.highContrast ? 0.06 : clamp(settings.contrast, -40, 40) / 600;

  const canvasDeep = blend((a) => a.canvasDeep);
  const canvas = blend((a) => a.canvas);

  // The work surface is the plane body text sits on, so it is the one colour
  // that may never rest inside the unreadable luminance band.
  const surface = avoidDeadLuminanceBand(
    blendAt((a) => a.surface, surfaceT),
    DEAD_BAND_LOW,
    DEAD_BAND_HIGH,
  );
  const light = relativeLuminance(surface) > DEAD_BAND_HIGH;
  const inkDirection = light ? 1 : -1;

  // Elevation is derived from the resolved surface rather than blended
  // separately, so raised/sunken can never drift to the wrong side of it.
  const surfaceRaised = shiftLightness(surface, light ? 0.014 : 0.042);
  const surfaceSunken = shiftLightness(surface, light ? -0.026 : -0.028);

  const solveInk = (pick: (anchor: ThemeAnchor) => string, ratio: number, boost: number) =>
    ensureContrast(
      surface,
      shiftLightness(blendAt(pick, surfaceT), contrastNudge * -inkDirection * boost),
      overrides.highContrast ? Math.min(ratio + 1.5, 12) : ratio,
    );

  const text = solveInk((a) => a.text, PRIMARY_TEXT_RATIO, 1);
  const textSecondary = solveInk((a) => a.textSecondary, SECONDARY_TEXT_RATIO, 1.4);
  const textMuted = solveInk((a) => a.textMuted, MUTED_TEXT_RATIO, 1.4);

  // The ambient frame and Project Overview paint straight onto the canvas,
  // which is free to sit mid-band, so their ink is solved separately.
  const textOnCanvas = ensureContrast(canvas, text, PRIMARY_TEXT_RATIO);
  const textOnCanvasSecondary = ensureContrast(canvas, textSecondary, SECONDARY_TEXT_RATIO);

  const lineInk = light ? parseHex("#191B20") : parseHex("#FFFFFF");
  const lineAlpha = clamp(
    blendNumber((a) => a.lineAlpha) + (overrides.highContrast ? 0.12 : 0),
    0,
    1,
  );
  const lineStrongAlpha = clamp(
    blendNumber((a) => a.lineStrongAlpha) + (overrides.highContrast ? 0.2 : 0),
    0,
    1,
  );

  const glassTint = blend((a) => a.glassTint);
  // `glassOpacity` is authored 0..100 in the drawer; treat >1 as a percentage.
  const glassOpacityRatio = clamp(
    settings.glassOpacity > 1 ? settings.glassOpacity / 100 : settings.glassOpacity,
    0,
    1,
  );
  const opaquePanels = overrides.reducedTransparency === true;
  const glassAlpha = opaquePanels
    ? 1
    : clamp(blendNumber((a) => a.glassAlpha) * (0.55 + glassOpacityRatio * 0.75), 0.12, 0.97);
  // Opaque mode still needs the panel to read as a distinct plane, so fall back
  // to the raised surface rather than a fully transparent tint.
  const glassFill = opaquePanels ? surfaceRaised : glassTint;
  const blurPx = opaquePanels ? 0 : blendNumber((a) => a.blurPx);

  const rimAlpha = blendNumber((a) => a.rimAlpha);
  const shadowInk = blend((a) => a.shadowInk);
  const shadowAlpha = blendNumber((a) => a.shadowAlpha);

  const statusIntensity = clamp(
    settings.statusIntensity > 1 ? settings.statusIntensity / 100 : settings.statusIntensity,
    0,
    1,
  );
  const statusChroma = 0.6 + statusIntensity * 0.7;
  const status = (pick: (anchor: ThemeAnchor) => string): Rgb =>
    scaleChroma(blend(pick), statusChroma);

  const accent = status((a) => a.accent);
  const live = status((a) => a.live);
  const attention = status((a) => a.attention);
  const blocked = status((a) => a.blocked);
  const resting = blend((a) => a.resting);

  const auraSource = safeParseHex(settings.projectAura, formatHex(accent));
  const backgroundDim = clamp(
    settings.backgroundDim > 1 ? settings.backgroundDim / 100 : settings.backgroundDim,
    0,
    1,
  );

  const radiusPx = clamp(settings.cornerRadius, 4, 32);
  const densityScale = DENSITY_SCALE[settings.density] ?? 1;
  const motionScale = overrides.reducedMotion ? 0 : (MOTION_SCALE[settings.motion] ?? 1);

  const softFill = (colour: Rgb, alpha: number) => formatRgba(colour, alpha);

  const variables: Record<string, string> = {
    "--sas-spectrum": String(clamp(settings.spectrum, 0, 1)),

    "--sas-canvas-deep": formatHex(canvasDeep),
    "--sas-canvas": formatHex(canvas),
    "--sas-surface": formatHex(surface),
    "--sas-surface-raised": formatHex(surfaceRaised),
    "--sas-surface-sunken": formatHex(surfaceSunken),

    "--sas-text": formatHex(text),
    "--sas-text-secondary": formatHex(textSecondary),
    "--sas-text-muted": formatHex(textMuted),
    "--sas-text-on-canvas": formatHex(textOnCanvas),
    "--sas-text-on-canvas-secondary": formatHex(textOnCanvasSecondary),
    "--sas-text-on-accent": formatHex(ensureContrast(accent, text, 4.6)),

    "--sas-line": formatRgba(lineInk, lineAlpha),
    "--sas-line-strong": formatRgba(lineInk, lineStrongAlpha),
    "--sas-rim": formatRgba(parseHex("#FFFFFF"), rimAlpha),

    "--sas-glass": formatRgba(glassFill, glassAlpha),
    "--sas-glass-strong": formatRgba(glassFill, clamp(glassAlpha + 0.16, 0, 1)),
    "--sas-glass-quiet": formatRgba(glassFill, clamp(glassAlpha - 0.16, 0.04, 1)),
    "--sas-blur": `${round(blurPx, 1)}px`,
    "--sas-blur-quiet": `${round(blurPx * 0.6, 1)}px`,

    "--sas-shadow-soft": `0 1px 2px ${formatRgba(shadowInk, shadowAlpha * 0.5)}`,
    "--sas-shadow-lift": `0 6px 16px -6px ${formatRgba(shadowInk, shadowAlpha * 0.9)}`,
    "--sas-shadow-float":
      `0 2px 6px ${formatRgba(shadowInk, shadowAlpha * 0.4)},` +
      ` 0 18px 44px -12px ${formatRgba(shadowInk, shadowAlpha * 1.1)}`,
    "--sas-shadow-overview": `0 40px 90px -30px ${formatRgba(shadowInk, shadowAlpha * 1.35)}`,

    "--sas-accent": formatHex(accent),
    "--sas-accent-soft": softFill(accent, 0.16 + statusIntensity * 0.08),
    "--sas-accent-line": softFill(accent, 0.42),
    "--sas-live": formatHex(live),
    "--sas-live-soft": softFill(live, 0.16 + statusIntensity * 0.08),
    "--sas-attention": formatHex(attention),
    "--sas-attention-soft": softFill(attention, 0.16 + statusIntensity * 0.08),
    "--sas-blocked": formatHex(blocked),
    "--sas-blocked-soft": softFill(blocked, 0.16 + statusIntensity * 0.08),
    "--sas-resting": formatHex(resting),
    "--sas-resting-soft": softFill(resting, 0.14),

    // Ink variants for status *text*. A dot alone never carries meaning, so the
    // label beside it has to be readable at every point on the spectrum.
    "--sas-accent-ink": formatHex(ensureContrast(surface, accent, SECONDARY_TEXT_RATIO)),
    "--sas-live-ink": formatHex(ensureContrast(surface, live, SECONDARY_TEXT_RATIO)),
    "--sas-attention-ink": formatHex(ensureContrast(surface, attention, SECONDARY_TEXT_RATIO)),
    "--sas-blocked-ink": formatHex(ensureContrast(surface, blocked, SECONDARY_TEXT_RATIO)),
    "--sas-resting-ink": formatHex(ensureContrast(surface, resting, MUTED_TEXT_RATIO)),

    "--sas-aura": formatHex(auraSource),
    "--sas-aura-soft": softFill(auraSource, light ? 0.18 : 0.24),
    "--sas-aura-glow": softFill(auraSource, light ? 0.1 : 0.16),

    "--sas-code-surface": formatHex(
      avoidDeadLuminanceBand(
        blendAt((a) => a.codeSurface, surfaceT),
        DEAD_BAND_LOW,
        DEAD_BAND_HIGH,
      ),
    ),
    "--sas-scrim": formatRgba(
      blend((a) => a.scrim),
      light ? 0.24 : 0.52,
    ),
    "--sas-background-dim": String(round(backgroundDim, 3)),

    "--sas-radius-xs": `${round(radiusPx * 0.45, 1)}px`,
    "--sas-radius-sm": `${round(radiusPx * 0.65, 1)}px`,
    "--sas-radius-md": `${round(radiusPx * 0.85, 1)}px`,
    "--sas-radius-lg": `${round(radiusPx, 1)}px`,
    "--sas-radius-xl": `${round(radiusPx * 1.2, 1)}px`,
    "--sas-radius-2xl": `${round(radiusPx * 1.4, 1)}px`,

    "--sas-density": String(round(densityScale, 3)),
    "--sas-space-1": `${round(4 * densityScale, 2)}px`,
    "--sas-space-2": `${round(8 * densityScale, 2)}px`,
    "--sas-space-3": `${round(12 * densityScale, 2)}px`,
    "--sas-space-4": `${round(16 * densityScale, 2)}px`,
    "--sas-space-5": `${round(24 * densityScale, 2)}px`,
    "--sas-space-6": `${round(32 * densityScale, 2)}px`,

    "--sas-motion": String(round(motionScale, 3)),
    "--sas-duration-fast": `${Math.round(150 * motionScale)}ms`,
    "--sas-duration-base": `${Math.round(240 * motionScale)}ms`,
    "--sas-duration-slow": `${Math.round(340 * motionScale)}ms`,
    "--sas-duration-spatial": `${Math.round(480 * motionScale)}ms`,
    "--sas-ease-out": "cubic-bezier(0.22, 0.61, 0.29, 1)",
    "--sas-ease-spatial": "cubic-bezier(0.32, 0.72, 0.24, 1)",
  };

  return {
    variables,
    light,
    blurPx,
    opaquePanels,
    motionScale,
    radiusPx,
    densityScale,
  };
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function safeParseHex(candidate: string, fallbackHex: string): Rgb {
  try {
    return parseHex(candidate);
  } catch {
    return parseHex(fallbackHex);
  }
}

/** Default appearance for a project that has never been personalised. */
export const DEFAULT_THEME_SETTINGS: SascodeThemeSettings = {
  spectrum: DUSK,
  projectAura: "#7775F6",
  glassOpacity: 0.68,
  contrast: 0,
  cornerRadius: 20,
  density: "comfortable",
  motion: "subtle",
  backgroundDim: 0.46,
  statusIntensity: 0.5,
};
