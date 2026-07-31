// FILE: sascode/sessions/sessionCards.ts
// Purpose: Joins SASCODE workflow/work-unit/attempt state onto live Synara
//          threads to produce the live session cards the shelf renders.
// Layer: Pure derivation. Given a snapshot and thread summaries it is total —
//        no fetching, no clock reads beyond the `now` the caller supplies.
//
// A card is the union of two truths: the Director knows what the work *is*
// (role, dependency, acceptance), the orchestration store knows what the
// session is *doing right now* (streaming, approval pending, input pending).
// Neither alone produces an honest card.

import type {
  ProjectId,
  SascodeProjectSnapshot,
  ThreadId,
  Workflow,
  WorkflowId,
  WorkUnit,
  WorkUnitAttempt,
} from "@synara/contracts";

import type { SidebarThreadSummary } from "~/types";

export type SessionCardState =
  | "working"
  | "waiting-dependency"
  | "needs-approval"
  | "needs-input"
  | "ready-review"
  | "failed"
  | "complete"
  | "paused"
  | "idle";

export type SessionCardActionKind =
  | "focus"
  | "review"
  | "approve"
  | "respond"
  | "retry"
  | "open"
  | "resume"
  | "split"
  | "route"
  | "return-to-shelf";

export interface SessionCardAction {
  kind: SessionCardActionKind;
  label: string;
  /** Primary actions get filled emphasis; everything else stays quiet. */
  emphasis: "primary" | "standard" | "quiet";
}

export interface SessionCard {
  threadId: ThreadId;
  projectId: ProjectId;
  title: string;
  state: SessionCardState;
  /** Role name when this session is a delegated SASCODE attempt. */
  roleLabel: string | null;
  /** Display label for the running model, e.g. the model slug. */
  modelLabel: string;
  provider: string | null;
  /** One concise line describing what is happening. Never a paragraph. */
  activity: string;
  updatedAt: string;
  /** Milliseconds since the session last changed, for the elapsed chip. */
  elapsedMs: number;
  /**
   * Workflow completion ratio, only present when the session belongs to a
   * workflow whose graph makes progress genuinely countable.
   */
  progress: number | null;
  workflowId: WorkflowId | null;
  workUnitId: string | null;
  attemptId: string | null;
  /** Backend attention fingerprint, so resolving goes through the Director. */
  attentionFingerprint: string | null;
  actions: ReadonlyArray<SessionCardAction>;
  /** True when the card is one of the sessions currently in the centre. */
  active: boolean;
}

const STATE_ORDER: Record<SessionCardState, number> = {
  "needs-approval": 0,
  "needs-input": 1,
  failed: 2,
  "ready-review": 3,
  working: 4,
  "waiting-dependency": 5,
  paused: 6,
  idle: 7,
  complete: 8,
};

export const SESSION_STATE_LABEL: Record<SessionCardState, string> = {
  working: "Working",
  "waiting-dependency": "Waiting on dependency",
  "needs-approval": "Needs approval",
  "needs-input": "Needs your input",
  "ready-review": "Ready for review",
  failed: "Failed",
  complete: "Complete",
  paused: "Paused",
  idle: "Idle",
};

/** Semantic colour family each state paints with. Never colour alone — the label ships too. */
export const SESSION_STATE_TONE: Record<
  SessionCardState,
  "live" | "attention" | "blocked" | "accent" | "resting"
> = {
  working: "live",
  "waiting-dependency": "resting",
  "needs-approval": "attention",
  "needs-input": "attention",
  "ready-review": "accent",
  failed: "blocked",
  complete: "live",
  paused: "resting",
  idle: "resting",
};

interface AttemptJoin {
  workflow: Workflow;
  workUnit: WorkUnit;
  attempt: WorkUnitAttempt;
}

/**
 * Indexes every attempt that has a provider thread attached, so a thread can be
 * resolved back to the work it is executing in one lookup.
 */
export function indexAttemptsByThread(
  workflows: ReadonlyArray<Workflow>,
  attemptsByWorkUnit: ReadonlyMap<string, ReadonlyArray<WorkUnitAttempt>>,
): Map<ThreadId, AttemptJoin> {
  const index = new Map<ThreadId, AttemptJoin>();
  for (const workflow of workflows) {
    for (const workUnit of workflow.workUnits) {
      const attempts = attemptsByWorkUnit.get(workUnit.id) ?? [];
      for (const attempt of attempts) {
        if (!attempt.threadId) continue;
        const existing = index.get(attempt.threadId);
        // Keep the newest attempt when a thread was reused across retries.
        if (existing && existing.attempt.attemptNumber >= attempt.attemptNumber) continue;
        index.set(attempt.threadId, { workflow, workUnit, attempt });
      }
    }
  }
  return index;
}

