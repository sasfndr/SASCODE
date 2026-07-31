import type { Workflow, WorkUnit } from "@synara/contracts";
import { describe, expect, it } from "vitest";

import {
  canTransitionWorkflow,
  canTransitionWorkUnit,
  canTransitionWorkUnitAttempt,
  selectReadyWorkUnitIds,
  validateWorkflowGraph,
} from "./sascodeWorkflow";

const now = "2026-07-30T04:30:00.000Z";

const unit = (
  id: string,
  key: string,
  sortOrder: number,
  status: WorkUnit["status"] = "waiting-dependency",
): WorkUnit =>
  ({
    id,
    workflowId: "workflow-1",
    key,
    title: key,
    outcome: `${key} complete`,
    activity: "backend-implementation",
    roleId: "role-backend",
    status,
    priority: "normal",
    risk: "medium",
    sortOrder,
    declaredResources: [],
    requiredEvidenceKinds: ["test"],
    activeAttemptId: null,
    createdAt: now,
    updatedAt: now,
    terminalAt: null,
  }) as WorkUnit;

const workflow = (
  units: ReadonlyArray<WorkUnit>,
  dependencies: Workflow["dependencies"],
): Pick<Workflow, "id" | "workUnits" | "dependencies"> => ({
  id: "workflow-1" as Workflow["id"],
  workUnits: units,
  dependencies,
});

describe("SASCODE workflow graph", () => {
  it("accepts a valid dependency graph and selects ready units deterministically", () => {
    const design = unit("unit-design", "design", 0, "succeeded");
    const backend = unit("unit-backend", "backend", 2);
    const frontend = unit("unit-frontend", "frontend", 1);
    const graph = workflow(
      [backend, design, frontend],
      [
        {
          fromWorkUnitId: design.id,
          toWorkUnitId: frontend.id,
          condition: "success",
          gateKey: null,
        },
        {
          fromWorkUnitId: design.id,
          toWorkUnitId: backend.id,
          condition: "success",
          gateKey: null,
        },
      ],
    );

    expect(validateWorkflowGraph(graph)).toEqual([]);
    expect(selectReadyWorkUnitIds(graph)).toEqual([frontend.id, backend.id]);
  });

  it("rejects cycles, missing nodes, and malformed gate dependencies", () => {
    const first = unit("unit-1", "first", 0);
    const second = unit("unit-2", "second", 1);
    const issues = validateWorkflowGraph(
      workflow(
        [first, second],
        [
          {
            fromWorkUnitId: first.id,
            toWorkUnitId: second.id,
            condition: "gate",
            gateKey: null,
          },
          {
            fromWorkUnitId: second.id,
            toWorkUnitId: first.id,
            condition: "success",
            gateKey: null,
          },
          {
            fromWorkUnitId: "missing" as WorkUnit["id"],
            toWorkUnitId: first.id,
            condition: "always",
            gateKey: null,
          },
        ],
      ),
    );

    expect(issues.map(({ code }) => code)).toEqual([
      "gate-key-required",
      "missing-dependency-source",
    ]);
  });

  it("requires named gates before releasing gate-dependent work", () => {
    const build = unit("unit-build", "build", 0, "succeeded");
    const release = unit("unit-release", "release", 1);
    const graph = workflow(
      [build, release],
      [
        {
          fromWorkUnitId: build.id,
          toWorkUnitId: release.id,
          condition: "gate",
          gateKey: "release-ready",
        },
      ],
    );

    expect(selectReadyWorkUnitIds(graph)).toEqual([]);
    expect(selectReadyWorkUnitIds(graph, new Set(["release-ready"]))).toEqual([release.id]);
  });

  it("allows only explicit workflow, work-unit, and attempt transitions", () => {
    expect(canTransitionWorkflow("proposed", "awaiting-approval")).toBe(true);
    expect(canTransitionWorkflow("completed", "running")).toBe(false);
    expect(canTransitionWorkUnit("verifying", "succeeded")).toBe(true);
    expect(canTransitionWorkUnit("succeeded", "running")).toBe(false);
    expect(canTransitionWorkUnitAttempt("dispatching", "running")).toBe(true);
    expect(canTransitionWorkUnitAttempt("succeeded", "running")).toBe(false);
  });
});
