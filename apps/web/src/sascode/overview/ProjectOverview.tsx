// FILE: sascode/overview/ProjectOverview.tsx
// Purpose: The temporary camera pull-back showing every project as a living
//          spatial card.
// Layer: Shell.
//
// This is explicitly *not* a home dashboard. It is summoned, it is searchable,
// it is fully keyboard navigable, and it gets out of the way. Heavy per-project
// content (transcripts, browsers, modules) stays suspended — the cards render
// from the same compact summaries that keep cross-project attention alive.

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ProjectId, ThreadId } from "@synara/contracts";
import { IconSearch, IconX } from "@tabler/icons-react";

import type { Project } from "~/types";
import { SascodeWordmark } from "../brand/SascodeMark";
import {
  ATTENTION_LABEL,
  type WorkspaceAttentionPresentation,
} from "../attention/attentionPresentation";
import type { SessionCard } from "../sessions/sessionCards";
import { formatElapsed } from "../sessions/SessionCardView";
import { AddProjectButton } from "../shell/WorkspaceActions";

const TONE_DOT: Record<string, string> = {
  live: "var(--sas-live)",
  attention: "var(--sas-attention)",
  blocked: "var(--sas-blocked)",
  accent: "var(--sas-accent)",
  resting: "var(--sas-resting)",
};

export interface ProjectOverviewProps {
  projects: ReadonlyArray<Project>;
  activeIndex: number;
  attention: WorkspaceAttentionPresentation;
  /** Compact live session summaries per project. */
  cardsByProject: ReadonlyMap<ProjectId, ReadonlyArray<SessionCard>>;
  query: string;
  onQueryChange: (query: string) => void;
  focusIndex: number;
  onFocusIndexChange: (index: number) => void;
  onOpenProject: (index: number) => void;
  onOpenSession: (projectId: ProjectId, threadId: ThreadId) => void;
  onSplitWith: (projectId: ProjectId, side: "left" | "right") => void;
  onClose: () => void;
}

