import {
  AgentRoleId,
  CapabilitySnapshotId,
  DirectorCommandId,
  ProjectId,
  ProviderConnectionId,
  RoutingDecisionId,
  RoutingPolicyId,
  TaskContractId,
  ThreadId,
  WorkflowId,
  WorkUnitAttemptId,
  WorkUnitId,
  type RoutingDecision,
  type RoutingPolicy,
  type TaskContract,
  type Workflow,
  type WorkUnitAttempt,
} from "@synara/contracts";
import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { AttemptDispatcher } from "../Services/AttemptDispatcher.ts";
import { ContextEvidenceRepository } from "../Services/ContextEvidenceRepository.ts";
import { DirectorCommands } from "../Services/DirectorCommands.ts";
import { DirectorRecovery } from "../Services/DirectorRecovery.ts";
import {
  DirectorThreadLauncher,
  type LaunchDirectorThreadInput,
} from "../Services/DirectorThreadLauncher.ts";
import { RoutingRepository } from "../Services/RoutingRepository.ts";
import { AttemptDispatcherLive } from "./AttemptDispatcher.ts";
import { ContextEvidenceRepositoryLive } from "./ContextEvidenceRepository.ts";
import { DirectorCommandsLive } from "./DirectorCommands.ts";
import { DirectorEventStoreLive } from "./DirectorEventStore.ts";
import { DirectorRecoveryLive } from "./DirectorRecovery.ts";
import { DirectorWorkflowRepositoryLive } from "./DirectorWorkflowRepository.ts";
import { DirectorLive } from "./Director.ts";
import { RoutingRepositoryLive } from "./RoutingRepository.ts";

const launches: LaunchDirectorThreadInput[] = [];
const launcherLayer = Layer.succeed(DirectorThreadLauncher, {
  launch: (input) =>
    Effect.sync(() => {
      launches.push(input);
      return {
        operationId: `operation:${input.requestId}`,
        threadId: ThreadId.makeUnsafe("thread-dispatched-attempt"),
        worktreePath: "/tmp/sascode/attempt-dispatch",
        baselineGitRef: "origin/main",
      };
    }),
});

const workflowRepositoryLayer = DirectorWorkflowRepositoryLive.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
);
const directorLayer = DirectorLive.pipe(
  Layer.provide(workflowRepositoryLayer),
);
const eventLayer = DirectorEventStoreLive.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
);
const commandDependencies = Layer.mergeAll(
  directorLayer,
  eventLayer,
  workflowRepositoryLayer,
);
const commandsLayer = DirectorCommandsLive.pipe(
  Layer.provide(commandDependencies),
);
const routingLayer = RoutingRepositoryLive.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
);
const contextLayer = ContextEvidenceRepositoryLive.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
);
const dispatcherDependencies = Layer.mergeAll(
  commandsLayer,
  commandDependencies,
  routingLayer,
  contextLayer,
  launcherLayer,
);
const attemptDispatcherLayer = AttemptDispatcherLive.pipe(
  Layer.provide(dispatcherDependencies),
);
const recoveryLayer = DirectorRecoveryLive.pipe(
  Layer.provide(
    Layer.mergeAll(attemptDispatcherLayer, workflowRepositoryLayer),
  ),
);

const dispatcherLayer = it.layer(
  Layer.mergeAll(
    attemptDispatcherLayer,
    recoveryLayer,
    dispatcherDependencies,
    SqlitePersistenceMemory,
  ),
);

const now = "2026-07-30T14:00:00.000Z";
const projectId = ProjectId.makeUnsafe("project-attempt-dispatch");
const workflowId = WorkflowId.makeUnsafe("workflow-attempt-dispatch");
const workUnitId = WorkUnitId.makeUnsafe("work-unit-attempt-dispatch");
const attemptId = WorkUnitAttemptId.makeUnsafe("attempt-dispatch-1");
const decisionId = RoutingDecisionId.makeUnsafe("routing-dispatch-1");
const taskContractId = TaskContractId.makeUnsafe("task-dispatch-1");

const workflow: Workflow = {
  id: workflowId,
  projectId,
  title: "Build the orchestration backend",
  outcome: "A verified backend exists.",
  status: "running",
  routingPolicyId: RoutingPolicyId.makeUnsafe("routing-policy-dispatch"),
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
      title: "Implement backend",
      outcome: "The backend is implemented.",
      activity: "backend-implementation",
      roleId: AgentRoleId.makeUnsafe("backend-engineer"),
      status: "routing",
      priority: "high",
      risk: "medium",
      sortOrder: 0,
      declaredResources: [
        { kind: "directory", uri: "apps/server/src/sascode" },
      ],
      requiredEvidenceKinds: ["test"],
      activeAttemptId: null,
      createdAt: now,
      updatedAt: now,
      terminalAt: null,
    },
  ],
  dependencies: [],
};

const target = {
  connectionId: ProviderConnectionId.makeUnsafe("connection-codex"),
  providerKey: "openai",
  providerKind: "codex" as const,
  modelSlug: "gpt-5.6-sol",
  modelFamily: "gpt",
  options: { reasoningEffort: "high" },
};

const decision: RoutingDecision = {
  id: decisionId,
  workflowId,
  workUnitId,
  policyId: workflow.routingPolicyId,
  policyRevision: 1,
  roleId: workflow.workUnits[0]!.roleId,
  candidates: [
    {
      target,
      capabilitySnapshotId: CapabilitySnapshotId.makeUnsafe(
        "capability-dispatch",
      ),
      eligible: true,
      score: 1,
      scoreComponents: {
        capability: 1,
        preference: 1,
        availability: 1,
        quality: 1,
        cost: 0.5,
        latency: 0.5,
        continuity: 1,
      },
      rejectedReasons: [],
      warnings: [],
    },
  ],
  selected: target,
  fallbackOrder: [],
  rationale: "Best backend implementation target.",
  constraints: [],
  decidedAt: now,
};

