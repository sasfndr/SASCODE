import type {
  IsoDateTime,
  WorkUnitAttempt,
  WorkUnitAttemptId,
} from "@synara/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";
import type {
  DirectorDispatchInvariantError,
  DirectorDomainError,
  DirectorThreadLaunchError,
} from "../Errors.ts";
import type { DirectorEventStoreError } from "./DirectorEventStore.ts";

export interface DispatchAttemptInput {
  readonly attemptId: WorkUnitAttemptId;
  readonly occurredAt: IsoDateTime;
}

export interface DispatchAttemptResult {
  readonly attempt: WorkUnitAttempt;
  readonly recovered: boolean;
}

export type AttemptDispatcherError =
  | ProjectionRepositoryError
  | DirectorDomainError
  | DirectorEventStoreError
  | DirectorThreadLaunchError
  | DirectorDispatchInvariantError;

export interface AttemptDispatcherShape {
  readonly dispatch: (
    input: DispatchAttemptInput,
  ) => Effect.Effect<DispatchAttemptResult, AttemptDispatcherError>;
}

export class AttemptDispatcher extends ServiceMap.Service<
  AttemptDispatcher,
  AttemptDispatcherShape
>()("sascode/Services/AttemptDispatcher") {}
