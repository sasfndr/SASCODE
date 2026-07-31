// FILE: sascode/shell/AmbientFrame.tsx
// Purpose: The one persistent strip of chrome. Identity, position, attention,
//          and the two triggers that reveal everything else.
// Layer: Shell.
//
// The design rule this file exists to honour: the frame must be nearly
// invisible during focus. There is no toolbar of equal-weight buttons — only
// what stays globally useful, and status that reads without being read.

import { useMemo } from "react";
import type { ProjectId } from "@synara/contracts";
import {
  IconLayoutGrid,
  IconSearch,
  IconSparkles,
  IconAdjustmentsHorizontal,
} from "@tabler/icons-react";

import { cn } from "~/lib/utils";
import {
  useDesktopTopBarTrafficLightGutterClassName,
  useDesktopTopBarWindowControlsGutterClassName,
} from "~/hooks/useDesktopTopBarGutter";
import { SascodeLockup } from "../brand/SascodeMark";
import type { WorkspaceAttentionPresentation } from "../attention/attentionPresentation";
import type { Project } from "~/types";

export interface AmbientFrameProps {
  projects: ReadonlyArray<Project>;
  activeIndex: number;
  activeProject: Project | null;
  /** Title of the session currently in focus, when there is one. */
  activeSessionTitle: string | null;
  attention: WorkspaceAttentionPresentation;
  connection: { live: boolean; repairing: boolean; error: string | null };
  editSpaceActive: boolean;
  onOpenOverview: () => void;
  onOpenCommand: () => void;
  onToggleAppearance: () => void;
  onToggleEditSpace: () => void;
  onSelectProject: (index: number) => void;
  onFocusAttention: (projectId: ProjectId) => void;
}

function ConnectionDot({
  connection,
}: {
  connection: AmbientFrameProps["connection"];
}) {
  const { label, tone } = connection.error
    ? { label: "Reconnecting", tone: "var(--sas-blocked)" }
    : connection.repairing
      ? { label: "Catching up", tone: "var(--sas-attention)" }
      : connection.live
        ? { label: "Connected", tone: "var(--sas-live)" }
        : { label: "Connecting", tone: "var(--sas-resting)" };

  return (
    <span className="flex items-center gap-1.5" title={label}>
      <span
        aria-hidden="true"
        className="size-[6px] rounded-full"
        style={{ backgroundColor: tone }}
      />
      <span className="sas-sr-only">{label}</span>
    </span>
  );
}

/**
 * Position among the project spaces. Reads as ambient punctuation rather than a
 * control, but every dot is still a real button so the whole thing is reachable
 * without a trackpad.
 */
