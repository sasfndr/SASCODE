// FILE: sascode/editspace/EditSpaceLayer.tsx
// Purpose: Edit Space — the mode where every module can be moved, resized,
//          docked, layered, added, removed, and recovered.
// Layer: Shell.
//
// Two things this must never do: lose the user's unsaved arrangement when a
// save loses a race, and leave the workspace in a state with no way back.
// Hence the explicit conflict choice and the always-present recovery controls.

import { useCallback, useMemo, useRef, useState } from "react";
import type {
  ProjectId,
  SascodePermissionCapability,
  SascodeThemeSettings,
} from "@synara/contracts";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";

import { AppearanceDrawer } from "./AppearanceDrawer";
import { ModuleFrame } from "./ModuleFrame";
import { ModuleLibrary } from "./ModuleLibrary";
import { ModuleContent } from "../modules/ModuleContent";
import { MODULE_DEFINITIONS, type SascodeModuleType } from "../modules/moduleRegistry";
import { bringToFront, findFreePlacement } from "../layout/layoutGeometry";
import type { ProjectLayoutController } from "../layout/useProjectLayout";
import { projectSnapshotQueryOptions } from "../queries/sascodeQueries";
import type { StillspaceAccessibility } from "../theme/useStillspaceTheme";

export interface EditSpaceLayerProps {
  controller: ProjectLayoutController;
  editing: boolean;
  appearanceOpen: boolean;
  accessibility: StillspaceAccessibility;
  effective: { reducedMotion: boolean; reducedTransparency: boolean; highContrast: boolean };
  onCloseAppearance: () => void;
  onExit: () => void;
  onEnterEditing: () => void;
  projectSnapshotProjectId: ProjectId | null;
  onInteractionChange: (busy: boolean) => void;
}

const SAVE_STATUS_LABEL: Record<string, string> = {
  idle: "All changes saved",
  saving: "Saving…",
  saved: "Saved",
  conflict: "Another window changed this layout",
  error: "Could not save",
};