/** Fraction of a workflow's work units that reached a terminal success. */
export function workflowProgress(workflow: Workflow): number | null {
  const total = workflow.workUnits.length;
  if (total === 0) return null;
  const done = workflow.workUnits.filter(
    (unit) => unit.status === "succeeded" || unit.status === "skipped",
  ).length;
  return done / total;
}

function attemptState(join: AttemptJoin): SessionCardState | null {
  switch (join.attempt.status) {
    case "failed":
      return "failed";
    case "cancelled":
    case "abandoned":
      return "paused";
    case "waiting-approval":
      return "needs-approval";
    case "verifying":
      return "ready-review";
    case "succeeded":
      return "complete";
    case "preparing":
    case "dispatching":
    case "queued":
      return "waiting-dependency";
    case "running":
      return "working";
    default:
      return null;
  }
}

function workUnitState(workUnit: WorkUnit): SessionCardState | null {
  switch (workUnit.status) {
    case "waiting-dependency":
      return "waiting-dependency";
    case "waiting-approval":
      return "needs-approval";
    case "blocked":
      return "failed";
    case "failed":
      return "failed";
    case "verifying":
      return "ready-review";
    case "succeeded":
      return "complete";
    case "cancelled":
    case "skipped":
      return "paused";
    default:
      return null;
  }
}

/**
 * Resolves the card state.
 *
 * Live interaction always wins: an approval or input request the user can act
 * on right now outranks whatever lifecycle phase the Director recorded, because
 * the session is genuinely blocked on a human either way.
 */
export function resolveSessionCardState(
  thread: SidebarThreadSummary,
  join: AttemptJoin | undefined,
): SessionCardState {
  if (thread.hasPendingApprovals || thread.hasActionableProposedPlan) return "needs-approval";
  if (thread.hasPendingUserInput) return "needs-input";

  if (join) {
    const fromAttempt = attemptState(join);
    if (fromAttempt === "failed" || fromAttempt === "ready-review") return fromAttempt;
    const fromUnit = workUnitState(join.workUnit);
    if (fromUnit === "failed" || fromUnit === "waiting-dependency") return fromUnit;
    if (thread.latestTurn?.state === "running" || thread.hasLiveTailWork) return "working";
    if (fromAttempt) return fromAttempt;
    if (fromUnit) return fromUnit;
  }

  if (thread.latestTurn?.state === "running") return "working";
  if (thread.hasLiveTailWork) return "working";
  if (thread.latestTurn?.state === "error") return "failed";
  if (thread.session?.status === "error") return "failed";
  if (thread.latestTurn?.state === "interrupted") return "paused";
  if (thread.latestTurn?.state === "completed") return "ready-review";
  return "idle";
}

function resolveActivity(
  state: SessionCardState,
  thread: SidebarThreadSummary,
  join: AttemptJoin | undefined,
): string {
  switch (state) {
    case "needs-approval":
      return join ? `Approval required for ${join.workUnit.title}` : "Waiting on your approval";
    case "needs-input":
      return "Waiting on your answer";
    case "waiting-dependency":
      return join ? `Waiting on ${join.workUnit.title} dependencies` : "Queued";
    case "failed":
      return join?.attempt.error ?? thread.session?.lastError ?? "Attempt failed";
    case "ready-review":
      return join ? `${join.workUnit.outcome}` : "Ready for review";
    case "complete":
      return join ? `${join.workUnit.title} complete` : "Complete";
    case "paused":
      return "Paused";
    case "working":
      return join ? join.workUnit.outcome : "Working";
    default:
      return join ? join.workUnit.outcome : "Idle";
  }
}

/**
 * `canSplit` is true when another session already holds the centre, so this one
 * can join it. Every drag interaction needs a button equivalent — drag-only
 * would make dual-session unreachable without a pointer.
 */
