import {
  AgentRoleId,
  CapabilitySnapshotId,
  ProjectId,
  ProviderConnectionId,
  ResultPacketId,
  RoutingPolicyId,
  ThreadId,
  WorkflowId,
  WorkUnitId,
  type ProviderCapabilitySnapshot,
  type ProviderConnection,
  type RoutingPolicy,
  type Workflow,
  type WorkUnitExecutionSpec,
} from "@synara/contracts";
import { assert, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { ContextEvidenceRepository } from "../Services/ContextEvidenceRepository.ts";
import {
  DirectorThreadLauncher,
  type LaunchDirectorThreadInput,
} from "../Services/DirectorThreadLauncher.ts";
import { DirectorWorkflowRepository } from "../Services/DirectorWorkflowRepository.ts";
import { RoutingRepository } from "../Services/RoutingRepository.ts";
import { ResultIngestion } from "../Services/ResultIngestion.ts";
import { WorkUnitOrchestrator } from "../Services/WorkUnitOrchestrator.ts";
import { AttemptDispatcherLive } from "./AttemptDispatcher.ts";
import { ContextEvidenceRepositoryLive } from "./ContextEvidenceRepository.ts";
import { DirectorCommandsLive } from "./DirectorCommands.ts";
import { DirectorEventStoreLive } from "./DirectorEventStore.ts";
import { DirectorExecutionCoordinatorLive } from "./DirectorExecutionCoordinator.ts";
import { DirectorWorkflowRepositoryLive } from "./DirectorWorkflowRepository.ts";
import { DirectorLive } from "./Director.ts";
import { ExecutionPlanRepositoryLive } from "./ExecutionPlanRepository.ts";
import { ModelRouterLive } from "./ModelRouter.ts";
import { RoutingRepositoryLive } from "./RoutingRepository.ts";
import { ResultIngestionLive } from "./ResultIngestion.ts";
import { TaskContractsLive } from "./TaskContracts.ts";
import { WorkUnitOrchestratorLive } from "./WorkUnitOrchestrator.ts";

const launches: LaunchDirectorThreadInput[] = [];
const launcherLayer = Layer.succeed(DirectorThreadLauncher, {
  launch: (input) =>
    Effect.sync(() => {
      launches.push(input);
      return {
        operationId: `operation:${input.requestId}`,
        threadId: ThreadId.makeUnsafe(`thread:${input.attemptId}`),
        worktreePath: `/tmp/sascode/${input.attemptId}`,
        baselineGitRef: input.baseRef,
      };
    }),
});

const repositories = Layer.mergeAll(
  ContextEvidenceRepositoryLive,
  DirectorWorkflowRepositoryLive,
  ExecutionPlanRepositoryLive,
  RoutingRepositoryLive,
).pipe(Layer.provideMerge(SqlitePersistenceMemory));
const directorLayer = DirectorLive.pipe(Layer.provide(repositories));
const eventLayer = DirectorEventStoreLive.pipe(Layer.provideMerge(SqlitePersistenceMemory));
const commandLayer = DirectorCommandsLive.pipe(
  Layer.provide(Layer.mergeAll(directorLayer, eventLayer, repositories)),
);
const modelRouterLayer = ModelRouterLive.pipe(Layer.provide(repositories));
const taskContractsLayer = TaskContractsLive.pipe(Layer.provide(repositories));
const executionCoordinatorLayer = DirectorExecutionCoordinatorLive.pipe(
  Layer.provide(Layer.mergeAll(directorLayer, repositories, taskContractsLayer)),
);
const dispatcherLayer = AttemptDispatcherLive.pipe(
  Layer.provide(Layer.mergeAll(commandLayer, repositories, launcherLayer)),
);
const orchestratorLayer = WorkUnitOrchestratorLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      dispatcherLayer,
      commandLayer,
      modelRouterLayer,
      repositories,
      taskContractsLayer,
    ),
  ),
);
const resultIngestionLayer = ResultIngestionLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      commandLayer,
      eventLayer,
      executionCoordinatorLayer,
      orchestratorLayer,
      repositories,
    ),
  ),
);

