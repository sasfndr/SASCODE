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
}

export function AttentionLayer({ projectId }: AttentionLayerProps) {
  const queryClient = useQueryClient();
  const snapshot = useQuery(projectSnapshotQueryOptions(projectId));
  const [resolving, setResolving] = useState<string | null>(null);

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

      {items.length > 0 ? (
        <div className="pointer-events-none absolute bottom-4 right-4 z-30 flex w-[320px] flex-col gap-2">
          {items.map((entry) => {
            const tone = ATTENTION_TONE[entry.item.state];
            return (
              <div
                key={entry.item.fingerprint}
                className="sas-glass sas-rim sas-settle pointer-events-auto flex items-start gap-2.5 p-3"
                role="status"
              >
                <span
                  aria-hidden="true"
                  className="mt-[3px] size-[7px] shrink-0 rounded-full"
                  style={{ backgroundColor: TONE_INK[tone] }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium" style={{ color: "var(--sas-text)" }}>
                    {entry.item.summary}
                  </p>
                  {entry.item.recommendedAction ? (
                    <p
                      className="mt-0.5 text-[11.5px]"
                      style={{ color: "var(--sas-text-secondary)" }}
                    >
                      {entry.item.recommendedAction}
                    </p>
                  ) : null}
                  <span
                    className="mt-1.5 inline-block rounded-full px-2 py-[2px] text-[10px]"
                    style={{ backgroundColor: TONE_FILL[tone], color: TONE_INK[tone] }}
                  >
                    {entry.item.reasonCode}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void dismiss(entry.item.fingerprint)}
                  disabled={resolving === entry.item.fingerprint}
                  aria-label={`Dismiss: ${entry.item.summary}`}
                  className="sas-transition sas-focusable shrink-0 rounded p-0.5 disabled:opacity-40"
                  style={{ color: "var(--sas-text-muted)" }}
                >
                  <IconX size={13} stroke={1.7} />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
