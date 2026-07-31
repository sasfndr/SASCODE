// FILE: sascode/project-space/ContextLensRail.tsx
// Purpose: The context lens — a compact, temporary tool selector that drives the
//          session's existing right dock rather than adding a second panel system.
// Layer: Shell adapter.
//
// This is not a permanent navigation rail. It shows the tools that make sense
// for the focused session, opens them as a temporary layer, and lets the same
// press close them again. Every tool it opens is an inherited, fully working
// panel — the lens only decides what is on screen.

import { useCallback } from "react";
import type { ThreadId } from "@synara/contracts";
import {
  IconBrowser,
  IconEye,
  IconFileDiff,
  IconFolder,
  IconRoute,
  IconTerminal2,
} from "@tabler/icons-react";

import { useRightDockStore, selectRightDockState } from "~/rightDockStore";
import type { ContextLensKind } from "../state/workspaceUiStore";

interface LensItem {
  kind: ContextLensKind;
  label: string;
  icon: React.ReactNode;
  /** Right-dock pane this lens opens, when it maps to one. */
  pane: "browser" | "diff" | "terminal" | "explorer" | null;
}

const LENSES: ReadonlyArray<LensItem> = [
  { kind: "preview", label: "Preview", icon: <IconEye size={15} stroke={1.6} />, pane: "browser" },
  {
    kind: "changes",
    label: "Changes",
    icon: <IconFileDiff size={15} stroke={1.6} />,
    pane: "diff",
  },
  {
    kind: "terminal",
    label: "Terminal",
    icon: <IconTerminal2 size={15} stroke={1.6} />,
    pane: "terminal",
  },
  { kind: "files", label: "Files", icon: <IconFolder size={15} stroke={1.6} />, pane: "explorer" },
  {
    kind: "browser",
    label: "Browser",
    icon: <IconBrowser size={15} stroke={1.6} />,
    pane: "browser",
  },
  { kind: "agents", label: "Agents", icon: <IconRoute size={15} stroke={1.6} />, pane: null },
];

export interface ContextLensRailProps {
  threadId: ThreadId | null;
  active: ContextLensKind | null;
  onSelect: (lens: ContextLensKind | null) => void;
  /** Horizontal reads as tabs above a surface; vertical as an edge rail. */
  orientation?: "horizontal" | "vertical";
}

export function ContextLensRail({
  threadId,
  active,
  onSelect,
  orientation = "horizontal",
}: ContextLensRailProps) {
  const toggleSingletonPane = useRightDockStore((state) => state.toggleSingletonPane);
  const dockState = useRightDockStore((state) =>
    threadId ? selectRightDockState(threadId)(state) : null,
  );
  const activePaneKind =
    dockState?.open === true
      ? (dockState.panes.find((pane) => pane.id === dockState.activePaneId)?.kind ?? null)
      : null;

  const handleSelect = useCallback(
    (item: LensItem) => {
      const next = active === item.kind ? null : item.kind;
      onSelect(next);
      // Panes that map onto the inherited dock are opened there, so the lens
      // never becomes a competing implementation of Diff, Terminal, or Browser.
      if (threadId && item.pane) {
        toggleSingletonPane(threadId, { kind: item.pane });
      }
    },
    [active, onSelect, threadId, toggleSingletonPane],
  );

  const vertical = orientation === "vertical";

  return (
    <div
      role="toolbar"
      aria-label="Context lens"
      aria-orientation={orientation}
      data-sas-gesture-opaque="true"
      className={`sas-glass-quiet sas-transition pointer-events-auto flex gap-0.5 p-1 ${
        vertical ? "flex-col" : "flex-row"
      }`}
    >
      {LENSES.map((item) => {
        const isActive =
          active === item.kind || (item.pane !== null && activePaneKind === item.pane);
        return (
          <button
            key={item.kind}
            type="button"
            aria-pressed={isActive}
            onClick={() => handleSelect(item)}
            title={item.label}
            className="sas-transition sas-focusable flex items-center gap-1.5 rounded-[var(--sas-radius-xs)] px-2.5 py-1.5 text-[11.5px]"
            style={{
              backgroundColor: isActive ? "var(--sas-surface-raised)" : "transparent",
              color: isActive ? "var(--sas-text)" : "var(--sas-text-secondary)",
            }}
          >
            {item.icon}
            {vertical ? (
              <span className="sas-sr-only">{item.label}</span>
            ) : (
              <span className="hidden lg:inline">{item.label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
