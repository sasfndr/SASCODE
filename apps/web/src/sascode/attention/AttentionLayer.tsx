// FILE: sascode/attention/AttentionLayer.tsx
// Purpose: The calm in-app notice for state the backend classified as worth
//          interrupting for.
// Layer: Presentation.
//
// This is not a notification feed. At most a few items, only ones the backend
// escalated past ambient, resolved through `resolveAttentionItem` so dismissal
// is durable rather than a local boolean, and announced once to assistive
// technology without chattering.

import { useCallback, useMemo, useState } from "react";
import type { ProjectId, ThreadId } from "@synara/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconX } from "@tabler/icons-react";

import {
  attentionAnnouncements,
  inAppAttentionItems,
  ATTENTION_TONE,
} from "./attentionPresentation";
import {
  projectSnapshotQueryOptions,
  resolveAttentionItem,
  sascodeQueryKeys,
} from "../queries/sascodeQueries";

const TONE_FILL: Record<string, string> = {
  live: "var(--sas-live-soft)",
  attention: "var(--sas-attention-soft)",
  blocked: "var(--sas-blocked-soft)",
  accent: "var(--sas-accent-soft)",
  resting: "var(--sas-resting-soft)",
};

const TONE_INK: Record<string, string> = {
  live: "var(--sas-live-ink)",
  attention: "var(--sas-attention-ink)",
  blocked: "var(--sas-blocked-ink)",
  accent: "var(--sas-accent-ink)",
  resting: "var(--sas-resting-ink)",
};

export interface AttentionLayerProps {
  projectId: ProjectId | null;
  onOpenSession: (threadId: ThreadId) => void;
  /** Development visual fixture only; replaces the live attention snapshot. */
  fixtureToast?: { summary: string; detail: string } | undefined;
}

export function AttentionLayer({ projectId, fixtureToast }: AttentionLayerProps) {
  const queryClient = useQueryClient();
  const snapshot = useQuery(projectSnapshotQueryOptions(projectId));
  const [resolving, setResolving] = useState<string | null>(null);
  const [fixtureToastDismissed, setFixtureToastDismissed] = useState(false);

  const items = useMemo(
    () => inAppAttentionItems(snapshot.data?.attention ?? undefined),
    [snapshot.data],
  );
  const announcements = useMemo(
    () => attentionAnnouncements(snapshot.data?.attention ?? undefined),
    [snapshot.data],
  );

  const dismiss = useCallback(
    async (fingerprint: string) => {
      setResolving(fingerprint);
      try {
        await resolveAttentionItem(fingerprint);
        if (projectId) {
          await queryClient.invalidateQueries({ queryKey: sascodeQueryKeys.project(projectId) });
        }
      } finally {
        setResolving(null);
      }
    },
    [projectId, queryClient],
  );

  // One shape for both sources, so the fixture exercises the real toast rather
  // than a look-alike drawn beside it.
  const toasts = useMemo(() => {
    if (fixtureToast) {
      // Dismiss is local: there is no backend fingerprint to resolve, but the
      // control must still be present and must still work, or the fixture would
      // be showing a different component than production does.
      return fixtureToastDismissed
        ? []
        : [
            {
              id: "fixture-toast",
              summary: fixtureToast.summary,
              detail: fixtureToast.detail,
              tone: "accent",
              onDismiss: () => setFixtureToastDismissed(true),
            },
          ];
    }
    return items.map((entry) => ({
      id: entry.item.fingerprint,
      summary: entry.item.summary,
      detail: entry.item.recommendedAction ?? null,
      tone: ATTENTION_TONE[entry.item.state] ?? "resting",
      onDismiss: () => void dismiss(entry.item.fingerprint),
    }));
  }, [dismiss, fixtureToast, fixtureToastDismissed, items]);

  return (
    <>
      {/* Announcements are separated by politeness so a failure can be assertive
          while ordinary progress stays polite. */}
      <p aria-live="polite" className="sas-sr-only">
        {announcements
          .filter((entry) => entry.politeness === "polite")
          .map((entry) => entry.message)
          .join(". ")}
      </p>
      <p aria-live="assertive" className="sas-sr-only">
        {announcements
          .filter((entry) => entry.politeness === "assertive")
          .map((entry) => entry.message)
          .join(". ")}
      </p>

      {toasts.length > 0 ? (
        <div className="pointer-events-none absolute right-[30px] bottom-[26px] z-30 flex w-[314px] flex-col gap-2">
          {toasts.map((toast) => (
            <DecisionToast
              key={toast.id}
              summary={toast.summary}
              detail={toast.detail}
              tone={toast.tone}
              busy={resolving === toast.id}
              {...(toast.onDismiss ? { onDismiss: toast.onDismiss } : {})}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

interface DecisionToastProps {
  summary: string;
  detail: string | null;
  tone: string;
  busy: boolean;
  onDismiss?: () => void;
}

/**
 * One waiting decision. Two lines and a way out — not a notification card with a
 * reason code, which is what made this read as system log output rather than as
 * something a person is being asked to do.
 */
function DecisionToast(props: DecisionToastProps) {
  return (
    <div className="sas-glass sas-rim sas-settle pointer-events-auto flex items-center gap-3 p-3" role="status">
      <span
        aria-hidden="true"
        className="flex size-[34px] shrink-0 items-center justify-center rounded-[var(--sas-radius-xs)]"
        style={{ backgroundColor: TONE_FILL[props.tone] }}
      >
        <svg viewBox="0 0 14 14" className="size-[15px]">
          <path
            d="M7 0 L8.6 5.4 L14 7 L8.6 8.6 L7 14 L5.4 8.6 L0 7 L5.4 5.4 Z"
            fill={TONE_INK[props.tone]}
          />
        </svg>
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px]" style={{ color: "var(--sas-text)" }}>
          {props.summary}
        </p>
        {props.detail ? (
          <p className="mt-0.5 truncate text-[12.5px]" style={{ color: "var(--sas-text-secondary)" }}>
            {props.detail}
          </p>
        ) : null}
      </div>

      {props.onDismiss ? (
        <>
          <span
            aria-hidden="true"
            className="h-[26px] w-px shrink-0"
            style={{ backgroundColor: "var(--sas-line)" }}
          />
          <button
            type="button"
            onClick={props.onDismiss}
            disabled={props.busy}
            aria-label={`Dismiss: ${props.summary}`}
            className="sas-transition sas-focusable flex size-[26px] shrink-0 items-center justify-center rounded disabled:opacity-40"
            style={{ color: "var(--sas-text-muted)" }}
          >
            <IconX size={15} stroke={1.7} />
          </button>
        </>
      ) : null}
    </div>
  );
}
