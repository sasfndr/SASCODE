// FILE: sascode/theme/oklab.ts
// Purpose: Perceptual colour conversion so the Daylight -> Dusk -> Nightfall
//          spectrum interpolates without the muddy midpoints sRGB lerping gives.
// Layer: Pure maths. No React, no DOM.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface OkLab {
  l: number;
  a: number;
  b: number;
}

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Parses `#rgb`, `#rrggbb`, or `#rrggbbaa`. Alpha is discarded. */
export function parseHex(hex: string): Rgb {
  const raw = hex.trim().replace(/^#/, "");
  const expanded =
    raw.length === 3 || raw.length === 4
      ? raw
          .slice(0, 3)
          .split("")
          .map((char) => char + char)
          .join("")
      : raw.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    throw new Error(`Invalid hex colour: ${hex}`);
  }
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16) / 255,
    g: Number.parseInt(expanded.slice(2, 4), 16) / 255,
    b: Number.parseInt(expanded.slice(4, 6), 16) / 255,
  };
}

const toHexPair = (channel: number): string =>
  Math.round(clamp01(channel) * 255)
    .toString(16)
    .padStart(2, "0");

export function formatHex({ r, g, b }: Rgb): string {
  return `#${toHexPair(r)}${toHexPair(g)}${toHexPair(b)}`;
}

export function formatRgba({ r, g, b }: Rgb, alpha: number): string {
  const channel = (value: number) => Math.round(clamp01(value) * 255);
  const roundedAlpha = Math.round(clamp01(alpha) * 1000) / 1000;
  return `rgba(${channel(r)}, ${channel(g)}, ${channel(b)}, ${roundedAlpha})`;
}

const srgbToLinear = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const linearToSrgb = (channel: number): number =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;

/** Björn Ottosson's OKLab. Chosen because equal numeric steps read as equal visual steps. */
export function rgbToOkLab({ r, g, b }: Rgb): OkLab {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const lCubeRoot = Math.cbrt(l);
  const mCubeRoot = Math.cbrt(m);
  const sCubeRoot = Math.cbrt(s);

  return {
    l: 0.2104542553 * lCubeRoot + 0.793617785 * mCubeRoot - 0.0040720468 * sCubeRoot,
    a: 1.9779984951 * lCubeRoot - 2.428592205 * mCubeRoot + 0.4505937099 * sCubeRoot,
    b: 0.0259040371 * lCubeRoot + 0.7827717662 * mCubeRoot - 0.808675766 * sCubeRoot,
  };
}

export function okLabToRgb({ l, a, b }: OkLab): Rgb {
  const lCubeRoot = l + 0.3963377774 * a + 0.2158037573 * b;
  const mCubeRoot = l - 0.1055613458 * a - 0.0638541728 * b;
  const sCubeRoot = l - 0.0894841775 * a - 1.291485548 * b;

  const lLinear = lCubeRoot ** 3;
  const mLinear = mCubeRoot ** 3;
  const sLinear = sCubeRoot ** 3;

  return {
    r: clamp01(
      linearToSrgb(
        4.0767416621 * lLinear - 3.3077115913 * mLinear + 0.2309699292 * sLinear,
      ),
    ),
    g: clamp01(
      linearToSrgb(
        -1.2684380046 * lLinear + 2.6097574011 * mLinear - 0.3413193965 * sLinear,
      ),
    ),
    b: clamp01(
      linearToSrgb(
        -0.0041960863 * lLinear - 0.7034186147 * mLinear + 1.707614701 * sLinear,
      ),
    ),
  };
}

/** Linear blend in OKLab. `t` is clamped, so callers may pass unbounded progress. */
export function mixOkLab(from: Rgb, to: Rgb, t: number): Rgb {
  const ratio = clamp01(t);
  if (ratio === 0) return from;
  if (ratio === 1) return to;
  const a = rgbToOkLab(from);
  const b = rgbToOkLab(to);
  return okLabToRgb({
    l: a.l + (b.l - a.l) * ratio,
    a: a.a + (b.a - a.a) * ratio,
    b: a.b + (b.b - a.b) * ratio,
  });
}

export function mixHex(fromHex: string, toHex: string, t: number): string {
  return formatHex(mixOkLab(parseHex(fromHex), parseHex(toHex), t));
}

/**
 * Nudges perceptual lightness while preserving hue and chroma. Used for the
 * contrast control and for deriving raised/sunken surfaces from one anchor.
 */
export function shiftLightness(colour: Rgb, delta: number): Rgb {
  const lab = rgbToOkLab(colour);
  return okLabToRgb({ ...lab, l: clamp01(lab.l + delta) });
}

