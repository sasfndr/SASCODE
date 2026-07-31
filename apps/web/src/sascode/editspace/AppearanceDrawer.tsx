// FILE: sascode/editspace/AppearanceDrawer.tsx
// Purpose: The Appearance drawer — the continuous Daylight/Dusk/Nightfall
//          spectrum and every other environmental control.
// Layer: Presentation.
//
// The spectrum is one continuous number, not a dark-mode toggle. The three
// named stops are shortcuts onto that same number, so a workspace can rest
// anywhere between them and still be reproducible from the durable layout.

import { useCallback, useId } from "react";
import type { SascodeThemeSettings, SascodeWorkspaceLayout } from "@synara/contracts";
import { IconRotate2, IconX } from "@tabler/icons-react";

import { SPECTRUM_STOPS, nearestSpectrumStop } from "../theme/spectrum";
import {
  resetStillspaceAccessibility,
  setStillspaceAccessibility,
  type StillspaceAccessibility,
} from "../theme/useStillspaceTheme";

const AURA_PRESETS: ReadonlyArray<{ label: string; value: string }> = [
  { label: "Stillspace Dusk", value: "#7775F6" },
  { label: "Mineral", value: "#5B8CCB" },
  { label: "Moss", value: "#5BCB9A" },
  { label: "Amber", value: "#E3AF5F" },
  { label: "Clay", value: "#E57876" },
  { label: "Graphite", value: "#7E8590" },
];

export interface AppearanceDrawerProps {
  layout: SascodeWorkspaceLayout;
  onThemeChange: (patch: Partial<SascodeThemeSettings>, immediate?: boolean) => void;
  onLayoutModeChange: (mode: SascodeWorkspaceLayout["layoutMode"]) => void;
  onPresetChange: (presetKey: string) => void;
  onToggleSnapToGrid: (value: boolean) => void;
  onToggleHideInactive: (value: boolean) => void;
  accessibility: StillspaceAccessibility;
  effective: { reducedMotion: boolean; reducedTransparency: boolean; highContrast: boolean };
  onReset: () => void;
  onRecoverModules: () => void;
  onClose: () => void;
  onDone: () => void;
  saveStatus: string;
}

