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
  type ContextArtifact,
  type EvidenceRecord,
  type QualityGateRun,
  type ResultPacket,
  type TaskContract,
  type Workflow,
  type WorkUnitAttempt,
} from "@synara/contracts";
import { assert, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { ContextEvidenceRepository } from "../Services/ContextEvidenceRepository.ts";
import { DirectorWorkflowRepository } from "../Services/DirectorWorkflowRepository.ts";
import { ContextEvidenceRepositoryLive } from "./ContextEvidenceRepository.ts";
import { DirectorWorkflowRepositoryLive } from "./DirectorWorkflowRepository.ts";

const repositoryLayer = it.layer(
  Layer.mergeAll(
    ContextEvidenceRepositoryLive.pipe(
      Layer.provideMerge(SqlitePersistenceMemory),
    ),
    DirectorWorkflowRepositoryLive.pipe(
      Layer.provideMerge(SqlitePersistenceMemory),
    ),
    SqlitePersistenceMemory,
  ),
);

const now = "2026-07-30T06:00:00.000Z";
const projectId = ProjectId.makeUnsafe("project-context-evidence");
const workflowId = WorkflowId.makeUnsafe("workflow-context-evidence");
const workUnitId = WorkUnitId.makeUnsafe("work-unit-context-evidence");
const attemptId = WorkUnitAttemptId.makeUnsafe("attempt-context-evidence");
const taskContractId = TaskContractId.makeUnsafe("task-context-evidence");

const workflow: Workflow = {
  id: workflowId,
  projectId,
  title: "Build with evidence",
  outcome: "The work is accepted only after evidence passes.",
  status: "running",
  routingPolicyId: RoutingPolicyId.makeUnsafe("policy-context-evidence"),
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
      key: "backend",
      title: "Build backend",
      outcome: "Backend behavior is verified.",
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

const attempt: WorkUnitAttempt = {
  id: attemptId,
  workflowId,
  workUnitId,
  attemptNumber: 1,
  status: "preparing",
  routingDecisionId: RoutingDecisionId.makeUnsafe("route-context-evidence"),
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

const contextArtifact: ContextArtifact = {
  id: ContextArtifactId.makeUnsafe("context-design-contract"),
  projectId,
  kind: "design-contract",
  title: "SASCODE Design Contract",
  version: 1,
  content: "Design is a product invariant.",
  contentHash: "context-hash",
  source: { kind: "file", uri: "CLAUDE.md" },
  tags: ["design", "frontend"],
  active: true,
  createdAt: now,
  updatedAt: now,
};

const taskContract: TaskContract = {
  id: taskContractId,
  workflowId,
  workUnitId,
  version: 1,
  digest: "task-contract-digest",
  activity: "backend-implementation",
  roleId: AgentRoleId.makeUnsafe("backend-engineer"),
  outcome: "Backend behavior is verified.",
  instructions: "Implement the backend contract and prove it with tests.",
  acceptanceCriteria: [
    {
      id: "tests-pass",
      statement: "Focused tests pass.",
      verification: "Run the focused Vitest suite.",
      required: true,
    },
  ],
  allowedResources: [{ kind: "directory", uri: "apps/server/src/sascode" }],
  forbiddenResources: [],
  contextArtifactIds: [contextArtifact.id],
  dependencyResultPacketIds: [],
  requiredEvidenceKinds: ["test"],
  baselineGitRef: "origin/main",
  permissionProfile: "full-access-isolated",
  permissionGrantIds: [],
  risk: "high",
  expectedArtifacts: ["Backend implementation", "Passing tests"],
  sealedAt: now,
  createdAt: now,
};

const evidence: EvidenceRecord = {
  id: EvidenceRecordId.makeUnsafe("evidence-context-test"),
  scope: { projectId, workflowId, workUnitId },
  kind: "test",
  status: "passed",
  summary: "Focused backend tests passed.",
  command: "bun run test -- context",
  resources: [{ kind: "directory", uri: "apps/server/src/sascode" }],
  details: "1 test file passed.",
  producer: "codex",
  usage: { durationMs: 800 },
  createdAt: "2026-07-30T06:01:00.000Z",
  expiresAt: null,
};

const gateRun: QualityGateRun = {
  id: QualityGateRunId.makeUnsafe("gate-context-tests"),
  scope: { projectId, workflowId, workUnitId },
  gate: {
    key: "focused-tests",
    label: "Focused tests",
    evidenceKinds: ["test"],
    required: true,
    blockOnFailure: true,
  },
  status: "passed",
  evidenceIds: [evidence.id],
  startedAt: "2026-07-30T06:01:00.000Z",
  completedAt: "2026-07-30T06:02:00.000Z",
  failureReason: null,
};

const resultPacket: ResultPacket = {
  id: ResultPacketId.makeUnsafe("result-context-evidence"),
  workflowId,
  workUnitId,
  attemptId,
  taskContractId,
  taskContractDigest: taskContract.digest,
  status: "complete",
  summary: "Backend implementation completed and verified.",
  changedResources: [
    { kind: "directory", uri: "apps/server/src/sascode" },
  ],
  decisionIds: [],
  evidenceIds: [evidence.id],
  commandsRun: ["bun run test -- context"],
  risks: [],
  unresolvedQuestions: [],
  nextAction: null,
  usage: { inputTokens: 1_000, outputTokens: 500 },
  producedAt: "2026-07-30T06:03:00.000Z",
};

repositoryLayer("ContextEvidenceRepository", (it) => {
  it.effect("round-trips context, contracts, results, evidence, and gate runs", () =>
    Effect.gen(function* () {
      const repository = yield* ContextEvidenceRepository;
      const workflows = yield* DirectorWorkflowRepository;

      assert.isTrue(yield* workflows.createGraph(workflow));
      assert.isTrue(yield* workflows.insertAttempt(attempt));

      yield* repository.upsertContextArtifact(contextArtifact);
      assert.deepStrictEqual(
        yield* repository.listActiveContextArtifacts({ projectId }),
        [contextArtifact],
      );

      assert.isTrue(yield* repository.saveTaskContract(taskContract));
      assert.isFalse(yield* repository.saveTaskContract(taskContract));
      assert.deepStrictEqual(
        Option.getOrThrow(
          yield* repository.getTaskContract({ taskContractId }),
        ),
        taskContract,
      );

      assert.isTrue(
        yield* repository.saveEvidenceRecord({
          evidence,
          links: [
            { subjectKind: "work-unit", subjectId: workUnitId },
            { subjectKind: "attempt", subjectId: attemptId },
          ],
          contentHash: "evidence-hash",
        }),
      );
      assert.deepStrictEqual(
        yield* repository.listEvidenceByWorkUnit({ workUnitId }),
        [evidence],
      );

      assert.isTrue(yield* repository.saveQualityGateRun(gateRun));
      assert.deepStrictEqual(
        yield* repository.listQualityGateRunsByWorkUnit({ workUnitId }),
        [gateRun],
      );

      assert.isTrue(yield* repository.saveResultPacket(resultPacket));
      assert.deepStrictEqual(
        Option.getOrThrow(
          yield* repository.getResultPacket({
            resultPacketId: resultPacket.id,
          }),
        ),
        resultPacket,
      );
      assert.deepStrictEqual(
        Option.getOrThrow(
          yield* repository.getResultPacketByAttempt({ attemptId }),
        ),
        resultPacket,
      );
    }),
  );
});
