import {
  ThreadId,
  WorkUnitResultSubmission,
  WorkUnitResultSubmissionOutcome,
} from "@synara/contracts";
import { Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";
import type { WorkUnitExecutionInvariantError } from "../Errors.ts";
import type { DirectorCommandServiceError } from "./DirectorCommands.ts";
import type { DirectorEventStoreError } from "./DirectorEventStore.ts";
import type { DirectorExecutionCoordinatorError } from "./DirectorExecutionCoordinator.ts";
import type { WorkUnitOrchestratorError } from "./WorkUnitOrchestrator.ts";

export const SubmitWorkUnitResultInput = Schema.Struct({
  submission: WorkUnitResultSubmission,
  actorKind: Schema.Literals(["human", "agent", "system", "module"]),
  actorId: Schema.String,
  expectedThreadId: Schema.optional(Schema.NullOr(ThreadId)),
});
export type SubmitWorkUnitResultInput =
  typeof SubmitWorkUnitResultInput.Type;

export type ResultIngestionError =
  | ProjectionRepositoryError
  | WorkUnitExecutionInvariantError
  | DirectorCommandServiceError
  | DirectorEventStoreError
  | DirectorExecutionCoordinatorError
  | WorkUnitOrchestratorError;

export interface ResultIngestionShape {
  readonly submit: (
    input: SubmitWorkUnitResultInput,
  ) => Effect.Effect<WorkUnitResultSubmissionOutcome, ResultIngestionError>;
}

export class ResultIngestion extends ServiceMap.Service<
  ResultIngestion,
  ResultIngestionShape
>()("sascode/Services/ResultIngestion") {}
