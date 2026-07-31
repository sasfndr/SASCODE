// FILE: sascode/project-space/ContextLensRail.tsx
// Purpose: The context lens — a compact tool selector attached to the workbench
//          edge, showing what the centre can become.
// Layer: Presentation.
//
// This is not a permanent navigation rail and not a second panel system. It
// selects the workbench's mode, exactly as the header switcher does, so the two
// controls are always describing the same surface. Only the active lens shows
// its label; the rest stay as icons, which is what keeps a five-item rail from
// reading as a sidebar.

import {
  IconEye,
  IconFileDiff,
  IconFolder,
  IconRoute,
  IconTerminal2,
} from "@tabler/icons-react";

import { WORKBENCH_MODE_LABEL, WORKBENCH_MODES, type WorkbenchMode } from "../workbench/workbenchModes";

const LENS_ICON: Record<WorkbenchMode, typeof IconEye> = {
  preview: IconEye,
  changes: IconFileDiff,
  terminal: IconTerminal2,
  files: IconFolder,
  agents: IconRoute,
};

export interface ContextLensRailProps {
  /** Null when nothing is in the centre; the rail then renders nothing. */
  mode: WorkbenchMode | null;
  onSelect: (mode: WorkbenchMode) => void;
  orientation?: "horizontal" | "vertical";
}

export function ContextLensRail({ mode, onSelect, orientation = "vertical" }: ContextLensRailProps) {
  if (mode === null) return null;
  const vertical = orientation === "vertical";

  // Agents is reached from the workbench overflow, not the rail: five items make
  // a column tall enough to read as a navigation sidebar, which is the one thing
  // this shell must not grow.
  const items = WORKBENCH_MODES.filter((item) => item !== "agents");

  return (
    <div
      role="toolbar"
      aria-label="Context lens"
      aria-orientation={orientation}
      data-sas-gesture-opaque="true"
      className={`sas-glass sas-rim sas-transition pointer-events-auto flex w-[82px] overflow-hidden ${
        vertical ? "flex-col" : "flex-row"
      }`}
      style={{ borderRadius: "999px" }}
    >
      {items.map((item, index) => {
        const Icon = LENS_ICON[item];
        const active = mode === item;
        return (
          <button
            key={item}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(item)}
            title={WORKBENCH_MODE_LABEL[item]}
            className="sas-transition sas-focusable flex min-h-[48px] flex-col items-center justify-center gap-1 px-2 py-2"
            style={{
              color: active ? "var(--sas-text)" : "var(--sas-text-secondary)",
              ...(index > 0 ? { borderTop: "1px solid var(--sas-line)" } : {}),
            }}
          >
            <Icon size={18} stroke={active ? 2 : 1.6} aria-hidden="true" />
            {active ? (
              <span className="text-[11.5px] font-medium">{WORKBENCH_MODE_LABEL[item]}</span>
            ) : (
              <span className="sas-sr-only">{WORKBENCH_MODE_LABEL[item]}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