export function EditSpaceLayer(props: EditSpaceLayerProps) {
  const { controller } = props;
  const { layout } = controller;
  const queryClient = useQueryClient();
  const snapshot = useQuery(projectSnapshotQueryOptions(props.projectSnapshotProjectId));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const canvasElement = useRef<HTMLDivElement | null>(null);

  const grantedCapabilities = useMemo(() => {
    const granted = new Set<SascodePermissionCapability>();
    for (const grant of snapshot.data?.activePermissionGrants ?? []) {
      for (const capability of grant.capabilities) granted.add(capability);
    }
    return granted;
  }, [snapshot.data]);

  const placedTypes = useMemo(
    () => new Set(layout.modules.map((placement) => placement.moduleType)),
    [layout.modules],
  );

  const handleThemeChange = useCallback(
    (patch: Partial<SascodeThemeSettings>, immediate?: boolean) => {
      controller.update((current) => ({ ...current, theme: { ...current.theme, ...patch } }), {
        persist: immediate ? "now" : "idle",
      });
    },
    [controller],
  );

  const addModule = useCallback(
    (type: SascodeModuleType) => {
      const definition = MODULE_DEFINITIONS[type];
      controller.update(
        (current) => {
          const rect = findFreePlacement(definition.defaultRect, current.modules);
          return {
            ...current,
            modules: [
              ...current.modules,
              {
                id: type,
                moduleType: type,
                moduleInstanceId: null,
                ...rect,
                dock: "floating" as const,
                zIndex: current.modules.length + 1,
                hiddenWhenInactive: false,
                permissionScope: [...definition.requiredPermissions],
                configuration: {},
              },
            ],
          };
        },
        { persist: "now" },
      );
      setSelectedId(type);
    },
    [controller],
  );

  const removeModule = useCallback(
    (id: string) => {
      controller.update(
        (current) => ({
          ...current,
          modules: current.modules.filter((placement) => placement.id !== id),
        }),
        { persist: "now" },
      );
      setSelectedId((current) => (current === id ? null : current));
    },
    [controller],
  );

  const drawer = props.appearanceOpen ? (
    <AppearanceDrawer
      layout={layout}
      onThemeChange={handleThemeChange}
      onLayoutModeChange={(layoutMode) =>
        controller.update((current) => ({ ...current, layoutMode }), { persist: "now" })
      }
      onPresetChange={(presetKey) =>
        controller.update((current) => ({ ...current, presetKey }), { persist: "now" })
      }
      onToggleSnapToGrid={(snapToGrid) =>
        controller.update((current) => ({ ...current, snapToGrid }), { persist: "now" })
      }
      onToggleHideInactive={(hideInactiveModules) =>
        controller.update((current) => ({ ...current, hideInactiveModules }), { persist: "now" })
      }
      accessibility={props.accessibility}
      effective={props.effective}
      editing={props.editing}
      onToggleEditing={props.editing ? props.onExit : props.onEnterEditing}
      onReset={controller.reset}
      onRecoverModules={controller.recoverModules}
      onClose={props.onCloseAppearance}
      onDone={props.onExit}
      saveStatus={
        controller.error ?? SAVE_STATUS_LABEL[controller.status] ?? SAVE_STATUS_LABEL["idle"]!
      }
    />
  ) : null;

  return (
    <>
      {props.editing ? (
        <div
          className="absolute inset-0 z-30 flex"
          style={{ backgroundColor: "color-mix(in srgb, var(--sas-scrim) 55%, transparent)" }}
        >
          <div ref={canvasElement} className="relative min-w-0 flex-1">
            <div className="sas-edit-grid" aria-hidden="true" />

            <p
              className="absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-full px-3 py-1 text-[11px]"
              style={{
                color: "var(--sas-text-on-canvas-secondary)",
                backgroundColor: "var(--sas-glass-quiet)",
              }}
            >
              Drag to move · Drag edges to resize · Arrows move · Shift+arrows resize · Alt+arrows
              dock
            </p>

            {layout.modules.map((placement) => (
              <ModuleFrame
                key={placement.id}
                placement={placement}
                selected={selectedId === placement.id}
                snapToGridEnabled={layout.snapToGrid}
                containerRef={canvasElement}
                onSelect={() => {
                  setSelectedId(placement.id);
                  controller.update(
                    (current) => ({
                      ...current,
                      modules: [...bringToFront(current.modules, placement.id)],
                    }),
                    { persist: "idle" },
                  );
                }}
                onGeometryChange={(rect, options) =>
                  controller.update(
                    (current) => ({
                      ...current,
                      modules: current.modules.map((entry) =>
                        entry.id === placement.id
                          ? { ...entry, ...rect, dock: "floating" as const }
                          : entry,
                      ),
                    }),
                    { persist: options.commit ? "now" : "never" },
                  )
                }
                onDockChange={(dock) =>
                  controller.update(
                    (current) => ({
                      ...current,
                      modules: current.modules.map((entry) =>
                        entry.id === placement.id ? { ...entry, dock } : entry,
                      ),
                    }),
                    { persist: "now" },
                  )
                }
                onRemove={() => removeModule(placement.id)}
                onInteractionChange={props.onInteractionChange}
              >
                <ModuleContent
                  placement={placement}
                  visible
                  projectId={props.projectSnapshotProjectId}
                  onConfigure={(patch) =>
                    controller.update(
                      (current) => ({
                        ...current,
                        modules: current.modules.map((entry) =>
                          entry.id === placement.id
                            ? { ...entry, configuration: { ...entry.configuration, ...patch } }
                            : entry,
                        ),
                      }),
                      { persist: "idle" },
                    )
                  }
                />
              </ModuleFrame>
            ))}

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
              <ModuleLibrary
                placedTypes={placedTypes}
                grantedCapabilities={grantedCapabilities}
                onAdd={addModule}
                onRemove={(type) => removeModule(type)}
              />
            </div>
          </div>

          {drawer}
        </div>
      ) : drawer ? (
        <div className="absolute inset-y-0 right-0 z-30 flex p-3">{drawer}</div>
      ) : null}

      {controller.conflict ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Layout conflict"
          className="absolute inset-0 z-50 flex items-center justify-center p-6"
          style={{ backgroundColor: "var(--sas-scrim)" }}
        >
          <div className="sas-glass sas-rim w-[min(420px,92vw)] p-5">
            <h2 className="text-[14px] font-medium" style={{ color: "var(--sas-text)" }}>
              This layout changed somewhere else
            </h2>
            <p
              className="mt-1.5 text-[12px] leading-relaxed"
              style={{ color: "var(--sas-text-secondary)" }}
            >
              Another window saved a newer arrangement. Your unsaved changes are still here — choose
              which one wins. Keeping yours reapplies your geometry on top of the newer revision.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => void controller.keepLocalEdits()}
                className="sas-transition sas-focusable flex-1 rounded-[var(--sas-radius-sm)] py-2 text-[12.5px] font-medium"
                style={{ backgroundColor: "var(--sas-accent)", color: "var(--sas-text-on-accent)" }}
              >
                Keep my changes
              </button>
              <button
                type="button"
                onClick={() => {
                  controller.takeRemote();
                  void queryClient.invalidateQueries({ queryKey: ["sascode", "layout"] });
                }}
                className="sas-transition sas-focusable flex-1 rounded-[var(--sas-radius-sm)] py-2 text-[12.5px]"
                style={{
                  backgroundColor: "var(--sas-surface-raised)",
                  color: "var(--sas-text)",
                  border: "1px solid var(--sas-line-strong)",
                }}
              >
                Use the newer one
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
