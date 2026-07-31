// FILE: sascode/workbench/WorkbenchActivityStrip.tsx
// Purpose: A quiet bar floating at the foot of the workbench recording what the
//          session just did, so the user can look away from the preview and
//          still know.
// Layer: Presentation.
//
// One row, three items, timestamped. It is not a log viewer and must never grow
// into one: the full history lives behind the Agents mode and the session's own
// record. It floats over the work surface rather than taking a band from it,
// because the preview is the thing worth the pixels.

import { memo } from "react";
import { IconAlertTriangle, IconCheck, IconPointFilled, IconTool } from "@tabler/icons-react";

export interface WorkbenchActivityItem {
  id: string;
  /** Wall-clock label, already formatted for the user's locale. */
  time: string;
  text: string;
  tone: "info" | "tool" | "approval" | "error";
}

const TONE_ICON = {
  info: IconPointFilled,
  tool: IconTool,
  approval: IconCheck,
  error: IconAlertTriangle,
} as const;

const TONE_INK: Record<WorkbenchActivityItem["tone"], string> = {
  info: "var(--sas-live)",
  tool: "var(--sas-text-muted)",
  approval: "var(--sas-live)",
  error: "var(--sas-blocked)",
};

export const WorkbenchActivityStrip = memo(function WorkbenchActivityStrip(props: {
  items: ReadonlyArray<WorkbenchActivityItem>;
}) {
  return (
    <footer
      className="sas-glass sas-rim pointer-events-auto absolute inset-x-4 bottom-8 z-10 flex items-center overflow-hidden"
      style={{ borderRadius: "var(--sas-radius-md)" }}
      aria-label="Recent session activity"
    >
      {props.items.slice(0, 3).map((item, index) => {
        const Icon = TONE_ICON[item.tone];
        return (
          <div
            key={item.id}
            className="flex min-w-0 flex-1 items-center gap-2 px-3.5 py-[7px]"
            style={index === 0 ? undefined : { borderInlineStart: "1px solid var(--sas-line)" }}
          >
            <Icon
              size={item.tone === "info" ? 11 : 13}
              stroke={1.8}
              aria-hidden="true"
              className="shrink-0"
              style={{ color: TONE_INK[item.tone] }}
            />
            <span className="truncate text-[12px]" style={{ color: "var(--sas-text)" }}>
              {item.text}
            </span>
            <span
              className="sas-numeric ms-auto shrink-0 text-[11px] tabular-nums"
              style={{ color: "var(--sas-text-muted)" }}
            >
              {item.time}
            </span>
          </div>
        );
      })}
    </footer>
  );
});
