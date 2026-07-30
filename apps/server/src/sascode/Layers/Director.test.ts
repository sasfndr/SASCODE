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
import { Director } from "../Services/Director.ts";
import { DirectorWorkflowRepositoryLive } from "./DirectorWorkflowRepository.ts";
import { DirectorLive } from "./Director.ts";

const directorLayer = it.layer(
  Layer.mergeAll(
    DirectorLive.pipe(
      Layer.provide(
        DirectorWorkflowRepositoryLive.pipe(
          Layer.provideMerge(SqlitePersistenceMemory),
        ),
      ),
    ),
    SqlitePersistenceMemory,
  ),
);

const now = "2026-07-30T03:00:00.000Z";
const projectId = ProjectId.makeUnsafe("project-director");
const workflowId = WorkflowId.makeUnsafe("workflow-director");
const implementationId = WorkUnitId.makeUnsafe("work-unit-implementation");
const verificationId = WorkUnitId.makeUnsafe("work-unit-verification");

const makeWorkflow = (
  identity: {
    readonly workflowId?: Workflow["id"];
    readonly implementationId?: Workflow["workUnits"][number]["id"];
    readonly verificationId?: Workflow["workUnits"][number]["id"];
  } = {},
): Workflow => {
  const selectedWorkflowId = identity.workflowId ?? workflowId;
  const selectedImplementationId = identity.implementationId ?? implementationId;
  const selectedVerificationId = identity.verificationId ?? verificationId;
  return {
    id: selectedWorkflowId,
    projectId,
    title: "Build one feature",
    outcome: "The feature is built and independently verified.",
    status: "proposed",
    routingPolicyId: RoutingPolicyId.makeUnsafe("policy-director"),
    routingPolicyRevision: 1,
    graphRevision: 1,
    concurrencyLimit: 2,
    createdBy: "sas",
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    workUnits: [
      {
        id: selectedImplementationId,
        workflowId: selectedWorkflowId,
        key: "implementation",
        title: "Implement",
        outcome: "The feature is implemented.",
        activity: "backend-implementation",
        roleId: AgentRoleId.makeUnsafe("backend-engineer"),
        status: "routing",
        priority: "high",
        risk: "medium",
        sortOrder: 0,
        declaredResources: [],
        requiredEvidenceKinds: ["test"],
        activeAttemptId: null,
        createdAt: now,
        updatedAt: now,
        terminalAt: null,
      },
      {
        id: selectedVerificationId,
        workflowId: selectedWorkflowId,
        key: "verification",
        title: "Verify",
        outcome: "The implementation is verified.",
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
        fromWorkUnitId: selectedImplementationId,
        toWorkUnitId: selectedVerificationId,
        condition: "success",
        gateKey: null,
      },
    ],
  };
};

const makeAttempt = (): WorkUnitAttempt => ({
  id: WorkUnitAttemptId.makeUnsafe("attempt-implementation-1"),
  workflowId,
  workUnitId: implementationId,
  attemptNumber: 1,
  status: "preparing",
  routingDecisionId: RoutingDecisionId.makeUnsafe("route-implementation-1"),
  taskContractId: TaskContractId.makeUnsafe("task-implementation-1"),
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

directorLayer("Director", (it) => {
  it.effect("rejects invalid graphs before persistence", () =>
    Effect.gen(function* () {
      const director = yield* Director;
      const workflow = makeWorkflow();
      const invalid: Workflow = {
        ...workflow,
        dependencies: [
          ...workflow.dependencies,
          {
            fromWorkUnitId: verificationId,
            toWorkUnitId: implementationId,
            condition: "success",
            gateKey: null,
          },
        ],
      };

      const outcome = yield* director.proposeWorkflow(invalid).pipe(Effect.flip);
      assert.strictEqual(outcome._tag, "DirectorWorkflowValidationError");
      if (outcome._tag === "DirectorWorkflowValidationError") {
        assert.isTrue(outcome.issues.some((issue) => issue.code === "cycle"));
      }
      assert.isTrue(Option.isNone(yield* director.getWorkflow(workflowId)));
    }),
  );

  it.effect("runs a model attempt through dispatch, execution, and verification", () =>
    Effect.gen(function* () {
      const director = yield* Director;
      yield* director.proposeWorkflow(makeWorkflow());
      const attempt = yield* director.beginAttempt(makeAttempt());
      assert.strictEqual(attempt.status, "preparing");

      const attached = yield* director.attachThread({
        attemptId: attempt.id,
        threadId: ThreadId.makeUnsafe("thread-implementation-1"),
        worktreePath: "/tmp/sascode/implementation",
        baselineGitRef: "origin/main",
        occurredAt: "2026-07-30T03:01:00.000Z",
      });
      assert.strictEqual(attached.threadId, "thread-implementation-1");

      const dispatching = yield* director.advanceAttempt({
        attemptId: attempt.id,
        nextStatus: "dispatching",
        occurredAt: "2026-07-30T03:02:00.000Z",
      });
      assert.strictEqual(dispatching.status, "dispatching");

      yield* director.advanceAttempt({
        attemptId: attempt.id,
        nextStatus: "running",
        occurredAt: "2026-07-30T03:03:00.000Z",
      });
      yield* director.advanceAttempt({
        attemptId: attempt.id,
        nextStatus: "verifying",
        occurredAt: "2026-07-30T03:04:00.000Z",
      });
      const succeeded = yield* director.advanceAttempt({
        attemptId: attempt.id,
        nextStatus: "succeeded",
        occurredAt: "2026-07-30T03:05:00.000Z",
      });
      assert.strictEqual(succeeded.status, "succeeded");
      assert.strictEqual(succeeded.settledAt, "2026-07-30T03:05:00.000Z");

      const workflow = Option.getOrThrow(yield* director.getWorkflow(workflowId));
      assert.strictEqual(workflow.workUnits[0]?.status, "succeeded");
      assert.strictEqual(workflow.workUnits[0]?.activeAttemptId, null);

      const newlyReady = yield* director.reconcileReadyWorkUnits({
        workflowId,
        passedGateKeys: [],
        occurredAt: "2026-07-30T03:06:00.000Z",
      });
      assert.deepStrictEqual(newlyReady, [verificationId]);
      const reconciled = Option.getOrThrow(yield* director.getWorkflow(workflowId));
      assert.strictEqual(reconciled.workUnits[1]?.status, "ready");
    }),
  );

  it.effect("enforces legal workflow transitions", () =>
    Effect.gen(function* () {
      const director = yield* Director;
      const lifecycleWorkflowId = WorkflowId.makeUnsafe("workflow-lifecycle");
      yield* director.proposeWorkflow(
        makeWorkflow({
          workflowId: lifecycleWorkflowId,
          implementationId: WorkUnitId.makeUnsafe("work-unit-lifecycle-implementation"),
          verificationId: WorkUnitId.makeUnsafe("work-unit-lifecycle-verification"),
        }),
      );

      const illegal = yield* director
        .moveWorkflow({
          workflowId: lifecycleWorkflowId,
          nextStatus: "completed",
          occurredAt: "2026-07-30T03:01:00.000Z",
        })
        .pipe(Effect.flip);
      assert.strictEqual(illegal._tag, "DirectorStateTransitionError");

      const awaiting = yield* director.moveWorkflow({
        workflowId: lifecycleWorkflowId,
        nextStatus: "awaiting-approval",
        occurredAt: "2026-07-30T03:02:00.000Z",
      });
      assert.strictEqual(awaiting.status, "awaiting-approval");
    }),
  );
});
