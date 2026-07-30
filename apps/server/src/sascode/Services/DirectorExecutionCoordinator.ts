import type {
  ResultPacketVerification,
  WorkUnitAttempt,
} from "@synara/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";

import type { DirectorServiceError } from "./Director.ts";
import type {
  RecordResultPacketInput,
  TaskContractServiceError,
} from "./TaskContracts.ts";

export interface DirectorResultCommit {
  readonly verification: ResultPacketVerification;
  readonly attempt: WorkUnitAttempt;
}

export type DirectorExecutionCoordinatorError =
  | DirectorServiceError
  | TaskContractServiceError;

export interface DirectorExecutionCoordinatorShape {
  readonly commitResult: (
    input: RecordResultPacketInput,
  ) => Effect.Effect<DirectorResultCommit, DirectorExecutionCoordinatorError>;
}

export class DirectorExecutionCoordinator extends ServiceMap.Service<
  DirectorExecutionCoordinator,
  DirectorExecutionCoordinatorShape
>()("sascode/Services/DirectorExecutionCoordinator") {}
