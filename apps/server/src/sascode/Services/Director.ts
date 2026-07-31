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
import { Schema, ServiceMap } from "effect";
import type { Effect, Option } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";
import type { DirectorDomainError } from "../Errors.ts";

export const MoveDirectorWorkflowInput = Schema.Struct({
  workflowId: WorkflowId,
  nextStatus: WorkflowStatus,
  occurredAt: IsoDateTime,
});
export type MoveDirectorWorkflowInput = typeof MoveDirectorWorkflowInput.Type;

export const MoveDirectorWorkUnitInput = Schema.Struct({
  workUnitId: WorkUnitId,
  nextStatus: WorkUnitStatus,
  occurredAt: IsoDateTime,
});
export type MoveDirectorWorkUnitInput = typeof MoveDirectorWorkUnitInput.Type;

export const ReconcileDirectorReadyWorkUnitsInput = Schema.Struct({
  workflowId: WorkflowId,
  passedGateKeys: Schema.Array(Schema.String),
  occurredAt: IsoDateTime,
});
export type ReconcileDirectorReadyWorkUnitsInput =
  typeof ReconcileDirectorReadyWorkUnitsInput.Type;

export const AdvanceDirectorAttemptInput = Schema.Struct({
  attemptId: WorkUnitAttemptId,
  nextStatus: WorkUnitAttemptStatus,
  error: Schema.optional(Schema.NullOr(Schema.String)),
  occurredAt: IsoDateTime,
});
export type AdvanceDirectorAttemptInput = typeof AdvanceDirectorAttemptInput.Type;

export const AttachDirectorThreadInput = Schema.Struct({
  attemptId: WorkUnitAttemptId,
  threadId: ThreadId,
  worktreePath: Schema.optional(Schema.NullOr(Schema.String)),
  baselineGitRef: Schema.optional(Schema.NullOr(Schema.String)),
  occurredAt: IsoDateTime,
});
export type AttachDirectorThreadInput = typeof AttachDirectorThreadInput.Type;

export type DirectorServiceError = DirectorDomainError | ProjectionRepositoryError;

export interface DirectorShape {
  readonly proposeWorkflow: (
    workflow: Workflow,
  ) => Effect.Effect<Workflow, DirectorServiceError>;

  readonly getWorkflow: (
    workflowId: WorkflowId,
  ) => Effect.Effect<Option.Option<Workflow>, ProjectionRepositoryError>;

  readonly listProjectWorkflows: (
    projectId: ProjectId,
  ) => Effect.Effect<ReadonlyArray<Workflow>, ProjectionRepositoryError>;

  readonly moveWorkflow: (
    input: MoveDirectorWorkflowInput,
  ) => Effect.Effect<Workflow, DirectorServiceError>;

  readonly moveWorkUnit: (
    input: MoveDirectorWorkUnitInput,
  ) => Effect.Effect<WorkUnit, DirectorServiceError>;

  readonly reconcileReadyWorkUnits: (
    input: ReconcileDirectorReadyWorkUnitsInput,
  ) => Effect.Effect<ReadonlyArray<WorkUnitId>, DirectorServiceError>;

  readonly beginAttempt: (
    attempt: WorkUnitAttempt,
  ) => Effect.Effect<WorkUnitAttempt, DirectorServiceError>;

  readonly advanceAttempt: (
    input: AdvanceDirectorAttemptInput,
  ) => Effect.Effect<WorkUnitAttempt, DirectorServiceError>;

  readonly attachThread: (
    input: AttachDirectorThreadInput,
  ) => Effect.Effect<WorkUnitAttempt, DirectorServiceError>;
}

export class Director extends ServiceMap.Service<Director, DirectorShape>()(
  "sascode/Services/Director",
) {}
