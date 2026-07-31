import {
  AgentRoleId,
  RoutingPolicyId,
  WorkflowId,
  WorkUnitId,
  type ContextArtifactId,
  type PermissionGrantId,
  type SascodeStartFeatureInput,
  type Workflow,
  type WorkUnit,
  type WorkUnitDependency,
  type WorkUnitExecutionSpec,
} from "@synara/contracts";

export interface SascodeFeaturePlan {
  readonly workflow: Workflow;
  readonly executionSpecs: ReadonlyArray<WorkUnitExecutionSpec>;
}

interface PlannedUnit {
  readonly unit: WorkUnit;
  readonly instructions: string;
  readonly acceptanceCriteria: WorkUnitExecutionSpec["acceptanceCriteria"];
  readonly expectedArtifacts: WorkUnitExecutionSpec["expectedArtifacts"];
}

const roleIds = {
  experienceArchitect: AgentRoleId.makeUnsafe(
    "sascode-role:experience-architect",
  ),
  interfaceEngineer: AgentRoleId.makeUnsafe(
    "sascode-role:interface-engineer",
  ),
  systemsEngineer: AgentRoleId.makeUnsafe(
    "sascode-role:systems-engineer",
  ),
  browserOperator: AgentRoleId.makeUnsafe(
    "sascode-role:browser-operator",
  ),
  independentReviewer: AgentRoleId.makeUnsafe(
    "sascode-role:independent-reviewer",
  ),
} as const;

const unitId = (
  input: SascodeStartFeatureInput,
  key: string,
): WorkUnitId =>
  WorkUnitId.makeUnsafe(`sascode:${input.projectId}:${input.requestId}:${key}`);

function baseInstructions(
  input: SascodeStartFeatureInput,
  responsibility: string,
): string {
  return [
    `Feature request: ${input.request}`,
    "",
    `Your responsibility: ${responsibility}`,
    "",
    "Work only inside the sealed resource boundary. Read the attached SASCODE context artifacts and dependency result packets before acting. Preserve unrelated work. Verify your outcome, then submit the structured result through synara_submit_sascode_result before your final textual handoff.",
  ].join("\n");
}

function makeUnit(
  input: SascodeStartFeatureInput,
  definition: {
    readonly key: string;
    readonly title: string;
    readonly outcome: string;
    readonly activity: WorkUnit["activity"];
    readonly roleId: WorkUnit["roleId"];
    readonly sortOrder: number;
    readonly risk: WorkUnit["risk"];
    readonly requiredEvidenceKinds: ReadonlyArray<string>;
    readonly responsibility: string;
    readonly acceptanceCriteria: WorkUnitExecutionSpec["acceptanceCriteria"];
    readonly expectedArtifacts: WorkUnitExecutionSpec["expectedArtifacts"];
  },
): PlannedUnit {
  return {
    unit: {
      id: unitId(input, definition.key),
      workflowId: WorkflowId.makeUnsafe(
        `sascode:${input.projectId}:${input.requestId}`,
      ),
      key: definition.key,
      title: definition.title,
      outcome: definition.outcome,
      activity: definition.activity,
      roleId: definition.roleId,
      status: "ready",
      priority: "high",
      risk: definition.risk,
      sortOrder: definition.sortOrder,
      declaredResources: [
        { kind: "directory", uri: input.workspaceRoot },
      ],
      requiredEvidenceKinds: [...definition.requiredEvidenceKinds],
      activeAttemptId: null,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
      terminalAt: null,
    },
    instructions: baseInstructions(input, definition.responsibility),
    acceptanceCriteria: definition.acceptanceCriteria,
    expectedArtifacts: definition.expectedArtifacts,
  };
}

