import {
  AgentRoleId,
  ContextArtifactId,
  EvidenceRecordId,
  ProjectId,
  QualityGateRunId,
  ResultPacketId,
  RoutingDecisionId,
  RoutingPolicyId,
  TaskContractId,
  WorkflowId,
  WorkUnitAttemptId,
  WorkUnitId,
  type RoutingPolicy,
  type Workflow,
  type WorkUnitAttempt,
} from "@synara/contracts";
import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { ContextEvidenceRepository } from "../Services/ContextEvidenceRepository.ts";
import { Director } from "../Services/Director.ts";
import { DirectorExecutionCoordinator } from "../Services/DirectorExecutionCoordinator.ts";
import { RoutingRepository } from "../Services/RoutingRepository.ts";
import { TaskContracts } from "../Services/TaskContracts.ts";
import { ContextEvidenceRepositoryLive } from "./ContextEvidenceRepository.ts";
import { DirectorExecutionCoordinatorLive } from "./DirectorExecutionCoordinator.ts";
import { DirectorWorkflowRepositoryLive } from "./DirectorWorkflowRepository.ts";
import { DirectorLive } from "./Director.ts";
import { RoutingRepositoryLive } from "./RoutingRepository.ts";
import { TaskContractsLive } from "./TaskContracts.ts";

const persistenceServices = Layer.mergeAll(
  ContextEvidenceRepositoryLive,
  DirectorWorkflowRepositoryLive,
  RoutingRepositoryLive,
).pipe(Layer.provideMerge(SqlitePersistenceMemory));

const directorService = DirectorLive.pipe(Layer.provide(persistenceServices));
const taskContractService = TaskContractsLive.pipe(
  Layer.provide(persistenceServices),
);
const executionDependencies = Layer.mergeAll(
  directorService,
  taskContractService,
  persistenceServices,
);

const taskServices = it.layer(
  Layer.mergeAll(
    DirectorExecutionCoordinatorLive.pipe(
      Layer.provide(executionDependencies),
    ),
    executionDependencies,
    SqlitePersistenceMemory,
  ),
);

const now = "2026-07-30T07:00:00.000Z";
const projectId = ProjectId.makeUnsafe("project-task-contracts");
const workflowId = WorkflowId.makeUnsafe("workflow-task-contracts");
const workUnitId = WorkUnitId.makeUnsafe("work-unit-task-contracts");
const taskContractId = TaskContractId.makeUnsafe("task-contract-task-contracts");
const attemptId = WorkUnitAttemptId.makeUnsafe("attempt-task-contracts");
const policyId = RoutingPolicyId.makeUnsafe("policy-task-contracts");
const evidenceId = EvidenceRecordId.makeUnsafe("evidence-task-contracts");

