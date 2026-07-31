// FILE: sascode/modules/WorkspaceModules.tsx
// Purpose: Notes, timer, provider usage, and the context/evidence lens.
// Layer: Presentation.
//
// Everything here renders real state. The provider module shows what the
// installed runtimes actually reported; the context module shows the acceptance
// requirements, permission boundary, and browser evidence the backend actually
// holds. Nothing is illustrative.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ProviderCapabilitySnapshot,
  SascodeProjectSnapshot,
} from "@synara/contracts";
import { IconPlayerPause, IconPlayerPlay, IconRefresh, IconRotate2 } from "@tabler/icons-react";

export interface ModulePanelProps {
  configuration: Record<string, string>;
  onConfigure: (patch: Record<string, string>) => void;
}

// ── Notes ────────────────────────────────────────────────────────────

/**
 * Notes persist in the module placement's durable configuration, so a note
 * written on one machine is there on the next. That is also why the write is
 * debounced — a keystroke must not become an RPC.
 */
export function NotesModule({ configuration, onConfigure }: ModulePanelProps) {
  const [value, setValue] = useState(configuration["text"] ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
  }, []);

  const handleChange = useCallback(
    (next: string) => {
      setValue(next);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onConfigure({ text: next }), 800);
    },
    [onConfigure],
  );

  return (
    <textarea
      value={value}
      onChange={(event) => handleChange(event.target.value)}
      placeholder="Notes for this project…"
      aria-label="Project notes"
      className="sas-focusable size-full resize-none bg-transparent p-3 text-[12px] leading-relaxed outline-none"
      style={{ color: "var(--sas-text)" }}
    />
  );
}

// ── Timer ────────────────────────────────────────────────────────────

