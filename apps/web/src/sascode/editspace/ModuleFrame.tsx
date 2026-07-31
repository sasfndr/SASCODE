// FILE: sascode/editspace/ModuleFrame.tsx
// Purpose: The movable, resizable chrome around a placed module in Edit Space.
// Layer: Presentation + interaction.
//
// Every pointer interaction here has a keyboard equivalent on the same element:
// arrows move, Shift+arrows resize, Alt+arrows dock, Delete removes. A module
// that can only be arranged with a mouse is treated as unfinished.

import { useCallback, useRef, useState } from "react";
import type { SascodeModuleDock, SascodeWorkspaceModulePlacement } from "@synara/contracts";
import { IconX } from "@tabler/icons-react";

import {
  clampRect,
  nudgeRect,
  resizeRect,
  resolveDockPreview,
  snapToGrid,
  toPercent,
  type Rect,
} from "../layout/layoutGeometry";
import { moduleDefinition } from "../modules/moduleRegistry";

type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export interface ModuleFrameProps {
  placement: SascodeWorkspaceModulePlacement;
  selected: boolean;
  snapToGridEnabled: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
  onSelect: () => void;
  onGeometryChange: (rect: Rect, options: { commit: boolean }) => void;
  onDockChange: (dock: SascodeModuleDock) => void;
  onRemove: () => void;
  onInteractionChange: (busy: boolean) => void;
  children: React.ReactNode;
}

const RESIZE_EDGES: ReadonlyArray<{ edge: ResizeEdge; style: React.CSSProperties }> = [
  { edge: "nw", style: { top: -5, left: -5, cursor: "nwse-resize" } },
  { edge: "ne", style: { top: -5, right: -5, cursor: "nesw-resize" } },
  { edge: "sw", style: { bottom: -5, left: -5, cursor: "nesw-resize" } },
  { edge: "se", style: { bottom: -5, right: -5, cursor: "nwse-resize" } },
  { edge: "n", style: { top: -5, left: "50%", marginLeft: -4, cursor: "ns-resize" } },
  { edge: "s", style: { bottom: -5, left: "50%", marginLeft: -4, cursor: "ns-resize" } },
  { edge: "w", style: { left: -5, top: "50%", marginTop: -4, cursor: "ew-resize" } },
  { edge: "e", style: { right: -5, top: "50%", marginTop: -4, cursor: "ew-resize" } },
];

