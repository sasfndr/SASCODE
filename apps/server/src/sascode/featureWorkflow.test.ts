import {
  ContextArtifactId,
  PermissionGrantId,
  ProjectId,
  Workflow,
  WorkUnitExecutionSpec,
} from "@synara/contracts";
import { validateWorkflowGraph } from "@synara/shared/sascodeWorkflow";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { createSascodeFeaturePlan } from "./featureWorkflow.ts";

const input = {
  requestId: "feature-live-sessions",
  projectId: ProjectId.makeUnsafe("project-sascode-feature-plan"),
  title: "Live multi-session project spaces",
  outcome:
    "Users can move through beautiful project workspaces while parallel sessions remain live.",
  request:
    "Create the project-space interaction, live session cards, backend session state, browser validation, and independent review.",
  workspaceRoot: "/Users/sas/Documents/SASCODE",
  includeFrontend: true,
  includeBackend: true,
  includeBrowserValidation: true,
  includeIndependentReview: true,
  permissionProfile: "full-access-isolated" as const,
  policyRevision: 1,
  concurrencyLimit: 4,
  maxAttempts: 3,
  baselineGitRef: "origin/main",
  occurredAt: "2026-07-30T19:00:00.000Z",
};

describe("SASCODE feature workflow", () => {
  it("builds a valid design-first multi-provider execution graph", () => {
    const plan = createSascodeFeaturePlan(
      input,
      [ContextArtifactId.makeUnsafe("context-design")],
      [PermissionGrantId.makeUnsafe("grant-full")],
    );

    expect(validateWorkflowGraph(plan.workflow)).toEqual([]);
    expect(() => Schema.decodeUnknownSync(Workflow)(plan.workflow)).not.toThrow();
    expect(
      plan.executionSpecs.every((spec) => {
        Schema.decodeUnknownSync(WorkUnitExecutionSpec)(spec);
        return true;
      }),
    ).toBe(true);
    expect(plan.workflow.workUnits.map(({ key }) => key)).toEqual([
      "experience-plan",
      "interface-build",
      "systems-build",
      "integration",
      "browser-validation",
      "independent-review",
    ]);
    expect(
      plan.workflow.workUnits
        .filter(({ status }) => status === "ready")
        .map(({ key }) => key),
    ).toEqual(["experience-plan", "systems-build"]);

    const review = plan.workflow.workUnits.find(
      ({ key }) => key === "independent-review",
    );
    const browser = plan.workflow.workUnits.find(
      ({ key }) => key === "browser-validation",
    );
    const reviewSpec = plan.executionSpecs.find(
      ({ workUnitId }) => workUnitId === review?.id,
    );
    expect(reviewSpec?.routingConstraints).toEqual([
      {
        type: "different-provider-from-work-unit",
        workUnitId: browser?.id,
      },
    ]);
    expect(
      plan.workflow.workUnits.find(({ key }) => key === "interface-build")
        ?.requiredEvidenceKinds,
    ).toEqual(["build"]);
  });

  it("falls back to a product decision workflow when no implementation track is selected", () => {
    const plan = createSascodeFeaturePlan(
      {
        ...input,
        requestId: "feature-product-decision",
        includeFrontend: false,
        includeBackend: false,
        includeBrowserValidation: false,
        includeIndependentReview: false,
      },
      [],
      [],
    );
    expect(plan.workflow.workUnits).toHaveLength(1);
    expect(plan.workflow.workUnits[0]).toMatchObject({
      key: "product-plan",
      activity: "product-strategy",
      status: "ready",
    });
    expect(validateWorkflowGraph(plan.workflow)).toEqual([]);
  });
});
