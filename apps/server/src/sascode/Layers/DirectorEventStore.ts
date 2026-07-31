import { createHash } from "node:crypto";

import { DirectorCommandReceipt, DirectorEvent, DirectorEventId } from "@synara/contracts";
import { Effect, Layer, Option, PubSub, Schema, Stream, Struct } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceSqlError, toPersistenceSqlOrDecodeError } from "../../persistence/Errors.ts";
import { DirectorCommandIdentityCollisionError, DirectorEventInvariantError } from "../Errors.ts";
import {
  DirectorEventStore,
  type DirectorEventStoreShape,
} from "../Services/DirectorEventStore.ts";

const FINGERPRINT_VERSION = 1;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

const fingerprint = (value: unknown): string =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");

const eventIdForCommand = (commandId: string, commandFingerprint: string): DirectorEventId =>
  DirectorEventId.makeUnsafe(`director-event:${commandId}:${commandFingerprint.slice(0, 16)}`);

const DirectorEventDbRow = DirectorEvent.mapFields(
  Struct.assign({
    payload: Schema.fromJsonString(DirectorEvent.fields.payload),
    metadata: Schema.fromJsonString(DirectorEvent.fields.metadata),
  }),
);

const makeDirectorEventStore = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const eventPubSub = yield* PubSub.bounded<DirectorEvent>(2_048);

  const getReceiptRow = SqlSchema.findOneOption({
    Request: Schema.Struct({
      commandId: DirectorCommandReceipt.fields.commandId,
    }),
    Result: DirectorCommandReceipt,
    execute: ({ commandId }) =>
      sql`
        SELECT
          command_id AS "commandId",
          aggregate_kind AS "aggregateKind",
          aggregate_id AS "aggregateId",
          accepted_at AS "acceptedAt",
          result_sequence AS "resultSequence",
          status,
          fingerprint_version AS "fingerprintVersion",
          command_fingerprint AS "commandFingerprint"
        FROM sascode_director_command_receipts
        WHERE command_id = ${commandId}
      `,
  });

  const getEventBySequence = SqlSchema.findOneOption({
    Request: Schema.Struct({ sequence: Schema.Number }),
    Result: DirectorEventDbRow,
    execute: ({ sequence }) =>
      sql`
        SELECT
          sequence,
          event_id AS id,
          project_id AS "projectId",
          aggregate_kind AS "aggregateKind",
          stream_id AS "aggregateId",
          stream_version AS "streamVersion",
          event_type AS type,
          occurred_at AS "occurredAt",
          command_id AS "commandId",
          causation_event_id AS "causationEventId",
          correlation_id AS "correlationId",
          actor_kind AS "actorKind",
          actor_id AS "actorId",
          payload_json AS payload,
          metadata_json AS metadata
        FROM sascode_director_events
        WHERE sequence = ${sequence}
      `,
  });

  const listEventRows = SqlSchema.findAll({
    Request: Schema.Struct({
      afterSequence: Schema.Number,
      limit: Schema.Number,
      projectId: Schema.NullOr(DirectorEvent.fields.projectId),
    }),
    Result: DirectorEventDbRow,
    execute: ({ afterSequence, limit, projectId }) =>
      projectId == null
        ? sql`
            SELECT
              sequence,
              event_id AS id,
              project_id AS "projectId",
              aggregate_kind AS "aggregateKind",
              stream_id AS "aggregateId",
              stream_version AS "streamVersion",
              event_type AS type,
              occurred_at AS "occurredAt",
              command_id AS "commandId",
              causation_event_id AS "causationEventId",
              correlation_id AS "correlationId",
              actor_kind AS "actorKind",
              actor_id AS "actorId",
              payload_json AS payload,
              metadata_json AS metadata
            FROM sascode_director_events
            WHERE sequence > ${afterSequence}
            ORDER BY sequence ASC
            LIMIT ${limit}
          `
        : sql`
            SELECT
              sequence,
              event_id AS id,
              project_id AS "projectId",
              aggregate_kind AS "aggregateKind",
              stream_id AS "aggregateId",
              stream_version AS "streamVersion",
              event_type AS type,
              occurred_at AS "occurredAt",
              command_id AS "commandId",
              causation_event_id AS "causationEventId",
              correlation_id AS "correlationId",
              actor_kind AS "actorKind",
              actor_id AS "actorId",
              payload_json AS payload,
              metadata_json AS metadata
            FROM sascode_director_events
            WHERE sequence > ${afterSequence}
              AND project_id = ${projectId}
            ORDER BY sequence ASC
            LIMIT ${limit}
          `,
  });

  const getReceipt: DirectorEventStoreShape["getReceipt"] = (commandId) =>
    getReceiptRow({ commandId }).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "DirectorEventStore.getReceipt:query",
          "DirectorEventStore.getReceipt:decode",
        ),
      ),
    );

  const listEvents: DirectorEventStoreShape["listEvents"] = (cursor) =>
    listEventRows({
      afterSequence: cursor.afterSequence,
      limit: Math.max(1, Math.min(cursor.limit, 1_000)),
      projectId: cursor.projectId ?? null,
    }).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "DirectorEventStore.listEvents:query",
          "DirectorEventStore.listEvents:decode",
        ),
      ),
    );

  const getHighWaterSequence: DirectorEventStoreShape["getHighWaterSequence"] = sql<{
    readonly sequence: number;
  }>`
      SELECT COALESCE(MAX(sequence), 0) AS sequence
      FROM sascode_director_events
    `.pipe(
    Effect.map((rows) => rows[0]?.sequence ?? 0),
    Effect.mapError(toPersistenceSqlError("DirectorEventStore.getHighWaterSequence:query")),
  );

  const subscribeEvents: DirectorEventStoreShape["subscribeEvents"] = PubSub.subscribe(
    eventPubSub,
  ).pipe(Effect.map((subscription) => Stream.fromEffectRepeat(PubSub.take(subscription))));

  // The SqlSchema read-backs inside commitCommand fail with a raw SchemaError
  // when a stored row no longer matches its schema. commitCommand's error
  // channel also carries the caller's mutation error `E`, so it cannot be
  // narrowed at the end of the pipeline — map each read at its concrete call
  // site instead, exactly as getReceipt/listEvents do.
  const toCommitReadError = toPersistenceSqlOrDecodeError(
    "DirectorEventStore.commitCommand:query",
    "DirectorEventStore.commitCommand:decode",
  );

  const commitCommand: DirectorEventStoreShape["commitCommand"] = (input, mutation) => {
    const commandFingerprint = fingerprint({
      projectId: input.projectId,
      aggregateKind: input.aggregateKind,
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      payload: input.fingerprintPayload ?? input.payload,
      metadata: input.metadata ?? {},
    });

    return sql
      .withTransaction(
        Effect.gen(function* () {
          const existing = yield* getReceiptRow({
            commandId: input.context.commandId,
          }).pipe(Effect.mapError(toCommitReadError));
          if (Option.isSome(existing)) {
            if (
              existing.value.fingerprintVersion !== FINGERPRINT_VERSION ||
              existing.value.commandFingerprint !== commandFingerprint
            ) {
              return yield* new DirectorCommandIdentityCollisionError({
                commandId: input.context.commandId,
                detail: "The command ID is already bound to different command content.",
              });
            }
            const event = yield* getEventBySequence({
              sequence: existing.value.resultSequence,
            }).pipe(Effect.mapError(toCommitReadError));
            if (Option.isNone(event)) {
              return yield* new DirectorEventInvariantError({
                commandId: input.context.commandId,
                detail: "The accepted receipt points to a missing event.",
              });
            }
            return { kind: "replayed" as const, event: event.value };
          }

          const value = yield* mutation;
          const versions = yield* sql<{ readonly streamVersion: number }>`
            SELECT COALESCE(MAX(stream_version), 0) + 1 AS "streamVersion"
            FROM sascode_director_events
            WHERE stream_id = ${input.aggregateId}
          `;
          const streamVersion = versions[0]?.streamVersion ?? 1;
          const eventId = eventIdForCommand(input.context.commandId, commandFingerprint);
          const insertedEvents = yield* sql<{ readonly sequence: number }>`
            INSERT INTO sascode_director_events (
              event_id,
              project_id,
              aggregate_kind,
              stream_id,
              stream_version,
              event_type,
              occurred_at,
              command_id,
              causation_event_id,
              correlation_id,
              actor_kind,
              actor_id,
              payload_json,
              metadata_json
            )
            VALUES (
              ${eventId},
              ${input.projectId},
              ${input.aggregateKind},
              ${input.aggregateId},
              ${streamVersion},
              ${input.eventType},
              ${input.context.occurredAt},
              ${input.context.commandId},
              ${input.context.causationEventId ?? null},
              ${input.context.correlationId ?? null},
              ${input.context.actorKind},
              ${input.context.actorId},
              ${JSON.stringify(input.payload)},
              ${JSON.stringify(input.metadata ?? {})}
            )
            RETURNING sequence
          `;
          const sequence = insertedEvents[0]?.sequence;
          if (sequence == null) {
            return yield* new DirectorEventInvariantError({
              commandId: input.context.commandId,
              detail: "The event insert did not return a sequence.",
            });
          }
          yield* sql`
            INSERT INTO sascode_director_command_receipts (
              command_id,
              aggregate_kind,
              aggregate_id,
              accepted_at,
              result_sequence,
              status,
              fingerprint_version,
              command_fingerprint
            )
            VALUES (
              ${input.context.commandId},
              ${input.aggregateKind},
              ${input.aggregateId},
              ${input.context.occurredAt},
              ${sequence},
              'accepted',
              ${FINGERPRINT_VERSION},
              ${commandFingerprint}
            )
          `;
          const event = yield* getEventBySequence({ sequence }).pipe(
            Effect.mapError(toCommitReadError),
          );
          if (Option.isNone(event)) {
            return yield* new DirectorEventInvariantError({
              commandId: input.context.commandId,
              detail: "The committed event could not be read back.",
            });
          }
          return {
            kind: "committed" as const,
            event: event.value,
            value,
          };
        }),
      )
      .pipe(
        Effect.catchTag("SqlError", (error) =>
          Effect.fail(toPersistenceSqlError("DirectorEventStore.commitCommand:transaction")(error)),
        ),
        Effect.tap((outcome) =>
          outcome.kind === "committed"
            ? Effect.uninterruptible(PubSub.publish(eventPubSub, outcome.event)).pipe(Effect.asVoid)
            : Effect.void,
        ),
      );
  };

  return {
    commitCommand,
    getReceipt,
    listEvents,
    getHighWaterSequence,
    subscribeEvents,
  } satisfies DirectorEventStoreShape;
});

export const DirectorEventStoreLive = Layer.effect(DirectorEventStore, makeDirectorEventStore);
