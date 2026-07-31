// FILE: sascode/project-space/ProjectEmptyState.tsx
// Purpose: What a project space says before any work exists in it.
// Layer: Presentation.
//
// Two genuinely different states, not one generic blank slate: a project the
// backend has never bootstrapped needs a one-time setup, and a bootstrapped
// project with nothing running just needs a first request.

import { IconArrowRight, IconShieldLock } from "@tabler/icons-react";

export interface ProjectEmptyStateProps {
  projectName: string;
  needsBootstrap: boolean;
  onBootstrap: () => void;
  onStartFeature: () => void;
}

export function ProjectEmptyState({
  projectName,
  needsBootstrap,
  onBootstrap,
  onStartFeature,
}: ProjectEmptyStateProps) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-8">
      <div className="max-w-[440px] text-center">
        <h1
          className="text-[19px] font-medium tracking-[-0.01em]"
          style={{ color: "var(--sas-text-on-canvas)" }}
        >
          {needsBootstrap ? `Set up ${projectName}` : projectName}
        </h1>
        <p
          className="mt-2 text-[13px] leading-relaxed"
          style={{ color: "var(--sas-text-on-canvas-secondary)" }}
        >
          {needsBootstrap
            ? "SASCODE needs a routing policy and a permission boundary for this project before it can delegate work. This takes one step."
            : "Nothing is running here yet. Describe an outcome and SASCODE will plan it, choose the models, and open the sessions."}
        </p>

        {needsBootstrap ? (
          <>
            <button
              type="button"
              onClick={onBootstrap}
              className="sas-transition sas-focusable mt-5 inline-flex items-center gap-2 rounded-[var(--sas-radius-sm)] px-4 py-2 text-[13px] font-medium"
              style={{
                backgroundColor: "var(--sas-accent)",
                color: "var(--sas-text-on-accent)",
              }}
            >
              Set up project
              <IconArrowRight size={15} stroke={1.8} aria-hidden="true" />
            </button>
            <p
              className="mt-4 flex items-center justify-center gap-1.5 text-[11.5px]"
              style={{ color: "var(--sas-text-muted)" }}
            >
              <IconShieldLock size={13} stroke={1.6} aria-hidden="true" />
              Agents run in isolated worktrees under a project-scoped grant.
            </p>
          </>
        ) : (
          <button
            type="button"
            onClick={onStartFeature}
            className="sas-transition sas-focusable mt-5 inline-flex items-center gap-2 rounded-[var(--sas-radius-sm)] px-4 py-2 text-[13px] font-medium"
            style={{
              backgroundColor: "var(--sas-accent)",
              color: "var(--sas-text-on-accent)",
            }}
          >
            Start work
            <IconArrowRight size={15} stroke={1.8} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