export function AppearanceDrawer(props: AppearanceDrawerProps) {
  const { theme } = props.layout;
  const spectrumId = useId();

  const setSpectrum = useCallback(
    (value: number) => props.onThemeChange({ spectrum: value }),
    [props],
  );

  return (
    <aside
      aria-label="Appearance"
      data-sas-gesture-opaque="true"
      className="sas-glass sas-rim sas-scroll pointer-events-auto flex h-full w-[300px] shrink-0 flex-col gap-5 p-4"
    >
      <div className="flex items-center">
        <h2 className="text-[13px] font-medium" style={{ color: "var(--sas-text)" }}>
          Appearance
        </h2>
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Close appearance"
          className="sas-transition sas-focusable ms-auto rounded p-1"
          style={{ color: "var(--sas-text-muted)" }}
        >
          <IconX size={15} stroke={1.7} />
        </button>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          {SPECTRUM_STOPS.map((stop) => (
            <button
              key={stop.key}
              type="button"
              onClick={() => props.onThemeChange({ spectrum: stop.value }, true)}
              className="sas-transition sas-focusable rounded px-1 text-[11px]"
              style={{
                color:
                  nearestSpectrumStop(theme.spectrum) === stop.key
                    ? "var(--sas-text)"
                    : "var(--sas-text-muted)",
                fontWeight: nearestSpectrumStop(theme.spectrum) === stop.key ? 500 : 400,
              }}
            >
              {stop.label}
            </button>
          ))}
        </div>
        <input
          id={spectrumId}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={theme.spectrum}
          onChange={(event) => setSpectrum(Number(event.target.value))}
          aria-label="Appearance spectrum from Daylight to Nightfall"
          aria-valuetext={`${Math.round(theme.spectrum * 100)} percent toward Nightfall`}
          className="theme-slider w-full"
          style={{
            background:
              "linear-gradient(90deg, #F4F5F7 0%, #7A8598 34%, #27303D 62%, #0D0F12 100%)",
          }}
        />
      </section>

      <Field label="Project aura">
        <div className="flex flex-wrap gap-1.5">
          {AURA_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => props.onThemeChange({ projectAura: preset.value }, true)}
              aria-label={preset.label}
              aria-pressed={theme.projectAura.toLowerCase() === preset.value.toLowerCase()}
              title={preset.label}
              className="sas-transition sas-focusable size-6 rounded-full"
              style={{
                backgroundColor: preset.value,
                outline:
                  theme.projectAura.toLowerCase() === preset.value.toLowerCase()
                    ? "2px solid var(--sas-text)"
                    : "1px solid var(--sas-line-strong)",
                outlineOffset: 2,
              }}
            />
          ))}
        </div>
      </Field>

      <Slider
        label="Glass opacity"
        value={theme.glassOpacity}
        min={0}
        max={1}
        step={0.01}
        format={(value) => `${Math.round(value * 100)}%`}
        onChange={(value) => props.onThemeChange({ glassOpacity: value })}
      />
      <Slider
        label="Contrast"
        value={theme.contrast}
        min={-30}
        max={30}
        step={1}
        format={(value) => (value > 0 ? `+${value}` : String(value))}
        onChange={(value) => props.onThemeChange({ contrast: value })}
      />
      <Slider
        label="Background dim"
        value={theme.backgroundDim}
        min={0}
        max={1}
        step={0.01}
        format={(value) => `${Math.round(value * 100)}%`}
        onChange={(value) => props.onThemeChange({ backgroundDim: value })}
      />
      <Slider
        label="Status intensity"
        value={theme.statusIntensity}
        min={0}
        max={1}
        step={0.01}
        format={(value) => (value < 0.34 ? "Low" : value < 0.67 ? "Medium" : "High")}
        onChange={(value) => props.onThemeChange({ statusIntensity: value })}
      />
      <Slider
        label="Corner radius"
        value={theme.cornerRadius}
        min={6}
        max={30}
        step={1}
        format={(value) => `${value}px`}
        onChange={(value) => props.onThemeChange({ cornerRadius: value })}
      />

      <Choice
        label="Interface density"
        value={theme.density}
        options={[
          { value: "compact", label: "Compact" },
          { value: "comfortable", label: "Comfortable" },
          { value: "spacious", label: "Spacious" },
        ]}
        onChange={(value) =>
          props.onThemeChange({ density: value as SascodeThemeSettings["density"] }, true)
        }
      />
      <Choice
        label="Motion"
        value={theme.motion}
        options={[
          { value: "reduced", label: "Reduced" },
          { value: "subtle", label: "Subtle" },
          { value: "expressive", label: "Expressive" },
        ]}
        onChange={(value) =>
          props.onThemeChange({ motion: value as SascodeThemeSettings["motion"] }, true)
        }
      />

      <Field label="Layout">
        <div className="grid grid-cols-3 gap-1.5">
          {(["freeform", "structured", "focus"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => props.onLayoutModeChange(mode)}
              aria-pressed={props.layout.layoutMode === mode}
              className="sas-transition sas-focusable rounded-[var(--sas-radius-xs)] px-2 py-1.5 text-[11px] capitalize"
              style={{
                backgroundColor:
                  props.layout.layoutMode === mode ? "var(--sas-accent-soft)" : "var(--sas-surface-sunken)",
                color:
                  props.layout.layoutMode === mode ? "var(--sas-accent-ink)" : "var(--sas-text-secondary)",
              }}
            >
              {mode}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Presets">
        <div className="grid grid-cols-3 gap-1.5">
          {["stillspace", "focus", "custom-1"].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => props.onPresetChange(preset)}
              aria-pressed={props.layout.presetKey === preset}
              className="sas-transition sas-focusable rounded-[var(--sas-radius-xs)] px-2 py-1.5 text-[11px] capitalize"
              style={{
                backgroundColor:
                  props.layout.presetKey === preset ? "var(--sas-accent-soft)" : "var(--sas-surface-sunken)",
                color:
                  props.layout.presetKey === preset ? "var(--sas-accent-ink)" : "var(--sas-text-secondary)",
              }}
            >
              {preset.replace("-", " ")}
            </button>
          ))}
        </div>
      </Field>

      <Toggle
        label="Snap to grid"
        checked={props.layout.snapToGrid}
        onChange={props.onToggleSnapToGrid}
      />
      <Toggle
        label="Hide modules when inactive"
        checked={props.layout.hideInactiveModules}
        onChange={props.onToggleHideInactive}
      />

      <section className="space-y-2">
        <h3 className="text-[11px] font-medium" style={{ color: "var(--sas-text-secondary)" }}>
          Accessibility
        </h3>
        <TriToggle
          label="Reduced motion"
          value={props.accessibility.reducedMotion}
          effective={props.effective.reducedMotion}
          onChange={(reducedMotion) => setStillspaceAccessibility({ reducedMotion })}
        />
        <TriToggle
          label="Reduced transparency"
          value={props.accessibility.reducedTransparency}
          effective={props.effective.reducedTransparency}
          onChange={(reducedTransparency) => setStillspaceAccessibility({ reducedTransparency })}
        />
        <TriToggle
          label="High contrast"
          value={props.accessibility.highContrast}
          effective={props.effective.highContrast}
          onChange={(highContrast) => setStillspaceAccessibility({ highContrast })}
        />
        <button
          type="button"
          onClick={resetStillspaceAccessibility}
          className="sas-focusable text-[11px] underline underline-offset-2"
          style={{ color: "var(--sas-text-muted)" }}
        >
          Follow system for all
        </button>
      </section>

      {/* Recovery is always reachable: customisation must never be able to make
          the workspace unusable without a way back. */}
      <section className="mt-auto space-y-2 pt-2" style={{ borderTop: "1px solid var(--sas-line)" }}>
        <div className="flex gap-1.5">
          <SecondaryButton onClick={props.onRecoverModules}>Recover modules</SecondaryButton>
          <SecondaryButton onClick={props.onReset}>
            <IconRotate2 size={13} stroke={1.7} aria-hidden="true" />
            Reset layout
          </SecondaryButton>
        </div>
        <button
          type="button"
          onClick={props.onDone}
          className="sas-transition sas-focusable w-full rounded-[var(--sas-radius-sm)] py-2 text-[12.5px] font-medium"
          style={{ backgroundColor: "var(--sas-accent)", color: "var(--sas-text-on-accent)" }}
        >
          Done
        </button>
        <p className="text-center text-[10.5px]" style={{ color: "var(--sas-text-muted)" }}>
          {props.saveStatus}
        </p>
      </section>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-1.5 text-[11px]" style={{ color: "var(--sas-text-secondary)" }}>
        {label}
      </p>
      {children}
    </section>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <section>
      <div className="mb-1 flex items-center justify-between">
        <label htmlFor={id} className="text-[11px]" style={{ color: "var(--sas-text-secondary)" }}>
          {label}
        </label>
        <span className="sas-numeric text-[11px]" style={{ color: "var(--sas-text)" }}>
          {format(value)}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="theme-slider w-full"
      />
    </section>
  );
}

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="grid grid-cols-3 gap-1.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className="sas-transition sas-focusable rounded-[var(--sas-radius-xs)] px-2 py-1.5 text-[11px]"
            style={{
              backgroundColor:
                value === option.value ? "var(--sas-accent-soft)" : "var(--sas-surface-sunken)",
              color: value === option.value ? "var(--sas-accent-ink)" : "var(--sas-text-secondary)",
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="text-[11.5px]" style={{ color: "var(--sas-text-secondary)" }}>
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="sas-transition sas-focusable relative h-[18px] w-[32px] shrink-0 rounded-full"
        style={{ backgroundColor: checked ? "var(--sas-accent)" : "var(--sas-line-strong)" }}
      >
        <span
          className="sas-transition absolute top-[2px] size-[14px] rounded-full"
          style={{
            left: checked ? 16 : 2,
            backgroundColor: "var(--sas-surface-raised)",
          }}
        />
      </button>
    </label>
  );
}

