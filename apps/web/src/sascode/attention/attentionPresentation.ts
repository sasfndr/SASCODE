// FILE: sascode/attention/attentionPresentation.ts
// Purpose: Turns backend attention snapshots into what the shell may show, and
//          how loudly. The escalation policy is the backend's; this only maps
//          it onto Stillspace presentation.
// Layer: Pure derivation.
//
// The rule the whole product rests on: working stays ambient, a human decision
// becomes unmistakable. Nothing here ever invents an interruption the backend
// did not already classify, and nothing pulses.

import type {
  AttentionInterruptionClass,
  AttentionPresentationItem,
  AttentionState,
  ProjectAttentionSnapshot,
  ProjectId,
  WorkspaceAttentionSnapshot,
} from "@synara/contracts";

export type AttentionTone = "live" | "attention" | "blocked" | "accent" | "resting";

export const ATTENTION_TONE: Record<AttentionState, AttentionTone> = {
  quiet: "resting",
  working: "live",
  observing: "live",
  "waiting-dependency": "resting",
  "needs-input": "attention",
  "needs-approval": "attention",
  "ready-review": "accent",
  failed: "blocked",
  complete: "live",
};

export const ATTENTION_LABEL: Record<AttentionState, string> = {
  quiet: "Quiet",
  working: "Working",
  observing: "Observing",
  "waiting-dependency": "Waiting on dependency",
  "needs-input": "Needs your input",
  "needs-approval": "Needs your approval",
  "ready-review": "Ready for review",
  failed: "Failed",
  complete: "Complete",
};

/** Higher wins when one indicator has to stand for a whole project. */
const STATE_WEIGHT: Record<AttentionState, number> = {
  failed: 6,
  "needs-approval": 5,
  "needs-input": 5,
  "ready-review": 4,
  working: 3,
  observing: 2,
  "waiting-dependency": 2,
  complete: 1,
  quiet: 0,
};

export interface ProjectAttentionPresentation {
  projectId: ProjectId;
  state: AttentionState;
  tone: AttentionTone;
  label: string;
  /** Decisions a human must make right now. Drives the numeric badge. */
  actionableCount: number;
  failedCount: number;
  activeCount: number;
  /** True when this project should draw the eye from another project space. */
  wantsAttention: boolean;
  /** Loudest surviving interruption class after suppression. */
  interruption: AttentionInterruptionClass;
}

const CLASS_WEIGHT: Record<AttentionInterruptionClass, number> = {
  silent: 0,
  ambient: 1,
  "in-app": 2,
  system: 3,
};

function loudestClass(
  items: ReadonlyArray<AttentionPresentationItem>,
): AttentionInterruptionClass {
  let loudest: AttentionInterruptionClass = "silent";
  for (const entry of items) {
    if (entry.suppressed) continue;
    if (CLASS_WEIGHT[entry.effectiveInterruptionClass] > CLASS_WEIGHT[loudest]) {
      loudest = entry.effectiveInterruptionClass;
    }
  }
  return loudest;
}

export function presentProjectAttention(
  snapshot: ProjectAttentionSnapshot,
): ProjectAttentionPresentation {
  const { summary } = snapshot;
  const actionableCount = summary.needsInputCount + summary.needsApprovalCount;
  const interruption = loudestClass(snapshot.items);

  return {
    projectId: summary.projectId,
    state: summary.state,
    tone: ATTENTION_TONE[summary.state],
    label: ATTENTION_LABEL[summary.state],
    actionableCount,
    failedCount: summary.failedCount,
    activeCount: summary.activeWorkUnitCount,
    // Ambient progress is never "attention" — only a decision or a failure is.
    wantsAttention:
      interruption !== "silent" && (actionableCount > 0 || summary.failedCount > 0),
    interruption,
  };
}

export interface WorkspaceAttentionPresentation {
  byProject: ReadonlyMap<ProjectId, ProjectAttentionPresentation>;
  /** Projects wanting attention, loudest first. Drives the global indicator. */
  ranked: ReadonlyArray<ProjectAttentionPresentation>;
  totalActionable: number;
  totalFailed: number;
}

export function presentWorkspaceAttention(
  snapshot: WorkspaceAttentionSnapshot | undefined,
): WorkspaceAttentionPresentation {
  const byProject = new Map<ProjectId, ProjectAttentionPresentation>();
  for (const project of snapshot?.projects ?? []) {
    byProject.set(project.summary.projectId, presentProjectAttention(project));
  }

  const ranked = [...byProject.values()]
    .filter((entry) => entry.wantsAttention)
    .sort((a, b) => {
      const byState = STATE_WEIGHT[b.state] - STATE_WEIGHT[a.state];
      if (byState !== 0) return byState;
      return b.actionableCount - a.actionableCount;
    });

  return {
    byProject,
    ranked,
    totalActionable: [...byProject.values()].reduce(
      (total, entry) => total + entry.actionableCount,
      0,
    ),
    totalFailed: [...byProject.values()].reduce((total, entry) => total + entry.failedCount, 0),
  };
}

export interface AttentionAnnouncement {
  fingerprint: string;
  projectId: ProjectId;
  message: string;
  /** `assertive` only for a failure or a hard block; everything else is polite. */
  politeness: "polite" | "assertive";
}

/**
 * Selects the items worth announcing to assistive technology.
 *
 * Only unsuppressed items that escalated past ambient are announced, so a
 * long-running build never chatters into a screen reader.
 */
export function attentionAnnouncements(
  snapshot: ProjectAttentionSnapshot | undefined,
): AttentionAnnouncement[] {
  if (!snapshot) return [];
  return snapshot.items
    .filter((entry) => !entry.suppressed && !entry.item.resolvedAt)
    .filter((entry) => CLASS_WEIGHT[entry.effectiveInterruptionClass] >= CLASS_WEIGHT["in-app"])
    .map((entry) => ({
      fingerprint: entry.item.fingerprint,
      projectId: entry.item.projectId,
      message: entry.item.recommendedAction
        ? `${entry.item.summary}. ${entry.item.recommendedAction}`
        : entry.item.summary,
      politeness:
        entry.item.state === "failed" || entry.item.priority === "urgent"
          ? ("assertive" as const)
          : ("polite" as const),
    }));
}

/**
 * The items that deserve a visible, actionable surface inside the app —
 * the calm bottom-right notice in the reference, not a notification feed.
 */
export function inAppAttentionItems(
  snapshot: ProjectAttentionSnapshot | undefined,
  limit = 3,
): ReadonlyArray<AttentionPresentationItem> {
  if (!snapshot) return [];
  return snapshot.items
    .filter((entry) => !entry.suppressed && !entry.item.resolvedAt)
    .filter((entry) => CLASS_WEIGHT[entry.effectiveInterruptionClass] >= CLASS_WEIGHT["in-app"])
    .sort((a, b) => STATE_WEIGHT[b.item.state] - STATE_WEIGHT[a.item.state])
    .slice(0, limit);
}
