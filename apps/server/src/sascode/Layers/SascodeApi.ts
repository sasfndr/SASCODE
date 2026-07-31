import {
  DirectorCommandId,
  type DirectorEvent,
  type SascodeDirectorCommandResult,
} from "@synara/contracts";
import { Effect, Layer, Option, Stream } from "effect";

import { AttemptDispatcher } from "../Services/AttemptDispatcher.ts";
import { AttentionEngine } from "../Services/AttentionEngine.ts";
import { AttentionRepository } from "../Services/AttentionRepository.ts";
import { BrowserWorkspaceRepository } from "../Services/BrowserWorkspaceRepository.ts";
import { BrowserWorkspace } from "../Services/BrowserWorkspace.ts";
import { CapabilityRepository } from "../Services/CapabilityRepository.ts";
import { ContextEvidenceRepository } from "../Services/ContextEvidenceRepository.ts";
import { DirectorCommands } from "../Services/DirectorCommands.ts";
import { DirectorEventStore } from "../Services/DirectorEventStore.ts";
import { DirectorWorkflowRepository } from "../Services/DirectorWorkflowRepository.ts";
import { ModuleRepository } from "../Services/ModuleRepository.ts";
import { ModuleRuntime } from "../Services/ModuleRuntime.ts";
import { RoutingRepository } from "../Services/RoutingRepository.ts";
import { SascodeApi, type SascodeApiShape } from "../Services/SascodeApi.ts";
import { WorkUnitOrchestrator } from "../Services/WorkUnitOrchestrator.ts";
import { WorkspaceLayoutRepository } from "../Services/WorkspaceLayoutRepository.ts";
import { ResultIngestion } from "../Services/ResultIngestion.ts";
import { ProviderCatalogSync } from "../Services/ProviderCatalogSync.ts";
import { createSascodeProjectDefaults } from "../projectDefaults.ts";
import { createSascodeFeaturePlan } from "../featureWorkflow.ts";

