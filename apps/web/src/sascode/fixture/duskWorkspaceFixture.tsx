// FILE: sascode/fixture/duskWorkspaceFixture.tsx
// Purpose: A deterministic development-only reconstruction of the Dusk
//          workspace foundation state, fed through the real presentation
//          components.
// Layer: Development tooling.
//
// WHY THIS EXISTS
// A design reference shows an active workspace: several models mid-flight, a
// preview with something in it, a decision waiting. Live backend state cannot
// be held still in that shape long enough to compare against a source image, so
// visual fidelity was previously being judged against an idle empty project —
// which is how a composition can pass review and still be wrong.
//
// WHAT IT IS NOT
// It is not a fallback, not seed data, and not a demo mode. Nothing here can
// reach production: the only entry point is `useVisualFixture`, whose dynamic
// import sits inside an `import.meta.env.DEV` branch, so the bundler drops this
// module from the production build entirely. It also renders nothing until the
// `?sascodeFixture=dusk` flag is present, so a development session does not
// silently show invented sessions either.
//
// Everything below is frozen: fixed ids, fixed timestamps, fixed elapsed times.
// A fixture that reads the clock produces a different screenshot every run and
// stops being usable as a visual baseline.

import type { ProjectId, ThreadId, WorkflowId } from "@synara/contracts";

import type { TranscriptEntry } from "../chat/transcriptModel";
import type { SessionCard } from "../sessions/sessionCards";
import type { WorkbenchActivityItem } from "../workbench/WorkbenchActivityStrip";
import type { WorkbenchMode } from "../workbench/workbenchModes";
import { DUSK_BACKGROUND_URL } from "../project-space/ProjectEnvironment";
import { FixturePreview, FixtureChanges, FixtureFiles, FixtureTerminal } from "./FixtureWorkbenchPanes";

const PROJECT_ID = "fixture-project-workspace-shell" as ProjectId;
const WORKFLOW_ID = "fixture-workflow-shell" as WorkflowId;

/** Frozen wall clock. Every relative time below is computed against this. */
const NOW = Date.parse("2026-07-30T18:38:00.000Z");
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

export interface VisualFixture {
  projectName: string;
  /** The canonical composition is chat-left; a stored layout must not change it. */
  chatDock: "left";
  previousProjectName: string;
  nextProjectName: string;
  cards: ReadonlyArray<SessionCard>;
  transcript: ReadonlyArray<TranscriptEntry>;
  activity: ReadonlyArray<WorkbenchActivityItem>;
  focusedThreadId: ThreadId;
  workbenchTitle: string;
  workbenchModel: string;
  toast: { summary: string; detail: string };
  renderMode: (mode: WorkbenchMode) => React.ReactNode | null;
}

const OPUS_THREAD = "fixture-thread-opus" as ThreadId;
const FABLE_THREAD = "fixture-thread-fable" as ThreadId;
const GPT_THREAD = "fixture-thread-gpt" as ThreadId;
const REVIEW_THREAD = "fixture-thread-review" as ThreadId;

function card(input: Partial<SessionCard> & Pick<SessionCard, "threadId" | "title" | "state">): SessionCard {
  return {
    projectId: PROJECT_ID,
    roleLabel: null,
    modelLabel: "Model",
    provider: null,
    activity: "",
    updatedAt: minutesAgo(1),
    elapsedMs: 60_000,
    progress: null,
    workflowId: WORKFLOW_ID,
    workUnitId: null,
    attemptId: null,
    attentionFingerprint: null,
    actions: [],
    active: false,
    ...input,
  };
}