const testLayer = it.layer(
  Layer.mergeAll(
    orchestratorLayer,
    dispatcherLayer,
    commandLayer,
    directorLayer,
    eventLayer,
    executionCoordinatorLayer,
    launcherLayer,
    modelRouterLayer,
    repositories,
    resultIngestionLayer,
    taskContractsLayer,
    SqlitePersistenceMemory,
  ),
);

const now = "2026-07-30T16:00:00.000Z";
const projectId = ProjectId.makeUnsafe("project-work-unit-orchestrator");
const workflowId = WorkflowId.makeUnsafe("workflow-work-unit-orchestrator");
const workUnitId = WorkUnitId.makeUnsafe("work-unit-work-unit-orchestrator");
const policyId = RoutingPolicyId.makeUnsafe("policy-work-unit-orchestrator");
const connectionId = ProviderConnectionId.makeUnsafe("connection-work-unit-orchestrator");

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
  id: CapabilitySnapshotId.makeUnsafe("snapshot-work-unit-orchestrator"),
  connectionId,
  providerKey: "codex",
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
      optionDefaults: { reasoningEffort: "high" },
    },
  ],
  quota: [{ label: "weekly", usedFraction: 0.2 }],
  authenticatedAccountLabel: "sas",
  discoveredAt: now,
  expiresAt: "2026-07-31T16:00:00.000Z",
};

