// FILE: sascode/workbench/WorkbenchModeSwitcher.tsx
// Purpose: The compact mode control attached to the workbench header.
// Layer: Presentation.
//
// Deliberately subordinate to the preview it sits above: the active mode gets a
// filled pill and an icon, the rest are quiet text. Agents lives behind the
// overflow because it is a reading surface, not something to flick between.

import { useState } from "react";
import {
  IconDots,
  IconEye,
  IconFileDiff,
  IconFolder,
  IconRoute,
  IconTerminal2,
} from "@tabler/icons-react";

import { Menu, MenuItem, MenuPopupBase, MenuTrigger } from "~/components/ui/menu";
import { WORKBENCH_MODE_LABEL, type WorkbenchMode } from "./workbenchModes";

const MODE_ICON: Record<WorkbenchMode, typeof IconEye> = {
  preview: IconEye,
  changes: IconFileDiff,
  terminal: IconTerminal2,
  files: IconFolder,
  agents: IconRoute,
};

/** Shown inline; `agents` stays in the overflow so the strip cannot crowd the title. */
const INLINE_MODES: ReadonlyArray<WorkbenchMode> = ["preview", "changes", "terminal", "files"];
const OVERFLOW_MODES: ReadonlyArray<WorkbenchMode> = ["agents"];

export interface WorkbenchModeSwitcherProps {
  mode: WorkbenchMode;
  onModeChange: (mode: WorkbenchMode) => void;
}

export function WorkbenchModeSwitcher(props: WorkbenchModeSwitcherProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const overflowActive = OVERFLOW_MODES.includes(props.mode);

  return (
    <div className="flex items-center gap-1">
      <div
        role="radiogroup"
        aria-label="Workbench mode"
        className="sas-glass sas-rim flex items-center p-[3px]"
        style={{ borderRadius: "999px" }}
      >
        {INLINE_MODES.map((mode, index) => {
          const Icon = MODE_ICON[mode];
          const active = props.mode === mode;
          // A hairline between inactive items, never against the active pill —
          // a divider touching the pill would read as a seam in the control.
          const divided = index > 0 && !active && props.mode !== INLINE_MODES[index - 1];
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => props.onModeChange(mode)}
              className="sas-transition sas-focusable flex items-center gap-2 rounded-full px-4 py-[7px] text-[12.5px]"
              style={{
                backgroundColor: active ? "var(--sas-surface-raised)" : "transparent",
                color: active ? "var(--sas-text)" : "var(--sas-text-secondary)",
                border: active ? "1px solid var(--sas-line-strong)" : "1px solid transparent",
                boxShadow: divided ? "-1px 0 0 -0.5px var(--sas-line)" : undefined,
              }}
            >
              <Icon size={15} stroke={1.7} aria-hidden="true" />
              {WORKBENCH_MODE_LABEL[mode]}
            </button>
          );
        })}
      </div>

      <Menu open={menuOpen} onOpenChange={setMenuOpen}>
        <MenuTrigger
          aria-label="More workbench modes"
          className="sas-transition sas-focusable flex size-[32px] items-center justify-center rounded-full"
          style={{
            backgroundColor: overflowActive ? "var(--sas-surface-raised)" : "transparent",
            color: overflowActive ? "var(--sas-text)" : "var(--sas-text-on-canvas-secondary)",
          }}
        >
          <IconDots size={18} stroke={1.9} />
        </MenuTrigger>
        <MenuPopupBase align="end" sideOffset={6} className="min-w-[150px]">
          {OVERFLOW_MODES.map((mode) => {
            const Icon = MODE_ICON[mode];
            return (
              <MenuItem
                key={mode}
                onClick={() => props.onModeChange(mode)}
                className="flex items-center gap-2 text-[11.5px]"
              >
                <Icon size={14} stroke={1.6} aria-hidden="true" />
                {WORKBENCH_MODE_LABEL[mode]}
              </MenuItem>
            );
          })}
        </MenuPopupBase>
      </Menu>
    </div>
  );
}
