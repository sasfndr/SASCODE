// FILE: sascode/editspace/ModuleLibrary.tsx
// Purpose: The temporary module library shown while Edit Space is open.
// Layer: Presentation.
//
// This is a catalogue of what this build ships, not a marketplace. Every entry
// is a built-in module; nothing here implies discovery, publishing, or payment.

import type { SascodePermissionCapability } from "@synara/contracts";
import {
  IconBrowser,
  IconClock,
  IconEye,
  IconFileDiff,
  IconFolder,
  IconLayoutList,
  IconMessage,
  IconMovie,
  IconMusic,
  IconNote,
  IconRoute,
  IconShieldCheck,
  IconTerminal2,
} from "@tabler/icons-react";

import {
  MODULE_LIBRARY_ORDER,
  MODULE_DEFINITIONS,
  type SascodeModuleType,
} from "../modules/moduleRegistry";

const ICONS: Record<SascodeModuleType, React.ReactNode> = {
  "agent-chat": <IconMessage size={17} stroke={1.5} />,
  "session-surface": <IconLayoutList size={17} stroke={1.5} />,
  "session-shelf": <IconLayoutList size={17} stroke={1.5} />,
  files: <IconFolder size={17} stroke={1.5} />,
  terminal: <IconTerminal2 size={17} stroke={1.5} />,
  diff: <IconFileDiff size={17} stroke={1.5} />,
  browser: <IconBrowser size={17} stroke={1.5} />,
  preview: <IconEye size={17} stroke={1.5} />,
  notes: <IconNote size={17} stroke={1.5} />,
  timer: <IconClock size={17} stroke={1.5} />,
  music: <IconMusic size={17} stroke={1.5} />,
  video: <IconMovie size={17} stroke={1.5} />,
  "provider-usage": <IconRoute size={17} stroke={1.5} />,
  "context-evidence": <IconShieldCheck size={17} stroke={1.5} />,
};

export interface ModuleLibraryProps {
  placedTypes: ReadonlySet<string>;
  /** Capabilities the project's active grant actually holds. */
  grantedCapabilities: ReadonlySet<SascodePermissionCapability>;
  onAdd: (type: SascodeModuleType) => void;
  onRemove: (type: SascodeModuleType) => void;
}

export function ModuleLibrary({
  placedTypes,
  grantedCapabilities,
  onAdd,
  onRemove,
}: ModuleLibraryProps) {
  return (
    <section
      aria-label="Module library"
      data-sas-gesture-opaque="true"
      className="sas-glass sas-rim pointer-events-auto p-3"
    >
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[12px] font-medium" style={{ color: "var(--sas-text)" }}>
          Module library
        </h3>
        <span className="text-[10.5px]" style={{ color: "var(--sas-text-muted)" }}>
          Modules run in isolated permission scopes
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {MODULE_LIBRARY_ORDER.map((type) => {
          const definition = MODULE_DEFINITIONS[type];
          const placed = placedTypes.has(type);
          const missing = definition.requiredPermissions.filter(
            (capability) => !grantedCapabilities.has(capability),
          );
          const blocked = missing.length > 0;

          return (
            <button
              key={type}
              type="button"
              onClick={() => (placed ? onRemove(type) : onAdd(type))}
              disabled={blocked && !placed}
              aria-pressed={placed}
              title={
                blocked
                  ? `Needs ${missing.join(", ")}`
                  : `${definition.title} — ${definition.description}`
              }
              className="sas-transition sas-focusable flex w-[86px] flex-col items-center gap-1.5 rounded-[var(--sas-radius-sm)] px-2 py-2.5 text-[10.5px] disabled:opacity-40"
              style={{
                backgroundColor: placed ? "var(--sas-accent-soft)" : "var(--sas-surface-sunken)",
                color: placed ? "var(--sas-accent-ink)" : "var(--sas-text-secondary)",
              }}
            >
              {ICONS[type]}
              <span className="truncate">{definition.title}</span>
              {blocked ? (
                <span className="text-[9px]" style={{ color: "var(--sas-attention-ink)" }}>
                  Needs permission
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