const makeSascodeApi = Effect.gen(function* () {
  const attempts = yield* AttemptDispatcher;
  const attention = yield* AttentionEngine;
  const attentionRepository = yield* AttentionRepository;
  const browsers = yield* BrowserWorkspaceRepository;
  const browserWorkspace = yield* BrowserWorkspace;
  const capabilities = yield* CapabilityRepository;
  const context = yield* ContextEvidenceRepository;
  const commands = yield* DirectorCommands;
  const events = yield* DirectorEventStore;
  const modules = yield* ModuleRepository;
  const moduleRuntime = yield* ModuleRuntime;
  const routing = yield* RoutingRepository;
  const workflows = yield* DirectorWorkflowRepository;
  const layouts = yield* WorkspaceLayoutRepository;
  const orchestrator = yield* WorkUnitOrchestrator;
  const resultIngestion = yield* ResultIngestion;
  const providerCatalog = yield* ProviderCatalogSync;

  const getWorkspaceSnapshot: SascodeApiShape["getWorkspaceSnapshot"] = (input) =>
    Effect.all([attention.getWorkspaceSnapshot(input), routing.listCurrentCapabilitySnapshots()], {
      concurrency: "unbounded",
    }).pipe(
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
        layouts.getLayout({ projectId: input.projectId }),
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
          projectLayout,
          activePermissionGrants,
        ]) => ({
          projectId: input.projectId,
          workflows: projectWorkflows,
          attention: projectAttention,
          browserProfiles,
          browserInstances,
          modules: projectModules,
          layout: Option.getOrNull(projectLayout),
          activePermissionGrants,
          generatedAt: input.now,
        }),
      ),
    );

  const getWorkflow: SascodeApiShape["getWorkflow"] = (input) =>
    workflows.getById(input).pipe(Effect.map(Option.getOrNull));

  const listProviderCapabilities: SascodeApiShape["listProviderCapabilities"] = () =>
    routing.listCurrentCapabilitySnapshots();

  const refreshProviderCapabilities: SascodeApiShape["refreshProviderCapabilities"] = (input) =>
    providerCatalog.refresh(input);

  const listEvents: SascodeApiShape["listEvents"] = (input) => events.listEvents(input);

  const executeDirectorCommand: SascodeApiShape["executeDirectorCommand"] = (command) => {
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
        return commands
          .advanceAttempt({
            ...command,
            // The wire schema declares these optional AND nullable, which under
            // exactOptionalPropertyTypes widens to `| undefined`. The command
            // service collapses absent/null to null anyway, so normalise here
            // rather than widening the service's input type.
            error: command.error ?? null,
          })
          .pipe(
            Effect.map(
              (result): SascodeDirectorCommandResult => ({
                resultKind: "attempt",
                ...result,
              }),
            ),
          );
      case "attempt.attach-thread":
        return commands
          .attachThread({
            ...command,
            worktreePath: command.worktreePath ?? null,
            baselineGitRef: command.baselineGitRef ?? null,
          })
          .pipe(
            Effect.map(
              (result): SascodeDirectorCommandResult => ({
                resultKind: "attempt",
                ...result,
              }),
            ),
          );
    }
  };

  const dispatchAttempt: SascodeApiShape["dispatchAttempt"] = (input) => attempts.dispatch(input);

  const scheduleWorkUnit: SascodeApiShape["scheduleWorkUnit"] = (input) =>
    orchestrator.schedule({
      ...input,
      actorId: "session-owner",
    });

  const runWorkflow: SascodeApiShape["runWorkflow"] = (input) => orchestrator.runWorkflow(input);

  const submitResult: SascodeApiShape["submitResult"] = (input) =>
    resultIngestion.submit({
      submission: input,
      actorKind: "human",
      actorId: "session-owner",
      expectedThreadId: null,
    });

  const subscribeEvents: SascodeApiShape["subscribeEvents"] = (input) =>
    Stream.unwrap(
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
          const bounded = page.filter((event) => event.sequence <= highWater);
          replay.push(...bounded);
          const nextCursor = bounded.at(-1)?.sequence ?? highWater;
          if (nextCursor <= cursor || page.length === 0) break;
          cursor = nextCursor;
        }
        const filteredLive = live.pipe(
          Stream.filter(
            (event) =>
              event.sequence > highWater &&
              (input.projectId == null || event.projectId === input.projectId),
          ),
        );
        return Stream.concat(Stream.fromIterable(replay), filteredLive);
      }),
    );

  const publishRoutingPolicy: SascodeApiShape["publishRoutingPolicy"] = (input) =>
    routing.publishPolicy(input);

  const upsertContextArtifact: SascodeApiShape["upsertContextArtifact"] = (input) =>
    context.upsertContextArtifact(input);

  const savePermissionGrant: SascodeApiShape["savePermissionGrant"] = (input) =>
    capabilities.saveGrant(input);

  const saveBrowserProfile: SascodeApiShape["saveBrowserProfile"] = (input) =>
    browserWorkspace.saveProfile(input);

  const createBrowserInstance: SascodeApiShape["createBrowserInstance"] = (input) =>
    browserWorkspace.createInstance(input);

  const acquireBrowserControl: SascodeApiShape["acquireBrowserControl"] = (input) =>
    browserWorkspace.acquireControl(input);

  const releaseBrowserControl: SascodeApiShape["releaseBrowserControl"] = (input) =>
    browserWorkspace.releaseControl(input);

  const updateBrowserInstance: SascodeApiShape["updateBrowserInstance"] = (input) =>
    browserWorkspace.updateInstance(input);

  const installModule: SascodeApiShape["installModule"] = (input) => moduleRuntime.install(input);

  const instantiateModule: SascodeApiShape["instantiateModule"] = (input) =>
    moduleRuntime.instantiate(input);

  const activateModule: SascodeApiShape["activateModule"] = (input) =>
    moduleRuntime.activate(input);

  const updateModuleInstance: SascodeApiShape["updateModuleInstance"] = (input) =>
    moduleRuntime.update(input);

  const bootstrapProject: SascodeApiShape["bootstrapProject"] = (input) =>
    Effect.gen(function* () {
      const defaults = createSascodeProjectDefaults(input);
      const existingLayout = yield* layouts.getLayout({
        projectId: input.projectId,
      });
      const [policyCreated, permissionGrantCreated] = yield* Effect.all(
        [routing.publishPolicy(defaults.policy), capabilities.saveGrant(defaults.permissionGrant)],
        { concurrency: "unbounded" },
      );
      yield* Effect.forEach(
        defaults.contextArtifacts,
        (artifact) => context.upsertContextArtifact(artifact),
        { concurrency: 1, discard: true },
      );
      const layout = Option.isSome(existingLayout)
        ? existingLayout.value
        : yield* layouts.saveLayout({
            layout: defaults.layout,
            expectedRevision: 0,
          });
      return {
        policy: defaults.policy,
        permissionGrant: defaults.permissionGrant,
        contextArtifacts: [...defaults.contextArtifacts],
        layout,
        policyCreated,
        permissionGrantCreated,
        layoutCreated: Option.isNone(existingLayout),
      };
    });

  const startFeature: SascodeApiShape["startFeature"] = (input) =>
    Effect.gen(function* () {
      const [activeContext, activeGrants] = yield* Effect.all(
        [
          context.listActiveContextArtifacts({
            projectId: input.projectId,
          }),
          capabilities.listActiveGrants({
            projectId: input.projectId,
            now: input.occurredAt,
          }),
        ],
        { concurrency: "unbounded" },
      );
      const plan = createSascodeFeaturePlan(
        input,
        activeContext.map(({ id }) => id),
        activeGrants
          .filter(({ profile }) => profile === input.permissionProfile)
          .map(({ id }) => id),
      );
      const proposed = yield* commands.proposeWorkflow({
        context: {
          commandId: DirectorCommandId.makeUnsafe(
            `sascode:${input.projectId}:${input.requestId}:propose`,
          ),
          actorKind: "human",
          actorId: "session-owner",
          occurredAt: input.occurredAt,
          correlationId: `sascode-feature:${input.requestId}`,
          causationEventId: null,
        },
        workflow: plan.workflow,
      });
      let current = proposed.current;
      if (current.status === "proposed") {
        current = (yield* commands.moveWorkflow({
          context: {
            commandId: DirectorCommandId.makeUnsafe(
              `sascode:${input.projectId}:${input.requestId}:approve`,
            ),
            actorKind: "human",
            actorId: "session-owner",
            occurredAt: input.occurredAt,
            correlationId: `sascode-feature:${input.requestId}`,
            causationEventId: null,
          },
          workflowId: current.id,
          nextStatus: "awaiting-approval",
        })).current;
      }
      if (current.status === "awaiting-approval") {
        current = (yield* commands.moveWorkflow({
          context: {
            commandId: DirectorCommandId.makeUnsafe(
              `sascode:${input.projectId}:${input.requestId}:queue`,
            ),
            actorKind: "human",
            actorId: "session-owner",
            occurredAt: input.occurredAt,
            correlationId: `sascode-feature:${input.requestId}`,
            causationEventId: null,
          },
          workflowId: current.id,
          nextStatus: "queued",
        })).current;
      }

      const results = yield* Effect.forEach(
        plan.executionSpecs,
        (spec) =>
          orchestrator
            .schedule({
              spec,
              occurredAt: input.occurredAt,
              actorId: "session-owner",
            })
            .pipe(
              Effect.map((result) => ({
                workUnitId: spec.workUnitId,
                result,
              })),
            ),
        { concurrency: 1 },
      );
      const workflow = Option.getOrElse(
        yield* workflows.getById({ workflowId: current.id }),
        () => current,
      );
      return {
        workflow,
        executionSpecs: [...plan.executionSpecs],
        execution: {
          scanned: results.length,
          scheduled: results.filter(({ result }) => result.disposition === "scheduled").length,
          active: results.filter(({ result }) => result.disposition === "already-active").length,
          exhausted: results.filter(({ result }) => result.disposition === "retry-exhausted")
            .length,
          deferred: results.filter(({ result }) => result.disposition === "not-ready").length,
          results,
        },
        replayed: proposed.replayed,
      };
    });

  const getWorkspaceLayout: SascodeApiShape["getWorkspaceLayout"] = (input) =>
    layouts.getLayout(input).pipe(Effect.map(Option.getOrNull));

  const saveWorkspaceLayout: SascodeApiShape["saveWorkspaceLayout"] = (input) =>
    layouts.saveLayout(input);

  const saveAttentionPreference: SascodeApiShape["saveAttentionPreference"] = (input) =>
    attentionRepository.savePreference(input);

  const resolveAttentionItem: SascodeApiShape["resolveAttentionItem"] = (input) =>
    attentionRepository.resolveItem(input);

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
    publishRoutingPolicy,
    upsertContextArtifact,
    savePermissionGrant,
    saveBrowserProfile,
    createBrowserInstance,
    acquireBrowserControl,
    releaseBrowserControl,
    updateBrowserInstance,
    installModule,
    instantiateModule,
    activateModule,
    updateModuleInstance,
    bootstrapProject,
    startFeature,
    getWorkspaceLayout,
    saveWorkspaceLayout,
    saveAttentionPreference,
    resolveAttentionItem,
  } satisfies SascodeApiShape;
});

export const SascodeApiLive = Layer.effect(SascodeApi, makeSascodeApi);
