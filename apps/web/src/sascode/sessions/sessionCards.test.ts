import type {
  ProjectId,
  SascodeProjectSnapshot,
  ThreadId,
  Workflow,
  WorkUnitAttempt,
} from "@synara/contracts";
import { describe, expect, it } from "vitest";

import type { SidebarThreadSummary } from "~/types";
import {
  buildSessionCards,
  countActionableCards,
  indexAttemptsByThread,
  resolveSessionCardState,
  workflowProgress,
} from "./sessionCards";

const PROJECT = "project-a" as ProjectId;
const NOW = Date.parse("2026-07-31T12:00:00.000Z");

const thread = (id: string, overrides: Partial<SidebarThreadSummary> = {}): SidebarThreadSummary =>
  ({
    id: id as ThreadId,
    projectId: PROJECT,
    title: id,
    modelSelection: { provider: "claudeAgent", model: "opus-5" },
    interactionMode: "chat",
    branch: null,
    worktreePath: null,
    session: null,
    createdAt: "2026-07-31T11:00:00.000Z",
    updatedAt: "2026-07-31T11:50:00.000Z",
    latestTurn: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    hasLiveTailWork: false,
    ...overrides,
  }) as unknown as SidebarThreadSummary;

const workUnit = (id: string, overrides: Record<string, unknown> = {}) =>
  ({
    id,
    workflowId: "wf-1",
    key: id,
    title: `Unit ${id}`,
    outcome: `Outcome ${id}`,
    activity: "frontend-implementation",
    roleId: "role-interface",
    status: "running",
    priority: "normal",
    risk: "low",
    sortOrder: 0,
    declaredResources: [],
    requiredEvidenceKinds: [],
    createdAt: "2026-07-31T11:00:00.000Z",
    updatedAt: "2026-07-31T11:00:00.000Z",
    ...overrides,
  }) as unknown as Workflow["workUnits"][number];

const workflow = (units: Workflow["workUnits"]): Workflow =>
  ({
    id: "wf-1",
    projectId: PROJECT,
    title: "Feature",
    outcome: "Ship it",
    status: "running",
    routingPolicyId: "policy-1",
    routingPolicyRevision: 1,
    graphRevision: 1,
    workUnits: units,
    dependencies: [],
    concurrencyLimit: 4,
    createdBy: "session-owner",
    createdAt: "2026-07-31T11:00:00.000Z",
    updatedAt: "2026-07-31T11:00:00.000Z",
  }) as unknown as Workflow;

const attempt = (
  id: string,
  workUnitId: string,
  overrides: Record<string, unknown> = {},
): WorkUnitAttempt =>
  ({
    id,
    workflowId: "wf-1",
    workUnitId,
    attemptNumber: 1,
    status: "running",
    routingDecisionId: "rd-1",
    taskContractId: "tc-1",
    threadId: "t-1" as ThreadId,
    createdAt: "2026-07-31T11:00:00.000Z",
    updatedAt: "2026-07-31T11:00:00.000Z",
    ...overrides,
  }) as unknown as WorkUnitAttempt;

const snapshot = (workflows: Workflow[]): SascodeProjectSnapshot =>
  ({
    projectId: PROJECT,
    workflows,
    attention: {
      summary: {
        projectId: PROJECT,
        state: "working",
        highestPriority: "normal",
        activeWorkflowCount: 1,
        activeWorkUnitCount: 1,
        needsInputCount: 0,
        needsApprovalCount: 0,
        failedCount: 0,
        updatedAt: "2026-07-31T11:00:00.000Z",
      },
      preference: {
        projectId: PROJECT,
        focusMode: "balanced",
        mutedReasonCodes: [],
        systemNotificationsEnabled: true,
        updatedAt: "2026-07-31T11:00:00.000Z",
      },
      items: [],
      generatedAt: "2026-07-31T11:00:00.000Z",
    },
    browserProfiles: [],
    browserInstances: [],
    modules: [],
    layout: null,
    activePermissionGrants: [],
    generatedAt: "2026-07-31T11:00:00.000Z",
  }) as unknown as SascodeProjectSnapshot;

