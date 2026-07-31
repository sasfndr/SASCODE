// FILE: sascode/chat/AgentTranscript.tsx
// Purpose: Render the merged project conversation inside the Agent Chat sheet.
// Layer: Presentation.
//
// Rows are quiet inset panels, not glass. Agent Chat is already a floating glass
// sheet; giving each turn its own glass would nest material inside material and
// flatten the very hierarchy the sheet exists to create.
//
// Turns are attributed by model, not by avatar — a run of four sessions produces
// four names, and names stay legible at 12px where portraits do not. The one
// exception is the user, who gets the SASCODE mark rather than a status dot,
// because "you" is not a session state.

import { memo, useEffect, useRef } from "react";
import { IconCode, IconFile, IconPhoto, IconTool } from "@tabler/icons-react";

import type { TranscriptChip, TranscriptEntry } from "./transcriptModel";

const PROVIDER_DOT: Record<string, string> = {
  claudeAgent: "var(--sas-accent)",
  codex: "var(--sas-live)",
  cursor: "var(--sas-attention)",
};

const CHIP_ICON = {
  file: IconFile,
  code: IconCode,
  image: IconPhoto,
  tool: IconTool,
} as const;

function formatTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function Chip({ chip }: { chip: TranscriptChip }) {
  const Icon = CHIP_ICON[chip.kind];
  return (
    <span
      className="inline-flex min-w-0 items-center gap-1.5 rounded-[var(--sas-radius-xs)] py-1 ps-2 pe-2.5"
      style={{
        backgroundColor: "var(--sas-surface-raised)",
        border: "1px solid var(--sas-line)",
      }}
    >
      <Icon
        size={13}
        stroke={1.6}
        aria-hidden="true"
        className="shrink-0"
        style={{ color: "var(--sas-text-muted)" }}
      />
      <span className="truncate text-[11.5px]" style={{ color: "var(--sas-text-secondary)" }}>
        {chip.label}
      </span>
      {chip.detail ? (
        <span
          className="sas-numeric shrink-0 text-[10px] tracking-wide uppercase"
          style={{ color: "var(--sas-text-muted)" }}
        >
          {chip.detail}
        </span>
      ) : null}
    </span>
  );
}

/** The SASCODE mark, used only for the user's own turns. */
function UserGlyph() {
  return (
    <svg viewBox="0 0 12 12" className="size-[11px] shrink-0" aria-hidden="true">
      <path
        d="M6 0 L7.4 4.6 L12 6 L7.4 7.4 L6 12 L4.6 7.4 L0 6 L4.6 4.6 Z"
        fill="var(--sas-accent)"
      />
    </svg>
  );
}

function TranscriptRow({ entry }: { entry: TranscriptEntry }) {
  const isUser = entry.authorKind === "user";
  const percent = entry.progress === null ? null : Math.round(entry.progress * 100);
  const thumbnail = entry.chips.find((chip) => chip.thumbnailUrl);
  const inlineChips = entry.chips.filter((chip) => !chip.thumbnailUrl);

  return (
    <article
      className="rounded-[var(--sas-radius-sm)] px-3.5 py-3"
      style={{ backgroundColor: "var(--sas-surface-sunken)" }}
    >
      <header className="mb-1 flex items-center gap-2">
        {isUser ? (
          <UserGlyph />
        ) : (
          <span
            aria-hidden="true"
            className="size-[7px] shrink-0 rounded-full"
            style={{ backgroundColor: PROVIDER_DOT[entry.provider ?? ""] ?? "var(--sas-resting)" }}
          />
        )}
        <span className="truncate text-[12px] font-semibold" style={{ color: "var(--sas-text)" }}>
          {entry.authorLabel}
        </span>
        <span
          className="sas-numeric ms-auto shrink-0 text-[10.5px]"
          style={{ color: "var(--sas-text-muted)" }}
        >
          {entry.streaming ? "working" : formatTime(entry.createdAt)}
        </span>
      </header>

      <div className="flex min-w-0 items-start gap-2.5">
        <div className="min-w-0 flex-1">
          {entry.status ? (
            <p className="text-[12px]" style={{ color: "var(--sas-text-secondary)" }}>
              {entry.status}
            </p>
          ) : null}

          {entry.text.trim().length > 0 ? (
            <p
              className="line-clamp-3 text-[12px] leading-[1.45]"
              style={{ color: "var(--sas-text-secondary)" }}
            >
              {entry.text}
            </p>
          ) : null}

          {inlineChips.length > 0 ? (
            <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
              {inlineChips.map((chip) => (
                <Chip key={`${chip.kind}:${chip.label}`} chip={chip} />
              ))}
            </div>
          ) : null}
        </div>

        {thumbnail ? (
          <img
            src={thumbnail.thumbnailUrl}
            alt={thumbnail.label}
            className="h-[70px] w-[126px] shrink-0 rounded-[var(--sas-radius-xs)] object-cover"
            style={{ border: "1px solid var(--sas-line)" }}
          />
        ) : null}

        {percent === null ? null : (
          <div className="w-[76px] shrink-0 pt-0.5">
            <p
              className="sas-numeric mb-1 text-end text-[12px]"
              style={{ color: "var(--sas-text-secondary)" }}
            >
              {percent}%
            </p>
            <div
              className="h-[4px] overflow-hidden rounded-full"
              style={{ backgroundColor: "var(--sas-surface-raised)" }}
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${entry.authorLabel} progress`}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${percent}%`, backgroundColor: "var(--sas-live)" }}
              />
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

export interface AgentTranscriptProps {
  entries: ReadonlyArray<TranscriptEntry>;
  hydrating: boolean;
  /** Shown when the project genuinely has nothing running yet. */
  emptyHint: string;
}

export const AgentTranscript = memo(function AgentTranscript(props: AgentTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastEntryId = props.entries[props.entries.length - 1]?.id ?? null;

  // Follow the newest turn. `auto` rather than smooth: a conversation four
  // models write to at once would otherwise spend its life mid-animation.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [lastEntryId]);

  if (props.entries.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6">
        <p
          className="max-w-[26ch] text-center text-[11.5px] leading-relaxed"
          style={{ color: "var(--sas-text-muted)" }}
        >
          {props.hydrating ? "Catching up on this project…" : props.emptyHint}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      // Bottom-anchored: a short conversation sits just above the composer
      // instead of stranding it below a band of empty sheet. `justify-end` on a
      // scroller keeps overflow scrolling normally once there is enough content.
      className="sas-scroll flex min-h-0 flex-1 flex-col justify-end gap-2 px-3.5 pb-2"
      role="log"
      aria-label="Project conversation"
    >
      {props.entries.map((entry) => (
        <TranscriptRow key={entry.id} entry={entry} />
      ))}
    </div>
  );
});