function SpacePosition({
  projects,
  activeIndex,
  attention,
  onSelectProject,
}: Pick<AmbientFrameProps, "projects" | "activeIndex" | "attention" | "onSelectProject">) {
  if (projects.length <= 1) return null;
  return (
    <div
      className="flex items-center gap-[7px]"
      role="tablist"
      aria-label="Project spaces"
    >
      {projects.map((project, index) => {
        const presentation = attention.byProject.get(project.id);
        const active = index === activeIndex;
        return (
          <button
            key={project.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`${project.name}${presentation?.wantsAttention ? ", needs attention" : ""}`}
            onClick={() => onSelectProject(index)}
            className="sas-transition group relative flex size-3 items-center justify-center rounded-full"
          >
            <span
              className="sas-transition rounded-full"
              style={{
                width: active ? 7 : 5,
                height: active ? 7 : 5,
                backgroundColor: presentation?.wantsAttention
                  ? "var(--sas-attention)"
                  : active
                    ? "var(--sas-text-on-canvas)"
                    : "var(--sas-text-muted)",
                opacity: active ? 0.92 : 0.5,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

export function AmbientFrame(props: AmbientFrameProps) {
  const trafficLightGutter = useDesktopTopBarTrafficLightGutterClassName();
  const windowControlsGutter = useDesktopTopBarWindowControlsGutterClassName();

  const decisions = props.attention.totalActionable;
  const failures = props.attention.totalFailed;

  const attentionLabel = useMemo(() => {
    if (failures > 0) return failures === 1 ? "1 failure" : `${failures} failures`;
    if (decisions > 0) return decisions === 1 ? "1 decision" : `${decisions} decisions`;
    return null;
  }, [decisions, failures]);

  return (
    <header
      className={cn(
        "drag-region relative z-30 flex h-11 shrink-0 items-center gap-3 px-4 text-[12px]",
        // The SASCODE shell renders no left sidebar, so this strip always owns
        // the macOS traffic-light gutter and the Windows caption gutter.
        trafficLightGutter,
        windowControlsGutter,
      )}
      style={{ color: "var(--sas-text-on-canvas-secondary)" }}
    >
      <SascodeLockup />

      {props.activeProject ? (
        <>
          <span aria-hidden="true" style={{ opacity: 0.32 }}>
            |
          </span>
          <span className="truncate" style={{ maxWidth: 220 }}>
            {props.activeProject.name}
          </span>
          {props.activeSessionTitle ? (
            <>
              <span aria-hidden="true" style={{ opacity: 0.32 }}>
                |
              </span>
              <span
                className="truncate font-medium"
                style={{ color: "var(--sas-text-on-canvas)", maxWidth: 260 }}
              >
                {props.activeSessionTitle}
              </span>
            </>
          ) : null}
        </>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 flex justify-center">
        <div className="pointer-events-auto">
          <SpacePosition
            projects={props.projects}
            activeIndex={props.activeIndex}
            attention={props.attention}
            onSelectProject={props.onSelectProject}
          />
        </div>
      </div>

      <div className="ms-auto flex items-center gap-1.5">
        {attentionLabel ? (
          <button
            type="button"
            onClick={() => {
              const first = props.attention.ranked[0];
              if (first) props.onFocusAttention(first.projectId);
            }}
            className="sas-transition sas-focusable flex items-center gap-1.5 rounded-full px-2.5 py-1"
            style={{
              backgroundColor: failures > 0 ? "var(--sas-blocked-soft)" : "var(--sas-attention-soft)",
              color: failures > 0 ? "var(--sas-blocked-ink)" : "var(--sas-attention-ink)",
            }}
          >
            <IconSparkles size={13} stroke={1.6} aria-hidden="true" />
            <span>{attentionLabel}</span>
          </button>
        ) : null}

        <FrameButton
          label="Search and commands"
          shortcut="⌘K"
          onClick={props.onOpenCommand}
          icon={<IconSearch size={15} stroke={1.6} />}
        />
        <FrameButton
          label="Project overview"
          shortcut="⌘⇧Space"
          onClick={props.onOpenOverview}
          icon={<IconLayoutGrid size={15} stroke={1.6} />}
        />
        <FrameButton
          label={props.editSpaceActive ? "Leave Edit Space" : "Appearance and Edit Space"}
          onClick={props.onToggleAppearance}
          onDoubleClick={props.onToggleEditSpace}
          active={props.editSpaceActive}
          icon={<IconAdjustmentsHorizontal size={15} stroke={1.6} />}
        />
        <ConnectionDot connection={props.connection} />
      </div>
    </header>
  );
}

function FrameButton({
  label,
  shortcut,
  icon,
  onClick,
  onDoubleClick,
  active,
}: {
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  onClick: () => void;
  onDoubleClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      aria-label={shortcut ? `${label} (${shortcut})` : label}
      title={shortcut ? `${label}  ${shortcut}` : label}
      className="sas-transition sas-focusable flex size-7 items-center justify-center rounded-[var(--sas-radius-xs)]"
      style={{
        color: active ? "var(--sas-accent-ink)" : "var(--sas-text-on-canvas-secondary)",
        backgroundColor: active ? "var(--sas-accent-soft)" : "transparent",
      }}
    >
      {icon}
    </button>
  );
}
