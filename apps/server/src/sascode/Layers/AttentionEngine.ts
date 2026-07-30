import {
  type AttentionItem,
  type AttentionPreference,
  type AttentionPresentationItem,
  type AttentionState,
  type ProjectAttentionSnapshot,
  type SascodePriority,
  type Workflow,
  type WorkflowStatus,
  type WorkUnit,
  type WorkUnitStatus,
} from "@synara/contracts";
import { Effect, Layer, Option } from "effect";

import {
  AttentionEngine,
  type AttentionEngineShape,
} from "../Services/AttentionEngine.ts";
import { AttentionRepository } from "../Services/AttentionRepository.ts";
import { DirectorWorkflowRepository } from "../Services/DirectorWorkflowRepository.ts";

const TERMINAL_WORKFLOW_STATUSES: ReadonlySet<WorkflowStatus> = new Set([
  "completed",
  "failed",
  "cancelled",
]);

const TERMINAL_WORK_UNIT_STATUSES: ReadonlySet<WorkUnitStatus> = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "skipped",
]);

const WORKING_WORKFLOW_STATUSES: ReadonlySet<WorkflowStatus> = new Set([
  "queued",
  "running",
]);

const WORKING_WORK_UNIT_STATUSES: ReadonlySet<WorkUnitStatus> = new Set([
  "ready",
  "routing",
  "queued",
  "running",
]);

const OBSERVING_WORKFLOW_STATUSES: ReadonlySet<WorkflowStatus> = new Set([
  "paused",
  "blocked",
  "verifying",
]);

const PRIORITY_WEIGHT: Readonly<Record<SascodePriority, number>> = {
  background: 0,
  normal: 1,
  high: 2,
  urgent: 3,
};

const highestPriority = (
  priorities: ReadonlyArray<SascodePriority>,
): SascodePriority =>
  priorities.reduce<SascodePriority>(
    (highest, candidate) =>
      PRIORITY_WEIGHT[candidate] > PRIORITY_WEIGHT[highest]
        ? candidate
        : highest,
    "background",
  );

const entityAttentionKey = (
  item: AttentionItem,
  prefix: string,
): string => {
  if (item.workUnitId != null) {
    return `work-unit:${item.workUnitId}`;
  }
  if (item.workflowId != null) {
    return `workflow:${item.workflowId}`;
  }
  return `${prefix}:${item.fingerprint}`;
};

const effectivePresentation = (
  item: AttentionItem,
  preference: AttentionPreference,
): AttentionPresentationItem => {
  if (preference.mutedReasonCodes.includes(item.reasonCode)) {
    return {
      item,
      effectiveInterruptionClass: "silent",
      suppressed: true,
      suppressionReason: "explicit-mute",
    };
  }

  if (preference.focusMode === "do-not-disturb") {
    return {
      item,
      effectiveInterruptionClass: "silent",
      suppressed: true,
      suppressionReason: "focus-mode",
    };
  }

  if (
    preference.focusMode === "deep-focus" &&
    (item.priority !== "urgent" ||
      (item.state !== "failed" &&
        item.state !== "needs-approval" &&
        item.state !== "needs-input"))
  ) {
    return {
      item,
      effectiveInterruptionClass: "silent",
      suppressed: true,
      suppressionReason: "focus-mode",
    };
  }

  if (
    item.interruptionClass === "system" &&
    !preference.systemNotificationsEnabled
  ) {
    return {
      item,
      effectiveInterruptionClass: "in-app",
      suppressed: true,
      suppressionReason: "system-notifications-disabled",
    };
  }

  return {
    item,
    effectiveInterruptionClass: item.interruptionClass,
    suppressed: false,
    suppressionReason: null,
  };
};

const deriveSummaryState = (input: {
  readonly workflows: ReadonlyArray<Workflow>;
  readonly activeItems: ReadonlyArray<AttentionItem>;
  readonly failedCount: number;
  readonly needsApprovalCount: number;
  readonly needsInputCount: number;
}): AttentionState => {
  if (input.failedCount > 0) {
    return "failed";
  }
  if (input.needsApprovalCount > 0) {
    return "needs-approval";
  }
  if (input.needsInputCount > 0) {
    return "needs-input";
  }
  if (
    input.activeItems.some((item) => item.state === "ready-review") ||
    input.workflows.some((workflow) => workflow.status === "integrating")
  ) {
    return "ready-review";
  }
  if (
    input.workflows.some((workflow) =>
      WORKING_WORKFLOW_STATUSES.has(workflow.status),
    ) ||
    input.workflows.some((workflow) =>
      workflow.workUnits.some((unit) =>
        WORKING_WORK_UNIT_STATUSES.has(unit.status),
      ),
    )
  ) {
    return "working";
  }
  if (
    input.activeItems.some((item) => item.state === "waiting-dependency") ||
    input.workflows.some((workflow) =>
      workflow.workUnits.some(
        (unit) => unit.status === "waiting-dependency",
      ),
    )
  ) {
    return "waiting-dependency";
  }
  if (
    input.activeItems.some((item) => item.state === "observing") ||
    input.workflows.some((workflow) =>
      OBSERVING_WORKFLOW_STATUSES.has(workflow.status),
    )
  ) {
    return "observing";
  }
  if (
    input.workflows.length > 0 &&
    input.workflows.every((workflow) => workflow.status === "completed")
  ) {
    return "complete";
  }
  return "quiet";
};