function resolveActions(
  state: SessionCardState,
  active: boolean,
  canSplit: boolean,
): SessionCardAction[] {
  const actions: SessionCardAction[] = [];
  switch (state) {
    case "needs-approval":
      actions.push(
        { kind: "review", label: "Review", emphasis: "standard" },
        { kind: "approve", label: "Approve", emphasis: "primary" },
      );
      break;
    case "needs-input":
      actions.push({ kind: "respond", label: "Respond", emphasis: "primary" });
      break;
    case "ready-review":
      actions.push({ kind: "review", label: "Review", emphasis: "primary" });
      break;
    case "failed":
      actions.push(
        { kind: "open", label: "Open", emphasis: "standard" },
        { kind: "retry", label: "Retry", emphasis: "primary" },
      );
      break;
    case "paused":
      actions.push({ kind: "resume", label: "Resume", emphasis: "primary" });
      break;
    default:
      break;
  }
  if (active) {
    actions.push({ kind: "return-to-shelf", label: "Return to shelf", emphasis: "quiet" });
  } else {
    actions.push({ kind: "focus", label: "Open", emphasis: "quiet" });
    if (canSplit) {
      actions.push({ kind: "split", label: "Open beside", emphasis: "quiet" });
    }
  }
  return actions;
}

function modelLabelOf(thread: SidebarThreadSummary): string {
  const selection = thread.modelSelection as { model?: string } | null;
  return selection?.model ?? "Automatic";
}

function providerOf(thread: SidebarThreadSummary): string | null {
  const selection = thread.modelSelection as { provider?: string } | null;
  return selection?.provider ?? thread.session?.provider ?? null;
}

export interface BuildSessionCardsInput {
  projectId: ProjectId;
  threads: ReadonlyArray<SidebarThreadSummary>;
  snapshot: SascodeProjectSnapshot | null;
  attemptsByWorkUnit: ReadonlyMap<string, ReadonlyArray<WorkUnitAttempt>>;
  /** Threads currently occupying the centre surface. */
  activeThreadIds: ReadonlyArray<ThreadId>;
  /** Caller-supplied clock so the derivation stays pure and testable. */
  nowMs: number;
  /** Role display names keyed by role id, from the project's routing policy. */
  roleLabels?: ReadonlyMap<string, string>;
}

/**
 * Builds the ordered session-card list for one project space.
 * Ordering puts anything needing a human first, then live work, then the rest.
 */
export function buildSessionCards(input: BuildSessionCardsInput): SessionCard[] {
  const workflows = input.snapshot?.workflows ?? [];
  const joins = indexAttemptsByThread(workflows, input.attemptsByWorkUnit);
  const attentionByWorkUnit = new Map<string, string>();
  for (const presentation of input.snapshot?.attention.items ?? []) {
    const workUnitId = presentation.item.workUnitId;
    if (workUnitId && !presentation.item.resolvedAt) {
      attentionByWorkUnit.set(workUnitId, presentation.item.fingerprint);
    }
  }

  const activeSet = new Set(input.activeThreadIds);

  const cards = input.threads
    .filter((thread) => thread.projectId === input.projectId && !thread.archivedAt)
    .map<SessionCard>((thread) => {
      const join = joins.get(thread.id);
      const state = resolveSessionCardState(thread, join);
      const active = activeSet.has(thread.id);
      const updatedAt = thread.updatedAt ?? thread.createdAt;
      const updatedMs = Date.parse(updatedAt);

      return {
        threadId: thread.id,
        projectId: thread.projectId,
        title: thread.title,
        state,
        roleLabel: join ? (input.roleLabels?.get(join.workUnit.roleId) ?? null) : null,
        modelLabel: modelLabelOf(thread),
        provider: providerOf(thread),
        activity: resolveActivity(state, thread, join),
        updatedAt,
        elapsedMs: Number.isFinite(updatedMs) ? Math.max(0, input.nowMs - updatedMs) : 0,
        progress: join ? workflowProgress(join.workflow) : null,
        workflowId: join?.workflow.id ?? null,
        workUnitId: join?.workUnit.id ?? null,
        attemptId: join?.attempt.id ?? null,
        attentionFingerprint: join ? (attentionByWorkUnit.get(join.workUnit.id) ?? null) : null,
        actions: resolveActions(state, active, input.activeThreadIds.length === 1 && !active),
        active,
      };
    });

  return cards.toSorted((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    const byState = STATE_ORDER[a.state] - STATE_ORDER[b.state];
    if (byState !== 0) return byState;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

/** Count of cards that genuinely need a human, for the collapsed shelf summary. */
export function countActionableCards(cards: ReadonlyArray<SessionCard>): number {
  return cards.filter((card) => card.state === "needs-approval" || card.state === "needs-input")
    .length;
}
