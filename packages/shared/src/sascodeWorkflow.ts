import type {
  Workflow,
  WorkflowStatus,
  WorkUnit,
  WorkUnitAttemptStatus,
  WorkUnitDependency,
  WorkUnitId,
  WorkUnitStatus,
} from "@synara/contracts";

export type WorkflowGraphIssueCode =
  | "empty-workflow"
  | "workflow-id-mismatch"
  | "duplicate-work-unit-id"
  | "duplicate-work-unit-key"
  | "missing-dependency-source"
  | "missing-dependency-target"
  | "self-dependency"
  | "duplicate-dependency"
  | "gate-key-required"
  | "gate-key-unexpected"
  | "cycle";

export interface WorkflowGraphIssue {
  readonly code: WorkflowGraphIssueCode;
  readonly message: string;
  readonly workUnitIds: ReadonlyArray<WorkUnitId>;
}

const issue = (
  code: WorkflowGraphIssueCode,
  message: string,
  workUnitIds: ReadonlyArray<WorkUnitId> = [],
): WorkflowGraphIssue => ({ code, message, workUnitIds });

export function validateWorkflowGraph(
  workflow: Pick<Workflow, "id" | "workUnits" | "dependencies">,
): ReadonlyArray<WorkflowGraphIssue> {
  const issues: WorkflowGraphIssue[] = [];
  const unitsById = new Map<string, WorkUnit>();
  const unitIdsByKey = new Map<string, WorkUnitId>();

  if (workflow.workUnits.length === 0) {
    issues.push(issue("empty-workflow", "A workflow must contain at least one work unit."));
  }

  for (const unit of workflow.workUnits) {
    if (unit.workflowId !== workflow.id) {
      issues.push(
        issue(
          "workflow-id-mismatch",
          `Work unit "${unit.key}" belongs to another workflow.`,
          [unit.id],
        ),
      );
    }
    if (unitsById.has(unit.id)) {
      issues.push(
        issue("duplicate-work-unit-id", `Work unit ID "${unit.id}" is duplicated.`, [unit.id]),
      );
    } else {
      unitsById.set(unit.id, unit);
    }
    const existingKeyOwner = unitIdsByKey.get(unit.key);
    if (existingKeyOwner) {
      issues.push(
        issue("duplicate-work-unit-key", `Work unit key "${unit.key}" is duplicated.`, [
          existingKeyOwner,
          unit.id,
        ]),
      );
    } else {
      unitIdsByKey.set(unit.key, unit.id);
    }
  }

  const edgeKeys = new Set<string>();
  for (const dependency of workflow.dependencies) {
    const sourceExists = unitsById.has(dependency.fromWorkUnitId);
    const targetExists = unitsById.has(dependency.toWorkUnitId);
    if (!sourceExists) {
      issues.push(
        issue(
          "missing-dependency-source",
          `Dependency source "${dependency.fromWorkUnitId}" does not exist.`,
          [dependency.fromWorkUnitId],
        ),
      );
    }
    if (!targetExists) {
      issues.push(
        issue(
          "missing-dependency-target",
          `Dependency target "${dependency.toWorkUnitId}" does not exist.`,
          [dependency.toWorkUnitId],
        ),
      );
    }
    if (dependency.fromWorkUnitId === dependency.toWorkUnitId) {
      issues.push(
        issue("self-dependency", "A work unit cannot depend on itself.", [
          dependency.fromWorkUnitId,
        ]),
      );
    }
    const edgeKey = `${dependency.fromWorkUnitId}\u0000${dependency.toWorkUnitId}`;
    if (edgeKeys.has(edgeKey)) {
      issues.push(
        issue("duplicate-dependency", "A workflow dependency is duplicated.", [
          dependency.fromWorkUnitId,
          dependency.toWorkUnitId,
        ]),
      );
    }
    edgeKeys.add(edgeKey);
    if (dependency.condition === "gate" && !dependency.gateKey) {
      issues.push(
        issue("gate-key-required", "Gate dependencies must name the required gate.", [
          dependency.fromWorkUnitId,
          dependency.toWorkUnitId,
        ]),
      );
    }
    if (dependency.condition !== "gate" && dependency.gateKey) {
      issues.push(
        issue("gate-key-unexpected", "Only gate dependencies may include a gate key.", [
          dependency.fromWorkUnitId,
          dependency.toWorkUnitId,
        ]),
      );
    }
  }

  if (
    issues.some(
      ({ code }) =>
        code === "missing-dependency-source" ||
        code === "missing-dependency-target" ||
        code === "self-dependency",
    )
  ) {
    return issues;
  }

  const indegree = new Map<string, number>(
    workflow.workUnits.map((unit) => [unit.id, 0] as const),
  );
  const outgoing = new Map<string, WorkUnitId[]>(
    workflow.workUnits.map((unit) => [unit.id, []] as const),
  );
  for (const dependency of workflow.dependencies) {
    indegree.set(
      dependency.toWorkUnitId,
      (indegree.get(dependency.toWorkUnitId) ?? 0) + 1,
    );
    outgoing.get(dependency.fromWorkUnitId)?.push(dependency.toWorkUnitId);
  }

  const queue = workflow.workUnits
    .filter((unit) => indegree.get(unit.id) === 0)
    .map((unit) => unit.id);
  let visited = 0;
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    visited += 1;
    for (const target of outgoing.get(current) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    }
  }

  if (visited !== unitsById.size) {
    const cycleMembers = workflow.workUnits
      .filter((unit) => (indegree.get(unit.id) ?? 0) > 0)
      .map((unit) => unit.id);
    issues.push(issue("cycle", "The workflow dependency graph contains a cycle.", cycleMembers));
  }

  return issues;
}

