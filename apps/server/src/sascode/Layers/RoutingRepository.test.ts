import {
  AgentRoleId,
  CapabilitySnapshotId,
  ProjectId,
  ProviderConnectionId,
  RoutingDecisionId,
  RoutingPolicyId,
  WorkflowId,
  WorkUnitId,
  type ProviderCapabilitySnapshot,
  type ProviderConnection,
  type RoutingDecision,
  type RoutingPolicy,
  type Workflow,
} from "@synara/contracts";
import { assert, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { DirectorWorkflowRepository } from "../Services/DirectorWorkflowRepository.ts";
import { ModelRouter } from "../Services/ModelRouter.ts";
import { RoutingRepository } from "../Services/RoutingRepository.ts";
import { DirectorWorkflowRepositoryLive } from "./DirectorWorkflowRepository.ts";
import { ModelRouterLive } from "./ModelRouter.ts";
import { RoutingRepositoryLive } from "./RoutingRepository.ts";

const routingDependencies = Layer.mergeAll(
  RoutingRepositoryLive,
  DirectorWorkflowRepositoryLive,
).pipe(Layer.provideMerge(SqlitePersistenceMemory));

const repositoryLayer = it.layer(
  Layer.mergeAll(
    ModelRouterLive.pipe(Layer.provide(routingDependencies)),
    routingDependencies,
    SqlitePersistenceMemory,
  ),
);

const now = "2026-07-30T04:00:00.000Z";
const projectId = ProjectId.makeUnsafe("project-routing-repository");
const workflowId = WorkflowId.makeUnsafe("workflow-routing-repository");
const workUnitId = WorkUnitId.makeUnsafe("work-unit-routing-repository");
const policyId = RoutingPolicyId.makeUnsafe("policy-routing-repository");
const connectionId = ProviderConnectionId.makeUnsafe("connection-routing-repository");

const connection: ProviderConnection = {
  id: connectionId,
  providerKey: "codex",
  displayName: "Codex Max",
  connectionKind: "subscription-cli",
  enabled: true,
  priority: 100,
  config: { credentialMode: "cli-subscription" },
  lastCapabilitySnapshotId: null,
  createdAt: now,
  updatedAt: now,
};

const snapshot: ProviderCapabilitySnapshot = {
  id: CapabilitySnapshotId.makeUnsafe("snapshot-routing-repository"),
  connectionId,
  providerKey: "codex",
  providerKind: "codex",
  displayName: "Codex Max",
  connectionKind: "subscription-cli",
  connectionPriority: 100,
  health: "ready",
  healthDetail: null,
  models: [
    {
      slug: "gpt-agent",
      family: "gpt-agentic",
      displayName: "GPT Agent",
      capability: {
        activities: ["backend-implementation", "testing"],
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        tools: ["file-read", "file-write", "shell", "git", "worktree"],
        supportsReasoningControl: true,
        supportsSessionResume: true,
        supportsThreadImport: false,
        supportsStructuredOutput: true,
        supportsStreaming: true,
      },
    },
  ],
  quota: [{ label: "weekly", usedFraction: 0.2 }],
  authenticatedAccountLabel: "sas",
  discoveredAt: now,
  expiresAt: "2026-07-31T04:00:00.000Z",
};

const policy: RoutingPolicy = {
  id: policyId,
  projectId,
  name: "Repository test policy",
  description: "Routes backend work.",
  revision: 1,
  roles: [
    {
      id: AgentRoleId.makeUnsafe("backend-engineer"),
      key: "backend-engineer",
      displayName: "Backend Engineer",
      description: "Builds the backend.",
      activities: ["backend-implementation"],
      requiredTools: ["file-read", "file-write", "shell", "git"],
      preferredProviderKeys: ["codex"],
      preferredModelFamilies: ["gpt-agentic"],
      forbiddenProviderKeys: [],
      fallbackRoleIds: [],
      defaultPermissionProfile: "full-access-isolated",
      defaultRisk: "high",
    },
  ],
  scoreWeights: {
    capability: 4,
    preference: 3,
    availability: 3,
    quality: 2,
    cost: 1,
    latency: 1,
    continuity: 1,
  },
  qualityGates: [],
  fallbackBehavior: "reroute-same-role",
  maxParallelWorkUnits: 4,
  requireDifferentProviderForIndependentReview: true,
  userOverrides: {},
  source: "repository-test",
  digest: "repository-policy-digest",
  publishedAt: now,
  createdAt: now,
  updatedAt: now,
};

const workflow: Workflow = {
  id: workflowId,
  projectId,
  title: "Route one work unit",
  outcome: "The work unit has an immutable routing decision.",
  status: "proposed",
  routingPolicyId: policyId,
  routingPolicyRevision: 1,
  graphRevision: 1,
  concurrencyLimit: 1,
  createdBy: "sas",
  createdAt: now,
  updatedAt: now,
  startedAt: null,
  completedAt: null,
  workUnits: [
    {
      id: workUnitId,
      workflowId,
      key: "backend",
      title: "Build backend",
      outcome: "Backend exists.",
      activity: "backend-implementation",
      roleId: AgentRoleId.makeUnsafe("backend-engineer"),
      status: "routing",
      priority: "high",
      risk: "high",
      sortOrder: 0,
      declaredResources: [],
      requiredEvidenceKinds: ["test"],
      activeAttemptId: null,
      createdAt: now,
      updatedAt: now,
      terminalAt: null,
    },
  ],
  dependencies: [],
};

const decision: RoutingDecision = {
  id: RoutingDecisionId.makeUnsafe("decision-routing-repository"),
  workflowId,
  workUnitId,
  policyId,
  policyRevision: 1,
  roleId: AgentRoleId.makeUnsafe("backend-engineer"),
  candidates: [
    {
      target: {
        connectionId,
        providerKey: "codex",
        providerKind: "codex",
        modelSlug: "gpt-agent",
        modelFamily: "gpt-agentic",
        options: {},
      },
      capabilitySnapshotId: snapshot.id,
      eligible: true,
      score: 0.9,
      scoreComponents: {
        capability: 1,
        preference: 1,
        availability: 1,
        quality: 0.5,
        cost: 0.5,
        latency: 0.5,
        continuity: 1,
      },
      rejectedReasons: [],
      warnings: [],
    },
  ],
  selected: {
    connectionId,
    providerKey: "codex",
    providerKind: "codex",
    modelSlug: "gpt-agent",
    modelFamily: "gpt-agentic",
    options: {},
  },
  fallbackOrder: [],
  constraints: [{ type: "requires-tool", tool: "git" }],
  rationale: "Codex is the highest-scoring eligible backend model.",
  decidedAt: now,
};

repositoryLayer("RoutingRepository", (it) => {
  it.effect("persists connections, snapshots, policies, and immutable decisions", () =>
    Effect.gen(function* () {
      const routing = yield* RoutingRepository;
      const workflows = yield* DirectorWorkflowRepository;
      const router = yield* ModelRouter;

      yield* routing.upsertConnection(connection);
      assert.deepStrictEqual(
        Option.getOrThrow(yield* routing.getConnection(connection.id)),
        connection,
      );
      assert.deepStrictEqual(yield* routing.listConnections(), [connection]);
      assert.isTrue(
        yield* routing.saveCapabilitySnapshot({
          snapshot,
          digest: "snapshot-digest",
        }),
      );
      assert.isFalse(
        yield* routing.saveCapabilitySnapshot({
          snapshot,
          digest: "snapshot-digest",
        }),
      );
      assert.deepStrictEqual(
        Option.getOrThrow(
          yield* routing.getCapabilitySnapshot({ snapshotId: snapshot.id }),
        ),
        snapshot,
      );
      assert.deepStrictEqual(yield* routing.listCurrentCapabilitySnapshots(), [
        snapshot,
      ]);

      assert.isTrue(yield* routing.publishPolicy(policy));
      assert.isFalse(yield* routing.publishPolicy(policy));
      assert.deepStrictEqual(
        Option.getOrThrow(
          yield* routing.getPolicy({ policyId, revision: policy.revision }),
        ),
        policy,
      );

      assert.isTrue(yield* workflows.createGraph(workflow));
      const automaticDecision = yield* router.routeWorkUnit({
        decisionId: RoutingDecisionId.makeUnsafe(
          "decision-routing-repository-automatic",
        ),
        workUnitId,
        constraints: [{ type: "requires-tool", tool: "git" }],
        priorProviders: [],
        decidedAt: "2026-07-30T04:01:00.000Z",
      });
      assert.strictEqual(automaticDecision.selected.providerKey, "codex");
      assert.strictEqual(automaticDecision.selected.modelSlug, "gpt-agent");
      assert.strictEqual(automaticDecision.policyId, policyId);

      assert.isTrue(yield* routing.saveDecision(decision));
      assert.isFalse(yield* routing.saveDecision(decision));
      assert.deepStrictEqual(
        Option.getOrThrow(yield* routing.getDecision({ decisionId: decision.id })),
        decision,
      );
      assert.deepStrictEqual(
        yield* routing.listDecisionsByWorkUnit({ workUnitId }),
        [automaticDecision, decision],
      );
    }),
  );
});
