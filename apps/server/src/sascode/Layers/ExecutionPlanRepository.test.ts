import {
  AgentRoleId,
  ProjectId,
  RoutingPolicyId,
  WorkflowId,
  WorkUnitId,
  type Workflow,
  type WorkUnitExecutionSpec,
} from "@synara/contracts";
import { assert, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { DirectorWorkflowRepository } from "../Services/DirectorWorkflowRepository.ts";
import { ExecutionPlanRepository } from "../Services/ExecutionPlanRepository.ts";
import { DirectorWorkflowRepositoryLive } from "./DirectorWorkflowRepository.ts";
import { ExecutionPlanRepositoryLive } from "./ExecutionPlanRepository.ts";

const repositoryLayer = it.layer(
  Layer.mergeAll(
    DirectorWorkflowRepositoryLive.pipe(
      Layer.provideMerge(SqlitePersistenceMemory),
    ),
    ExecutionPlanRepositoryLive.pipe(
      Layer.provideMerge(SqlitePersistenceMemory),
    ),
    SqlitePersistenceMemory,
  ),
);

const now = "2026-07-30T15:00:00.000Z";
const projectId = ProjectId.makeUnsafe("project-execution-plan");
const workflowId = WorkflowId.makeUnsafe("workflow-execution-plan");
const workUnitId = WorkUnitId.makeUnsafe("work-unit-execution-plan");

const workflow: Workflow = {
  id: workflowId,
  projectId,
  title: "Execute a durable plan",
  outcome: "The Director can resume model delegation after restart.",
  status: "running",
  routingPolicyId: RoutingPolicyId.makeUnsafe("policy-execution-plan"),
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
      outcome: "The backend is implemented and verified.",
      activity: "backend-implementation",
      roleId: AgentRoleId.makeUnsafe("backend-engineer"),
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
    },
  ],
  dependencies: [],
};

const spec = (revision = 1): WorkUnitExecutionSpec => ({
  workflowId,
  workUnitId,
  revision,
  instructions: "Implement the backend using the sealed architecture.",
  acceptanceCriteria: [
    {
      id: "tests",
      statement: "Focused tests pass.",
      verification: "Run the focused test files.",
      required: true,
    },
  ],
  allowedResources: [{ kind: "directory", uri: "apps/server" }],
  forbiddenResources: [],
  contextArtifactIds: [],
  permissionProfile: "full-access-isolated",
  permissionGrantIds: [],
  expectedArtifacts: ["Backend implementation", "Passing focused tests"],
  routingConstraints: [
    { type: "requires-activity", activity: "backend-implementation" },
  ],
  baselineGitRef: "origin/main",
  maxAttempts: 3,
  createdAt: now,
  updatedAt:
    revision === 1 ? now : "2026-07-30T15:05:00.000Z",
});

repositoryLayer("ExecutionPlanRepository", (it) => {
  it.effect("persists idempotent intent, rejects collisions, and lists runnable specs", () =>
    Effect.gen(function* () {
      const plans = yield* ExecutionPlanRepository;
      const workflows = yield* DirectorWorkflowRepository;
      assert.isTrue(yield* workflows.createGraph(workflow));

      assert.deepStrictEqual(yield* plans.saveSpec(spec()), spec());
      assert.deepStrictEqual(yield* plans.saveSpec(spec()), spec());

      const collision = yield* plans
        .saveSpec({
          ...spec(),
          instructions: "Conflicting instructions at the same revision.",
        })
        .pipe(Effect.flip);
      assert.strictEqual(
        collision._tag,
        "WorkUnitExecutionSpecConflictError",
      );

      const revised = spec(2);
      assert.deepStrictEqual(yield* plans.saveSpec(revised), revised);
      assert.deepStrictEqual(
        Option.getOrThrow(yield* plans.getSpec({ workUnitId })),
        revised,
      );
      assert.deepStrictEqual(
        yield* plans.listRunnableSpecs({ limit: 10 }),
        [revised],
      );
    }),
  );
});