const roleId = AgentRoleId.makeUnsafe("backend-engineer");
const policy: RoutingPolicy = {
  id: policyId,
  projectId,
  name: "Design-led model delegation",
  description: "Routes each work unit to its strongest eligible model.",
  revision: 1,
  roles: [
    {
      id: roleId,
      key: "backend-engineer",
      displayName: "Backend Engineer",
      description: "Builds durable backend systems.",
      activities: ["backend-implementation"],
      requiredTools: ["file-read", "file-write", "shell", "git", "worktree"],
      preferredProviderKeys: ["codex"],
      preferredModelFamilies: ["gpt-agentic"],
      forbiddenProviderKeys: [],
      fallbackRoleIds: [],
      defaultPermissionProfile: "full-access-isolated",
      defaultRisk: "medium",
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
  maxParallelWorkUnits: 2,
  requireDifferentProviderForIndependentReview: true,
  userOverrides: {},
  source: "test",
  digest: "policy-work-unit-orchestrator-digest",
  publishedAt: now,
  createdAt: now,
  updatedAt: now,
};

const workflow: Workflow = {
  id: workflowId,
  projectId,
  title: "Build the orchestration loop",
  outcome: "The right model receives a sealed task in an isolated worktree.",
  status: "running",
  routingPolicyId: policyId,
  routingPolicyRevision: 1,
  graphRevision: 1,
  concurrencyLimit: 2,
  createdBy: "sas",
  createdAt: now,
  updatedAt: now,
  startedAt: now,
  completedAt: null,
  workUnits: [
    {
      id: workUnitId,
      workflowId,
      key: "backend",
      title: "Build the backend",
      outcome: "The backend is durable and verified.",
      activity: "backend-implementation",
      roleId,
      status: "ready",
      priority: "urgent",
      risk: "medium",
      sortOrder: 0,
      declaredResources: [{ kind: "directory", uri: "apps/server" }],
      requiredEvidenceKinds: [],
      activeAttemptId: null,
      createdAt: now,
      updatedAt: now,
      terminalAt: null,
    },
  ],
  dependencies: [],
};

const spec: WorkUnitExecutionSpec = {
  workflowId,
  workUnitId,
  revision: 1,
  instructions: "Implement the backend orchestration loop.",
  acceptanceCriteria: [
    {
      id: "dispatch",
      statement: "The selected model receives a sealed task.",
      verification: "Inspect the dispatched thread request.",
      required: true,
    },
  ],
  allowedResources: [{ kind: "directory", uri: "apps/server" }],
  forbiddenResources: [],
  contextArtifactIds: [],
  permissionProfile: "full-access-isolated",
  permissionGrantIds: [],
  expectedArtifacts: ["Backend implementation"],
  routingConstraints: [{ type: "requires-activity", activity: "backend-implementation" }],
  baselineGitRef: "origin/main",
  maxAttempts: 3,
  createdAt: now,
  updatedAt: now,
};

testLayer("WorkUnitOrchestrator", (it) => {
  it.effect("persists intent, routes, seals, begins, and dispatches exactly once", () =>
    Effect.gen(function* () {
      launches.length = 0;
      const context = yield* ContextEvidenceRepository;
      const orchestrator = yield* WorkUnitOrchestrator;
      const results = yield* ResultIngestion;
      const routing = yield* RoutingRepository;
      const workflows = yield* DirectorWorkflowRepository;

      yield* routing.upsertConnection(connection);
      assert.isTrue(
        yield* routing.saveCapabilitySnapshot({
          snapshot,
          digest: "snapshot-work-unit-orchestrator-digest",
        }),
      );
      assert.isTrue(yield* routing.publishPolicy(policy));
      assert.isTrue(yield* workflows.createGraph(workflow));

      const scheduled = yield* orchestrator.schedule({
        spec,
        occurredAt: now,
        actorId: "sas",
      });
      assert.strictEqual(scheduled.disposition, "scheduled");
      const attempt = scheduled.attempt;
      if (attempt === null) {
        assert.fail("A scheduled work unit must return its attempt.");
      }
      assert.strictEqual(attempt.status, "queued");
      assert.strictEqual(attempt.threadId, `thread:${attempt.id}`);
      assert.strictEqual(launches.length, 1);
      assert.strictEqual(launches[0]?.target.providerKey, "codex");
      assert.strictEqual(launches[0]?.target.modelSlug, "gpt-5.6-sol");
      assert.include(launches[0]?.prompt ?? "", "SASCODE Sealed Task Contract");

      const contract = yield* context.getTaskContract({
        taskContractId: attempt.taskContractId,
      });
      assert.isTrue(Option.isSome(contract));

      const repeated = yield* orchestrator.schedule({
        spec,
        occurredAt: now,
        actorId: "sas",
      });
      assert.strictEqual(repeated.disposition, "already-active");
      assert.strictEqual(repeated.attempt?.id, scheduled.attempt?.id);
      assert.strictEqual(launches.length, 1);

      const resultPacket = {
        id: ResultPacketId.makeUnsafe("result-work-unit-orchestrator"),
        workflowId,
        workUnitId,
        attemptId: scheduled.attempt!.id,
        taskContractId: scheduled.attempt!.taskContractId,
        taskContractDigest: Option.getOrThrow(contract).digest,
        status: "complete" as const,
        summary: "The backend orchestration loop is complete.",
        changedResources: [{ kind: "directory" as const, uri: "apps/server" }],
        decisionIds: [],
        evidenceIds: [],
        commandsRun: ["focused test"],
        risks: [],
        unresolvedQuestions: [],
        nextAction: null,
        producedAt: "2026-07-30T16:10:00.000Z",
      };
      const submission = {
        packet: resultPacket,
        evidence: [],
        qualityGateRuns: [],
        verifiedAt: "2026-07-30T16:10:00.000Z",
      };
      const settled = yield* results.submit({
        submission,
        actorKind: "agent",
        actorId: scheduled.attempt!.threadId!,
        expectedThreadId: scheduled.attempt!.threadId,
      });
      assert.isTrue(settled.verification.acceptedForCompletion);
      assert.strictEqual(settled.attempt.status, "succeeded");
      assert.isFalse(settled.replayed);
      assert.strictEqual(
        (yield* workflows.getById({ workflowId })).pipe(Option.getOrThrow).status,
        "completed",
      );

      const replayedResult = yield* results.submit({
        submission,
        actorKind: "agent",
        actorId: scheduled.attempt!.threadId!,
        expectedThreadId: scheduled.attempt!.threadId,
      });
      assert.isTrue(replayedResult.replayed);
      assert.strictEqual(replayedResult.attempt.status, "succeeded");
    }),
  );
});