export function ProjectOverview(props: ProjectOverviewProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const query = props.query.trim().toLowerCase();
    const entries = props.projects.map((project, index) => ({ project, index }));
    if (query.length === 0) return entries;
    return entries.filter(({ project }) => project.name.toLowerCase().includes(query));
  }, [props.projects, props.query]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        const delta = event.key === "ArrowRight" ? 1 : -1;
        const next = Math.min(
          Math.max(props.focusIndex + delta, 0),
          Math.max(filtered.length - 1, 0),
        );
        props.onFocusIndexChange(next);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const target = filtered[props.focusIndex];
        if (target) props.onOpenProject(target.index);
        return;
      }
      // Bracket keys place the focused project into a dual-project split
      // without needing a drag, which is the accessible route to State D.
      if (event.key === "[" || event.key === "]") {
        event.preventDefault();
        const target = filtered[props.focusIndex];
        if (target) props.onSplitWith(target.project.id, event.key === "[" ? "left" : "right");
      }
    },
    [filtered, props],
  );

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Project overview"
      onKeyDown={handleKeyDown}
      className="sas-settle absolute inset-0 z-40 flex flex-col"
      style={{ backgroundColor: "var(--sas-scrim)", backdropFilter: "blur(28px)" }}
    >
      <header className="flex shrink-0 items-center gap-4 px-5 py-3.5">
        <span className="flex items-center gap-2.5">
          <SascodeWordmark className="text-[var(--sas-text-on-canvas)]" />
          <span aria-hidden="true" style={{ opacity: 0.3 }}>
            |
          </span>
          <span className="text-[12px]" style={{ color: "var(--sas-text-on-canvas-secondary)" }}>
            Projects
          </span>
        </span>

        <div
          className="mx-auto flex w-[min(380px,42vw)] items-center gap-2 rounded-full px-3 py-1.5"
          style={{
            backgroundColor: "var(--sas-glass)",
            border: "1px solid var(--sas-line)",
          }}
        >
          <IconSearch size={14} stroke={1.7} aria-hidden="true" style={{ color: "var(--sas-text-muted)" }} />
          <input
            ref={searchRef}
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder="Search projects"
            aria-label="Search projects"
            className="w-full bg-transparent text-[12.5px] outline-none"
            style={{ color: "var(--sas-text-on-canvas)" }}
          />
        </div>

        <button
          type="button"
          onClick={props.onClose}
          className="sas-transition sas-focusable flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px]"
          style={{
            backgroundColor: "var(--sas-glass)",
            border: "1px solid var(--sas-line)",
            color: "var(--sas-text-on-canvas)",
          }}
        >
          <IconX size={14} stroke={1.8} aria-hidden="true" />
          Close overview
          <kbd
            className="rounded px-1.5 py-0.5 text-[10px]"
            style={{ backgroundColor: "var(--sas-surface-sunken)", color: "var(--sas-text-muted)" }}
          >
            esc
          </kbd>
        </button>
      </header>

      <div className="sas-scroll flex min-h-0 flex-1 items-center gap-5 px-8 pb-6">
        {filtered.length === 0 ? (
          <p
            className="mx-auto text-[13px]"
            style={{ color: "var(--sas-text-on-canvas-secondary)" }}
          >
            No project matches “{props.query}”.
          </p>
        ) : (
          filtered.map(({ project, index }, position) => {
            const presentation = props.attention.byProject.get(project.id);
            const cards = props.cardsByProject.get(project.id) ?? [];
            const focused = position === props.focusIndex;
            const current = index === props.activeIndex;
            return (
              <article
                key={project.id}
                aria-label={`${project.name}${presentation ? `, ${ATTENTION_LABEL[presentation.state]}` : ""}`}
                tabIndex={focused ? 0 : -1}
                ref={(node) => {
                  if (focused && node) node.focus({ preventScroll: false });
                }}
                onClick={() => props.onOpenProject(index)}
                className="sas-glass sas-rim sas-transition-spatial sas-focusable flex h-[min(66vh,520px)] w-[min(30vw,380px)] shrink-0 cursor-pointer flex-col overflow-hidden"
                style={{
                  transform: focused ? "translateY(-10px) scale(1.02)" : undefined,
                  boxShadow: focused ? "var(--sas-shadow-overview)" : "var(--sas-shadow-float)",
                  borderColor: current ? "var(--sas-accent-line)" : "var(--sas-line)",
                }}
              >
                <div className="flex items-start gap-3 px-4 pb-3 pt-4">
                  <div className="min-w-0 flex-1">
                    <h2
                      className="truncate text-[15px] font-medium tracking-[0.06em] uppercase"
                      style={{ color: "var(--sas-text)" }}
                    >
                      {project.name}
                    </h2>
                    {presentation ? (
                      <p
                        className="mt-1 flex items-center gap-1.5 text-[11.5px]"
                        style={{ color: "var(--sas-text-secondary)" }}
                      >
                        <span
                          aria-hidden="true"
                          className="size-[6px] rounded-full"
                          style={{ backgroundColor: TONE_DOT[presentation.tone] }}
                        />
                        {ATTENTION_LABEL[presentation.state]}
                      </p>
                    ) : null}
                  </div>
                  {presentation && presentation.actionableCount > 0 ? (
                    <span
                      className="shrink-0 rounded-full px-2 py-[3px] text-[10.5px] font-medium"
                      style={{
                        backgroundColor: "var(--sas-attention-soft)",
                        color: "var(--sas-attention-ink)",
                      }}
                    >
                      {presentation.actionableCount}
                    </span>
                  ) : null}
                </div>

                {/* The card's own atmosphere: a compact echo of the project space. */}
                <div
                  className="relative mx-3 min-h-[110px] flex-1 overflow-hidden rounded-[var(--sas-radius-md)]"
                  style={{ backgroundColor: "var(--sas-canvas-deep)" }}
                >
                  <div className="sas-aura" />
                </div>

                <div className="space-y-1.5 p-3">
                  {cards.slice(0, 3).map((card) => (
                    <button
                      key={card.threadId}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        props.onOpenSession(project.id, card.threadId as ThreadId);
                      }}
                      className="sas-transition sas-focusable block w-full rounded-[var(--sas-radius-sm)] p-2 text-left"
                      style={{ backgroundColor: "var(--sas-surface-sunken)" }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="size-[5px] shrink-0 rounded-full"
                          style={{ backgroundColor: TONE_DOT[toneOf(card)] }}
                        />
                        <span
                          className="truncate text-[11.5px] font-medium"
                          style={{ color: "var(--sas-text)" }}
                        >
                          {card.title}
                        </span>
                        <span
                          className="sas-numeric ms-auto shrink-0 text-[10px]"
                          style={{ color: "var(--sas-text-muted)" }}
                        >
                          {formatElapsed(card.elapsedMs)}
                        </span>
                      </div>
                      <p
                        className="mt-0.5 truncate text-[10.5px]"
                        style={{ color: "var(--sas-text-secondary)" }}
                      >
                        {card.activity}
                      </p>
                    </button>
                  ))}
                  {cards.length === 0 ? (
                    <p className="px-1 py-2 text-[11px]" style={{ color: "var(--sas-text-muted)" }}>
                      No sessions running
                    </p>
                  ) : null}
                </div>
              </article>
            );
          })
        )}

        {/* Project creation lives here now that the shell has no sidebar. */}
        <AddProjectButton variant="card" />
      </div>

      <footer
        className="mx-auto mb-5 flex shrink-0 items-center gap-4 rounded-full px-4 py-2 text-[11px]"
        style={{
          backgroundColor: "var(--sas-glass)",
          border: "1px solid var(--sas-line)",
          color: "var(--sas-text-on-canvas-secondary)",
        }}
      >
        <Hint keys="← →" label="Navigate" />
        <Hint keys="↵" label="Open" />
        <Hint keys="[ ]" label="Split left / right" />
        <Hint keys="esc" label="Close" />
      </footer>
    </div>
  );
}

function toneOf(card: SessionCard): string {
  switch (card.state) {
    case "failed":
      return "blocked";
    case "needs-approval":
    case "needs-input":
      return "attention";
    case "ready-review":
      return "accent";
    case "working":
    case "complete":
      return "live";
    default:
      return "resting";
  }
}

function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd
        className="rounded px-1.5 py-0.5 text-[10px]"
        style={{ backgroundColor: "var(--sas-surface-sunken)", color: "var(--sas-text)" }}
      >
        {keys}
      </kbd>
      {label}
    </span>
  );
}
