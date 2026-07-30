import type {
  DirectorEvent,
  ProviderCapabilitySnapshot,
  SascodeDirectorCommand,
  SascodeDirectorCommandResult,
  SascodeDispatchAttemptInput,
  SascodeDispatchAttemptResult,
  SascodeGetProjectSnapshotInput,
  SascodeGetWorkflowInput,
  SascodeGetWorkspaceSnapshotInput,
  SascodeListEventsInput,
  SascodeProjectSnapshot,
  SascodeSubscribeEventsInput,
  SascodeWorkspaceSnapshot,
  Workflow,
} from "@synara/contracts";
import { ServiceMap } from "effect";
import type { Effect, Stream } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";
import type { AttemptDispatcherError } from "./AttemptDispatcher.ts";
import type { DirectorCommandServiceError } from "./DirectorCommands.ts";

export type SascodeApiError =
  | ProjectionRepositoryError
  | DirectorCommandServiceError
  | AttemptDispatcherError;

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

  readonly listEvents: (
    input: SascodeListEventsInput,
  ) => Effect.Effect<ReadonlyArray<DirectorEvent>, ProjectionRepositoryError>;

  readonly executeDirectorCommand: (
    command: SascodeDirectorCommand,
  ) => Effect.Effect<SascodeDirectorCommandResult, SascodeApiError>;

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
