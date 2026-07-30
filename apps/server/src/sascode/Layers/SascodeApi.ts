import type {
  DirectorEvent,
  SascodeDirectorCommandResult,
} from "@synara/contracts";
import { Effect, Layer, Option, Stream } from "effect";

import { AttemptDispatcher } from "../Services/AttemptDispatcher.ts";
import { AttentionEngine } from "../Services/AttentionEngine.ts";
import { BrowserWorkspaceRepository } from "../Services/BrowserWorkspaceRepository.ts";
import { CapabilityRepository } from "../Services/CapabilityRepository.ts";
import { DirectorCommands } from "../Services/DirectorCommands.ts";
import { DirectorEventStore } from "../Services/DirectorEventStore.ts";
import { DirectorWorkflowRepository } from "../Services/DirectorWorkflowRepository.ts";
import { ModuleRepository } from "../Services/ModuleRepository.ts";
import { RoutingRepository } from "../Services/RoutingRepository.ts";
import { SascodeApi, type SascodeApiShape } from "../Services/SascodeApi.ts";
import { WorkUnitOrchestrator } from "../Services/WorkUnitOrchestrator.ts";
import { ResultIngestion } from "../Services/ResultIngestion.ts";
import { ProviderCatalogSync } from "../Services/ProviderCatalogSync.ts";