/** Scales chroma around the neutral axis. `amount` of 0 fully desaturates. */
export function scaleChroma(colour: Rgb, amount: number): Rgb {
  const lab = rgbToOkLab(colour);
  return okLabToRgb({ l: lab.l, a: lab.a * amount, b: lab.b * amount });
}

/** WCAG 2.x relative luminance, used to pick readable foregrounds over aura fills. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** Rounds to the 8-bit values `formatHex` will emit, so measurements match output. */
export function quantize8Bit({ r, g, b }: Rgb): Rgb {
  return {
    r: Math.round(clamp01(r) * 255) / 255,
    g: Math.round(clamp01(g) * 255) / 255,
    b: Math.round(clamp01(b) * 255) / 255,
  };
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const luminanceA = relativeLuminance(a);
  const luminanceB = relativeLuminance(b);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Returns ink that meets `targetRatio` against `background` while keeping the
 * hue and chroma the designer authored.
 *
 * Only lightness moves, and only as far as it must: if the authored ink already
 * clears the target it is returned untouched, so hand-tuned stops keep their
 * exact values and only the interpolated space in between gets corrected.
 * When neither polarity can reach the target the closest achievable ink wins —
 * a caller that needs a hard guarantee should widen the background instead.
 */
export function ensureContrast(background: Rgb, ink: Rgb, targetRatio: number): Rgb {
  // Measure everything at the 8-bit precision the colour is finally written at,
  // otherwise a float-perfect solution can round below the target in the CSS.
  const quantized = quantize8Bit(background);
  if (contrastRatio(quantize8Bit(ink), quantized) >= targetRatio) return ink;

  const inkLab = rgbToOkLab(ink);
  const backgroundLuminance = relativeLuminance(quantized);

  const searchToward = (endpointLightness: number): Rgb | null => {
    let low = inkLab.l;
    let high = endpointLightness;
    const endpoint = quantize8Bit(okLabToRgb({ ...inkLab, l: endpointLightness }));
    if (contrastRatio(endpoint, quantized) < targetRatio) return null;
    for (let iteration = 0; iteration < 24; iteration += 1) {
      const mid = (low + high) / 2;
      const candidate = quantize8Bit(okLabToRgb({ ...inkLab, l: mid }));
      if (contrastRatio(candidate, quantized) >= targetRatio) {
        high = mid;
      } else {
        low = mid;
      }
    }
    const solved = quantize8Bit(okLabToRgb({ ...inkLab, l: high }));
    return contrastRatio(solved, quantized) >= targetRatio ? solved : endpoint;
  };

  // Try to preserve the authored polarity (dark ink stays dark) before flipping.
  const preferDarker = relativeLuminance(ink) <= backgroundLuminance;
  const first = searchToward(preferDarker ? 0 : 1);
  if (first) return first;
  const second = searchToward(preferDarker ? 1 : 0);
  if (second) return second;

  const darkest = okLabToRgb({ ...inkLab, l: 0 });
  const lightest = okLabToRgb({ ...inkLab, l: 1 });
  return contrastRatio(darkest, background) >= contrastRatio(lightest, background)
    ? darkest
    : lightest;
}

/**
 * Nudges a colour out of the luminance band where neither black nor white ink
 * can reach AAA, snapping to the nearer edge.
 *
 * This is what lets one continuous slider cross from light to dark without a
 * stretch of unreadable mid-grey work surfaces: the atmosphere keeps
 * interpolating smoothly while text-bearing planes step across the band.
 */
export function avoidDeadLuminanceBand(
  colour: Rgb,
  lowEdge: number,
  highEdge: number,
): Rgb {
  const luminance = relativeLuminance(colour);
  if (luminance <= lowEdge || luminance >= highEdge) return colour;

  const snapUp = highEdge - luminance <= luminance - lowEdge;
  const target = snapUp ? highEdge : lowEdge;
  const lab = rgbToOkLab(colour);

  // Solve at 8-bit precision and land on the safe side of the edge: snapping up
  // must end at or above `highEdge`, snapping down at or below `lowEdge`, so the
  // written hex still clears the contrast the band exists to protect.
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const mid = (low + high) / 2;
    if (relativeLuminance(quantize8Bit(okLabToRgb({ ...lab, l: mid }))) < target) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const candidate = quantize8Bit(okLabToRgb({ ...lab, l: snapUp ? high : low }));
  const candidateLuminance = relativeLuminance(candidate);
  if (snapUp ? candidateLuminance >= target : candidateLuminance <= target) return candidate;
  // Step one 8-bit level further rather than risk sitting inside the band.
  const step = snapUp ? 1 / 255 : -1 / 255;
  return quantize8Bit({
    r: candidate.r + step,
    g: candidate.g + step,
    b: candidate.b + step,
  });
}
