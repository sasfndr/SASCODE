// FILE: sascode/feature/StartFeatureDialog.tsx
// Purpose: The primary action — describe an outcome, and SASCODE plans it,
//          routes it, and opens the sessions.
// Layer: Presentation + command dispatch.
//
// Deliberately short. The backend already created a design-led routing policy
// at bootstrap, so nobody has to configure a routing table before they can
// work. Advanced routing exists, but folded away.

import { useCallback, useMemo, useState } from "react";
import type {
  ProjectId,
  SascodePermissionProfile,
  SascodeStartFeatureResult,
} from "@synara/contracts";
import { IconChevronDown, IconLoader2, IconX } from "@tabler/icons-react";

import { bootstrapProject, startFeature } from "../queries/sascodeQueries";
import { describeRpcError, looksLikeMissingProjectSetup } from "../api/rpcError";
import { WorkGraph } from "./WorkGraph";

const PROFILE_EXPLANATION: Record<SascodePermissionProfile, string> = {
  observe: "Read only. Agents can look but cannot change anything.",
  "safe-build": "Edit files and run safe commands. No network, no git pushes.",
  "trusted-build": "Edit, run commands, and manage git inside this workspace.",
  "full-access-isolated":
    "All twenty capabilities, but every agent runs in an isolated worktree under this project's boundary. Denied resources, step-up requirements, and spend limits still apply.",
  custom: "A capability set you defined for this project.",
};

export interface StartFeatureDialogProps {
  projectId: ProjectId;
  projectName: string;
  workspaceRoot: string;
  policyRevision: number;
  /** Prefilled from the chat composer when the user typed there first. */
  initialRequest?: string;
  onClose: () => void;
  onStarted: (result: SascodeStartFeatureResult) => void;
}

