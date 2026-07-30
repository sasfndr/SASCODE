import {
  AgentRoleId,
  ProjectId,
  RoutingDecisionId,
  RoutingPolicyId,
  TaskContractId,
  ThreadId,
  WorkflowId,
  WorkUnitAttemptId,
  WorkUnitId,
  type Workflow,
  type WorkUnitAttempt,
} from "@synara/contracts";
import { assert, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { DirectorWorkflowRepository } from "../Services/DirectorWorkflowRepository.ts";
import { DirectorWorkflowRepositoryLive } from "./DirectorWorkflowRepository.ts";

const repositoryLayer = it.layer(
  Layer.mergeAll(
    DirectorWorkflowRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
    SqlitePersistenceMemory,
  ),
);

const now = "2026-07-30T02:00:00.000Z";
const projectId = ProjectId.makeUnsafe("project-sascode");
const workflowId = WorkflowId.makeUnsafe("workflow-build-backend");
const workUnitId = WorkUnitId.makeUnsafe("work-unit-contracts");

const makeWorkflow = (): Workflow => ({
  id: workflowId,
  projectId,
  title: "Build the backend",
  outcome: "A durable multi-model orchestration backend exists.",
  status: "proposed",
  routingPolicyId: RoutingPolicyId.makeUnsafe("routing-policy-default"),
  routingPolicyRevision: 1,
  graphRevision: 1,
  concurrencyLimit: 3,
  createdBy: "sas",
  createdAt: now,
  updatedAt: now,
  startedAt: null,
  completedAt: null,
  workUnits: [
    {
      id: workUnitId,
      workflowId,
      key: "contracts",
      title: "Define contracts",
      outcome: "The workflow boundary is typed.",
      activity: "backend-implementation",
      roleId: AgentRoleId.makeUnsafe("backend-engineer"),
      status: "ready",
      priority: "high",
      risk: "medium",
      sortOrder: 0,
      declaredResources: [{ kind: "directory", uri: "packages/contracts/src/sascode" }],
      requiredEvidenceKinds: ["test"],
      activeAttemptId: null,
      createdAt: now,
      updatedAt: now,
      terminalAt: null,
    },
    {
      id: WorkUnitId.makeUnsafe("work-unit-tests"),
      workflowId,
      key: "tests",
      title: "Verify contracts",
      outcome: "Contract behavior is covered.",
      activity: "testing",
      roleId: AgentRoleId.makeUnsafe("test-engineer"),
      status: "waiting-dependency",
      priority: "normal",
      risk: "low",
      sortOrder: 1,
      declaredResources: [],
      requiredEvidenceKinds: ["test"],
      activeAttemptId: null,
      createdAt: now,
      updatedAt: now,
      terminalAt: null,
    },
  ],
  dependencies: [
    {
      fromWorkUnitId: workUnitId,
      toWorkUnitId: WorkUnitId.makeUnsafe("work-unit-tests"),
      condition: "success",
      gateKey: null,
    },
  ],
});

const makeAttempt = (
  id = "attempt-contracts-1",
  attemptNumber = 1,
): WorkUnitAttempt => ({
  id: WorkUnitAttemptId.makeUnsafe(id),
  workflowId,
  workUnitId,
  attemptNumber,
  status: "preparing",
  routingDecisionId: RoutingDecisionId.makeUnsafe("route-contracts-1"),
  taskContractId: TaskContractId.makeUnsafe("task-contracts-1"),
  resultPacketId: null,
  threadId: null,
  worktreePath: null,
  baselineGitRef: "origin/main",
  startedAt: null,
  settledAt: null,
  error: null,
  createdAt: now,
  updatedAt: now,
});

repositoryLayer("DirectorWorkflowRepository", (it) => {
  it.effect("creates and reconstructs a workflow graph atomically", () =>
    Effect.gen(function* () {
      const repository = yield* DirectorWorkflowRepository;
      const workflow = makeWorkflow();

      assert.isTrue(yield* repository.createGraph(workflow));
      assert.isFalse(yield* repository.createGraph(workflow));

      const persisted = yield* repository.getById({ workflowId });
      assert.isTrue(Option.isSome(persisted));
      assert.deepStrictEqual(Option.getOrThrow(persisted), workflow);

      const projectWorkflows = yield* repository.listByProject({ projectId });
      assert.deepStrictEqual(projectWorkflows, [workflow]);
    }),
  );

  it.effect("uses compare-and-set transitions for workflow and work-unit state", () =>
    Effect.gen(function* () {
      const repository = yield* DirectorWorkflowRepository;
      yield* repository.createGraph(makeWorkflow());

      assert.isTrue(
        yield* repository.transitionWorkflow({
          workflowId,
          expectedStatus: "proposed",
          nextStatus: "awaiting-approval",
          updatedAt: "2026-07-30T02:01:00.000Z",
        }),
      );
      assert.isFalse(
        yield* repository.transitionWorkflow({
          workflowId,
          expectedStatus: "proposed",
          nextStatus: "cancelled",
          updatedAt: "2026-07-30T02:02:00.000Z",
        }),
      );
      assert.isTrue(
        yield* repository.transitionWorkUnit({
          workUnitId,
          expectedStatus: "ready",
          nextStatus: "routing",
          updatedAt: "2026-07-30T02:01:00.000Z",
        }),
      );

      const persisted = yield* repository.getById({ workflowId });
      const value = Option.getOrThrow(persisted);
      assert.strictEqual(value.status, "awaiting-approval");
      assert.strictEqual(value.workUnits[0]?.status, "routing");
    }),
  );

  it.effect("enforces one active attempt and clears it when the attempt settles", () =>
    Effect.gen(function* () {
      const repository = yield* DirectorWorkflowRepository;
      yield* repository.createGraph(makeWorkflow());
      const attempt = makeAttempt();

      assert.isTrue(yield* repository.insertAttempt(attempt));
      assert.isFalse(yield* repository.insertAttempt(attempt));
      assert.isFalse(yield* repository.insertAttempt(makeAttempt("attempt-contracts-2", 2)));

      assert.isTrue(
        yield* repository.attachAttemptThread({
          attemptId: attempt.id,
          threadId: ThreadId.makeUnsafe("thread-contracts-1"),
          worktreePath: "/tmp/sascode/contracts",
          baselineGitRef: "origin/main",
          updatedAt: "2026-07-30T02:01:00.000Z",
        }),
      );
      assert.isFalse(
        yield* repository.attachAttemptThread({
          attemptId: attempt.id,
          threadId: ThreadId.makeUnsafe("thread-contracts-2"),
          updatedAt: "2026-07-30T02:02:00.000Z",
        }),
      );
      assert.isTrue(
        yield* repository.transitionAttempt({
          attemptId: attempt.id,
          expectedStatus: "preparing",
          nextStatus: "failed",
          error: "Provider usage limit reached.",
          settledAt: "2026-07-30T02:03:00.000Z",
          updatedAt: "2026-07-30T02:03:00.000Z",
        }),
      );

      const workUnit = Option.getOrThrow(
        yield* repository.getWorkUnitById({ workUnitId }),
      );
      assert.strictEqual(workUnit.activeAttemptId, null);

      const attempts = yield* repository.listAttemptsByWorkUnit({ workUnitId });
      assert.strictEqual(attempts.length, 1);
      assert.strictEqual(attempts[0]?.status, "failed");
      assert.strictEqual(attempts[0]?.threadId, "thread-contracts-1");
      assert.strictEqual(attempts[0]?.error, "Provider usage limit reached.");

      assert.isTrue(yield* repository.insertAttempt(makeAttempt("attempt-contracts-2", 2)));
    }),
  );
});