const WORKFLOW_TRANSITIONS: Readonly<Record<WorkflowStatus, ReadonlySet<WorkflowStatus>>> = {
  proposed: new Set(["awaiting-approval", "cancelled"]),
  "awaiting-approval": new Set(["queued", "proposed", "cancelled"]),
  queued: new Set(["running", "paused", "cancelled"]),
  running: new Set(["paused", "blocked", "verifying", "integrating", "failed", "cancelled"]),
  paused: new Set(["queued", "running", "cancelled"]),
  blocked: new Set(["running", "paused", "failed", "cancelled"]),
  verifying: new Set(["running", "integrating", "failed", "cancelled"]),
  integrating: new Set(["verifying", "completed", "failed", "cancelled"]),
  completed: new Set(),
  failed: new Set(),
  cancelled: new Set(),
};

const WORK_UNIT_TRANSITIONS: Readonly<Record<WorkUnitStatus, ReadonlySet<WorkUnitStatus>>> = {
  draft: new Set(["waiting-dependency", "ready", "cancelled", "skipped"]),
  "waiting-dependency": new Set(["ready", "cancelled", "skipped"]),
  ready: new Set(["routing", "cancelled", "skipped"]),
  routing: new Set(["queued", "blocked", "failed", "cancelled"]),
  queued: new Set(["running", "blocked", "failed", "cancelled"]),
  running: new Set(["waiting-approval", "blocked", "verifying", "failed", "cancelled"]),
  "waiting-approval": new Set(["running", "blocked", "failed", "cancelled"]),
  blocked: new Set(["ready", "routing", "running", "failed", "cancelled"]),
  verifying: new Set(["running", "succeeded", "failed", "cancelled"]),
  succeeded: new Set(),
  failed: new Set(["ready"]),
  cancelled: new Set(),
  skipped: new Set(),
};

const ATTEMPT_TRANSITIONS: Readonly<
  Record<WorkUnitAttemptStatus, ReadonlySet<WorkUnitAttemptStatus>>
> = {
  preparing: new Set(["dispatching", "failed", "cancelled"]),
  dispatching: new Set(["queued", "running", "failed", "cancelled", "abandoned"]),
  queued: new Set(["running", "failed", "cancelled", "abandoned"]),
  running: new Set(["waiting-approval", "verifying", "failed", "cancelled", "abandoned"]),
  "waiting-approval": new Set(["running", "failed", "cancelled", "abandoned"]),
  verifying: new Set(["running", "succeeded", "failed", "cancelled"]),
  succeeded: new Set(),
  failed: new Set(),
  cancelled: new Set(),
  abandoned: new Set(),
};

export const canTransitionWorkflow = (from: WorkflowStatus, to: WorkflowStatus): boolean =>
  WORKFLOW_TRANSITIONS[from].has(to);

export const canTransitionWorkUnit = (from: WorkUnitStatus, to: WorkUnitStatus): boolean =>
  WORK_UNIT_TRANSITIONS[from].has(to);

export const canTransitionWorkUnitAttempt = (
  from: WorkUnitAttemptStatus,
  to: WorkUnitAttemptStatus,
): boolean => ATTEMPT_TRANSITIONS[from].has(to);

function dependencySatisfied(
  dependency: WorkUnitDependency,
  source: WorkUnit,
  passedGateKeys: ReadonlySet<string>,
): boolean {
  switch (dependency.condition) {
    case "success":
      return source.status === "succeeded";
    case "failure":
      return source.status === "failed";
    case "always":
      return ["succeeded", "failed", "cancelled", "skipped"].includes(source.status);
    case "gate":
      return (
        source.status === "succeeded" &&
        Boolean(dependency.gateKey) &&
        passedGateKeys.has(dependency.gateKey!)
      );
  }
}

export function selectReadyWorkUnitIds(
  workflow: Pick<Workflow, "workUnits" | "dependencies">,
  passedGateKeys: ReadonlySet<string> = new Set(),
): ReadonlyArray<WorkUnitId> {
  const unitsById = new Map(workflow.workUnits.map((unit) => [unit.id, unit] as const));
  const incoming = new Map<string, WorkUnitDependency[]>();
  for (const dependency of workflow.dependencies) {
    const current = incoming.get(dependency.toWorkUnitId) ?? [];
    current.push(dependency);
    incoming.set(dependency.toWorkUnitId, current);
  }

  return workflow.workUnits
    .filter((unit) => unit.status === "waiting-dependency" || unit.status === "ready")
    .filter((unit) =>
      (incoming.get(unit.id) ?? []).every((dependency) => {
        const source = unitsById.get(dependency.fromWorkUnitId);
        return source ? dependencySatisfied(dependency, source, passedGateKeys) : false;
      }),
    )
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
    .map((unit) => unit.id);
}
