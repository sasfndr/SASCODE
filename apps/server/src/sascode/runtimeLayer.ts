import { Layer } from "effect";

import { AttemptDispatcherLive } from "./Layers/AttemptDispatcher.ts";
import { AttentionEngineLive } from "./Layers/AttentionEngine.ts";
import { AttentionRepositoryLive } from "./Layers/AttentionRepository.ts";
import { BrowserWorkspaceLive } from "./Layers/BrowserWorkspace.ts";
import { BrowserWorkspaceRepositoryLive } from "./Layers/BrowserWorkspaceRepository.ts";
import { CapabilityBrokerLive } from "./Layers/CapabilityBroker.ts";
import { CapabilityRepositoryLive } from "./Layers/CapabilityRepository.ts";
import { ContextEvidenceRepositoryLive } from "./Layers/ContextEvidenceRepository.ts";
import { DirectorCommandsLive } from "./Layers/DirectorCommands.ts";
import { DirectorEventStoreLive } from "./Layers/DirectorEventStore.ts";
import { DirectorExecutionCoordinatorLive } from "./Layers/DirectorExecutionCoordinator.ts";
import { DirectorRecoveryLive } from "./Layers/DirectorRecovery.ts";
import { DirectorThreadLauncherLive } from "./Layers/DirectorThreadLauncher.ts";
import { DirectorWorkflowRepositoryLive } from "./Layers/DirectorWorkflowRepository.ts";
import { DirectorLive } from "./Layers/Director.ts";
import { ExecutionPlanRepositoryLive } from "./Layers/ExecutionPlanRepository.ts";
import { ModelRouterLive } from "./Layers/ModelRouter.ts";
import { ModuleRepositoryLive } from "./Layers/ModuleRepository.ts";
import { ModuleRuntimeLive } from "./Layers/ModuleRuntime.ts";
import { ProviderCapabilitySyncLive } from "./Layers/ProviderCapabilitySync.ts";
import { ProviderCatalogSyncLive } from "./Layers/ProviderCatalogSync.ts";
import { RoutingRepositoryLive } from "./Layers/RoutingRepository.ts";
import { ResultIngestionLive } from "./Layers/ResultIngestion.ts";
import { SascodeApiLive } from "./Layers/SascodeApi.ts";
import { TaskContractsLive } from "./Layers/TaskContracts.ts";
import { WorkUnitOrchestratorLive } from "./Layers/WorkUnitOrchestrator.ts";

const repositoryLayer = Layer.mergeAll(
  AttentionRepositoryLive,
  BrowserWorkspaceRepositoryLive,
  CapabilityRepositoryLive,
  ContextEvidenceRepositoryLive,
  DirectorWorkflowRepositoryLive,
  ExecutionPlanRepositoryLive,
  ModuleRepositoryLive,
  RoutingRepositoryLive,
);

const directorLayer = DirectorLive.pipe(
  Layer.provide(repositoryLayer),
);

const eventLayer = DirectorEventStoreLive;

const commandLayer = DirectorCommandsLive.pipe(
  Layer.provide(
    Layer.mergeAll(directorLayer, eventLayer, repositoryLayer),
  ),
);

const capabilityBrokerLayer = CapabilityBrokerLive.pipe(
  Layer.provide(repositoryLayer),
);

const attentionEngineLayer = AttentionEngineLive.pipe(
  Layer.provide(repositoryLayer),
);

const browserWorkspaceLayer = BrowserWorkspaceLive.pipe(
  Layer.provide(
    Layer.mergeAll(repositoryLayer, capabilityBrokerLayer),
  ),
);

const moduleRuntimeLayer = ModuleRuntimeLive.pipe(
  Layer.provide(
    Layer.mergeAll(repositoryLayer, capabilityBrokerLayer),
  ),
);

const modelRouterLayer = ModelRouterLive.pipe(
  Layer.provide(repositoryLayer),
);

const providerCapabilitySyncLayer = ProviderCapabilitySyncLive.pipe(
  Layer.provide(repositoryLayer),
);

const providerCatalogSyncLayer = ProviderCatalogSyncLive.pipe(
  Layer.provide(providerCapabilitySyncLayer),
);

const taskContractsLayer = TaskContractsLive.pipe(
  Layer.provide(repositoryLayer),
);

const executionCoordinatorLayer = DirectorExecutionCoordinatorLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      directorLayer,
      repositoryLayer,
      taskContractsLayer,
    ),
  ),
);

const attemptDispatcherLayer = AttemptDispatcherLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      commandLayer,
      repositoryLayer,
      DirectorThreadLauncherLive,
    ),
  ),
);

const recoveryLayer = DirectorRecoveryLive.pipe(
  Layer.provide(
    Layer.mergeAll(attemptDispatcherLayer, repositoryLayer),
  ),
);

const workUnitOrchestratorLayer = WorkUnitOrchestratorLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      attemptDispatcherLayer,
      commandLayer,
      modelRouterLayer,
      repositoryLayer,
      taskContractsLayer,
    ),
  ),
);

const resultIngestionLayer = ResultIngestionLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      commandLayer,
      eventLayer,
      executionCoordinatorLayer,
      repositoryLayer,
      workUnitOrchestratorLayer,
    ),
  ),
);

const apiLayer = SascodeApiLive.pipe(
  Layer.provide(
    Layer.mergeAll(
      attemptDispatcherLayer,
      attentionEngineLayer,
      browserWorkspaceLayer,
      commandLayer,
      eventLayer,
      repositoryLayer,
      resultIngestionLayer,
      moduleRuntimeLayer,
      workUnitOrchestratorLayer,
      providerCatalogSyncLayer,
    ),
  ),
);

export const SascodeRuntimeLayerLive = Layer.mergeAll(
  repositoryLayer,
  directorLayer,
  eventLayer,
  commandLayer,
  capabilityBrokerLayer,
  attentionEngineLayer,
  browserWorkspaceLayer,
  moduleRuntimeLayer,
  modelRouterLayer,
  providerCapabilitySyncLayer,
  providerCatalogSyncLayer,
  taskContractsLayer,
  executionCoordinatorLayer,
  DirectorThreadLauncherLive,
  attemptDispatcherLayer,
  recoveryLayer,
  workUnitOrchestratorLayer,
  resultIngestionLayer,
  apiLayer,
);
