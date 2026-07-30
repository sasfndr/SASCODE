import {
  AgentRoleId,
  ProjectId,
  RoutingPolicyId,
  WorkflowId,
  WorkUnitId,
  type Workflow,
} from "@synara/contracts";
import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { AttentionEngine } from "../Services/AttentionEngine.ts";
import { AttentionRepository } from "../Services/AttentionRepository.ts";
import { DirectorWorkflowRepository } from "../Services/DirectorWorkflowRepository.ts";
import { AttentionEngineLive } from "./AttentionEngine.ts";
import { AttentionRepositoryLive } from "./AttentionRepository.ts";
import { DirectorWorkflowRepositoryLive } from "./DirectorWorkflowRepository.ts";

const directorRepositoryLayer = DirectorWorkflowRepositoryLive.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
);
const attentionRepositoryLayer = AttentionRepositoryLive.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
);
const dependencies = Layer.mergeAll(
  directorRepositoryLayer,
  attentionRepositoryLayer,
);

const attentionLayer = it.layer(
  Layer.mergeAll(
    AttentionEngineLive.pipe(Layer.provide(dependencies)),
    dependencies,
    SqlitePersistenceMemory,
  ),
);

const now = "2026-07-30T12:00:00.000Z";
const projectId = ProjectId.makeUnsafe("project-attention-engine");
const quietProjectId = ProjectId.makeUnsafe("project-attention-quiet");
const workflowId = WorkflowId.makeUnsafe("workflow-attention-engine");
const workUnitId = WorkUnitId.makeUnsafe("work-unit-attention-engine");

const makeWorkflow = (): Workflow => ({
  id: workflowId,
  projectId,
  title: "Ship the backend",
  outcome: "The backend is verified.",
  status: "running",
  routingPolicyId: RoutingPolicyId.makeUnsafe("routing-policy-attention"),
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
      key: "deploy",
      title: "Deploy the backend",
      outcome: "A deployment is ready.",
      activity: "release",
      roleId: AgentRoleId.makeUnsafe("release-engineer"),
      status: "waiting-approval",
      priority: "urgent",
      risk: "high",
      sortOrder: 0,
      declaredResources: [],
      requiredEvidenceKinds: ["deployment"],
      activeAttemptId: null,
      createdAt: now,
      updatedAt: now,
      terminalAt: null,
    },
  ],
  dependencies: [],
});

attentionLayer("AttentionEngine", (it) => {
  it.effect("keeps execution truth visible while focus mode suppresses interruption", () =>
    Effect.gen(function* () {
      const engine = yield* AttentionEngine;
      const attention = yield* AttentionRepository;
      const director = yield* DirectorWorkflowRepository;

      yield* director.createGraph(makeWorkflow());
      yield* attention.upsertItem({
        fingerprint: "approval:workflow-attention-engine:work-unit-attention-engine",
        projectId,
        workflowId,
        workUnitId,
        state: "needs-approval",
        priority: "urgent",
        interruptionClass: "system",
        reasonCode: "deployment-approval",
        summary: "Deployment approval is required.",
        recommendedAction: "Review the deployment boundary.",
        createdAt: now,
        updatedAt: now,
        resolvedAt: null,
        snoozedUntil: null,
      });
      yield* attention.savePreference({
        projectId,
        focusMode: "do-not-disturb",
        mutedReasonCodes: [],
        systemNotificationsEnabled: false,
        updatedAt: now,
      });

      const snapshot = yield* engine.getProjectSnapshot({ projectId, now });
      assert.strictEqual(snapshot.summary.state, "needs-approval");
      assert.strictEqual(snapshot.summary.needsApprovalCount, 1);
      assert.strictEqual(snapshot.summary.activeWorkflowCount, 1);
      assert.strictEqual(snapshot.summary.activeWorkUnitCount, 1);
      assert.strictEqual(snapshot.items[0]?.effectiveInterruptionClass, "silent");
      assert.strictEqual(snapshot.items[0]?.suppressionReason, "focus-mode");

      const workspace = yield* engine.getWorkspaceSnapshot({
        projectIds: [projectId, quietProjectId, projectId],
        now,
      });
      assert.strictEqual(workspace.projects.length, 2);
      assert.strictEqual(workspace.projects[1]?.summary.state, "quiet");
    }),
  );
});
