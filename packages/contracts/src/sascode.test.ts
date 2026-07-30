import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  AttentionItem,
  BrowserInstance,
  ProviderCapabilitySnapshot,
  ResultPacket,
  RoutingPolicy,
  SascodeModuleManifest,
  SascodePermissionGrant,
  SascodeStepUpRequest,
  TaskContract,
  Workflow,
} from "./sascode";

const now = "2026-07-30T04:30:00.000Z";

const role = {
  id: "role-backend",
  key: "backend-engineer",
  displayName: "Backend Engineer",
  description: "Implements backend work.",
  activities: ["backend-implementation"],
  requiredTools: ["file-read", "file-write", "shell", "git", "worktree"],
  preferredProviderKeys: ["openai"],
  preferredModelFamilies: ["gpt-agentic"],
  forbiddenProviderKeys: [],
  fallbackRoleIds: [],
  defaultPermissionProfile: "safe-build",
  defaultRisk: "medium",
};

describe("SASCODE contracts", () => {
  it("decodes immutable dynamic provider capability snapshots", () => {
    const decoded = Schema.decodeUnknownSync(ProviderCapabilitySnapshot)({
      id: "capability-snapshot-1",
      connectionId: "connection-codex",
      providerKey: "openai",
      providerKind: "codex",
      displayName: "Codex Max",
      connectionKind: "subscription-cli",
      health: "ready",
      healthDetail: null,
      models: [
        {
          slug: "gpt-5.6-sol",
          family: "gpt-agentic",
          displayName: "GPT-5.6",
          capability: {
            activities: ["backend-implementation", "code-review", "testing"],
            inputModalities: ["text", "image"],
            outputModalities: ["text"],
            tools: ["file-read", "file-write", "shell", "git", "worktree", "browser"],
            contextWindowTokens: 400_000,
            supportsReasoningControl: true,
            supportsSessionResume: true,
            supportsThreadImport: true,
            supportsStructuredOutput: true,
            supportsStreaming: true,
          },
          optionDefaults: { reasoningEffort: "high" },
        },
      ],
      quota: [{ label: "weekly", usedFraction: 0.25, resetsAt: null }],
      authenticatedAccountLabel: "Primary",
      discoveredAt: now,
      expiresAt: null,
    });

    expect(decoded.models[0]?.capability.tools).toContain("worktree");
    expect(decoded.connectionKind).toBe("subscription-cli");
  });

  it("requires a non-empty role catalog in routing policies", () => {
    const base = {
      id: "policy-design-led",
      projectId: "project-1",
      name: "Design-led product build",
      description: "Routes design, frontend, backend, and independent review.",
      revision: 1,
      roles: [role],
      scoreWeights: {
        capability: 1,
        preference: 1,
        availability: 1,
        quality: 1,
        cost: 0.25,
        latency: 0.25,
        continuity: 0.5,
      },
      qualityGates: [],
      fallbackBehavior: "reroute-same-role",
      maxParallelWorkUnits: 4,
      requireDifferentProviderForIndependentReview: true,
      userOverrides: {},
      digest: "sha256:policy",
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    expect(Schema.is(RoutingPolicy)(base)).toBe(true);
    expect(Schema.is(RoutingPolicy)({ ...base, roles: [] })).toBe(false);
  });

  it("decodes a sealed task contract and matching result packet", () => {
    const task = Schema.decodeUnknownSync(TaskContract)({
      id: "task-contract-1",
      workflowId: "workflow-1",
      workUnitId: "work-unit-1",
      version: 1,
      digest: "sha256:task-contract",
      activity: "backend-implementation",
      roleId: role.id,
      outcome: "Implement the capability catalog.",
      instructions: "Follow the repository service/layer split.",
      acceptanceCriteria: [
        {
          id: "criterion-1",
          statement: "Capability snapshots are durable.",
          verification: "Repository round-trip test passes.",
          required: true,
        },
      ],
      allowedResources: [{ kind: "directory", uri: "apps/server/src/sascode" }],
      forbiddenResources: [{ kind: "file", uri: ".env" }],
      contextArtifactIds: ["context-product-vision"],
      dependencyResultPacketIds: [],
      requiredEvidenceKinds: ["test"],
      baselineGitRef: "47e71197",
      permissionProfile: "safe-build",
      permissionGrantIds: [],
      risk: "medium",
      expectedArtifacts: ["Typed repository"],
      sealedAt: now,
      createdAt: now,
    });

    const result = Schema.decodeUnknownSync(ResultPacket)({
      id: "result-packet-1",
      workflowId: task.workflowId,
      workUnitId: task.workUnitId,
      attemptId: "attempt-1",
      taskContractId: task.id,
      taskContractDigest: task.digest,
      status: "complete",
      summary: "Capability catalog implemented.",
      changedResources: [{ kind: "file", uri: "apps/server/src/sascode/catalog.ts" }],
      decisionIds: [],
      evidenceIds: ["evidence-test-1"],
      commandsRun: ["bun run test"],
      risks: [],
      unresolvedQuestions: [],
      nextAction: null,
      producedAt: now,
    });

    expect(result.taskContractDigest).toBe(task.digest);
    expect(result.evidenceIds).toHaveLength(1);
  });

  it("represents workflow graphs independently from provider threads", () => {
    const unit = {
      id: "work-unit-1",
      workflowId: "workflow-1",
      key: "backend",
      title: "Build backend",
      outcome: "Backend capability is complete.",
      activity: "backend-implementation",
      roleId: role.id,
      status: "ready",
      priority: "high",
      risk: "medium",
      sortOrder: 0,
      declaredResources: [{ kind: "directory", uri: "apps/server" }],
      requiredEvidenceKinds: ["test"],
      activeAttemptId: null,
      createdAt: now,
      updatedAt: now,
      terminalAt: null,
    };
    const decoded = Schema.decodeUnknownSync(Workflow)({
      id: "workflow-1",
      projectId: "project-1",
      title: "Build SASCODE",
      outcome: "A verified backend exists.",
      status: "queued",
      routingPolicyId: "policy-design-led",
      routingPolicyRevision: 1,
      graphRevision: 1,
      workUnits: [unit],
      dependencies: [],
      concurrencyLimit: 4,
      createdBy: "user:sas",
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
    });

    expect(decoded.workUnits[0]?.status).toBe("ready");
    expect(decoded.workUnits[0]).not.toHaveProperty("threadId");
  });

  it("keeps full access bounded by an isolated permission boundary", () => {
    const grant = Schema.decodeUnknownSync(SascodePermissionGrant)({
      id: "grant-1",
      scope: {
        projectId: "project-1",
        threadId: null,
        workflowId: "workflow-1",
        workUnitId: "work-unit-1",
      },
      profile: "full-access-isolated",
      capabilities: ["read-files", "write-files", "run-arbitrary-commands", "use-network"],
      boundary: {
        workspaceRoots: ["/tmp/sascode-worktree"],
        allowedHosts: [],
        deniedResources: [{ kind: "file", uri: "/Users/sas/.ssh" }],
        isolatedExecutionRequired: true,
        expiresAt: null,
      },
      grantedBy: "user:sas",
      reason: "Backend implementation in an isolated worktree.",
      createdAt: now,
      revokedAt: null,
    });

    expect(grant.boundary.isolatedExecutionRequired).toBe(true);
    expect(grant.profile).toBe("full-access-isolated");
  });

  it("models consequential actions as explicit step-up requests", () => {
    expect(
      Schema.is(SascodeStepUpRequest)({
        id: "step-up-1",
        scope: {
          projectId: "project-1",
          workflowId: "workflow-1",
          workUnitId: "work-unit-1",
        },
        status: "pending",
        requestedCapabilities: ["deploy"],
        risk: "high",
        reason: "Publish the verified release.",
        consequence: "Makes the release publicly available.",
        requestedAt: now,
        resolvedAt: null,
        resolvedBy: null,
      }),
    ).toBe(true);
  });

  it("supports durable browser, module, and attention identities", () => {
    const browser = Schema.decodeUnknownSync(BrowserInstance)({
      id: "browser-1",
      projectId: "project-1",
      profileId: "browser-profile-1",
      backend: "local-visible",
      status: "agent-controlled",
      controlOwner: {
        kind: "agent",
        threadId: "thread-1",
        workflowId: "workflow-1",
        workUnitId: "work-unit-1",
      },
      tabs: [
        {
          id: "tab-1",
          url: "http://localhost:5173",
          title: "SASCODE",
          active: true,
          lastNavigationAt: now,
        },
      ],
      assignedWorkflowId: "workflow-1",
      assignedWorkUnitId: "work-unit-1",
      evidenceIds: [],
      recordingEnabled: true,
      runtimeGeneration: 1,
      authorizationEpoch: 2,
      controlLeaseExpiresAt: now,
      lastError: null,
      createdAt: now,
      updatedAt: now,
      stoppedAt: null,
    });
    const module = Schema.decodeUnknownSync(SascodeModuleManifest)({
      id: "module-browser",
      version: "1.0.0",
      name: "Browser",
      description: "A shared browser module.",
      category: "core-work",
      origin: "built-in",
      entrypoint: "builtin:browser",
      placements: ["canvas", "fullscreen"],
      requiredPermissions: ["control-browser"],
      backgroundExecution: true,
      singletonPerProject: false,
      signature: null,
    });
    const attention = Schema.decodeUnknownSync(AttentionItem)({
      fingerprint: "approval:workflow-1:work-unit-1",
      projectId: "project-1",
      workflowId: "workflow-1",
      workUnitId: "work-unit-1",
      state: "needs-approval",
      priority: "urgent",
      interruptionClass: "in-app",
      reasonCode: "permission-step-up",
      summary: "Deployment approval is required.",
      recommendedAction: "Review the requested scope.",
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      snoozedUntil: null,
    });

    expect(browser.controlOwner.kind).toBe("agent");
    expect(module.origin).toBe("built-in");
    expect(attention.state).toBe("needs-approval");
  });
});