export function StartFeatureDialog(props: StartFeatureDialogProps) {
  const [title, setTitle] = useState("");
  const [outcome, setOutcome] = useState("");
  const [request, setRequest] = useState(props.initialRequest ?? "");
  const [includeFrontend, setIncludeFrontend] = useState(true);
  const [includeBackend, setIncludeBackend] = useState(true);
  const [includeBrowserValidation, setIncludeBrowserValidation] = useState(true);
  const [includeIndependentReview, setIncludeIndependentReview] = useState(true);
  const [permissionProfile, setPermissionProfile] =
    useState<SascodePermissionProfile>("full-access-isolated");
  const [concurrencyLimit, setConcurrencyLimit] = useState(4);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [baselineGitRef, setBaselineGitRef] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [bootstrapAttempted, setBootstrapAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SascodeStartFeatureResult | null>(null);

  const canSubmit = useMemo(
    () => title.trim().length > 0 && outcome.trim().length > 0 && request.trim().length > 0,
    [outcome, request, title],
  );

  const submit = useCallback(async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const started = await startFeature({
        requestId: crypto.randomUUID(),
        projectId: props.projectId,
        title: title.trim(),
        outcome: outcome.trim(),
        request: request.trim(),
        workspaceRoot: props.workspaceRoot,
        includeFrontend,
        includeBackend,
        includeBrowserValidation,
        includeIndependentReview,
        permissionProfile,
        policyRevision: props.policyRevision,
        concurrencyLimit,
        maxAttempts,
        baselineGitRef: baselineGitRef.trim().length > 0 ? baselineGitRef.trim() : null,
        occurredAt: new Date().toISOString(),
      });
      setResult(started);
      props.onStarted(started);
    } catch (cause) {
      // A project that has never been bootstrapped has no routing policy to
      // plan against. Rather than dead-ending, do the one-time setup and retry
      // once — the operation is idempotent at its durable boundaries.
      if (looksLikeMissingProjectSetup(cause) && !bootstrapAttempted) {
        setBootstrapAttempted(true);
        try {
          await bootstrapProject({
            projectId: props.projectId,
            projectName: props.projectName,
            workspaceRoots: [props.workspaceRoot],
            allowedHosts: ["*"],
            permissionProfile,
            policyRevision: props.policyRevision,
            maxParallelWorkUnits: concurrencyLimit,
            occurredAt: new Date().toISOString(),
          });
          setSubmitting(false);
          await submit();
          return;
        } catch (bootstrapCause) {
          setError(describeRpcError(bootstrapCause, "Could not set up this project"));
          return;
        }
      }
      setError(describeRpcError(cause, "Could not start this work"));
    } finally {
      setSubmitting(false);
    }
  }, [
    baselineGitRef,
    bootstrapAttempted,
    canSubmit,
    concurrencyLimit,
    includeBackend,
    includeBrowserValidation,
    includeFrontend,
    includeIndependentReview,
    maxAttempts,
    outcome,
    permissionProfile,
    props,
    request,
    submitting,
    title,
  ]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Start work"
      className="absolute inset-0 z-50 flex items-center justify-center p-6"
      style={{ backgroundColor: "var(--sas-scrim)" }}
      onKeyDown={(event) => {
        if (event.key === "Escape") props.onClose();
      }}
    >
      <div
        className="sas-glass sas-rim sas-scroll flex max-h-full w-[min(620px,92vw)] flex-col gap-4 p-5"
        data-sas-gesture-opaque="true"
      >
        <header className="flex items-start gap-3">
          <div>
            <h2 className="text-[15px] font-medium" style={{ color: "var(--sas-text)" }}>
              {result ? "Work started" : "Start work"}
            </h2>
            <p className="text-[12px]" style={{ color: "var(--sas-text-secondary)" }}>
              {result
                ? `${result.workflow.workUnits.length} lanes in ${props.projectName}`
                : props.projectName}
            </p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close"
            className="sas-transition sas-focusable ms-auto rounded p-1"
            style={{ color: "var(--sas-text-muted)" }}
          >
            <IconX size={16} stroke={1.7} />
          </button>
        </header>

        {result ? (
          <>
            <WorkGraph workflow={result.workflow} execution={result.execution} />
            <button
              type="button"
              onClick={props.onClose}
              className="sas-transition sas-focusable rounded-[var(--sas-radius-sm)] py-2 text-[13px] font-medium"
              style={{ backgroundColor: "var(--sas-accent)", color: "var(--sas-text-on-accent)" }}
            >
              Back to work
            </button>
          </>
        ) : (
          <>
            <TextField
              label="Title"
              value={title}
              onChange={setTitle}
              placeholder="Beautiful onboarding"
            />
            <TextField
              label="Desired outcome"
              value={outcome}
              onChange={setOutcome}
              placeholder="A production-ready onboarding flow with persisted account setup"
            />
            <TextArea
              label="Request"
              value={request}
              onChange={setRequest}
              placeholder="Describe what you want built, and anything that must be true when it is done."
            />

            <fieldset className="grid grid-cols-2 gap-2">
              <legend className="sas-sr-only">Lanes to include</legend>
              <Check label="Frontend" checked={includeFrontend} onChange={setIncludeFrontend} />
              <Check label="Backend" checked={includeBackend} onChange={setIncludeBackend} />
              <Check
                label="Browser validation"
                checked={includeBrowserValidation}
                onChange={setIncludeBrowserValidation}
              />
              <Check
                label="Independent review"
                checked={includeIndependentReview}
                onChange={setIncludeIndependentReview}
              />
            </fieldset>

            <section>
              <label
                className="mb-1 block text-[11px]"
                style={{ color: "var(--sas-text-secondary)" }}
                htmlFor="sas-permission-profile"
              >
                Permission profile
              </label>
              <select
                id="sas-permission-profile"
                value={permissionProfile}
                onChange={(event) =>
                  setPermissionProfile(event.target.value as SascodePermissionProfile)
                }
                className="sas-focusable w-full rounded-[var(--sas-radius-xs)] px-2.5 py-2 text-[12.5px] outline-none"
                style={{
                  backgroundColor: "var(--sas-surface-sunken)",
                  color: "var(--sas-text)",
                  border: "1px solid var(--sas-line)",
                }}
              >
                {(
                  [
                    "full-access-isolated",
                    "trusted-build",
                    "safe-build",
                    "observe",
                  ] as SascodePermissionProfile[]
                ).map((profile) => (
                  <option key={profile} value={profile}>
                    {profile}
                    {profile === "full-access-isolated" ? " (recommended)" : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "var(--sas-text-muted)" }}>
                {PROFILE_EXPLANATION[permissionProfile]}
              </p>
            </section>

            <section>
              <button
                type="button"
                onClick={() => setAdvancedOpen((open) => !open)}
                aria-expanded={advancedOpen}
                className="sas-focusable flex items-center gap-1.5 text-[11.5px]"
                style={{ color: "var(--sas-text-secondary)" }}
              >
                <IconChevronDown
                  size={13}
                  stroke={1.7}
                  aria-hidden="true"
                  className="sas-transition"
                  style={{ transform: advancedOpen ? "rotate(180deg)" : undefined }}
                />
                Advanced
              </button>
              {advancedOpen ? (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <NumberField
                    label="Parallel lanes"
                    value={concurrencyLimit}
                    min={1}
                    max={12}
                    onChange={setConcurrencyLimit}
                  />
                  <NumberField
                    label="Max attempts"
                    value={maxAttempts}
                    min={1}
                    max={8}
                    onChange={setMaxAttempts}
                  />
                  <TextField
                    label="Baseline ref"
                    value={baselineGitRef}
                    onChange={setBaselineGitRef}
                    placeholder="origin/main"
                  />
                </div>
              ) : null}
            </section>

            {error ? (
              <p role="alert" className="text-[12px]" style={{ color: "var(--sas-blocked-ink)" }}>
                {error}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit || submitting}
              className="sas-transition sas-focusable flex items-center justify-center gap-2 rounded-[var(--sas-radius-sm)] py-2.5 text-[13px] font-medium disabled:opacity-45"
              style={{ backgroundColor: "var(--sas-accent)", color: "var(--sas-text-on-accent)" }}
            >
              {submitting ? (
                <IconLoader2 size={15} stroke={1.8} className="animate-spin" aria-hidden="true" />
              ) : null}
              {submitting ? "Planning" : "Start work"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px]" style={{ color: "var(--sas-text-secondary)" }}>
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="sas-focusable w-full rounded-[var(--sas-radius-xs)] px-2.5 py-2 text-[12.5px] outline-none"
        style={{
          backgroundColor: "var(--sas-surface-sunken)",
          color: "var(--sas-text)",
          border: "1px solid var(--sas-line)",
        }}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px]" style={{ color: "var(--sas-text-secondary)" }}>
        {label}
      </span>
      <textarea
        rows={4}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="sas-focusable w-full resize-y rounded-[var(--sas-radius-xs)] px-2.5 py-2 text-[12.5px] leading-relaxed outline-none"
        style={{
          backgroundColor: "var(--sas-surface-sunken)",
          color: "var(--sas-text)",
          border: "1px solid var(--sas-line)",
        }}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px]" style={{ color: "var(--sas-text-secondary)" }}>
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="sas-focusable w-full rounded-[var(--sas-radius-xs)] px-2.5 py-2 text-[12.5px] outline-none"
        style={{
          backgroundColor: "var(--sas-surface-sunken)",
          color: "var(--sas-text)",
          border: "1px solid var(--sas-line)",
        }}
      />
    </label>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      className="sas-transition flex cursor-pointer items-center gap-2 rounded-[var(--sas-radius-xs)] px-2.5 py-2 text-[12px]"
      style={{
        backgroundColor: checked ? "var(--sas-accent-soft)" : "var(--sas-surface-sunken)",
        color: checked ? "var(--sas-accent-ink)" : "var(--sas-text-secondary)",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="sas-focusable size-3.5 accent-[var(--sas-accent)]"
      />
      {label}
    </label>
  );
}
