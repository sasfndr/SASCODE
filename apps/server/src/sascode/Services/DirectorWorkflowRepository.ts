import {
  IsoDateTime,
  ProjectId,
  ThreadId,
  Workflow,
  WorkflowId,
  WorkflowStatus,
  WorkUnit,
  WorkUnitAttempt,
  WorkUnitAttemptId,
  WorkUnitAttemptStatus,
  WorkUnitId,
  WorkUnitStatus,
} from "@synara/contracts";
import { Option, Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";

export const GetDirectorWorkflowInput = Schema.Struct({
  workflowId: WorkflowId,
});
export type GetDirectorWorkflowInput = typeof GetDirectorWorkflowInput.Type;

export const ListDirectorWorkflowsInput = Schema.Struct({
  projectId: ProjectId,
});
export type ListDirectorWorkflowsInput = typeof ListDirectorWorkflowsInput.Type;

export const GetDirectorWorkUnitInput = Schema.Struct({
  workUnitId: WorkUnitId,
});
export type GetDirectorWorkUnitInput = typeof GetDirectorWorkUnitInput.Type;

export const ListDirectorWorkUnitAttemptsInput = Schema.Struct({
  workUnitId: WorkUnitId,
});
export type ListDirectorWorkUnitAttemptsInput =
  typeof ListDirectorWorkUnitAttemptsInput.Type;

export const GetDirectorAttemptInput = Schema.Struct({
  attemptId: WorkUnitAttemptId,
});
export type GetDirectorAttemptInput = typeof GetDirectorAttemptInput.Type;

export const TransitionDirectorWorkflowInput = Schema.Struct({
  workflowId: WorkflowId,
  expectedStatus: WorkflowStatus,
  nextStatus: WorkflowStatus,
  updatedAt: IsoDateTime,
  startedAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  completedAt: Schema.optional(Schema.NullOr(IsoDateTime)),
});
export type TransitionDirectorWorkflowInput =
  typeof TransitionDirectorWorkflowInput.Type;

export const TransitionDirectorWorkUnitInput = Schema.Struct({
  workUnitId: WorkUnitId,
  expectedStatus: WorkUnitStatus,
  nextStatus: WorkUnitStatus,
  updatedAt: IsoDateTime,
  terminalAt: Schema.optional(Schema.NullOr(IsoDateTime)),
});
export type TransitionDirectorWorkUnitInput =
  typeof TransitionDirectorWorkUnitInput.Type;

export const TransitionDirectorAttemptInput = Schema.Struct({
  attemptId: WorkUnitAttemptId,
  expectedStatus: WorkUnitAttemptStatus,
  nextStatus: WorkUnitAttemptStatus,
  expectedWorkUnitStatus: Schema.optional(WorkUnitStatus),
  nextWorkUnitStatus: Schema.optional(WorkUnitStatus),
  workUnitTerminalAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  updatedAt: IsoDateTime,
  startedAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  settledAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  error: Schema.optional(Schema.NullOr(Schema.String)),
});
export type TransitionDirectorAttemptInput =
  typeof TransitionDirectorAttemptInput.Type;

export const AttachDirectorAttemptThreadInput = Schema.Struct({
  attemptId: WorkUnitAttemptId,
  threadId: ThreadId,
  worktreePath: Schema.optional(Schema.NullOr(Schema.String)),
  baselineGitRef: Schema.optional(Schema.NullOr(Schema.String)),
  updatedAt: IsoDateTime,
});
export type AttachDirectorAttemptThreadInput =
  typeof AttachDirectorAttemptThreadInput.Type;

export interface DirectorWorkflowRepositoryShape {
  readonly createGraph: (
    workflow: Workflow,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  readonly getById: (
    input: GetDirectorWorkflowInput,
  ) => Effect.Effect<Option.Option<Workflow>, ProjectionRepositoryError>;

  readonly listByProject: (
    input: ListDirectorWorkflowsInput,
  ) => Effect.Effect<ReadonlyArray<Workflow>, ProjectionRepositoryError>;

  readonly getWorkUnitById: (
    input: GetDirectorWorkUnitInput,
  ) => Effect.Effect<Option.Option<WorkUnit>, ProjectionRepositoryError>;

  readonly listAttemptsByWorkUnit: (
    input: ListDirectorWorkUnitAttemptsInput,
  ) => Effect.Effect<ReadonlyArray<WorkUnitAttempt>, ProjectionRepositoryError>;

  readonly getAttemptById: (
    input: GetDirectorAttemptInput,
  ) => Effect.Effect<Option.Option<WorkUnitAttempt>, ProjectionRepositoryError>;

  readonly transitionWorkflow: (
    input: TransitionDirectorWorkflowInput,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  readonly transitionWorkUnit: (
    input: TransitionDirectorWorkUnitInput,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  readonly insertAttempt: (
    attempt: WorkUnitAttempt,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  readonly transitionAttempt: (
    input: TransitionDirectorAttemptInput,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  readonly attachAttemptThread: (
    input: AttachDirectorAttemptThreadInput,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;
}

export class DirectorWorkflowRepository extends ServiceMap.Service<
  DirectorWorkflowRepository,
  DirectorWorkflowRepositoryShape
>()("sascode/Services/DirectorWorkflowRepository") {}