const collectEntityCounts = (
  workflows: ReadonlyArray<Workflow>,
  activeItems: ReadonlyArray<AttentionItem>,
) => {
  const failed = new Set<string>();
  const approvals = new Set<string>();
  const inputs = new Set<string>();

  for (const workflow of workflows) {
    if (workflow.status === "failed") {
      failed.add(`workflow:${workflow.id}`);
    }
    if (workflow.status === "awaiting-approval") {
      approvals.add(`workflow:${workflow.id}`);
    }
    for (const unit of workflow.workUnits) {
      if (unit.status === "failed") {
        failed.add(`work-unit:${unit.id}`);
      }
      if (unit.status === "waiting-approval") {
        approvals.add(`work-unit:${unit.id}`);
      }
    }
  }

  for (const item of activeItems) {
    if (item.state === "failed") {
      failed.add(entityAttentionKey(item, "failed"));
    }
    if (item.state === "needs-approval") {
      approvals.add(entityAttentionKey(item, "approval"));
    }
    if (item.state === "needs-input") {
      inputs.add(entityAttentionKey(item, "input"));
    }
  }

  return {
    failedCount: failed.size,
    needsApprovalCount: approvals.size,
    needsInputCount: inputs.size,
  };
};

const makeAttentionEngine = Effect.gen(function* () {
  const workflows = yield* DirectorWorkflowRepository;
  const attention = yield* AttentionRepository;

  const getEffectivePreference = (
    projectId: ProjectAttentionSnapshot["summary"]["projectId"],
    now: string,
  ) =>
    Effect.gen(function* () {
      const projectPreference = yield* attention.getPreference({ projectId });
      if (Option.isSome(projectPreference)) {
        return projectPreference.value;
      }
      const globalPreference = yield* attention.getPreference({
        projectId: null,
      });
      if (Option.isSome(globalPreference)) {
        return globalPreference.value;
      }
      return {
        projectId: null,
        focusMode: "balanced",
        mutedReasonCodes: [],
        systemNotificationsEnabled: true,
        updatedAt: now,
      } satisfies AttentionPreference;
    });

  const getProjectSnapshot: AttentionEngineShape["getProjectSnapshot"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const [projectWorkflows, activeItems, preference] = yield* Effect.all(
        [
          workflows.listByProject({ projectId: input.projectId }),
          attention.listActiveItems({
            projectId: input.projectId,
            now: input.now,
          }),
          getEffectivePreference(input.projectId, input.now),
        ],
        { concurrency: "unbounded" },
      );

      const activeWorkflows = projectWorkflows.filter(
        (workflow) => !TERMINAL_WORKFLOW_STATUSES.has(workflow.status),
      );
      const activeWorkUnits = activeWorkflows.flatMap((workflow) =>
        workflow.workUnits.filter(
          (unit) => !TERMINAL_WORK_UNIT_STATUSES.has(unit.status),
        ),
      );
      const counts = collectEntityCounts(projectWorkflows, activeItems);
      const state = deriveSummaryState({
        workflows: projectWorkflows,
        activeItems,
        ...counts,
      });
      const priorities = [
        ...activeItems.map((item) => item.priority),
        ...activeWorkUnits.map((unit: WorkUnit) => unit.priority),
      ];

      return {
        summary: {
          projectId: input.projectId,
          state,
          highestPriority: highestPriority(priorities),
          activeWorkflowCount: activeWorkflows.length,
          activeWorkUnitCount: activeWorkUnits.length,
          ...counts,
          updatedAt: input.now,
        },
        preference,
        items: activeItems.map((item) =>
          effectivePresentation(item, preference),
        ),
        generatedAt: input.now,
      } satisfies ProjectAttentionSnapshot;
    });

  const getWorkspaceSnapshot: AttentionEngineShape["getWorkspaceSnapshot"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const uniqueProjectIds = [...new Set(input.projectIds)];
      const projects = yield* Effect.forEach(
        uniqueProjectIds,
        (projectId) => getProjectSnapshot({ projectId, now: input.now }),
        { concurrency: "unbounded" },
      );
      return {
        projects,
        generatedAt: input.now,
      };
    });

  return {
    getProjectSnapshot,
    getWorkspaceSnapshot,
  } satisfies AttentionEngineShape;
});

export const AttentionEngineLive = Layer.effect(
  AttentionEngine,
  makeAttentionEngine,
);