const CARDS: ReadonlyArray<SessionCard> = [
  card({
    threadId: OPUS_THREAD,
    title: "Workspace shell",
    state: "working",
    roleLabel: "Implementation",
    modelLabel: "Opus 5",
    provider: "claudeAgent",
    activity: "Wiring the session shelf to durable layout state",
    progress: 0.62,
    elapsedMs: 14 * 60_000,
    updatedAt: minutesAgo(1),
    active: true,
  }),
  card({
    threadId: FABLE_THREAD,
    title: "Visual system",
    state: "working",
    roleLabel: "Design direction",
    modelLabel: "Fable 5",
    provider: "claudeAgent",
    activity: "Resolving glass rim against the Dusk horizon",
    progress: 0.41,
    elapsedMs: 22 * 60_000,
    updatedAt: minutesAgo(2),
  }),
  card({
    threadId: REVIEW_THREAD,
    title: "Permissions",
    state: "needs-approval",
    roleLabel: "Security review",
    modelLabel: "Opus 5",
    provider: "claudeAgent",
    activity: "Module scope widened to filesystem read",
    elapsedMs: 4 * 60_000,
    updatedAt: minutesAgo(4),
    attentionFingerprint: "fixture-attention-permissions",
    actions: [
      { kind: "review", label: "Review", emphasis: "standard" },
      { kind: "approve", label: "Approve", emphasis: "primary" },
    ],
  }),
  card({
    threadId: GPT_THREAD,
    title: "Release",
    state: "waiting-dependency",
    roleLabel: "Systems",
    modelLabel: "GPT-5.6 Sol",
    provider: "codex",
    activity: "Waiting on Workspace shell",
    elapsedMs: 9 * 60_000,
    updatedAt: minutesAgo(9),
  }),
];

const TRANSCRIPT: ReadonlyArray<TranscriptEntry> = [
  {
    id: "fixture-message-1",
    threadId: OPUS_THREAD,
    authorKind: "user",
    authorLabel: "You",
    provider: null,
    text: "Refine the workspace to match the Stillspace Dusk direction.",
    chips: [],
    progress: null,
    status: null,
    streaming: false,
    createdAt: minutesAgo(24),
  },
  {
    id: "fixture-message-2",
    threadId: FABLE_THREAD,
    authorKind: "agent",
    authorLabel: "Fable 5",
    provider: "claudeAgent",
    text: "Attached UI direction",
    chips: [
      { kind: "image", label: "dusk-direction.jpg", thumbnailUrl: DUSK_BACKGROUND_URL },
    ],
    progress: null,
    status: null,
    streaming: false,
    createdAt: minutesAgo(19),
  },
  {
    id: "fixture-message-3",
    threadId: OPUS_THREAD,
    authorKind: "agent",
    authorLabel: "Opus 5",
    provider: "claudeAgent",
    text: "Implementing",
    chips: [{ kind: "code", label: "WorkspaceShell.tsx", detail: "TSX" }],
    progress: 0.62,
    status: null,
    streaming: false,
    createdAt: minutesAgo(3),
  },
  {
    id: "fixture-message-4",
    threadId: GPT_THREAD,
    authorKind: "agent",
    authorLabel: "GPT-5.6 Sol",
    provider: "codex",
    text: "Prepare integration layer",
    chips: [],
    progress: null,
    status: "Queued",
    streaming: false,
    createdAt: minutesAgo(9),
  },
];

const ACTIVITY: ReadonlyArray<WorkbenchActivityItem> = [
  { id: "fixture-activity-1", time: "6:31 PM", text: "WorkspaceShell.tsx edited", tone: "info" },
  { id: "fixture-activity-2", time: "6:34 PM", text: "Theme tokens updated", tone: "tool" },
  { id: "fixture-activity-3", time: "6:35 PM", text: "Typecheck passed", tone: "approval" },
];

export function buildDuskWorkspaceFixture(): VisualFixture {
  return {
    projectName: "Workspace shell",
    chatDock: "left",
    previousProjectName: "Billing SDK",
    nextProjectName: "Client portal",
    cards: CARDS,
    transcript: TRANSCRIPT,
    activity: ACTIVITY,
    focusedThreadId: OPUS_THREAD,
    workbenchTitle: "Workspace shell",
    workbenchModel: "Opus 5",
    toast: { summary: "Visual system · Fable 5", detail: "2 decisions ready" },
    renderMode: (mode) => {
      switch (mode) {
        case "preview":
          return <FixturePreview />;
        case "changes":
          return <FixtureChanges />;
        case "terminal":
          return <FixtureTerminal />;
        case "files":
          return <FixtureFiles />;
        case "agents":
          // Agents reads the real Director workflow, which the fixture has no
          // business inventing. Left to the real pane's own empty state.
          return null;
      }
    },
  };
}
