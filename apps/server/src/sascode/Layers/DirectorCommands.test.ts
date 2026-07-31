import {
  AgentRoleId,
  DirectorCommandId,
  ProjectId,
  RoutingPolicyId,
  WorkflowId,
  WorkUnitId,
  type Workflow,
} from "@synara/contracts";
import { assert, it } from "@effect/vitest";
import { Effect, Layer, Option, Stream } from "effect";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { DirectorCommands } from "../Services/DirectorCommands.ts";
import { DirectorEventStore } from "../Services/DirectorEventStore.ts";
import { Director } from "../Services/Director.ts";
import { DirectorCommandsLive } from "./DirectorCommands.ts";
import { DirectorEventStoreLive } from "./DirectorEventStore.ts";
import { DirectorWorkflowRepositoryLive } from "./DirectorWorkflowRepository.ts";
import { DirectorLive } from "./Director.ts";

const repositoryLayer = DirectorWorkflowRepositoryLive.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
);
const directorLayer = DirectorLive.pipe(Layer.provide(repositoryLayer));
const eventLayer = DirectorEventStoreLive.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
);
const dependencies = Layer.mergeAll(
  directorLayer,
  eventLayer,
  repositoryLayer,
);

const commandLayer = it.layer(
  Layer.mergeAll(
    DirectorCommandsLive.pipe(Layer.provide(dependencies)),
    dependencies,
    SqlitePersistenceMemory,
  ),
);

const now = "2026-07-30T13:00:00.000Z";
const projectId = ProjectId.makeUnsafe("project-director-commands");
const workflowId = WorkflowId.makeUnsafe("workflow-director-commands");
const workUnitId = WorkUnitId.makeUnsafe("work-unit-director-commands");

const makeWorkflow = (title = "Build the durable Director"): Workflow => ({
  id: workflowId,
  projectId,
  title,
  outcome: "Every accepted command is durable and replayable.",
  status: "proposed",
  routingPolicyId: RoutingPolicyId.makeUnsafe("routing-policy-director-commands"),
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
      key: "director",
      title: "Build Director commands",
      outcome: "Commands commit once.",
      activity: "backend-implementation",
      roleId: AgentRoleId.makeUnsafe("backend-engineer"),
      status: "ready",
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
  ],
  dependencies: [],
});

const commandContext = {
  commandId: DirectorCommandId.makeUnsafe("command-propose-durable-director"),
  actorKind: "human" as const,
  actorId: "sas",
  occurredAt: now,
  correlationId: "goal-sascode",
  causationEventId: null,
};

commandLayer("DirectorCommands", (it) => {
  it.effect("commits projection, event, and receipt once and replays safely", () =>
    Effect.gen(function* () {
      const commands = yield* DirectorCommands;
      const events = yield* DirectorEventStore;
      const live = yield* events.subscribeEvents;
      const [liveEvent, committed] = yield* Effect.all(
        [
          Stream.runHead(live),
          commands.proposeWorkflow({
            context: commandContext,
            workflow: makeWorkflow(),
          }),
        ],
        { concurrency: "unbounded" },
      );
      assert.isFalse(committed.replayed);
      assert.strictEqual(committed.event.streamVersion, 1);
      assert.strictEqual(
        Option.getOrThrow(liveEvent).sequence,
        committed.event.sequence,
      );

      const replayed = yield* commands.proposeWorkflow({
        context: commandContext,
        workflow: makeWorkflow(),
      });
      assert.isTrue(replayed.replayed);
      assert.strictEqual(replayed.event.sequence, committed.event.sequence);

      const projectEvents = yield* events.listEvents({
        afterSequence: 0,
        limit: 100,
        projectId,
      });
      assert.strictEqual(projectEvents.length, 1);
      assert.strictEqual(projectEvents[0]?.type, "workflow.proposed");

      const receipt = yield* events.getReceipt(commandContext.commandId);
      assert.isTrue(Option.isSome(receipt));
      assert.strictEqual(
        Option.getOrThrow(receipt).resultSequence,
        committed.event.sequence,
      );
    }),
  );

  it.effect("rejects command-id reuse with different semantic content", () =>
    Effect.gen(function* () {
      const commands = yield* DirectorCommands;
      yield* commands.proposeWorkflow({
        context: commandContext,
        workflow: makeWorkflow(),
      });

      const collision = yield* commands
        .proposeWorkflow({
          context: commandContext,
          workflow: makeWorkflow("A conflicting workflow title"),
        })
        .pipe(Effect.flip);
      assert.strictEqual(
        collision._tag,
        "DirectorCommandIdentityCollisionError",
      );
    }),
  );

  it.effect("rolls projection state back when an event transaction fails", () =>
    Effect.gen(function* () {
      const director = yield* Director;
      const events = yield* DirectorEventStore;
      const rollbackWorkflowId = WorkflowId.makeUnsafe(
        "workflow-director-rollback",
      );
      const workflow: Workflow = {
        ...makeWorkflow(),
        id: rollbackWorkflowId,
        workUnits: [
          {
            ...makeWorkflow().workUnits[0]!,
            id: WorkUnitId.makeUnsafe("work-unit-director-rollback"),
            workflowId: rollbackWorkflowId,
          },
        ],
      };

      yield* events
        .commitCommand(
          {
            context: {
              ...commandContext,
              commandId: DirectorCommandId.makeUnsafe(
                "command-director-rollback",
              ),
            },
            projectId,
            aggregateKind: "workflow",
            aggregateId: workflow.id,
            eventType: "workflow.proposed",
            payload: { workflowId: workflow.id },
            fingerprintPayload: workflow,
          },
          director
            .proposeWorkflow(workflow)
            .pipe(
              Effect.flatMap(() =>
                Effect.fail(new Error("simulate commit failure")),
              ),
            ),
        )
        .pipe(Effect.flip);

      assert.isTrue(
        Option.isNone(yield* director.getWorkflow(rollbackWorkflowId)),
      );
    }),
  );
});