export function TimerModule({ configuration, onConfigure }: ModulePanelProps) {
  const target = Number(configuration["minutes"] ?? "25");
  const [remaining, setRemaining] = useState(target * 60);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setRemaining((current) => {
        if (current <= 1) {
          setRunning(false);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-3">
      <p
        className="sas-numeric text-[30px] font-light tabular-nums"
        style={{ color: "var(--sas-text)" }}
        role="timer"
        aria-live="off"
      >
        {minutes}:{String(seconds).padStart(2, "0")}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setRunning((current) => !current)}
          aria-label={running ? "Pause timer" : "Start timer"}
          className="sas-transition sas-focusable rounded-full p-1.5"
          style={{ backgroundColor: "var(--sas-accent)", color: "var(--sas-text-on-accent)" }}
        >
          {running ? <IconPlayerPause size={14} stroke={1.8} /> : <IconPlayerPlay size={14} stroke={1.8} />}
        </button>
        <button
          type="button"
          onClick={() => {
            setRunning(false);
            setRemaining(target * 60);
          }}
          aria-label="Reset timer"
          className="sas-transition sas-focusable rounded-full p-1.5"
          style={{ color: "var(--sas-text-secondary)" }}
        >
          <IconRotate2 size={14} stroke={1.7} />
        </button>
        <select
          value={String(target)}
          onChange={(event) => {
            onConfigure({ minutes: event.target.value });
            setRemaining(Number(event.target.value) * 60);
            setRunning(false);
          }}
          aria-label="Timer length"
          className="sas-focusable rounded-[var(--sas-radius-xs)] px-1.5 py-1 text-[11px] outline-none"
          style={{ backgroundColor: "var(--sas-surface-sunken)", color: "var(--sas-text-secondary)" }}
        >
          {[15, 25, 45, 60, 90].map((option) => (
            <option key={option} value={option}>
              {option}m
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ── Provider usage ───────────────────────────────────────────────────

const HEALTH_TONE: Record<string, string> = {
  ready: "var(--sas-live)",
  degraded: "var(--sas-attention)",
  "rate-limited": "var(--sas-attention)",
  "usage-limited": "var(--sas-attention)",
  "needs-auth": "var(--sas-blocked)",
  unavailable: "var(--sas-blocked)",
};

const HEALTH_LABEL: Record<string, string> = {
  ready: "Ready",
  degraded: "Degraded",
  "rate-limited": "Rate limited",
  "usage-limited": "Usage limited",
  "needs-auth": "Needs authentication",
  unavailable: "Unavailable",
};

export function ProviderUsageModule({
  snapshots,
  refreshing,
  onRefresh,
  failures,
}: {
  snapshots: ReadonlyArray<ProviderCapabilitySnapshot>;
  refreshing: boolean;
  onRefresh: () => void;
  failures: ReadonlyArray<{ provider: string; detail: string }>;
}) {
  return (
    <div className="sas-scroll h-full p-3">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[12px] font-medium" style={{ color: "var(--sas-text)" }}>
          Providers
        </h3>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh provider capabilities"
          className="sas-transition sas-focusable ms-auto rounded p-1 disabled:opacity-50"
          style={{ color: "var(--sas-text-muted)" }}
        >
          <IconRefresh size={13} stroke={1.7} />
        </button>
      </div>

      {snapshots.length === 0 ? (
        <p className="py-4 text-[11.5px]" style={{ color: "var(--sas-text-secondary)" }}>
          No provider runtimes discovered yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {snapshots.map((snapshot) => (
            <li
              key={snapshot.id}
              className="rounded-[var(--sas-radius-sm)] p-2.5"
              style={{ backgroundColor: "var(--sas-surface-sunken)" }}
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-[6px] shrink-0 rounded-full"
                  style={{ backgroundColor: HEALTH_TONE[snapshot.health] ?? "var(--sas-resting)" }}
                />
                <span
                  className="truncate text-[11.5px] font-medium"
                  style={{ color: "var(--sas-text)" }}
                >
                  {snapshot.displayName}
                </span>
                <span
                  className="ms-auto shrink-0 text-[10.5px]"
                  style={{ color: "var(--sas-text-muted)" }}
                >
                  {HEALTH_LABEL[snapshot.health] ?? snapshot.health}
                </span>
              </div>
              <p className="mt-1 text-[10.5px]" style={{ color: "var(--sas-text-muted)" }}>
                {snapshot.models.length} model{snapshot.models.length === 1 ? "" : "s"} ·{" "}
                {snapshot.connectionKind}
                {snapshot.authenticatedAccountLabel
                  ? ` · ${snapshot.authenticatedAccountLabel}`
                  : ""}
              </p>
              {snapshot.quota.map((window) => (
                <div key={window.label} className="mt-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span style={{ color: "var(--sas-text-muted)" }}>{window.label}</span>
                    {window.usedFraction !== undefined ? (
                      <span className="sas-numeric" style={{ color: "var(--sas-text-secondary)" }}>
                        {Math.round(window.usedFraction * 100)}%
                      </span>
                    ) : null}
                  </div>
                  {window.usedFraction !== undefined ? (
                    <div
                      className="mt-1 h-[3px] overflow-hidden rounded-full"
                      style={{ backgroundColor: "var(--sas-line)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, Math.round(window.usedFraction * 100))}%`,
                          backgroundColor:
                            window.usedFraction > 0.85
                              ? "var(--sas-blocked)"
                              : window.usedFraction > 0.6
                                ? "var(--sas-attention)"
                                : "var(--sas-live)",
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              ))}
              {snapshot.healthDetail ? (
                <p className="mt-1.5 text-[10.5px]" style={{ color: "var(--sas-attention-ink)" }}>
                  {snapshot.healthDetail}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {failures.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1 text-[10.5px]" style={{ color: "var(--sas-text-muted)" }}>
            Not discovered
          </p>
          <ul className="space-y-1">
            {failures.map((failure) => (
              <li key={failure.provider} className="text-[10.5px]" style={{ color: "var(--sas-text-muted)" }}>
                <span style={{ color: "var(--sas-text-secondary)" }}>{failure.provider}</span> ·{" "}
                {failure.detail}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// ── Context and evidence ─────────────────────────────────────────────

/**
 * What the agents were given and what they must prove.
 *
 * This renders only what the project snapshot genuinely carries: the work graph
 * with its required evidence kinds, the active permission boundary, and browser
 * instances holding evidence references.
 */
export function ContextEvidenceModule({
  snapshot,
}: {
  snapshot: SascodeProjectSnapshot | null;
}) {
  const workUnits = useMemo(
    () => (snapshot?.workflows ?? []).flatMap((workflow) => workflow.workUnits),
    [snapshot],
  );
  const grant = snapshot?.activePermissionGrants[0] ?? null;

  return (
    <div className="sas-scroll h-full space-y-3 p-3">
      <section>
        <h3 className="mb-1.5 text-[11px]" style={{ color: "var(--sas-text-secondary)" }}>
          Acceptance requirements
        </h3>
        {workUnits.length === 0 ? (
          <p className="text-[11.5px]" style={{ color: "var(--sas-text-muted)" }}>
            No work units yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {workUnits.slice(0, 8).map((unit) => (
              <li
                key={unit.id}
                className="rounded-[var(--sas-radius-sm)] p-2"
                style={{ backgroundColor: "var(--sas-surface-sunken)" }}
              >
                <p className="truncate text-[11.5px] font-medium" style={{ color: "var(--sas-text)" }}>
                  {unit.title}
                </p>
                <p className="text-[10.5px]" style={{ color: "var(--sas-text-muted)" }}>
                  {unit.requiredEvidenceKinds.length > 0
                    ? unit.requiredEvidenceKinds.join(" · ")
                    : "No evidence required"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-1.5 text-[11px]" style={{ color: "var(--sas-text-secondary)" }}>
          Permission boundary
        </h3>
        {grant ? (
          <div
            className="space-y-1 rounded-[var(--sas-radius-sm)] p-2"
            style={{ backgroundColor: "var(--sas-surface-sunken)" }}
          >
            <p className="text-[11.5px] font-medium" style={{ color: "var(--sas-text)" }}>
              {grant.profile}
            </p>
            <p className="text-[10.5px]" style={{ color: "var(--sas-text-muted)" }}>
              {grant.capabilities.length} capabilities ·{" "}
              {grant.boundary.isolatedExecutionRequired ? "isolated execution" : "shared execution"}
            </p>
            <p className="truncate text-[10.5px]" style={{ color: "var(--sas-text-muted)" }}>
              {grant.boundary.workspaceRoots.join(", ")}
            </p>
          </div>
        ) : (
          <p className="text-[11.5px]" style={{ color: "var(--sas-text-muted)" }}>
            No active grant.
          </p>
        )}
      </section>

      {snapshot && snapshot.browserInstances.length > 0 ? (
        <section>
          <h3 className="mb-1.5 text-[11px]" style={{ color: "var(--sas-text-secondary)" }}>
            Browser evidence
          </h3>
          <ul className="space-y-1">
            {snapshot.browserInstances.map((instance) => (
              <li
                key={instance.id}
                className="rounded-[var(--sas-radius-sm)] p-2 text-[10.5px]"
                style={{ backgroundColor: "var(--sas-surface-sunken)", color: "var(--sas-text-muted)" }}
              >
                <span style={{ color: "var(--sas-text)" }}>{instance.status}</span> ·{" "}
                {instance.evidenceIds.length} record
                {instance.evidenceIds.length === 1 ? "" : "s"} ·{" "}
                {instance.controlOwner.kind === "agent" ? "agent control" : instance.controlOwner.kind}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