const makeSascodeApi = Effect.gen(function* () {
  const attempts = yield* AttemptDispatcher;
  const attention = yield* AttentionEngine;
  const browsers = yield* BrowserWorkspaceRepository;
  const capabilities = yield* CapabilityRepository;
  const commands = yield* DirectorCommands;
  const events = yield* DirectorEventStore;
  const modules = yield* ModuleRepository;
  const routing = yield* RoutingRepository;
  const workflows = yield* DirectorWorkflowRepository;
  const orchestrator = yield* WorkUnitOrchestrator;
  const resultIngestion = yield* ResultIngestion;
  const providerCatalog = yield* ProviderCatalogSync;

  const getWorkspaceSnapshot: SascodeApiShape["getWorkspaceSnapshot"] = (
    input,
  ) =>
    Effect.all(
      [
        attention.getWorkspaceSnapshot(input),
        routing.listCurrentCapabilitySnapshots(),
      ],
      { concurrency: "unbounded" },
    ).pipe(
      Effect.map(([attentionSnapshot, providerCapabilities]) => ({
        attention: attentionSnapshot,
        providerCapabilities,
        generatedAt: input.now,
      })),
    );

  const getProjectSnapshot: SascodeApiShape["getProjectSnapshot"] = (input) =>
    Effect.all(
      [
        workflows.listByProject({ projectId: input.projectId }),
        attention.getProjectSnapshot(input),
        browsers.listProfiles({ projectId: input.projectId }),
        browsers.listInstances({ projectId: input.projectId }),
        modules.listInstances({ projectId: input.projectId }),
        capabilities.listActiveGrants({
          projectId: input.projectId,
          now: input.now,
        }),
      ],
      { concurrency: "unbounded" },
    ).pipe(
      Effect.map(
        ([
          projectWorkflows,
          projectAttention,
          browserProfiles,
          browserInstances,
          projectModules,
          activePermissionGrants,
        ]) => ({
          projectId: input.projectId,
          workflows: projectWorkflows,
          attention: projectAttention,
          browserProfiles,
          browserInstances,
          modules: projectModules,
          activePermissionGrants,
          generatedAt: input.now,
        }),
      ),
    );

  const getWorkflow: SascodeApiShape["getWorkflow"] = (input) =>
    workflows
      .getById(input)
      .pipe(Effect.map(Option.getOrNull));

  const listProviderCapabilities: SascodeApiShape["listProviderCapabilities"] =
    () => routing.listCurrentCapabilitySnapshots();

  const refreshProviderCapabilities: SascodeApiShape["refreshProviderCapabilities"] =
    (input) => providerCatalog.refresh(input);

  const listEvents: SascodeApiShape["listEvents"] = (input) =>
    events.listEvents(input);

  const executeDirectorCommand: SascodeApiShape["executeDirectorCommand"] = (
    command,
  ) => {
    switch (command.type) {
      case "workflow.propose":
        return commands.proposeWorkflow(command).pipe(
          Effect.map(
            (result): SascodeDirectorCommandResult => ({
              resultKind: "workflow",
              ...result,
            }),
          ),
        );
      case "workflow.move":
        return commands.moveWorkflow(command).pipe(
          Effect.map(
            (result): SascodeDirectorCommandResult => ({
              resultKind: "workflow",
              ...result,
            }),
          ),
        );
      case "work-unit.move":
        return commands.moveWorkUnit(command).pipe(
          Effect.map(
            (result): SascodeDirectorCommandResult => ({
              resultKind: "work-unit",
              ...result,
            }),
          ),
        );
      case "workflow.reconcile-ready":
        return commands.reconcileReadyWorkUnits(command).pipe(
          Effect.map(
            (result): SascodeDirectorCommandResult => ({
              resultKind: "work-unit-ids",
              ...result,
              current: [...result.current],
            }),
          ),
        );
      case "attempt.begin":
        return commands.beginAttempt(command).pipe(
          Effect.map(
            (result): SascodeDirectorCommandResult => ({
              resultKind: "attempt",
              ...result,
            }),
          ),
        );
      case "attempt.advance":
        return commands.advanceAttempt(command).pipe(
          Effect.map(
            (result): SascodeDirectorCommandResult => ({
              resultKind: "attempt",
              ...result,
            }),
          ),
        );
      case "attempt.attach-thread":
        return commands.attachThread(command).pipe(
          Effect.map(
            (result): SascodeDirectorCommandResult => ({
              resultKind: "attempt",
              ...result,
            }),
          ),
        );
    }
  };

  const dispatchAttempt: SascodeApiShape["dispatchAttempt"] = (input) =>
    attempts.dispatch(input);

  const scheduleWorkUnit: SascodeApiShape["scheduleWorkUnit"] = (input) =>
    orchestrator.schedule({
      ...input,
      actorId: "session-owner",
    });

  const runWorkflow: SascodeApiShape["runWorkflow"] = (input) =>
    orchestrator.runWorkflow(input);

  const submitResult: SascodeApiShape["submitResult"] = (input) =>
    resultIngestion.submit({
      submission: input,
      actorKind: "human",
      actorId: "session-owner",
      expectedThreadId: null,
    });

  const subscribeEvents: SascodeApiShape["subscribeEvents"] = (input) =>
    Stream.unwrapScoped(
      Effect.gen(function* () {
        const live = yield* events.subscribeEvents;
        const highWater = yield* events.getHighWaterSequence;
        const replay: DirectorEvent[] = [];
        let cursor = Math.max(0, input.afterSequence);
        while (cursor < highWater) {
          const page = yield* events.listEvents({
            afterSequence: cursor,
            limit: 500,
            projectId: input.projectId ?? null,
          });
          const bounded = page.filter(
            (event) => event.sequence <= highWater,
          );
          replay.push(...bounded);
          const nextCursor = bounded.at(-1)?.sequence ?? highWater;
          if (nextCursor <= cursor || page.length === 0) break;
          cursor = nextCursor;
        }
        const filteredLive = live.pipe(
          Stream.filter(
            (event) =>
              event.sequence > highWater &&
              (input.projectId == null ||
                event.projectId === input.projectId),
          ),
        );
        return Stream.concat(Stream.fromIterable(replay), filteredLive);
      }),
    );

  return {
    getWorkspaceSnapshot,
    getProjectSnapshot,
    getWorkflow,
    listProviderCapabilities,
    refreshProviderCapabilities,
    listEvents,
    executeDirectorCommand,
    scheduleWorkUnit,
    runWorkflow,
    submitResult,
    dispatchAttempt,
    subscribeEvents,
  } satisfies SascodeApiShape;
});

export const SascodeApiLive = Layer.effect(
  SascodeApi,
  makeSascodeApi,
);
