import type {
  IsoDateTime,
  WorkUnitAttemptId,
  WorkUnitAttemptStatus,
} from "@synara/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";

export interface RecoverDirectorInput {
  readonly occurredAt: IsoDateTime;
  readonly limit: number;
}

export interface DirectorRecoveryOutcome {
  readonly attemptId: WorkUnitAttemptId;
  readonly status: WorkUnitAttemptStatus;
  readonly recovered: boolean;
  readonly error: string | null;
}

export interface DirectorRecoveryReport {
  readonly scanned: number;
  readonly recovered: number;
  readonly failed: number;
  readonly outcomes: ReadonlyArray<DirectorRecoveryOutcome>;
  readonly completedAt: IsoDateTime;
}

export interface DirectorRecoveryShape {
  readonly recover: (
    input: RecoverDirectorInput,
  ) => Effect.Effect<DirectorRecoveryReport, ProjectionRepositoryError>;
}

export class DirectorRecovery extends ServiceMap.Service<
  DirectorRecovery,
  DirectorRecoveryShape
>()("sascode/Services/DirectorRecovery") {}
