// FILE: sascode/theme/useStillspaceTheme.ts
// Purpose: Applies the resolved Stillspace appearance to the document and keeps
//          the inherited Synara theme variant in step with the spectrum.
// Layer: Theme adapter.
//
// Two theme systems coexist deliberately. The inherited engine drives every
// pre-existing chat, diff, terminal, and settings component; replacing it would
// mean restyling all of them. Stillspace writes its own `--sas-*` namespace and
// only tells the inherited engine which side of the light/dark line we are on.

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { SascodeThemeSettings } from "@synara/contracts";

import { useTheme } from "~/hooks/useTheme";
import { resolveTheme, type ResolvedTheme } from "./spectrum";

const ACCESSIBILITY_STORAGE_KEY = "sascode:appearance-accessibility:v1";

export interface StillspaceAccessibility {
  /** null means "follow the operating system". */
  reducedMotion: boolean | null;
  reducedTransparency: boolean | null;
  highContrast: boolean | null;
}

const DEFAULT_ACCESSIBILITY: StillspaceAccessibility = {
  reducedMotion: null,
  reducedTransparency: null,
  highContrast: null,
};

function readAccessibility(): StillspaceAccessibility {
  if (typeof localStorage === "undefined") return DEFAULT_ACCESSIBILITY;
  try {
    const raw = localStorage.getItem(ACCESSIBILITY_STORAGE_KEY);
    if (!raw) return DEFAULT_ACCESSIBILITY;
    const parsed = JSON.parse(raw) as Partial<StillspaceAccessibility>;
    const tri = (value: unknown): boolean | null =>
      value === true || value === false ? value : null;
    return {
      reducedMotion: tri(parsed.reducedMotion),
      reducedTransparency: tri(parsed.reducedTransparency),
      highContrast: tri(parsed.highContrast),
    };
  } catch {
    return DEFAULT_ACCESSIBILITY;
  }
}

function writeAccessibility(state: StillspaceAccessibility): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ACCESSIBILITY_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // A full or blocked storage must never break appearance.
  }
}

// These are device preferences, not project state, so they stay local rather
// than travelling in the durable workspace layout.
let accessibilityState: StillspaceAccessibility = readAccessibility();
const accessibilityListeners = new Set<() => void>();

function subscribeAccessibility(listener: () => void) {
  accessibilityListeners.add(listener);
  return () => accessibilityListeners.delete(listener);
}

export function setStillspaceAccessibility(patch: Partial<StillspaceAccessibility>) {
  accessibilityState = { ...accessibilityState, ...patch };
  writeAccessibility(accessibilityState);
  for (const listener of accessibilityListeners) listener();
}

export function resetStillspaceAccessibility() {
  accessibilityState = DEFAULT_ACCESSIBILITY;
  writeAccessibility(accessibilityState);
  for (const listener of accessibilityListeners) listener();
}

function useAccessibilityPreferences(): StillspaceAccessibility {
  return useSyncExternalStore(
    subscribeAccessibility,
    () => accessibilityState,
    () => accessibilityState,
  );
}

function useMediaPreference(query: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const media = window.matchMedia(query);
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    },
    () =>
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia(query).matches
        : false,
    () => false,
  );
}

export interface StillspaceThemeResult extends ResolvedTheme {
  accessibility: StillspaceAccessibility;
  /** What is actually in force after folding OS preferences with user choice. */
  effective: {
    reducedMotion: boolean;
    reducedTransparency: boolean;
    highContrast: boolean;
  };
}

/**
 * Resolves the appearance and writes it to `<html>`.
 *
 * Writing to the document element rather than a container means portalled
 * menus, dialogs, and toasts inherit the same tokens as the shell.
 */
export function useStillspaceTheme(settings: SascodeThemeSettings): StillspaceThemeResult {
  const accessibility = useAccessibilityPreferences();
  const systemReducedMotion = useMediaPreference("(prefers-reduced-motion: reduce)");
  const systemReducedTransparency = useMediaPreference("(prefers-reduced-transparency: reduce)");
  const systemHighContrast = useMediaPreference("(prefers-contrast: more)");
  const { setTheme, resolvedTheme } = useTheme();

  const effective = useMemo(
    () => ({
      reducedMotion: accessibility.reducedMotion ?? systemReducedMotion,
      reducedTransparency: accessibility.reducedTransparency ?? systemReducedTransparency,
      highContrast: accessibility.highContrast ?? systemHighContrast,
    }),
    [
      accessibility.highContrast,
      accessibility.reducedMotion,
      accessibility.reducedTransparency,
      systemHighContrast,
      systemReducedMotion,
      systemReducedTransparency,
    ],
  );

  const resolved = useMemo(
    () =>
      resolveTheme(settings, {
        reducedMotion: effective.reducedMotion,
        reducedTransparency: effective.reducedTransparency,
        highContrast: effective.highContrast,
      }),
    [settings, effective],
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    for (const [name, value] of Object.entries(resolved.variables)) {
      root.style.setProperty(name, value);
    }
    root.dataset["sasTransparency"] = resolved.opaquePanels ? "off" : "on";
    root.dataset["sasMotion"] = effective.reducedMotion ? "reduced" : settings.motion;
    root.dataset["sasContrast"] = effective.highContrast ? "high" : "normal";
    root.dataset["sasAppearance"] = resolved.light ? "light" : "dark";
    // Marks the document so the inherited-token bridge applies globally. Base UI
    // portals menus, dialogs, and popovers at the body, outside the shell's DOM
    // subtree — without this they would keep the inherited palette and read as
    // borrowed chrome inside a Stillspace workspace.
    root.dataset["sasShellMounted"] = "true";
    return () => {
      delete root.dataset["sasShellMounted"];
    };
  }, [effective.highContrast, effective.reducedMotion, resolved, settings.motion]);

  // Keep the inherited engine's variant aligned so a chat bubble, diff gutter,
  // or settings pane never renders light chrome inside a Nightfall workspace.
  useEffect(() => {
    const desired = resolved.light ? "light" : "dark";
    if (resolvedTheme !== desired) setTheme(desired);
  }, [resolved.light, resolvedTheme, setTheme]);

  return { ...resolved, accessibility, effective };
}