describe("indexAttemptsByThread", () => {
  it("joins an attempt to its provider thread", () => {
    const flow = workflow([workUnit("wu-1")]);
    const index = indexAttemptsByThread([flow], new Map([["wu-1", [attempt("a-1", "wu-1")]]]));
    expect(index.get("t-1" as ThreadId)?.workUnit.id).toBe("wu-1");
  });

  it("prefers the newest attempt when a thread was reused across retries", () => {
    const flow = workflow([workUnit("wu-1")]);
    const index = indexAttemptsByThread(
      [flow],
      new Map([
        [
          "wu-1",
          [
            attempt("a-1", "wu-1", { attemptNumber: 1, status: "failed" }),
            attempt("a-2", "wu-1", { attemptNumber: 2, status: "running" }),
          ],
        ],
      ]),
    );
    expect(index.get("t-1" as ThreadId)?.attempt.id).toBe("a-2");
  });

  it("ignores attempts with no thread attached yet", () => {
    const flow = workflow([workUnit("wu-1")]);
    const index = indexAttemptsByThread(
      [flow],
      new Map([["wu-1", [attempt("a-1", "wu-1", { threadId: null })]]]),
    );
    expect(index.size).toBe(0);
  });
});

describe("workflowProgress", () => {
  it("counts succeeded and skipped units", () => {
    const flow = workflow([
      workUnit("a", { status: "succeeded" }),
      workUnit("b", { status: "skipped" }),
      workUnit("c", { status: "running" }),
      workUnit("d", { status: "ready" }),
    ]);
    expect(workflowProgress(flow)).toBeCloseTo(0.5, 5);
  });
});

describe("resolveSessionCardState", () => {
  it("puts a live approval above whatever the Director recorded", () => {
    const flow = workflow([workUnit("wu-1", { status: "running" })]);
    const join = {
      workflow: flow,
      workUnit: flow.workUnits[0]!,
      attempt: attempt("a-1", "wu-1"),
    };
    expect(resolveSessionCardState(thread("t-1", { hasPendingApprovals: true }), join)).toBe(
      "needs-approval",
    );
  });

  it("treats an actionable plan as an approval", () => {
    expect(
      resolveSessionCardState(thread("t-1", { hasActionableProposedPlan: true }), undefined),
    ).toBe("needs-approval");
  });

  it("reports a dependency wait from the work unit", () => {
    const flow = workflow([workUnit("wu-1", { status: "waiting-dependency" })]);
    const join = {
      workflow: flow,
      workUnit: flow.workUnits[0]!,
      attempt: attempt("a-1", "wu-1", { status: "queued" }),
    };
    expect(resolveSessionCardState(thread("t-1"), join)).toBe("waiting-dependency");
  });

  it("reports a failed attempt even while the thread looks quiet", () => {
    const flow = workflow([workUnit("wu-1")]);
    const join = {
      workflow: flow,
      workUnit: flow.workUnits[0]!,
      attempt: attempt("a-1", "wu-1", { status: "failed", error: "typecheck failed" }),
    };
    expect(resolveSessionCardState(thread("t-1"), join)).toBe("failed");
  });

  it("falls back to live turn state for a plain chat thread", () => {
    expect(
      resolveSessionCardState(
        thread("t-1", { latestTurn: { state: "running" } as never }),
        undefined,
      ),
    ).toBe("working");
    expect(
      resolveSessionCardState(
        thread("t-1", { latestTurn: { state: "completed" } as never }),
        undefined,
      ),
    ).toBe("ready-review");
    expect(resolveSessionCardState(thread("t-1"), undefined)).toBe("idle");
  });
});

