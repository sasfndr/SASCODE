import {
  WorkUnitExecutionSpec,
  WorkUnitId,
} from "@synara/contracts";
import { Option, Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";
import type { WorkUnitExecutionSpecConflictError } from "../Errors.ts";

export const GetExecutionSpecInput = Schema.Struct({
  workUnitId: WorkUnitId,
});
export type GetExecutionSpecInput = typeof GetExecutionSpecInput.Type;

export const ListRunnableExecutionSpecsInput = Schema.Struct({
  limit: Schema.Number,
});
export type ListRunnableExecutionSpecsInput =
  typeof ListRunnableExecutionSpecsInput.Type;

export interface ExecutionPlanRepositoryShape {
  readonly saveSpec: (
    spec: WorkUnitExecutionSpec,
  ) => Effect.Effect<
    WorkUnitExecutionSpec,
    ProjectionRepositoryError | WorkUnitExecutionSpecConflictError
  >;

  readonly getSpec: (
    input: GetExecutionSpecInput,
  ) => Effect.Effect<
    Option.Option<WorkUnitExecutionSpec>,
    ProjectionRepositoryError
  >;

  readonly listRunnableSpecs: (
    input: ListRunnableExecutionSpecsInput,
  ) => Effect.Effect<
    ReadonlyArray<WorkUnitExecutionSpec>,
    ProjectionRepositoryError
  >;
}

export class ExecutionPlanRepository extends ServiceMap.Service<
  ExecutionPlanRepository,
  ExecutionPlanRepositoryShape
>()("sascode/Services/ExecutionPlanRepository") {}
