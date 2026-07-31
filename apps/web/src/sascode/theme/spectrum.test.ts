import { describe, expect, it } from "vitest";

import { contrastRatio, mixHex, parseHex, rgbToOkLab, okLabToRgb } from "./oklab";
import {
  DEFAULT_THEME_SETTINGS,
  isLightSpectrum,
  nearestSpectrumStop,
  resolveAnchorBracket,
  resolveTheme,
} from "./spectrum";

const settings = (overrides: Partial<typeof DEFAULT_THEME_SETTINGS> = {}) => ({
  ...DEFAULT_THEME_SETTINGS,
  ...overrides,
});

describe("oklab", () => {
  it("round-trips a colour through OKLab", () => {
    const source = parseHex("#7775F6");
    const result = okLabToRgb(rgbToOkLab(source));
    expect(result.r).toBeCloseTo(source.r, 3);
    expect(result.g).toBeCloseTo(source.g, 3);
    expect(result.b).toBeCloseTo(source.b, 3);
  });

  it("returns the endpoints exactly at t=0 and t=1", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
  });

  it("clamps progress outside 0..1", () => {
    expect(mixHex("#000000", "#ffffff", -3)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 9)).toBe("#ffffff");
  });

  it("expands three-digit hex", () => {
    expect(parseHex("#fff")).toEqual(parseHex("#ffffff"));
  });

  it("rejects malformed hex", () => {
    expect(() => parseHex("not-a-colour")).toThrow();
  });
});

describe("spectrum brackets", () => {
  it("brackets Daylight to Dusk below the midpoint", () => {
    const { t } = resolveAnchorBracket(0.25);
    expect(t).toBeCloseTo(0.5, 5);
  });

  it("brackets Dusk to Nightfall above the midpoint", () => {
    const { t } = resolveAnchorBracket(0.75);
    expect(t).toBeCloseTo(0.5, 5);
  });

  it("clamps out-of-range input", () => {
    expect(resolveAnchorBracket(-1).t).toBe(0);
    expect(resolveAnchorBracket(4).t).toBe(1);
  });

  it("names the nearest stop", () => {
    expect(nearestSpectrumStop(0.05)).toBe("daylight");
    expect(nearestSpectrumStop(0.45)).toBe("dusk");
    expect(nearestSpectrumStop(0.95)).toBe("nightfall");
  });

  it("treats only the bright end as light", () => {
    expect(isLightSpectrum(0)).toBe(true);
    expect(isLightSpectrum(0.5)).toBe(false);
    expect(isLightSpectrum(1)).toBe(false);
  });
});

describe("resolveTheme", () => {
  it("interpolates continuously rather than snapping between stops", () => {
    const a = resolveTheme(settings({ spectrum: 0.2 })).variables["--sas-canvas"];
    const b = resolveTheme(settings({ spectrum: 0.3 })).variables["--sas-canvas"];
    const c = resolveTheme(settings({ spectrum: 0.4 })).variables["--sas-canvas"];
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
  });

  it("is deterministic for the same settings", () => {
    expect(resolveTheme(settings()).variables).toEqual(resolveTheme(settings()).variables);
  });

  it("keeps body text readable against the work surface at every stop", () => {
    for (const spectrum of [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1]) {
      const { variables } = resolveTheme(settings({ spectrum }));
      const ratio = contrastRatio(
        parseHex(variables["--sas-text"]!),
        parseHex(variables["--sas-surface"]!),
      );
      expect(ratio, `primary text at spectrum ${spectrum}`).toBeGreaterThanOrEqual(7);
    }
  });

  it("keeps secondary text at AA against the work surface at every stop", () => {
    for (const spectrum of [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1]) {
      const { variables } = resolveTheme(settings({ spectrum }));
      const ratio = contrastRatio(
        parseHex(variables["--sas-text-secondary"]!),
        parseHex(variables["--sas-surface"]!),
      );
      expect(ratio, `secondary text at spectrum ${spectrum}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("raises contrast when high contrast is requested", () => {
    const normal = resolveTheme(settings({ spectrum: 0.5 }));
    const high = resolveTheme(settings({ spectrum: 0.5 }), { highContrast: true });
    const normalRatio = contrastRatio(
      parseHex(normal.variables["--sas-text-secondary"]!),
      parseHex(normal.variables["--sas-surface"]!),
    );
    const highRatio = contrastRatio(
      parseHex(high.variables["--sas-text-secondary"]!),
      parseHex(high.variables["--sas-surface"]!),
    );
    expect(highRatio).toBeGreaterThan(normalRatio);
  });

  it("drops blur and makes panels opaque under reduced transparency", () => {
    const resolved = resolveTheme(settings(), { reducedTransparency: true });
    expect(resolved.opaquePanels).toBe(true);
    expect(resolved.blurPx).toBe(0);
    expect(resolved.variables["--sas-blur"]).toBe("0px");
    expect(resolved.variables["--sas-glass"]).toMatch(/, 1\)$/);
  });

  it("collapses durations under reduced motion", () => {
    const resolved = resolveTheme(settings(), { reducedMotion: true });
    expect(resolved.motionScale).toBe(0);
    expect(resolved.variables["--sas-duration-spatial"]).toBe("0ms");
    expect(resolved.variables["--sas-duration-base"]).toBe("0ms");
  });

  it("honours the reduced motion theme setting without an override", () => {
    const resolved = resolveTheme(settings({ motion: "reduced" }));
    expect(resolved.variables["--sas-duration-base"]).toBe("0ms");
  });

  it("scales the radius ramp from the corner-radius setting", () => {
    const resolved = resolveTheme(settings({ cornerRadius: 20 }));
    expect(resolved.variables["--sas-radius-lg"]).toBe("20px");
    expect(resolved.variables["--sas-radius-sm"]).toBe("13px");
  });

  it("scales spacing from density", () => {
    const compact = resolveTheme(settings({ density: "compact" })).variables["--sas-space-4"];
    const spacious = resolveTheme(settings({ density: "spacious" })).variables["--sas-space-4"];
    expect(Number.parseFloat(compact!)).toBeLessThan(Number.parseFloat(spacious!));
  });

  it("accepts a percentage glass opacity as well as a ratio", () => {
    const ratio = resolveTheme(settings({ glassOpacity: 0.68 })).variables["--sas-glass"];
    const percent = resolveTheme(settings({ glassOpacity: 68 })).variables["--sas-glass"];
    expect(ratio).toBe(percent);
  });

  it("falls back to the accent when the project aura is unparseable", () => {
    const resolved = resolveTheme(settings({ projectAura: "chartreuse-ish" }));
    expect(resolved.variables["--sas-aura"]).toBe(resolved.variables["--sas-accent"]);
  });

  it("uses the project aura when it is valid", () => {
    const resolved = resolveTheme(settings({ projectAura: "#5BCB9A" }));
    expect(resolved.variables["--sas-aura"]?.toLowerCase()).toBe("#5bcb9a");
  });
});
