import {
  AttentionItem,
  AttentionPreference,
  ProjectId,
  WorkflowId,
  WorkUnitId,
} from "@synara/contracts";
import { Effect, Layer, Option, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceSqlOrDecodeError } from "../../persistence/Errors.ts";
import {
  AttentionRepository,
  GetAttentionPreferenceInput,
  ListProjectAttentionInput,
  ResolveAttentionItemInput,
  type AttentionRepositoryShape,
} from "../Services/AttentionRepository.ts";

const AttentionItemDbRow = Schema.Struct({
  fingerprint: AttentionItem.fields.fingerprint,
  projectId: ProjectId,
  workflowId: Schema.NullOr(WorkflowId),
  workUnitId: Schema.NullOr(WorkUnitId),
  state: AttentionItem.fields.state,
  priority: AttentionItem.fields.priority,
  interruptionClass: AttentionItem.fields.interruptionClass,
  reasonCode: AttentionItem.fields.reasonCode,
  summary: AttentionItem.fields.summary,
  recommendedAction: Schema.NullOr(Schema.String),
  createdAt: AttentionItem.fields.createdAt,
  updatedAt: AttentionItem.fields.updatedAt,
  resolvedAt: Schema.NullOr(AttentionItem.fields.createdAt),
  snoozedUntil: Schema.NullOr(AttentionItem.fields.createdAt),
});
type AttentionItemDbRow = typeof AttentionItemDbRow.Type;

const AttentionPreferenceDbRow = Schema.Struct({
  projectId: Schema.NullOr(ProjectId),
  focusMode: AttentionPreference.fields.focusMode,
  mutedReasonCodes: Schema.fromJsonString(AttentionPreference.fields.mutedReasonCodes),
  systemNotificationsEnabled: Schema.Number,
  updatedAt: AttentionPreference.fields.updatedAt,
});
type AttentionPreferenceDbRow = typeof AttentionPreferenceDbRow.Type;

const toAttentionItem = (row: AttentionItemDbRow): AttentionItem => ({
  ...row,
  workflowId: row.workflowId,
  workUnitId: row.workUnitId,
  recommendedAction: row.recommendedAction,
  resolvedAt: row.resolvedAt,
  snoozedUntil: row.snoozedUntil,
});

const toAttentionPreference = (
  row: AttentionPreferenceDbRow,
): AttentionPreference => ({
  projectId: row.projectId,
  focusMode: row.focusMode,
  mutedReasonCodes: row.mutedReasonCodes,
  systemNotificationsEnabled: row.systemNotificationsEnabled !== 0,
  updatedAt: row.updatedAt,
});

const makeAttentionRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertItemRow = SqlSchema.void({
    Request: AttentionItem,
    execute: (item) =>
      sql`
        INSERT INTO sascode_attention_items (
          fingerprint,
          project_id,
          workflow_id,
          work_unit_id,
          state,
          priority,
          interruption_class,
          reason_code,
          summary,
          recommended_action,
          created_at,
          updated_at,
          resolved_at,
          snoozed_until
        )
        VALUES (
          ${item.fingerprint},
          ${item.projectId},
          ${item.workflowId ?? null},
          ${item.workUnitId ?? null},
          ${item.state},
          ${item.priority},
          ${item.interruptionClass},
          ${item.reasonCode},
          ${item.summary},
          ${item.recommendedAction ?? null},
          ${item.createdAt},
          ${item.updatedAt},
          ${item.resolvedAt ?? null},
          ${item.snoozedUntil ?? null}
        )
        ON CONFLICT (fingerprint)
        DO UPDATE SET
          state = excluded.state,
          priority = excluded.priority,
          interruption_class = excluded.interruption_class,
          reason_code = excluded.reason_code,
          summary = excluded.summary,
          recommended_action = excluded.recommended_action,
          updated_at = excluded.updated_at,
          resolved_at = excluded.resolved_at,
          snoozed_until = excluded.snoozed_until
      `,
  });

  const listActiveItemRows = SqlSchema.findAll({
    Request: ListProjectAttentionInput,
    Result: AttentionItemDbRow,
    execute: ({ projectId, now }) =>
      sql`
        SELECT
          fingerprint,
          project_id AS "projectId",
          workflow_id AS "workflowId",
          work_unit_id AS "workUnitId",
          state,
          priority,
          interruption_class AS "interruptionClass",
          reason_code AS "reasonCode",
          summary,
          recommended_action AS "recommendedAction",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          resolved_at AS "resolvedAt",
          snoozed_until AS "snoozedUntil"
        FROM sascode_attention_items
        WHERE project_id = ${projectId}
          AND resolved_at IS NULL
          AND (snoozed_until IS NULL OR snoozed_until <= ${now})
        ORDER BY
          CASE priority
            WHEN 'urgent' THEN 0
            WHEN 'high' THEN 1
            WHEN 'normal' THEN 2
            ELSE 3
          END,
          updated_at DESC,
          fingerprint ASC
      `,
  });

  const resolveItemRow = SqlSchema.findOneOption({
    Request: ResolveAttentionItemInput,
    Result: Schema.Struct({ fingerprint: Schema.String }),
    execute: (input) =>
      sql`
        UPDATE sascode_attention_items
        SET
          resolved_at = ${input.resolvedAt},
          updated_at = ${input.updatedAt}
        WHERE fingerprint = ${input.fingerprint}
          AND resolved_at IS NULL
        RETURNING fingerprint
      `,
  });

  const upsertPreferenceRow = SqlSchema.void({
    Request: AttentionPreference,
    execute: (preference) => {
      const scopeKind = preference.projectId == null ? "global" : "project";
      const scopeId = preference.projectId ?? "global";
      return sql`
        INSERT INTO sascode_attention_preferences (
          scope_kind,
          scope_id,
          focus_mode,
          muted_reason_codes_json,
          system_notifications_enabled,
          updated_at
        )
        VALUES (
          ${scopeKind},
          ${scopeId},
          ${preference.focusMode},
          ${JSON.stringify(preference.mutedReasonCodes)},
          ${preference.systemNotificationsEnabled ? 1 : 0},
          ${preference.updatedAt}
        )
        ON CONFLICT (scope_kind, scope_id)
        DO UPDATE SET
          focus_mode = excluded.focus_mode,
          muted_reason_codes_json = excluded.muted_reason_codes_json,
          system_notifications_enabled = excluded.system_notifications_enabled,
          updated_at = excluded.updated_at
      `;
    },
  });

  const getPreferenceRow = SqlSchema.findOneOption({
    Request: GetAttentionPreferenceInput,
    Result: AttentionPreferenceDbRow,
    execute: ({ projectId }) => {
      const scopeKind = projectId == null ? "global" : "project";
      const scopeId = projectId ?? "global";
      return sql`
        SELECT
          CASE WHEN scope_kind = 'project' THEN scope_id ELSE NULL END AS "projectId",
          focus_mode AS "focusMode",
          muted_reason_codes_json AS "mutedReasonCodes",
          system_notifications_enabled AS "systemNotificationsEnabled",
          updated_at AS "updatedAt"
        FROM sascode_attention_preferences
        WHERE scope_kind = ${scopeKind}
          AND scope_id = ${scopeId}
      `;
    },
  });

  const mapError = (operation: string) =>
    toPersistenceSqlOrDecodeError(`${operation}:query`, `${operation}:decode`);

  const upsertItem: AttentionRepositoryShape["upsertItem"] = (item) =>
    upsertItemRow(item).pipe(
      Effect.mapError(mapError("AttentionRepository.upsertItem")),
    );

  const listActiveItems: AttentionRepositoryShape["listActiveItems"] = (input) =>
    listActiveItemRows(input).pipe(
      Effect.map((rows) => rows.map(toAttentionItem)),
      Effect.mapError(mapError("AttentionRepository.listActiveItems")),
    );

  const resolveItem: AttentionRepositoryShape["resolveItem"] = (input) =>
    resolveItemRow(input).pipe(
      Effect.map(Option.isSome),
      Effect.mapError(mapError("AttentionRepository.resolveItem")),
    );

  const savePreference: AttentionRepositoryShape["savePreference"] = (preference) =>
    upsertPreferenceRow(preference).pipe(
      Effect.mapError(mapError("AttentionRepository.savePreference")),
    );

  const getPreference: AttentionRepositoryShape["getPreference"] = (input) =>
    getPreferenceRow(input).pipe(
      Effect.map(Option.map(toAttentionPreference)),
      Effect.mapError(mapError("AttentionRepository.getPreference")),
    );

  return {
    upsertItem,
    listActiveItems,
    resolveItem,
    savePreference,
    getPreference,
  } satisfies AttentionRepositoryShape;
});

export const AttentionRepositoryLive = Layer.effect(
  AttentionRepository,
  makeAttentionRepository,
);