const policy: RoutingPolicy = {
  id: workflow.routingPolicyId,
  projectId,
  name: "Design-led delivery",
  description: "Routes each task to a capability-matched provider.",
  revision: 1,
  roles: [
    {
      id: workflow.workUnits[0]!.roleId,
      key: "backend-engineer",
      displayName: "Backend Engineer",
      description: "Implements backend systems.",
      activities: ["backend-implementation"],
      requiredTools: ["file-read", "file-write", "shell", "git", "worktree"],
      preferredProviderKeys: ["openai"],
      preferredModelFamilies: ["gpt"],
      forbiddenProviderKeys: [],
      fallbackRoleIds: [],
      defaultPermissionProfile: "full-access-isolated",
      defaultRisk: "medium",
    },
  ],
  scoreWeights: {
    capability: 1,
    preference: 1,
    availability: 1,
    quality: 1,
    cost: 0.5,
    latency: 0.5,
    continuity: 1,
  },
  qualityGates: [],
  fallbackBehavior: "reroute-same-role",
  maxParallelWorkUnits: 2,
  requireDifferentProviderForIndependentReview: true,
  userOverrides: {},
  digest: "sha256:routing-policy-dispatch",
  publishedAt: now,
  createdAt: now,
  updatedAt: now,
};

const contract: TaskContract = {
  id: taskContractId,
  workflowId,
  workUnitId,
  version: 1,
  digest: "sha256:dispatch-contract",
  activity: "backend-implementation",
  roleId: workflow.workUnits[0]!.roleId,
  outcome: "Implement the backend orchestration slice.",
  instructions: "Follow the repository service/layer split.",
  acceptanceCriteria: [
    {
      id: "criterion-tests",
      statement: "Focused tests pass.",
      verification: "Run the SASCODE test file.",
      required: true,
    },
  ],
  allowedResources: [
    { kind: "directory", uri: "apps/server/src/sascode" },
  ],
  forbiddenResources: [{ kind: "file", uri: ".env" }],
  contextArtifactIds: [],
  dependencyResultPacketIds: [],
  requiredEvidenceKinds: ["test"],
  baselineGitRef: "origin/main",
  permissionProfile: "full-access-isolated",
  permissionGrantIds: [],
  risk: "medium",
  expectedArtifacts: ["Attempt dispatcher"],
  sealedAt: now,
  createdAt: now,
};

const attempt: WorkUnitAttempt = {
  id: attemptId,
  workflowId,
  workUnitId,
  attemptNumber: 1,
  status: "preparing",
  routingDecisionId: decisionId,
  taskContractId,
  resultPacketId: null,
  threadId: null,
  worktreePath: null,
  baselineGitRef: "origin/main",
  startedAt: null,
  settledAt: null,
  error: null,
  createdAt: now,
  updatedAt: now,
};

dispatcherLayer("AttemptDispatcher", (it) => {
  it.effect("launches a sealed task once and recovers idempotently", () =>
    Effect.gen(function* () {
      launches.length = 0;
      const commands = yield* DirectorCommands;
      const routing = yield* RoutingRepository;
      const context = yield* ContextEvidenceRepository;
      const dispatcher = yield* AttemptDispatcher;
      const recovery = yield* DirectorRecovery;

      yield* commands.proposeWorkflow({
        context: {
          commandId: DirectorCommandId.makeUnsafe(
            "command-propose-attempt-dispatch",
          ),
          actorKind: "human",
          actorId: "sas",
          occurredAt: now,
        },
        workflow,
      });
      assert.isTrue(yield* routing.publishPolicy(policy));
      assert.isTrue(yield* routing.saveDecision(decision));
      assert.isTrue(yield* context.saveTaskContract(contract));
      yield* commands.beginAttempt({
        context: {
          commandId: DirectorCommandId.makeUnsafe(
            "command-begin-attempt-dispatch",
          ),
          actorKind: "system",
          actorId: "sascode-director",
          occurredAt: now,
        },
        attempt,
      });

      const recoveryReport = yield* recovery.recover({
        occurredAt: "2026-07-30T14:01:00.000Z",
        limit: 100,
      });
      assert.strictEqual(recoveryReport.scanned, 1);
      assert.strictEqual(recoveryReport.recovered, 1);

      const dispatched = yield* dispatcher.dispatch({
        attemptId,
        occurredAt: "2026-07-30T14:01:30.000Z",
      });
      assert.strictEqual(dispatched.attempt.status, "queued");
      assert.strictEqual(
        dispatched.attempt.threadId,
        "thread-dispatched-attempt",
      );
      assert.strictEqual(launches.length, 1);
      assert.strictEqual(launches[0]?.environment, "worktree");
      assert.strictEqual(launches[0]?.runtimeMode, "full-access");
      assert.include(launches[0]?.prompt ?? "", "SASCODE Sealed Task Contract");
      assert.include(launches[0]?.prompt ?? "", contract.digest);

      const replayed = yield* dispatcher.dispatch({
        attemptId,
        occurredAt: "2026-07-30T14:02:00.000Z",
      });
      assert.isTrue(replayed.recovered);
      assert.strictEqual(replayed.attempt.status, "queued");
      assert.strictEqual(launches.length, 1);
    }),
  );
});
