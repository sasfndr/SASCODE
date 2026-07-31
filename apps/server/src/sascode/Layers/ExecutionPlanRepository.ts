import { createHash } from "node:crypto";

import { WorkUnitExecutionSpec } from "@synara/contracts";
import { Effect, Layer, Option, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceSqlOrDecodeError } from "../../persistence/Errors.ts";
import { WorkUnitExecutionSpecConflictError } from "../Errors.ts";
import {
  ExecutionPlanRepository,
  GetExecutionSpecInput,
  ListRunnableExecutionSpecsInput,
  type ExecutionPlanRepositoryShape,
} from "../Services/ExecutionPlanRepository.ts";

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

const specDigest = (spec: WorkUnitExecutionSpec): string =>
  createHash("sha256").update(canonicalJson(spec)).digest("hex");

const ExecutionSpecRow = Schema.Struct({
  spec: Schema.fromJsonString(WorkUnitExecutionSpec),
  digest: Schema.String,
});

const InsertedIdRow = Schema.Struct({ id: WorkUnitExecutionSpec.fields.workUnitId });

const makeExecutionPlanRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const getSpecRow = SqlSchema.findOneOption({
    Request: GetExecutionSpecInput,
    Result: ExecutionSpecRow,
    execute: ({ workUnitId }) =>
      sql`
        SELECT spec_json AS spec, digest
        FROM sascode_work_unit_execution_specs
        WHERE work_unit_id = ${workUnitId}
      `,
  });

  const insertSpecRow = SqlSchema.findOneOption({
    Request: Schema.Struct({
      spec: WorkUnitExecutionSpec,
      digest: Schema.String,
    }),
    Result: InsertedIdRow,
    execute: ({ spec, digest }) =>
      sql`
        INSERT INTO sascode_work_unit_execution_specs (
          work_unit_id,
          workflow_id,
          revision,
          digest,
          spec_json,
          created_at,
          updated_at
        )
        VALUES (
          ${spec.workUnitId},
          ${spec.workflowId},
          ${spec.revision},
          ${digest},
          ${JSON.stringify(spec)},
          ${spec.createdAt},
          ${spec.updatedAt}
        )
        ON CONFLICT (work_unit_id) DO NOTHING
        RETURNING work_unit_id AS id
      `,
  });

  const updateSpecRow = SqlSchema.findOneOption({
    Request: Schema.Struct({
      spec: WorkUnitExecutionSpec,
      expectedRevision: Schema.Number,
      digest: Schema.String,
    }),
    Result: InsertedIdRow,
    execute: ({ spec, expectedRevision, digest }) =>
      sql`
        UPDATE sascode_work_unit_execution_specs
        SET
          workflow_id = ${spec.workflowId},
          revision = ${spec.revision},
          digest = ${digest},
          spec_json = ${JSON.stringify(spec)},
          updated_at = ${spec.updatedAt}
        WHERE work_unit_id = ${spec.workUnitId}
          AND revision = ${expectedRevision}
        RETURNING work_unit_id AS id
      `,
  });

  const listRunnableSpecRows = SqlSchema.findAll({
    Request: ListRunnableExecutionSpecsInput,
    Result: ExecutionSpecRow,
    execute: ({ limit }) =>
      sql`
        SELECT spec.spec_json AS spec, spec.digest
        FROM sascode_work_unit_execution_specs spec
        INNER JOIN sascode_projection_work_units unit
          ON unit.work_unit_id = spec.work_unit_id
        INNER JOIN sascode_projection_workflows workflow
          ON workflow.workflow_id = spec.workflow_id
        WHERE workflow.status = 'running'
          AND unit.status IN ('ready', 'routing', 'failed')
        ORDER BY
          CASE unit.priority
            WHEN 'urgent' THEN 0
            WHEN 'high' THEN 1
            WHEN 'normal' THEN 2
            ELSE 3
          END,
          unit.sort_order,
          spec.updated_at,
          spec.work_unit_id
        LIMIT ${Math.max(1, Math.min(limit, 1_000))}
      `,
  });

  const conflict = (
    spec: WorkUnitExecutionSpec,
    detail: string,
  ): WorkUnitExecutionSpecConflictError =>
    new WorkUnitExecutionSpecConflictError({
      workUnitId: spec.workUnitId,
      revision: spec.revision,
      detail,
    });

  const saveSpec: ExecutionPlanRepositoryShape["saveSpec"] = (spec) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          const digest = specDigest(spec);
          const existing = yield* getSpecRow({ workUnitId: spec.workUnitId });
          if (Option.isNone(existing)) {
            const inserted = yield* insertSpecRow({ spec, digest });
            if (Option.isSome(inserted)) return spec;
            const raced = yield* getSpecRow({ workUnitId: spec.workUnitId });
            if (Option.isSome(raced) && raced.value.digest === digest) {
              return raced.value.spec;
            }
            return yield* conflict(
              spec,
              "Another writer persisted different execution intent.",
            );
          }
          if (existing.value.digest === digest) return existing.value.spec;
          if (spec.revision <= existing.value.spec.revision) {
            return yield* conflict(
              spec,
              `Revision ${existing.value.spec.revision} is already current.`,
            );
          }
          const updated = yield* updateSpecRow({
            spec,
            expectedRevision: existing.value.spec.revision,
            digest,
          });
          if (Option.isNone(updated)) {
            return yield* conflict(
              spec,
              "The execution spec changed during an optimistic update.",
            );
          }
          return spec;
        }),
      )
      .pipe(
        Effect.mapError((error) =>
          error instanceof WorkUnitExecutionSpecConflictError
            ? error
            : toPersistenceSqlOrDecodeError(
                "ExecutionPlanRepository.saveSpec:transaction",
                "ExecutionPlanRepository.saveSpec:decode",
              )(error),
        ),
      );

  const getSpec: ExecutionPlanRepositoryShape["getSpec"] = (input) =>
    getSpecRow(input).pipe(
      Effect.map(Option.map((row) => row.spec)),
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "ExecutionPlanRepository.getSpec:query",
          "ExecutionPlanRepository.getSpec:decode",
        ),
      ),
    );

  const listRunnableSpecs: ExecutionPlanRepositoryShape["listRunnableSpecs"] = (
    input,
  ) =>
    listRunnableSpecRows(input).pipe(
      Effect.map((rows) => rows.map((row) => row.spec)),
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "ExecutionPlanRepository.listRunnableSpecs:query",
          "ExecutionPlanRepository.listRunnableSpecs:decode",
        ),
      ),
    );

  return {
    saveSpec,
    getSpec,
    listRunnableSpecs,
  } satisfies ExecutionPlanRepositoryShape;
});

export const ExecutionPlanRepositoryLive = Layer.effect(
  ExecutionPlanRepository,
  makeExecutionPlanRepository,
);
