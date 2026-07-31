// FILE: sascode/feature/WorkGraph.tsx
// Purpose: The generated work graph — what began, what is waiting, and why.
// Layer: Presentation.
//
// Supporting information, not a permanent screen. It answers "what did SASCODE
// decide to do" once, then the user goes back to work.

import { useMemo } from "react";
import type { WorkUnitExecutionBatch, Workflow } from "@synara/contracts";

import { SESSION_STATE_TONE } from "../sessions/sessionCards";

const TONE_DOT: Record<string, string> = {
  live: "var(--sas-live)",
  attention: "var(--sas-attention)",
  blocked: "var(--sas-blocked)",
  accent: "var(--sas-accent)",
  resting: "var(--sas-resting)",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  "waiting-dependency": "Waiting on dependency",
  ready: "Ready",
  routing: "Choosing a model",
  queued: "Queued",
  running: "Running",
  "waiting-approval": "Needs approval",
  blocked: "Blocked",
  verifying: "Verifying",
  succeeded: "Complete",
  failed: "Failed",
  cancelled: "Cancelled",
  skipped: "Skipped",
};

const STATUS_TONE: Record<string, keyof typeof TONE_DOT> = {
  running: "live",
  succeeded: "live",
  "waiting-approval": "attention",
  blocked: "blocked",
  failed: "blocked",
  verifying: "accent",
  ready: "resting",
  routing: "resting",
  queued: "resting",
  "waiting-dependency": "resting",
  draft: "resting",
  cancelled: "resting",
  skipped: "resting",
};

export interface WorkGraphProps {
  workflow: Workflow;
  execution?: WorkUnitExecutionBatch;
  /** Called when a lane should be inspected or routed differently. */
  onSelectWorkUnit?: (workUnitId: string) => void;
}

export function WorkGraph({ workflow, execution, onSelectWorkUnit }: WorkGraphProps) {
  const dependents = useMemo(() => {
    const map = new Map<string, ReadonlyArray<string>>();
    for (const dependency of workflow.dependencies) {
      const list = map.get(dependency.toWorkUnitId) ?? [];
      map.set(dependency.toWorkUnitId, [...list, dependency.fromWorkUnitId]);
    }
    return map;
  }, [workflow.dependencies]);

  const titleById = useMemo(
    () => new Map<string, string>(workflow.workUnits.map((unit) => [unit.id, unit.title])),
    [workflow.workUnits],
  );

  const ordered = useMemo(
    () => workflow.workUnits.toSorted((a, b) => a.sortOrder - b.sortOrder),
    [workflow.workUnits],
  );

  return (
    <div className="space-y-2">
      {execution ? (
        <p className="text-[11.5px]" style={{ color: "var(--sas-text-secondary)" }}>
          {execution.scheduled} started · {execution.deferred} waiting
          {execution.exhausted > 0 ? ` · ${execution.exhausted} exhausted` : ""}
        </p>
      ) : null}

      <ol className="space-y-1.5">
        {ordered.map((unit) => {
          const blockedBy = (dependents.get(unit.id) ?? [])
            .map((id) => titleById.get(id))
            .filter((value): value is string => Boolean(value));
          const tone = STATUS_TONE[unit.status] ?? "resting";
          const interactive = Boolean(onSelectWorkUnit);

          return (
            <li key={unit.id}>
              <button
                type="button"
                disabled={!interactive}
                onClick={() => onSelectWorkUnit?.(unit.id)}
                className="sas-transition sas-focusable block w-full rounded-[var(--sas-radius-sm)] p-2.5 text-left disabled:cursor-default"
                style={{ backgroundColor: "var(--sas-surface-sunken)" }}
              >
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-[6px] shrink-0 rounded-full"
                    style={{ backgroundColor: TONE_DOT[tone] }}
                  />
                  <span
                    className="truncate text-[12px] font-medium"
                    style={{ color: "var(--sas-text)" }}
                  >
                    {unit.title}
                  </span>
                  <span
                    className="ms-auto shrink-0 text-[10.5px]"
                    style={{ color: "var(--sas-text-muted)" }}
                  >
                    {STATUS_LABEL[unit.status] ?? unit.status}
                  </span>
                </div>
                <p
                  className="mt-0.5 truncate text-[11px]"
                  style={{ color: "var(--sas-text-secondary)" }}
                >
                  {unit.outcome}
                </p>
                {blockedBy.length > 0 ? (
                  <p
                    className="mt-0.5 truncate text-[10.5px]"
                    style={{ color: "var(--sas-text-muted)" }}
                  >
                    After {blockedBy.join(", ")}
                  </p>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Re-exported so the shelf and graph agree on state colour without a cycle. */
export { SESSION_STATE_TONE };
