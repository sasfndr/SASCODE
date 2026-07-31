// FILE: sascode/onboarding/FirstRun.tsx
// Purpose: What SASCODE shows before there is anything to show — a short,
//          honest setup rather than an empty screen.
// Layer: Shell.
//
// Three things a person needs before their first delegated build: a workspace
// to build in, a truthful picture of which model runtimes are actually
// available, and a plain explanation of what the recommended permission
// profile does and does not allow.

import { useMemo } from "react";
import { IconAlertTriangle, IconCheck, IconShieldLock } from "@tabler/icons-react";

import { SascodeSymbol, SascodeWordmark } from "../brand/SascodeMark";
import { useProviderCapabilities } from "../state/useWorkspace";
import { AddProjectButton } from "../shell/WorkspaceActions";

const READY_HEALTH = new Set(["ready", "degraded", "rate-limited", "usage-limited"]);

export function FirstRun() {
  const capabilities = useProviderCapabilities();

  const providers = useMemo(() => {
    const snapshots = capabilities.data ?? [];
    return [...snapshots].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [capabilities.data]);

  const readyCount = providers.filter((snapshot) => READY_HEALTH.has(snapshot.health)).length;

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      <div className="absolute inset-0" style={{ backgroundColor: "var(--sas-canvas)" }} />
      <div
        className="absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(76% 46% at 50% 96%, var(--sas-aura-soft) 0%, transparent 66%)," +
            " radial-gradient(58% 44% at 82% 2%, color-mix(in srgb, var(--sas-aura) 20%, transparent) 0%, transparent 62%)",
        }}
      />

      <div className="relative w-[min(560px,90vw)]">
        <div className="mb-7 flex items-center gap-3">
          <SascodeSymbol size={26} className="text-[var(--sas-text-on-canvas)]" />
          <div>
            <SascodeWordmark className="text-[var(--sas-text-on-canvas)]" />
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--sas-text-on-canvas-secondary)" }}>
              A place to build.
            </p>
          </div>
        </div>

        <div className="sas-glass sas-rim p-5">
          <h1 className="text-[16px] font-medium" style={{ color: "var(--sas-text)" }}>
            Choose a project to build in
          </h1>
          <p
            className="mt-1.5 text-[12.5px] leading-relaxed"
            style={{ color: "var(--sas-text-secondary)" }}
          >
            A project becomes its own workspace — its own atmosphere, sessions,
            and layout. You move between projects sideways, the way you move
            between desks.
          </p>

          <div className="mt-4">
            <AddProjectButton variant="primary" />
          </div>

          <div className="my-5 h-px" style={{ backgroundColor: "var(--sas-line)" }} />

          <h2 className="text-[12px] font-medium" style={{ color: "var(--sas-text)" }}>
            Model runtimes
          </h2>
          <p className="mt-1 text-[11.5px]" style={{ color: "var(--sas-text-secondary)" }}>
            {capabilities.isLoading
              ? "Looking for installed runtimes…"
              : readyCount > 0
                ? `${readyCount} of ${providers.length} discovered runtimes are ready. SASCODE routes each lane to whichever of these actually fits the work.`
                : "No runtime is authenticated yet. You can still set up a project — delegated work needs at least one signed-in runtime."}
          </p>

          {providers.length > 0 ? (
            <ul className="mt-3 grid grid-cols-2 gap-1.5">
              {providers.slice(0, 8).map((snapshot) => {
                const ready = READY_HEALTH.has(snapshot.health);
                return (
                  <li
                    key={snapshot.id}
                    className="flex items-center gap-2 rounded-[var(--sas-radius-xs)] px-2 py-1.5 text-[11px]"
                    style={{ backgroundColor: "var(--sas-surface-sunken)" }}
                  >
                    {ready ? (
                      <IconCheck
                        size={12}
                        stroke={2}
                        aria-hidden="true"
                        style={{ color: "var(--sas-live-ink)" }}
                      />
                    ) : (
                      <IconAlertTriangle
                        size={12}
                        stroke={1.8}
                        aria-hidden="true"
                        style={{ color: "var(--sas-attention-ink)" }}
                      />
                    )}
                    <span className="truncate" style={{ color: "var(--sas-text)" }}>
                      {snapshot.displayName}
                    </span>
                    <span
                      className="ms-auto shrink-0 text-[10px]"
                      style={{ color: "var(--sas-text-muted)" }}
                    >
                      {ready ? `${snapshot.models.length} models` : snapshot.health}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}

          <div className="my-5 h-px" style={{ backgroundColor: "var(--sas-line)" }} />

          <div className="flex items-start gap-2.5">
            <IconShieldLock
              size={15}
              stroke={1.6}
              aria-hidden="true"
              className="mt-[1px] shrink-0"
              style={{ color: "var(--sas-text-muted)" }}
            />
            <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--sas-text-secondary)" }}>
              New projects start on{" "}
              <span style={{ color: "var(--sas-text)" }}>full access, isolated</span>: agents get
              every capability, but only inside an isolated worktree under this project&apos;s
              boundary. Denied resources, step-up requirements, and spend limits still apply — it
              is not a global bypass. You can change this per project or per piece of work.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