describe("buildSessionCards", () => {
  const baseInput = {
    projectId: PROJECT,
    snapshot: snapshot([workflow([workUnit("wu-1")])]),
    attemptsByWorkUnit: new Map([["wu-1", [attempt("a-1", "wu-1")]]]),
    activeThreadIds: [] as ThreadId[],
    nowMs: NOW,
  };

  it("orders actionable sessions before working ones", () => {
    const cards = buildSessionCards({
      ...baseInput,
      threads: [
        thread("t-2", { latestTurn: { state: "running" } as never }),
        thread("t-3", { hasPendingUserInput: true }),
        thread("t-4", { hasPendingApprovals: true }),
      ],
    });
    expect(cards.map((card) => card.state)).toEqual(["needs-approval", "needs-input", "working"]);
  });

  it("floats the active session to the front", () => {
    const cards = buildSessionCards({
      ...baseInput,
      threads: [thread("t-5", { hasPendingApprovals: true }), thread("t-1")],
      activeThreadIds: ["t-1" as ThreadId],
    });
    expect(cards[0]!.threadId).toBe("t-1");
    expect(cards[0]!.active).toBe(true);
  });

  it("excludes archived and other-project threads", () => {
    const cards = buildSessionCards({
      ...baseInput,
      threads: [
        thread("t-1"),
        thread("t-archived", { archivedAt: "2026-07-30T00:00:00.000Z" }),
        thread("t-other", { projectId: "project-b" as ProjectId }),
      ],
    });
    expect(cards.map((card) => card.threadId)).toEqual(["t-1"]);
  });

  it("carries workflow progress only for sessions that belong to a workflow", () => {
    const cards = buildSessionCards({
      ...baseInput,
      threads: [thread("t-1"), thread("t-9")],
    });
    const joined = cards.find((card) => card.threadId === "t-1");
    const plain = cards.find((card) => card.threadId === "t-9");
    expect(joined?.progress).not.toBeNull();
    expect(plain?.progress).toBeNull();
  });

  it("offers review and approve on an approval card, and open on the rest", () => {
    const cards = buildSessionCards({
      ...baseInput,
      threads: [thread("t-1", { hasPendingApprovals: true })],
    });
    const kinds = cards[0]!.actions.map((action) => action.kind);
    expect(kinds).toContain("review");
    expect(kinds).toContain("approve");
  });

  it("offers a keyboard-reachable split once one session holds the centre", () => {
    const cards = buildSessionCards({
      ...baseInput,
      threads: [thread("t-1"), thread("t-2")],
      activeThreadIds: ["t-1" as ThreadId],
    });
    const inactive = cards.find((card) => card.threadId === "t-2");
    // Dual-session must be reachable without a pointer, so the drag has a button.
    expect(inactive?.actions.map((action) => action.kind)).toContain("split");
  });

  it("does not offer split when nothing is focused yet", () => {
    const cards = buildSessionCards({ ...baseInput, threads: [thread("t-1")] });
    expect(cards[0]!.actions.map((action) => action.kind)).not.toContain("split");
  });

  it("offers return-to-shelf instead of open for an active session", () => {
    const cards = buildSessionCards({
      ...baseInput,
      threads: [thread("t-1")],
      activeThreadIds: ["t-1" as ThreadId],
    });
    expect(cards[0]!.actions.map((action) => action.kind)).toContain("return-to-shelf");
  });

  it("labels the role when the routing policy supplies one", () => {
    const cards = buildSessionCards({
      ...baseInput,
      threads: [thread("t-1")],
      roleLabels: new Map([["role-interface", "Interface Engineer"]]),
    });
    expect(cards[0]!.roleLabel).toBe("Interface Engineer");
  });

  it("computes elapsed time from the supplied clock", () => {
    const cards = buildSessionCards({ ...baseInput, threads: [thread("t-1")] });
    expect(cards[0]!.elapsedMs).toBe(10 * 60 * 1000);
  });

  it("works with no SASCODE snapshot at all", () => {
    const cards = buildSessionCards({
      ...baseInput,
      snapshot: null,
      attemptsByWorkUnit: new Map(),
      threads: [thread("t-1", { latestTurn: { state: "running" } as never })],
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]!.state).toBe("working");
    expect(cards[0]!.workflowId).toBeNull();
  });
});

describe("countActionableCards", () => {
  it("counts only sessions blocked on a human", () => {
    const cards = buildSessionCards({
      projectId: PROJECT,
      snapshot: null,
      attemptsByWorkUnit: new Map(),
      activeThreadIds: [],
      nowMs: NOW,
      threads: [
        thread("t-1", { hasPendingApprovals: true }),
        thread("t-2", { hasPendingUserInput: true }),
        thread("t-3", { latestTurn: { state: "running" } as never }),
      ],
    });
    expect(countActionableCards(cards)).toBe(2);
  });
});