export function ModuleFrame(props: ModuleFrameProps) {
  const definition = moduleDefinition(props.placement.moduleType);
  const [dockPreview, setDockPreview] = useState<SascodeModuleDock | null>(null);
  const originRef = useRef<{ rect: Rect; pointerX: number; pointerY: number } | null>(null);

  const currentRect = useCallback(
    (): Rect => ({
      x: props.placement.x,
      y: props.placement.y,
      width: props.placement.width,
      height: props.placement.height,
    }),
    [props.placement.height, props.placement.width, props.placement.x, props.placement.y],
  );

  const applyRect = useCallback(
    (rect: Rect, commit: boolean) => {
      const clamped = clampRect(props.snapToGridEnabled && commit ? snapToGrid(rect) : rect);
      props.onGeometryChange(clamped, { commit });
    },
    [props],
  );

  const beginPointerInteraction = useCallback(
    (
      event: React.PointerEvent,
      compute: (deltaXPercent: number, deltaYPercent: number, origin: Rect) => Rect,
      trackDock: boolean,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      props.onSelect();
      props.onInteractionChange(true);

      const container = props.containerRef.current;
      const bounds = container?.getBoundingClientRect();
      originRef.current = {
        rect: currentRect(),
        pointerX: event.clientX,
        pointerY: event.clientY,
      };

      const move = (moveEvent: PointerEvent) => {
        const origin = originRef.current;
        if (!origin || !bounds) return;
        const deltaX = ((moveEvent.clientX - origin.pointerX) / bounds.width) * 100;
        const deltaY = ((moveEvent.clientY - origin.pointerY) / bounds.height) * 100;
        const next = compute(deltaX, deltaY, origin.rect);
        applyRect(next, false);
        if (trackDock) setDockPreview(resolveDockPreview(clampRect(next))?.dock ?? null);
      };

      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        props.onInteractionChange(false);
        // Persistence happens once, here — never per animation frame.
        if (trackDock && dockPreview) {
          props.onDockChange(dockPreview);
        } else {
          applyRect(currentRect(), true);
        }
        setDockPreview(null);
        originRef.current = null;
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [applyRect, currentRect, dockPreview, props],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const directions = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
        ArrowDown: "down",
      } as const;
      const direction = directions[event.key as keyof typeof directions];

      if (direction) {
        event.preventDefault();
        if (event.altKey) {
          props.onDockChange(
            direction === "left"
              ? "left"
              : direction === "right"
                ? "right"
                : direction === "up"
                  ? "top"
                  : "bottom",
          );
          return;
        }
        const step = event.metaKey || event.ctrlKey ? 10 : 2;
        const next = event.shiftKey
          ? resizeRect(currentRect(), direction, step)
          : nudgeRect(currentRect(), direction, step);
        props.onGeometryChange(next, { commit: true });
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (definition?.removable) {
          event.preventDefault();
          props.onRemove();
        }
      }
    },
    [currentRect, definition?.removable, props],
  );

  return (
    <div
      role="group"
      aria-label={`${definition?.title ?? props.placement.moduleType} module`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerDown={props.onSelect}
      className="sas-glass sas-rim absolute flex flex-col overflow-hidden"
      style={{
        left: `${props.placement.x}%`,
        top: `${props.placement.y}%`,
        width: `${props.placement.width}%`,
        height: `${props.placement.height}%`,
        zIndex: props.placement.zIndex,
        outline: props.selected ? "1.5px solid var(--sas-accent)" : undefined,
        outlineOffset: 1,
      }}
    >
      <header
        onPointerDown={(event) =>
          beginPointerInteraction(
            event,
            (deltaX, deltaY, origin) => ({
              ...origin,
              x: origin.x + deltaX,
              y: origin.y + deltaY,
            }),
            true,
          )
        }
        className="flex shrink-0 cursor-grab items-center gap-2 px-3 py-2"
        style={{ borderBottom: "1px solid var(--sas-line)" }}
      >
        <span className="truncate text-[11.5px] font-medium" style={{ color: "var(--sas-text)" }}>
          {definition?.title ?? props.placement.moduleType}
        </span>
        {props.placement.dock && props.placement.dock !== "floating" ? (
          <span
            className="rounded-full px-1.5 py-[1px] text-[9.5px] capitalize"
            style={{ backgroundColor: "var(--sas-surface-sunken)", color: "var(--sas-text-muted)" }}
          >
            {props.placement.dock}
          </span>
        ) : null}
        {definition?.removable ? (
          <button
            type="button"
            onClick={props.onRemove}
            aria-label={`Remove ${definition.title}`}
            className="sas-transition sas-focusable ms-auto rounded p-0.5"
            style={{ color: "var(--sas-text-muted)" }}
          >
            <IconX size={13} stroke={1.7} />
          </button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1">{props.children}</div>

      {props.selected
        ? RESIZE_EDGES.map(({ edge, style }) => (
            <div
              key={edge}
              aria-hidden="true"
              className="sas-resize-handle"
              style={style}
              onPointerDown={(event) =>
                beginPointerInteraction(
                  event,
                  (deltaX, deltaY, origin) => {
                    let next = { ...origin };
                    if (edge.includes("e")) next = { ...next, width: origin.width + deltaX };
                    if (edge.includes("s")) next = { ...next, height: origin.height + deltaY };
                    if (edge.includes("w")) {
                      next = { ...next, x: origin.x + deltaX, width: origin.width - deltaX };
                    }
                    if (edge.includes("n")) {
                      next = { ...next, y: origin.y + deltaY, height: origin.height - deltaY };
                    }
                    return next;
                  },
                  false,
                )
              }
            />
          ))
        : null}

      {dockPreview ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: "var(--sas-accent-soft)" }}
        >
          <span
            className="rounded-full px-2.5 py-1 text-[11px] capitalize"
            style={{ backgroundColor: "var(--sas-surface-raised)", color: "var(--sas-text)" }}
          >
            Dock {dockPreview}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** Converts a pixel rect from a drop event into the durable percent space. */
export function rectFromPixels(
  pixels: { x: number; y: number; width: number; height: number },
  container: DOMRect,
): Rect {
  return clampRect(toPercent(pixels, { width: container.width, height: container.height }));
}
