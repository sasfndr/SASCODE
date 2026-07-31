import {
  IsoDateTime,
  WorkUnitExecutionBatch,
  WorkUnitExecutionResult,
  WorkUnitExecutionSpec,
  WorkflowId,
} from "@synara/contracts";
import { Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";
import type {
  WorkUnitExecutionInvariantError,
  WorkUnitExecutionSpecConflictError,
} from "../Errors.ts";
import type { AttemptDispatcherError } from "./AttemptDispatcher.ts";
import type { DirectorCommandServiceError } from "./DirectorCommands.ts";
import type { ModelRouterError } from "./ModelRouter.ts";
import type { TaskContractServiceError } from "./TaskContracts.ts";

export const ScheduleWorkUnitInput = Schema.Struct({
  spec: WorkUnitExecutionSpec,
  occurredAt: IsoDateTime,
  actorId: Schema.String,
});
export type ScheduleWorkUnitInput = typeof ScheduleWorkUnitInput.Type;

export const RunWorkflowExecutionInput = Schema.Struct({
  workflowId: WorkflowId,
  occurredAt: IsoDateTime,
  limit: Schema.Number,
});
export type RunWorkflowExecutionInput =
  typeof RunWorkflowExecutionInput.Type;

export const RecoverWorkUnitExecutionInput = Schema.Struct({
  occurredAt: IsoDateTime,
  limit: Schema.Number,
});
export type RecoverWorkUnitExecutionInput =
  typeof RecoverWorkUnitExecutionInput.Type;

export type WorkUnitOrchestratorError =
  | ProjectionRepositoryError
  | WorkUnitExecutionSpecConflictError
  | WorkUnitExecutionInvariantError
  | DirectorCommandServiceError
  | ModelRouterError
  | TaskContractServiceError
  | AttemptDispatcherError;

export interface WorkUnitOrchestratorShape {
  readonly schedule: (
    input: ScheduleWorkUnitInput,
  ) => Effect.Effect<WorkUnitExecutionResult, WorkUnitOrchestratorError>;

  readonly runWorkflow: (
    input: RunWorkflowExecutionInput,
  ) => Effect.Effect<WorkUnitExecutionBatch, WorkUnitOrchestratorError>;

  readonly recover: (
    input: RecoverWorkUnitExecutionInput,
  ) => Effect.Effect<WorkUnitExecutionBatch, WorkUnitOrchestratorError>;
}

export class WorkUnitOrchestrator extends ServiceMap.Service<
  WorkUnitOrchestrator,
  WorkUnitOrchestratorShape
>()("sascode/Services/WorkUnitOrchestrator") {}
