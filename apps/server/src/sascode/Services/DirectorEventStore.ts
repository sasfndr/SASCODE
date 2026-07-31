import type {
  DirectorAggregateId,
  DirectorAggregateKind,
  DirectorCommandContext,
  DirectorCommandReceipt,
  DirectorEvent,
  DirectorEventCursor,
  DirectorEventMetadata,
  DirectorEventPayload,
  DirectorEventType,
  ProjectId,
} from "@synara/contracts";
import { Option, ServiceMap } from "effect";
import type { Effect, Scope, Stream } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";
import type {
  DirectorCommandIdentityCollisionError,
  DirectorEventInvariantError,
} from "../Errors.ts";

export interface CommitDirectorCommandInput {
  readonly context: DirectorCommandContext;
  readonly projectId: ProjectId;
  readonly aggregateKind: DirectorAggregateKind;
  readonly aggregateId: DirectorAggregateId;
  readonly eventType: DirectorEventType;
  readonly payload: DirectorEventPayload;
  readonly metadata?: DirectorEventMetadata;
  readonly fingerprintPayload?: unknown;
}

export type DirectorCommandCommit<A> =
  | {
      readonly kind: "committed";
      readonly event: DirectorEvent;
      readonly value: A;
    }
  | {
      readonly kind: "replayed";
      readonly event: DirectorEvent;
    };

export type DirectorEventStoreError =
  | ProjectionRepositoryError
  | DirectorCommandIdentityCollisionError
  | DirectorEventInvariantError;

export interface DirectorEventStoreShape {
  readonly commitCommand: <A, E>(
    input: CommitDirectorCommandInput,
    mutation: Effect.Effect<A, E>,
  ) => Effect.Effect<DirectorCommandCommit<A>, E | DirectorEventStoreError>;

  readonly getReceipt: (
    commandId: DirectorCommandContext["commandId"],
  ) => Effect.Effect<
    Option.Option<DirectorCommandReceipt>,
    ProjectionRepositoryError
  >;

  readonly listEvents: (
    cursor: DirectorEventCursor,
  ) => Effect.Effect<ReadonlyArray<DirectorEvent>, ProjectionRepositoryError>;

  readonly getHighWaterSequence: Effect.Effect<
    number,
    ProjectionRepositoryError
  >;

  readonly subscribeEvents: Effect.Effect<
    Stream.Stream<DirectorEvent>,
    never,
    Scope.Scope
  >;
}

export class DirectorEventStore extends ServiceMap.Service<
  DirectorEventStore,
  DirectorEventStoreShape
>()("sascode/Services/DirectorEventStore") {}