/** Three-state control: follow the system, force on, or force off. */
function TriToggle({
  label,
  value,
  effective,
  onChange,
}: {
  label: string;
  value: boolean | null;
  effective: boolean;
  onChange: (value: boolean | null) => void;
}) {
  const options: ReadonlyArray<{ value: boolean | null; label: string }> = [
    { value: null, label: "Auto" },
    { value: true, label: "On" },
    { value: false, label: "Off" },
  ];
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11.5px]" style={{ color: "var(--sas-text-secondary)" }}>
        {label}
        {value === null ? (
          <span style={{ color: "var(--sas-text-muted)" }}> · {effective ? "on" : "off"}</span>
        ) : null}
      </span>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex shrink-0 items-center gap-0.5 rounded-full p-0.5"
        style={{ backgroundColor: "var(--sas-surface-sunken)" }}
      >
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className="sas-transition sas-focusable rounded-full px-2 py-[2px] text-[10px]"
            style={{
              backgroundColor:
                value === option.value ? "var(--sas-surface-raised)" : "transparent",
              color: value === option.value ? "var(--sas-text)" : "var(--sas-text-muted)",
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SecondaryButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="sas-transition sas-focusable flex flex-1 items-center justify-center gap-1.5 rounded-[var(--sas-radius-xs)] px-2 py-1.5 text-[11px]"
      style={{
        backgroundColor: "var(--sas-surface-sunken)",
        color: "var(--sas-text-secondary)",
      }}
    >
      {children}
    </button>
  );
}
