import type {
  DirectorEvent,
  ProviderCapabilitySnapshot,
  ProviderCatalogRefreshResult,
  SascodeDirectorCommand,
  SascodeDirectorCommandResult,
  SascodeDispatchAttemptInput,
  SascodeDispatchAttemptResult,
  SascodeGetProjectSnapshotInput,
  SascodeGetWorkflowInput,
  SascodeGetWorkspaceSnapshotInput,
  SascodeAcquireBrowserControlInput,
  SascodeAcquireBrowserControlResult,
  SascodeActivateModuleInput,
  SascodeActivateModuleResult,
  SascodeBootstrapProjectInput,
  SascodeBootstrapProjectResult,
  SascodeCreateBrowserInstanceInput,
  SascodeInstallModuleInput,
  SascodeInstantiateModuleInput,
  SascodeListEventsInput,
  SascodeProjectSnapshot,
  SascodePublishRoutingPolicyInput,
  SascodeRefreshProviderCapabilitiesInput,
  SascodeRunWorkflowInput,
  SascodeRunWorkflowResult,
  SascodeScheduleWorkUnitInput,
  SascodeScheduleWorkUnitResult,
  SascodeStartFeatureInput,
  SascodeStartFeatureResult,
  SascodeReleaseBrowserControlInput,
  SascodeSaveBrowserProfileInput,
  SascodeSavePermissionGrantInput,
  SascodeSubmitResultInput,
  SascodeSubmitResultResult,
  SascodeUpdateBrowserInstanceInput,
  SascodeUpsertContextArtifactInput,
  SascodeSubscribeEventsInput,
  SascodeWorkspaceSnapshot,
  Workflow,
  BrowserInstance,
  BrowserProfile,
  SascodeModuleInstance,
  SascodeModuleManifest,
} from "@synara/contracts";
import { ServiceMap } from "effect";
import type { Effect, Stream } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";
import type { AttemptDispatcherError } from "./AttemptDispatcher.ts";
import type { DirectorCommandServiceError } from "./DirectorCommands.ts";
import type { WorkUnitOrchestratorError } from "./WorkUnitOrchestrator.ts";
import type { ResultIngestionError } from "./ResultIngestion.ts";
import type { ProviderCatalogSyncError } from "./ProviderCatalogSync.ts";
import type { BrowserWorkspaceError } from "./BrowserWorkspace.ts";
import type { ModuleRuntimeError } from "./ModuleRuntime.ts";

export type SascodeApiError =
  | ProjectionRepositoryError
  | DirectorCommandServiceError
  | AttemptDispatcherError
  | WorkUnitOrchestratorError
  | ResultIngestionError
  | ProviderCatalogSyncError
  | BrowserWorkspaceError
  | ModuleRuntimeError;

export interface SascodeApiShape {
  readonly getWorkspaceSnapshot: (
    input: SascodeGetWorkspaceSnapshotInput,
  ) => Effect.Effect<SascodeWorkspaceSnapshot, ProjectionRepositoryError>;

  readonly getProjectSnapshot: (
    input: SascodeGetProjectSnapshotInput,
  ) => Effect.Effect<SascodeProjectSnapshot, ProjectionRepositoryError>;

  readonly getWorkflow: (
    input: SascodeGetWorkflowInput,
  ) => Effect.Effect<Workflow | null, ProjectionRepositoryError>;

  readonly listProviderCapabilities: () => Effect.Effect<
    ReadonlyArray<ProviderCapabilitySnapshot>,
    ProjectionRepositoryError
  >;

  readonly refreshProviderCapabilities: (
    input: SascodeRefreshProviderCapabilitiesInput,
  ) => Effect.Effect<ProviderCatalogRefreshResult, SascodeApiError>;

  readonly listEvents: (
    input: SascodeListEventsInput,
  ) => Effect.Effect<ReadonlyArray<DirectorEvent>, ProjectionRepositoryError>;

  readonly executeDirectorCommand: (
    command: SascodeDirectorCommand,
  ) => Effect.Effect<SascodeDirectorCommandResult, SascodeApiError>;

  readonly scheduleWorkUnit: (
    input: SascodeScheduleWorkUnitInput,
  ) => Effect.Effect<SascodeScheduleWorkUnitResult, SascodeApiError>;

  readonly runWorkflow: (
    input: SascodeRunWorkflowInput,
  ) => Effect.Effect<SascodeRunWorkflowResult, SascodeApiError>;

  readonly submitResult: (
    input: SascodeSubmitResultInput,
  ) => Effect.Effect<SascodeSubmitResultResult, SascodeApiError>;

  readonly dispatchAttempt: (
    input: SascodeDispatchAttemptInput,
  ) => Effect.Effect<SascodeDispatchAttemptResult, SascodeApiError>;

  readonly subscribeEvents: (
    input: SascodeSubscribeEventsInput,
  ) => Stream.Stream<DirectorEvent, ProjectionRepositoryError>;

  readonly publishRoutingPolicy: (
    input: SascodePublishRoutingPolicyInput,
  ) => Effect.Effect<boolean, SascodeApiError>;

  readonly upsertContextArtifact: (
    input: SascodeUpsertContextArtifactInput,
  ) => Effect.Effect<void, SascodeApiError>;

  readonly savePermissionGrant: (
    input: SascodeSavePermissionGrantInput,
  ) => Effect.Effect<boolean, SascodeApiError>;

  readonly saveBrowserProfile: (
    input: SascodeSaveBrowserProfileInput,
  ) => Effect.Effect<BrowserProfile, SascodeApiError>;

  readonly createBrowserInstance: (
    input: SascodeCreateBrowserInstanceInput,
  ) => Effect.Effect<BrowserInstance, SascodeApiError>;

  readonly acquireBrowserControl: (
    input: SascodeAcquireBrowserControlInput,
  ) => Effect.Effect<SascodeAcquireBrowserControlResult, SascodeApiError>;

  readonly releaseBrowserControl: (
    input: SascodeReleaseBrowserControlInput,
  ) => Effect.Effect<BrowserInstance, SascodeApiError>;

  readonly updateBrowserInstance: (
    input: SascodeUpdateBrowserInstanceInput,
  ) => Effect.Effect<BrowserInstance, SascodeApiError>;

  readonly installModule: (
    input: SascodeInstallModuleInput,
  ) => Effect.Effect<SascodeModuleManifest, SascodeApiError>;

  readonly instantiateModule: (
    input: SascodeInstantiateModuleInput,
  ) => Effect.Effect<SascodeModuleInstance, SascodeApiError>;

  readonly activateModule: (
    input: SascodeActivateModuleInput,
  ) => Effect.Effect<SascodeActivateModuleResult, SascodeApiError>;

  readonly bootstrapProject: (
    input: SascodeBootstrapProjectInput,
  ) => Effect.Effect<SascodeBootstrapProjectResult, SascodeApiError>;

  readonly startFeature: (
    input: SascodeStartFeatureInput,
  ) => Effect.Effect<SascodeStartFeatureResult, SascodeApiError>;
}

export class SascodeApi extends ServiceMap.Service<
  SascodeApi,
  SascodeApiShape
>()("sascode/Services/SascodeApi") {}