export function createSascodeFeaturePlan(
  input: SascodeStartFeatureInput,
  contextArtifactIds: ReadonlyArray<ContextArtifactId>,
  permissionGrantIds: ReadonlyArray<PermissionGrantId>,
): SascodeFeaturePlan {
  const workflowId = WorkflowId.makeUnsafe(
    `sascode:${input.projectId}:${input.requestId}`,
  );
  const planned: PlannedUnit[] = [];
  const dependencies: WorkUnitDependency[] = [];
  let sortOrder = 0;
  let frontendEnd: WorkUnitId | null = null;
  let backendEnd: WorkUnitId | null = null;

  if (input.includeFrontend) {
    const ux = makeUnit(input, {
      key: "experience-plan",
      title: "Plan the product experience",
      outcome:
        "A precise, design-led UX and visual implementation plan grounded in the product and taste context.",
      activity: "ux-planning",
      roleId: roleIds.experienceArchitect,
      sortOrder: sortOrder++,
      risk: "low",
      requiredEvidenceKinds: ["artifact"],
      responsibility:
        "Plan the hierarchy, user flow, interaction model, responsive behavior, visual system, states, and acceptance details. Do not implement the interface. Produce a concise artifact that the interface engineer can execute without rediscovering intent.",
      acceptanceCriteria: [
        {
          id: "experience-plan-complete",
          statement:
            "The implementation plan covers hierarchy, interaction, visual language, responsive behavior, empty/loading/error states, and accessibility.",
          verification:
            "Review the plan against the project charter, design contract, and requested outcome.",
          required: true,
        },
      ],
      expectedArtifacts: [
        "Experience plan",
        "Visual and interaction acceptance checklist",
      ],
    });
    const frontend = makeUnit(input, {
      key: "interface-build",
      title: "Build the interface",
      outcome:
        "A production-grade interface that faithfully realizes the approved SASCODE experience plan.",
      activity: "frontend-implementation",
      roleId: roleIds.interfaceEngineer,
      sortOrder: sortOrder++,
      risk: "medium",
      requiredEvidenceKinds: ["build"],
      responsibility:
        "Implement the interface from the dependency experience plan. Treat polish, hierarchy, motion, responsiveness, accessibility, and all interaction states as product requirements. Use the existing application architecture and component system.",
      acceptanceCriteria: [
        {
          id: "interface-implemented",
          statement:
            "The requested interface and interaction behavior are implemented across relevant responsive states.",
          verification:
            "Run the focused frontend build or equivalent repository verification and inspect the implementation against the experience plan.",
          required: true,
        },
        {
          id: "interface-quality",
          statement:
            "The interface preserves semantic structure, keyboard access, clear states, and production-grade visual finish.",
          verification:
            "Inspect the rendered UI and implementation for accessibility, hierarchy, state coverage, and visual coherence.",
          required: true,
        },
      ],
      expectedArtifacts: [
        "Interface implementation",
        "Focused build evidence",
        "Implementation handoff",
      ],
    });
    dependencies.push({
      fromWorkUnitId: ux.unit.id,
      toWorkUnitId: frontend.unit.id,
      condition: "success",
      gateKey: null,
    });
    planned.push(ux, frontend);
    frontendEnd = frontend.unit.id;
  }

  if (input.includeBackend) {
    const backend = makeUnit(input, {
      key: "systems-build",
      title: "Build the systems layer",
      outcome:
        "A durable, tested backend implementation that satisfies the feature contract and integrates cleanly with the existing system.",
      activity: "backend-implementation",
      roleId: roleIds.systemsEngineer,
      sortOrder: sortOrder++,
      risk: "high",
      requiredEvidenceKinds: ["test"],
      responsibility:
        "Implement the backend, data, automation, or infrastructure behavior required by the feature. Preserve compatibility, durability, idempotency, observability, and testability. Provide a typed integration contract for the interface.",
      acceptanceCriteria: [
        {
          id: "systems-behavior",
          statement:
            "The requested backend behavior is implemented with durable error handling and typed boundaries.",
          verification:
            "Run the narrowest repository-provided tests that prove the changed behavior.",
          required: true,
        },
        {
          id: "systems-integration-contract",
          statement:
            "Frontend and downstream consumers have a clear, stable integration contract.",
          verification:
            "Review changed contracts, runtime handlers, and tests together.",
          required: true,
        },
      ],
      expectedArtifacts: [
        "Backend implementation",
        "Typed integration contract",
        "Focused test evidence",
      ],
    });
    planned.push(backend);
    backendEnd = backend.unit.id;
  }

  if (!input.includeFrontend && !input.includeBackend) {
    const plan = makeUnit(input, {
      key: "product-plan",
      title: "Resolve the product request",
      outcome: "A complete product strategy and execution-ready decision.",
      activity: "product-strategy",
      roleId: roleIds.experienceArchitect,
      sortOrder: sortOrder++,
      risk: "low",
      requiredEvidenceKinds: ["artifact"],
      responsibility:
        "Analyze the product request, resolve the user experience and technical implications, and produce an execution-ready recommendation.",
      acceptanceCriteria: [
        {
          id: "product-decision",
          statement:
            "The request is translated into a coherent, actionable product decision with explicit tradeoffs.",
          verification:
            "Review the decision against the project charter and requested outcome.",
          required: true,
        },
      ],
      expectedArtifacts: ["Product decision", "Execution recommendation"],
    });
    planned.push(plan);
    frontendEnd = plan.unit.id;
  }

  let implementationEndIds = [frontendEnd, backendEnd].filter(
    (id): id is WorkUnitId => id !== null,
  );

  if (implementationEndIds.length > 1) {
    const integration = makeUnit(input, {
      key: "integration",
      title: "Integrate the feature",
      outcome:
        "The interface and systems implementations operate as one coherent, verified feature.",
      activity: "integration",
      roleId: roleIds.systemsEngineer,
      sortOrder: sortOrder++,
      risk: "high",
      requiredEvidenceKinds: ["test", "build"],
      responsibility:
        "Consume both implementation handoffs, connect the interface and backend, resolve contract mismatches, and verify the end-to-end feature without weakening either implementation.",
      acceptanceCriteria: [
        {
          id: "feature-integrated",
          statement:
            "Frontend and backend behavior operate together through the typed contract.",
          verification:
            "Run focused integration tests and the relevant build.",
          required: true,
        },
      ],
      expectedArtifacts: [
        "Integrated feature",
        "Integration test evidence",
        "Build evidence",
      ],
    });
    for (const dependencyId of implementationEndIds) {
      dependencies.push({
        fromWorkUnitId: dependencyId,
        toWorkUnitId: integration.unit.id,
        condition: "success",
        gateKey: null,
      });
    }
    planned.push(integration);
    implementationEndIds = [integration.unit.id];
  }

  if (input.includeBrowserValidation && input.includeFrontend) {
    const browser = makeUnit(input, {
      key: "browser-validation",
      title: "Validate the live experience",
      outcome:
        "Evidence that the implemented experience works and looks correct in a real browser across its critical states.",
      activity: "browser-operation",
      roleId: roleIds.browserOperator,
      sortOrder: sortOrder++,
      risk: "medium",
      requiredEvidenceKinds: [
        "browser-check",
        "visual-comparison",
        "accessibility-check",
      ],
      responsibility:
        "Run the application, exercise the critical journey in an isolated browser, inspect responsive and interaction states, compare the rendered result with the design contract, and record visual, browser, and accessibility evidence. Make only narrowly scoped corrections when authorized.",
      acceptanceCriteria: [
        {
          id: "critical-journey",
          statement:
            "The critical user journey succeeds in a real browser with correct loading, success, empty, and error behavior.",
          verification:
            "Exercise and record the critical path in the isolated browser.",
          required: true,
        },
        {
          id: "visual-fidelity",
          statement:
            "The rendered result meets the hierarchy, aesthetic, responsive, and accessibility requirements.",
          verification:
            "Capture and compare the relevant visual states, including keyboard and responsive checks.",
          required: true,
        },
      ],
      expectedArtifacts: [
        "Browser journey evidence",
        "Visual comparison evidence",
        "Accessibility evidence",
      ],
    });
    for (const dependencyId of implementationEndIds) {
      dependencies.push({
        fromWorkUnitId: dependencyId,
        toWorkUnitId: browser.unit.id,
        condition: "success",
        gateKey: null,
      });
    }
    planned.push(browser);
    implementationEndIds = [browser.unit.id];
  }

  if (input.includeIndependentReview) {
    const review = makeUnit(input, {
      key: "independent-review",
      title: "Independently review the feature",
      outcome:
        "An evidence-backed independent review by a provider different from the implementation, with blocking defects resolved or explicitly surfaced.",
      activity: "code-review",
      roleId: roleIds.independentReviewer,
      sortOrder: sortOrder++,
      risk: "medium",
      requiredEvidenceKinds: input.includeFrontend
        ? ["code-review", "visual-comparison"]
        : ["code-review"],
      responsibility:
        "Independently review the dependency result, complete diff, tests, security implications, and—when present—the rendered interface. Use a provider different from the implementation. Correct only clear in-scope defects, rerun affected verification, and report every remaining risk.",
      acceptanceCriteria: [
        {
          id: "independent-review-complete",
          statement:
            "A provider independent from the implementation has reviewed the complete feature and its evidence.",
          verification:
            "Confirm the routing decision differs from the dependency provider and attach passing review evidence.",
          required: true,
        },
        {
          id: "blocking-defects-resolved",
          statement:
            "No known blocking correctness, security, accessibility, or visual defect remains.",
          verification:
            "Review the complete diff and rerun every verification affected by review corrections.",
          required: true,
        },
      ],
      expectedArtifacts: [
        "Independent code review",
        ...(input.includeFrontend ? ["Independent visual review"] : []),
        "Final risk assessment",
      ],
    });
    for (const dependencyId of implementationEndIds) {
      dependencies.push({
        fromWorkUnitId: dependencyId,
        toWorkUnitId: review.unit.id,
        condition: "success",
        gateKey: null,
      });
    }
    planned.push(review);
  }

  const dependentIds = new Set(
    dependencies.map(({ toWorkUnitId }) => toWorkUnitId),
  );
  const workUnits = planned.map(({ unit }) => ({
    ...unit,
    status: dependentIds.has(unit.id)
      ? ("waiting-dependency" as const)
      : ("ready" as const),
  }));
  const workflow: Workflow = {
    id: workflowId,
    projectId: input.projectId,
    title: input.title,
    outcome: input.outcome,
    status: "proposed",
    routingPolicyId: RoutingPolicyId.makeUnsafe(
      `sascode:${input.projectId}:design-led-routing`,
    ),
    routingPolicyRevision: input.policyRevision,
    graphRevision: 1,
    workUnits,
    dependencies,
    concurrencyLimit: Math.max(1, Math.floor(input.concurrencyLimit)),
    createdBy: "session-owner",
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
    startedAt: null,
    completedAt: null,
  };

  const incomingByUnit = new Map<WorkUnitId, ReadonlyArray<WorkUnitId>>();
  for (const unit of workUnits) {
    incomingByUnit.set(
      unit.id,
      dependencies
        .filter(({ toWorkUnitId }) => toWorkUnitId === unit.id)
        .map(({ fromWorkUnitId }) => fromWorkUnitId),
    );
  }
  const executionSpecs: WorkUnitExecutionSpec[] = planned.map((entry) => ({
    workflowId,
    workUnitId: entry.unit.id,
    revision: 1,
    instructions: entry.instructions,
    acceptanceCriteria: [...entry.acceptanceCriteria],
    allowedResources: [
      { kind: "directory", uri: input.workspaceRoot },
    ],
    forbiddenResources: [],
    contextArtifactIds: [...contextArtifactIds],
    permissionProfile: input.permissionProfile,
    permissionGrantIds: [...permissionGrantIds],
    expectedArtifacts: [...entry.expectedArtifacts],
    routingConstraints:
      entry.unit.activity === "code-review"
        ? (incomingByUnit.get(entry.unit.id) ?? []).map((workUnitId) => ({
            type: "different-provider-from-work-unit" as const,
            workUnitId,
          }))
        : [],
    baselineGitRef: input.baselineGitRef ?? null,
    maxAttempts: Math.max(1, Math.floor(input.maxAttempts)),
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  }));

  return { workflow, executionSpecs };
}
