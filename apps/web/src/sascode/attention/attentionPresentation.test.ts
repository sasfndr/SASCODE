import type {
  AttentionPresentationItem,
  ProjectAttentionSnapshot,
  ProjectId,
} from "@synara/contracts";
import { describe, expect, it } from "vitest";

import {
  attentionAnnouncements,
  inAppAttentionItems,
  presentProjectAttention,
  presentWorkspaceAttention,
} from "./attentionPresentation";

const PROJECT = "project-a" as ProjectId;

const item = (
  overrides: Record<string, unknown> = {},
): AttentionPresentationItem =>
  ({
    item: {
      fingerprint: "fp-1",
      projectId: PROJECT,
      state: "needs-approval",
      priority: "normal",
      interruptionClass: "in-app",
      reasonCode: "approval.pending",
      summary: "Visual system is awaiting feedback",
      recommendedAction: "Review the proposed direction",
      createdAt: "2026-07-31T11:00:00.000Z",
      updatedAt: "2026-07-31T11:00:00.000Z",
      ...(overrides["item"] as Record<string, unknown> | undefined),
    },
    effectiveInterruptionClass: "in-app",
    suppressed: false,
    ...overrides,
  }) as unknown as AttentionPresentationItem;

const snapshot = (
  overrides: Record<string, unknown> = {},
  items: AttentionPresentationItem[] = [],
): ProjectAttentionSnapshot =>
  ({
    summary: {
      projectId: PROJECT,
      state: "working",
      highestPriority: "normal",
      activeWorkflowCount: 1,
      activeWorkUnitCount: 2,
      needsInputCount: 0,
      needsApprovalCount: 0,
      failedCount: 0,
      updatedAt: "2026-07-31T11:00:00.000Z",
      ...(overrides["summary"] as Record<string, unknown> | undefined),
    },
    preference: {
      projectId: PROJECT,
      focusMode: "balanced",
      mutedReasonCodes: [],
      systemNotificationsEnabled: true,
      updatedAt: "2026-07-31T11:00:00.000Z",
    },
    items,
    generatedAt: "2026-07-31T11:00:00.000Z",
  }) as unknown as ProjectAttentionSnapshot;

describe("presentProjectAttention", () => {
  it("treats ambient progress as not wanting attention", () => {
    const result = presentProjectAttention(snapshot({ summary: { state: "working" } }));
    expect(result.wantsAttention).toBe(false);
    expect(result.tone).toBe("live");
    expect(result.label).toBe("Working");
  });

  it("wants attention once a decision is pending", () => {
    const result = presentProjectAttention(
      snapshot({ summary: { state: "needs-approval", needsApprovalCount: 2 } }, [item()]),
    );
    expect(result.wantsAttention).toBe(true);
    expect(result.actionableCount).toBe(2);
    expect(result.interruption).toBe("in-app");
  });

  it("respects backend suppression rather than deciding locally", () => {
    const result = presentProjectAttention(
      snapshot({ summary: { state: "needs-approval", needsApprovalCount: 1 } }, [
        item({ suppressed: true, suppressionReason: "focus-mode" }),
      ]),
    );
    expect(result.interruption).toBe("silent");
    expect(result.wantsAttention).toBe(false);
  });

  it("reports the loudest surviving interruption class", () => {
    const result = presentProjectAttention(
      snapshot({ summary: { state: "failed", failedCount: 1 } }, [
        item({ effectiveInterruptionClass: "ambient" }),
        item({ effectiveInterruptionClass: "system" }),
      ]),
    );
    expect(result.interruption).toBe("system");
  });
});

describe("presentWorkspaceAttention", () => {
  it("ranks failures above decisions", () => {
    const workspace = presentWorkspaceAttention({
      projects: [
        snapshot({ summary: { projectId: "p1", state: "needs-approval", needsApprovalCount: 3 } }, [
          item(),
        ]),
        snapshot({ summary: { projectId: "p2", state: "failed", failedCount: 1 } }, [item()]),
      ],
      generatedAt: "2026-07-31T11:00:00.000Z",
    } as never);
    expect(workspace.ranked[0]?.projectId).toBe("p2");
    expect(workspace.totalActionable).toBe(3);
    expect(workspace.totalFailed).toBe(1);
  });

  it("survives a missing snapshot", () => {
    const workspace = presentWorkspaceAttention(undefined);
    expect(workspace.ranked).toHaveLength(0);
    expect(workspace.totalActionable).toBe(0);
  });
});

describe("announcements and in-app items", () => {
  it("does not announce ambient items", () => {
    const announcements = attentionAnnouncements(
      snapshot({}, [item({ effectiveInterruptionClass: "ambient" })]),
    );
    expect(announcements).toHaveLength(0);
  });

  it("announces a failure assertively and a decision politely", () => {
    const announcements = attentionAnnouncements(
      snapshot({}, [
        item({ item: { fingerprint: "a", state: "failed" } }),
        item({ item: { fingerprint: "b", state: "needs-approval" } }),
      ]),
    );
    expect(announcements.find((entry) => entry.fingerprint === "a")?.politeness).toBe("assertive");
    expect(announcements.find((entry) => entry.fingerprint === "b")?.politeness).toBe("polite");
  });

  it("includes the recommended action in the announcement", () => {
    const [announcement] = attentionAnnouncements(snapshot({}, [item()]));
    expect(announcement?.message).toContain("Review the proposed direction");
  });

  it("skips resolved items", () => {
    const items = inAppAttentionItems(
      snapshot({}, [item({ item: { resolvedAt: "2026-07-31T11:30:00.000Z" } })]),
    );
    expect(items).toHaveLength(0);
  });

  it("caps how many notices can appear at once", () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      item({ item: { fingerprint: `fp-${index}` } }),
    );
    expect(inAppAttentionItems(snapshot({}, many))).toHaveLength(3);
  });
});
