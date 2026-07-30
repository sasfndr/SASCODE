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
  SascodeListEventsInput,
  SascodeProjectSnapshot,
  SascodeRefreshProviderCapabilitiesInput,
  SascodeRunWorkflowInput,
  SascodeRunWorkflowResult,
  SascodeScheduleWorkUnitInput,
  SascodeScheduleWorkUnitResult,
  SascodeSubmitResultInput,
  SascodeSubmitResultResult,
  SascodeSubscribeEventsInput,
  SascodeWorkspaceSnapshot,
  Workflow,
} from "@synara/contracts";
import { ServiceMap } from "effect";
import type { Effect, Stream } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";
import type { AttemptDispatcherError } from "./AttemptDispatcher.ts";
import type { DirectorCommandServiceError } from "./DirectorCommands.ts";
import type { WorkUnitOrchestratorError } from "./WorkUnitOrchestrator.ts";
import type { ResultIngestionError } from "./ResultIngestion.ts";
import type { ProviderCatalogSyncError } from "./ProviderCatalogSync.ts";

export type SascodeApiError =
  | ProjectionRepositoryError
  | DirectorCommandServiceError
  | AttemptDispatcherError
  | WorkUnitOrchestratorError
  | ResultIngestionError
  | ProviderCatalogSyncError;

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
}

export class SascodeApi extends ServiceMap.Service<
  SascodeApi,
  SascodeApiShape
>()("sascode/Services/SascodeApi") {}
