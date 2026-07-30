import type {
  DirectorCommandContext,
  DirectorEvent,
  ThreadId,
  Workflow,
  WorkflowId,
  WorkflowStatus,
  WorkUnit,
  WorkUnitAttempt,
  WorkUnitAttemptStatus,
  WorkUnitId,
  WorkUnitStatus,
} from "@synara/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";

import type { DirectorServiceError } from "./Director.ts";
import type { DirectorEventStoreError } from "./DirectorEventStore.ts";

export interface DirectorCommandResult<A> {
  readonly current: A;
  readonly event: DirectorEvent;
  readonly replayed: boolean;
}

export interface ProposeWorkflowCommandInput {
  readonly context: DirectorCommandContext;
  readonly workflow: Workflow;
}

export interface MoveWorkflowCommandInput {
  readonly context: DirectorCommandContext;
  readonly workflowId: WorkflowId;
  readonly nextStatus: WorkflowStatus;
}

export interface MoveWorkUnitCommandInput {
  readonly context: DirectorCommandContext;
  readonly workUnitId: WorkUnitId;
  readonly nextStatus: WorkUnitStatus;
}

export interface ReconcileReadyWorkUnitsCommandInput {
  readonly context: DirectorCommandContext;
  readonly workflowId: WorkflowId;
  readonly passedGateKeys: ReadonlyArray<string>;
}

export interface BeginAttemptCommandInput {
  readonly context: DirectorCommandContext;
  readonly attempt: WorkUnitAttempt;
}

export interface AdvanceAttemptCommandInput {
  readonly context: DirectorCommandContext;
  readonly attemptId: WorkUnitAttempt["id"];
  readonly nextStatus: WorkUnitAttemptStatus;
  readonly error?: string | null;
}

export interface AttachAttemptThreadCommandInput {
  readonly context: DirectorCommandContext;
  readonly attemptId: WorkUnitAttempt["id"];
  readonly threadId: ThreadId;
  readonly worktreePath?: string | null;
  readonly baselineGitRef?: string | null;
}

export type DirectorCommandServiceError =
  | DirectorServiceError
  | DirectorEventStoreError;

export interface DirectorCommandsShape {
  readonly proposeWorkflow: (
    input: ProposeWorkflowCommandInput,
  ) => Effect.Effect<
    DirectorCommandResult<Workflow>,
    DirectorCommandServiceError
  >;

  readonly moveWorkflow: (
    input: MoveWorkflowCommandInput,
  ) => Effect.Effect<
    DirectorCommandResult<Workflow>,
    DirectorCommandServiceError
  >;

  readonly moveWorkUnit: (
    input: MoveWorkUnitCommandInput,
  ) => Effect.Effect<
    DirectorCommandResult<WorkUnit>,
    DirectorCommandServiceError
  >;

  readonly reconcileReadyWorkUnits: (
    input: ReconcileReadyWorkUnitsCommandInput,
  ) => Effect.Effect<
    DirectorCommandResult<ReadonlyArray<WorkUnitId>>,
    DirectorCommandServiceError
  >;

  readonly beginAttempt: (
    input: BeginAttemptCommandInput,
  ) => Effect.Effect<
    DirectorCommandResult<WorkUnitAttempt>,
    DirectorCommandServiceError
  >;

  readonly advanceAttempt: (
    input: AdvanceAttemptCommandInput,
  ) => Effect.Effect<
    DirectorCommandResult<WorkUnitAttempt>,
    DirectorCommandServiceError
  >;

  readonly attachThread: (
    input: AttachAttemptThreadCommandInput,
  ) => Effect.Effect<
    DirectorCommandResult<WorkUnitAttempt>,
    DirectorCommandServiceError
  >;
}

export class DirectorCommands extends ServiceMap.Service<
  DirectorCommands,
  DirectorCommandsShape
>()("sascode/Services/DirectorCommands") {}