const policy: RoutingPolicy = {
  id: policyId,
  projectId,
  name: "Evidence-gated policy",
  description: "Requires tests before completion.",
  revision: 1,
  roles: [
    {
      id: AgentRoleId.makeUnsafe("backend-engineer"),
      key: "backend-engineer",
      displayName: "Backend Engineer",
      description: "Builds verified backend systems.",
      activities: ["backend-implementation"],
      requiredTools: ["file-read", "file-write", "shell", "git"],
      preferredProviderKeys: ["codex"],
      preferredModelFamilies: ["gpt"],
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
  qualityGates: [
    {
      key: "tests",
      label: "Focused tests",
      evidenceKinds: ["test"],
      required: true,
      blockOnFailure: true,
      freshnessSeconds: 600,
    },
  ],
  fallbackBehavior: "reroute-same-role",
  maxParallelWorkUnits: 2,
  requireDifferentProviderForIndependentReview: false,
  userOverrides: {},
  digest: "task-contract-policy-digest",
  publishedAt: now,
  createdAt: now,
  updatedAt: now,
};

const workflow: Workflow = {
  id: workflowId,
  projectId,
  title: "Evidence-gated implementation",
  outcome: "A verified backend change.",
  status: "running",
  routingPolicyId: policyId,
  routingPolicyRevision: 1,
  graphRevision: 1,
  concurrencyLimit: 1,
  createdBy: "sas",
  createdAt: now,
  updatedAt: now,
  startedAt: now,
  completedAt: null,
  workUnits: [
    {
      id: workUnitId,
      workflowId,
      key: "implementation",
      title: "Implement backend",
      outcome: "Backend behavior exists and is tested.",
      activity: "backend-implementation",
      roleId: AgentRoleId.makeUnsafe("backend-engineer"),
      status: "routing",
      priority: "high",
      risk: "high",
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

taskServices("TaskContracts", (it) => {
  it.effect("seals scoped context and accepts only digest-matched, evidence-gated results", () =>
    Effect.gen(function* () {
      const context = yield* ContextEvidenceRepository;
      const director = yield* Director;
      const coordinator = yield* DirectorExecutionCoordinator;
      const routing = yield* RoutingRepository;
      const contracts = yield* TaskContracts;

      assert.isTrue(yield* routing.publishPolicy(policy));
      yield* director.proposeWorkflow(workflow);
      const contextId = ContextArtifactId.makeUnsafe("context-task-contracts");
      yield* context.upsertContextArtifact({
        id: contextId,
        projectId,
        kind: "architecture",
        title: "Backend architecture",
        version: 1,
        content: "Director attempts are separate from provider threads.",
        contentHash: "architecture-hash",
        tags: ["backend"],
        active: true,
        createdAt: now,
        updatedAt: now,
      });

      const contract = yield* contracts.seal({
        taskContractId,
        workUnitId,
        version: 1,
        instructions: "Implement the backend and attach focused test evidence.",
        acceptanceCriteria: [
          {
            id: "focused-tests",
            statement: "Focused tests pass.",
            verification: "Run the work-unit test suite.",
            required: true,
          },
        ],
        allowedResources: [
          { kind: "directory", uri: "apps/server/src/sascode" },
        ],
        forbiddenResources: [{ kind: "file", uri: ".env" }],
        contextArtifactIds: [contextId],
        dependencyResultPacketIds: [],
        baselineGitRef: "origin/main",
        permissionProfile: "full-access-isolated",
        permissionGrantIds: [],
        expectedArtifacts: ["Implementation", "Focused test evidence"],
        occurredAt: "2026-07-30T07:01:00.000Z",
      });
      assert.strictEqual(contract.sealedAt, "2026-07-30T07:01:00.000Z");
      assert.match(contract.digest, /^[0-9a-f]{64}$/);

      const attempt: WorkUnitAttempt = {
        id: attemptId,
        workflowId,
        workUnitId,
        attemptNumber: 1,
        status: "preparing",
        routingDecisionId: RoutingDecisionId.makeUnsafe("route-task-contracts"),
        taskContractId,
        resultPacketId: null,
        threadId: null,
        worktreePath: null,
        baselineGitRef: "origin/main",
        startedAt: null,
        settledAt: null,
        error: null,
        createdAt: "2026-07-30T07:02:00.000Z",
        updatedAt: "2026-07-30T07:02:00.000Z",
      };
      yield* director.beginAttempt(attempt);
      yield* director.advanceAttempt({
        attemptId,
        nextStatus: "dispatching",
        occurredAt: "2026-07-30T07:03:00.000Z",
      });
      yield* director.advanceAttempt({
        attemptId,
        nextStatus: "running",
        occurredAt: "2026-07-30T07:04:00.000Z",
      });
      yield* director.advanceAttempt({
        attemptId,
        nextStatus: "verifying",
        occurredAt: "2026-07-30T07:05:00.000Z",
      });

      yield* context.saveEvidenceRecord({
        evidence: {
          id: evidenceId,
          scope: { projectId, workflowId, workUnitId },
          kind: "test",
          status: "passed",
          summary: "Focused tests passed.",
          command: "bun run test -- task-contracts",
          resources: [
            { kind: "directory", uri: "apps/server/src/sascode" },
          ],
          producer: "codex",
          createdAt: "2026-07-30T07:06:00.000Z",
          expiresAt: "2026-07-30T07:16:00.000Z",
        },
        links: [{ subjectKind: "attempt", subjectId: attemptId }],
      });
      yield* context.saveQualityGateRun({
        id: QualityGateRunId.makeUnsafe("gate-task-contracts"),
        scope: { projectId, workflowId, workUnitId },
        gate: policy.qualityGates[0]!,
        status: "passed",
        evidenceIds: [evidenceId],
        startedAt: "2026-07-30T07:06:00.000Z",
        completedAt: "2026-07-30T07:07:00.000Z",
        failureReason: null,
      });

      const packet = {
        id: ResultPacketId.makeUnsafe("result-task-contracts"),
        workflowId,
        workUnitId,
        attemptId,
        taskContractId,
        taskContractDigest: contract.digest,
        status: "complete" as const,
        summary: "Backend implementation completed.",
        changedResources: [
          { kind: "directory" as const, uri: "apps/server/src/sascode" },
        ],
        decisionIds: [],
        evidenceIds: [evidenceId],
        commandsRun: ["bun run test -- task-contracts"],
        risks: [],
        unresolvedQuestions: [],
        nextAction: null,
        producedAt: "2026-07-30T07:08:00.000Z",
      };
      const committed = yield* coordinator.commitResult({
        packet,
        verifiedAt: "2026-07-30T07:08:00.000Z",
      });
      const verification = committed.verification;
      assert.isTrue(verification.acceptedForCompletion);
      assert.deepStrictEqual(verification.issues, []);
      assert.deepStrictEqual(verification.passedGateKeys, ["tests"]);
      assert.strictEqual(committed.attempt.status, "succeeded");
      assert.strictEqual(committed.attempt.resultPacketId, packet.id);
    }),
  );
});
