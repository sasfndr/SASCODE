import {
  ProviderCapabilitySnapshot,
  ProviderConnection,
  ResolvedModelTarget,
  RoutingCandidate,
  RoutingConstraint,
  RoutingDecision,
  RoutingPolicy,
} from "@synara/contracts";
import { Effect, Layer, Option, Schema, Struct } from "effect";
import * as SchemaGetter from "effect/SchemaGetter";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceSqlOrDecodeError } from "../../persistence/Errors.ts";
import {
  GetCapabilitySnapshotInput,
  GetRoutingDecisionInput,
  GetRoutingPolicyInput,
  ListRoutingPoliciesInput,
  ListWorkUnitRoutingDecisionsInput,
  RoutingRepository,
  SaveCapabilitySnapshotInput,
  type RoutingRepositoryShape,
} from "../Services/RoutingRepository.ts";

const SqliteBoolean = Schema.Number.pipe(
  Schema.decodeTo(Schema.Boolean, {
    decode: SchemaGetter.transform((value) => value !== 0),
    encode: SchemaGetter.transform((value) => (value ? 1 : 0)),
  }),
);

const ProviderConnectionDbRow = ProviderConnection.mapFields(
  Struct.assign({
    enabled: SqliteBoolean,
    config: Schema.fromJsonString(ProviderConnection.fields.config),
  }),
);

const CapabilitySnapshotDbRow = ProviderCapabilitySnapshot.mapFields(
  Struct.assign({
    models: Schema.fromJsonString(ProviderCapabilitySnapshot.fields.models),
    quota: Schema.fromJsonString(ProviderCapabilitySnapshot.fields.quota),
  }),
);

const RoutingPolicyJsonRow = Schema.Struct({
  policy: Schema.fromJsonString(RoutingPolicy),
});

const RoutingDecisionDbRow = RoutingDecision.mapFields(
  Struct.assign({
    candidates: Schema.fromJsonString(Schema.Array(RoutingCandidate)),
    selected: Schema.fromJsonString(ResolvedModelTarget),
    fallbackOrder: Schema.fromJsonString(Schema.Array(ResolvedModelTarget)),
    constraints: Schema.fromJsonString(Schema.Array(RoutingConstraint)),
    override: Schema.NullOr(
      Schema.fromJsonString(
        Schema.Struct({
          actor: Schema.String,
          reason: Schema.String,
        }),
      ),
    ),
  }),
);
type RoutingDecisionDbRow = typeof RoutingDecisionDbRow.Type;

const toRoutingDecision = (row: RoutingDecisionDbRow): RoutingDecision => {
  const { override, ...decision } = row;
  return override === null ? decision : { ...decision, override };
};

const InsertedIdRow = Schema.Struct({ id: Schema.String });

const makeRoutingRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertConnectionRow = SqlSchema.void({
    Request: ProviderConnection,
    execute: (connection) =>
      sql`
        INSERT INTO sascode_provider_connections (
          connection_id,
          provider_key,
          display_name,
          connection_kind,
          enabled,
          priority,
          config_json,
          last_capability_snapshot_id,
          created_at,
          updated_at
        )
        VALUES (
          ${connection.id},
          ${connection.providerKey},
          ${connection.displayName},
          ${connection.connectionKind},
          ${connection.enabled ? 1 : 0},
          ${connection.priority},
          ${JSON.stringify(connection.config)},
          ${connection.lastCapabilitySnapshotId ?? null},
          ${connection.createdAt},
          ${connection.updatedAt}
        )
        ON CONFLICT (connection_id)
        DO UPDATE SET
          provider_key = excluded.provider_key,
          display_name = excluded.display_name,
          connection_kind = excluded.connection_kind,
          enabled = excluded.enabled,
          priority = excluded.priority,
          config_json = excluded.config_json,
          updated_at = excluded.updated_at
      `,
  });

  const insertCapabilitySnapshotRow = SqlSchema.findOneOption({
    Request: SaveCapabilitySnapshotInput,
    Result: InsertedIdRow,
    execute: ({ snapshot, digest }) =>
      sql`
        INSERT INTO sascode_capability_snapshots (
          snapshot_id,
          connection_id,
          provider_key,
          provider_kind,
          display_name,
          connection_kind,
          health,
          health_detail,
          models_json,
          quota_json,
          authenticated_account_label,
          digest,
          discovered_at,
          expires_at
        )
        VALUES (
          ${snapshot.id},
          ${snapshot.connectionId},
          ${snapshot.providerKey},
          ${snapshot.providerKind ?? null},
          ${snapshot.displayName},
          ${snapshot.connectionKind},
          ${snapshot.health},
          ${snapshot.healthDetail ?? null},
          ${JSON.stringify(snapshot.models)},
          ${JSON.stringify(snapshot.quota)},
          ${snapshot.authenticatedAccountLabel ?? null},
          ${digest},
          ${snapshot.discoveredAt},
          ${snapshot.expiresAt ?? null}
        )
        ON CONFLICT (snapshot_id) DO NOTHING
        RETURNING snapshot_id AS id
      `,
  });

  const selectConnectionRow = SqlSchema.findOneOption({
    Request: Schema.Struct({ connectionId: ProviderConnection.fields.id }),
    Result: ProviderConnectionDbRow,
    execute: ({ connectionId }) =>
      sql`
        SELECT
          connection_id AS id,
          provider_key AS "providerKey",
          display_name AS "displayName",
          connection_kind AS "connectionKind",
          enabled,
          priority,
          config_json AS config,
          last_capability_snapshot_id AS "lastCapabilitySnapshotId",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM sascode_provider_connections
        WHERE connection_id = ${connectionId}
      `,
  });

  const listConnectionRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProviderConnectionDbRow,
    execute: () =>
      sql`
        SELECT
          connection_id AS id,
          provider_key AS "providerKey",
          display_name AS "displayName",
          connection_kind AS "connectionKind",
          enabled,
          priority,
          config_json AS config,
          last_capability_snapshot_id AS "lastCapabilitySnapshotId",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM sascode_provider_connections
        ORDER BY priority DESC, provider_key ASC, connection_id ASC
      `,
  });

  const updateConnectionSnapshotRow = SqlSchema.void({
    Request: Schema.Struct({
      connectionId: ProviderConnection.fields.id,
      snapshotId: ProviderCapabilitySnapshot.fields.id,
      updatedAt: ProviderCapabilitySnapshot.fields.discoveredAt,
    }),
    execute: ({ connectionId, snapshotId, updatedAt }) =>
      sql`
        UPDATE sascode_provider_connections
        SET
          last_capability_snapshot_id = ${snapshotId},
          updated_at = CASE WHEN updated_at > ${updatedAt} THEN updated_at ELSE ${updatedAt} END
        WHERE connection_id = ${connectionId}
      `,
  });

  const getCapabilitySnapshotRow = SqlSchema.findOneOption({
    Request: GetCapabilitySnapshotInput,
    Result: CapabilitySnapshotDbRow,
    execute: ({ snapshotId }) =>
      sql`
        SELECT
          snapshots.snapshot_id AS id,
          snapshots.connection_id AS "connectionId",
          snapshots.provider_key AS "providerKey",
          snapshots.provider_kind AS "providerKind",
          snapshots.display_name AS "displayName",
          snapshots.connection_kind AS "connectionKind",
          connections.priority AS "connectionPriority",
          snapshots.health,
          snapshots.health_detail AS "healthDetail",
          snapshots.models_json AS models,
          snapshots.quota_json AS quota,
          snapshots.authenticated_account_label AS "authenticatedAccountLabel",
          snapshots.discovered_at AS "discoveredAt",
          snapshots.expires_at AS "expiresAt"
        FROM sascode_capability_snapshots AS snapshots
        LEFT JOIN sascode_provider_connections AS connections
          ON connections.connection_id = snapshots.connection_id
        WHERE snapshots.snapshot_id = ${snapshotId}
      `,
  });

  const listCurrentCapabilitySnapshotRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: CapabilitySnapshotDbRow,
    execute: () =>
      sql`
        SELECT
          snapshots.snapshot_id AS id,
          snapshots.connection_id AS "connectionId",
          snapshots.provider_key AS "providerKey",
          snapshots.provider_kind AS "providerKind",
          snapshots.display_name AS "displayName",
          snapshots.connection_kind AS "connectionKind",
          connections.priority AS "connectionPriority",
          snapshots.health,
          snapshots.health_detail AS "healthDetail",
          snapshots.models_json AS models,
          snapshots.quota_json AS quota,
          snapshots.authenticated_account_label AS "authenticatedAccountLabel",
          snapshots.discovered_at AS "discoveredAt",
          snapshots.expires_at AS "expiresAt"
        FROM sascode_provider_connections AS connections
        JOIN sascode_capability_snapshots AS snapshots
          ON snapshots.snapshot_id = connections.last_capability_snapshot_id
        WHERE connections.enabled = 1
        ORDER BY
          connections.priority DESC,
          connections.provider_key ASC,
          connections.connection_id ASC
      `,
  });

  const insertPolicyHeaderRow = SqlSchema.void({
    Request: RoutingPolicy,
    execute: (policy) =>
      sql`
        INSERT INTO sascode_routing_policies (
          policy_id,
          project_id,
          name,
          description,
          created_at,
          updated_at
        )
        VALUES (
          ${policy.id},
          ${policy.projectId ?? null},
          ${policy.name},
          ${policy.description},
          ${policy.createdAt},
          ${policy.updatedAt}
        )
        ON CONFLICT (policy_id)
        DO UPDATE SET
          project_id = excluded.project_id,
          name = excluded.name,
          description = excluded.description,
          updated_at = excluded.updated_at
      `,
  });

  const insertPolicyRevisionRow = SqlSchema.findOneOption({
    Request: RoutingPolicy,
    Result: InsertedIdRow,
    execute: (policy) =>
      sql`
        INSERT INTO sascode_routing_policy_revisions (
          policy_id,
          revision,
          canonical_json,
          source_text,
          digest,
          diagnostics_json,
          created_at,
          published_at
        )
        VALUES (
          ${policy.id},
          ${policy.revision},
          ${JSON.stringify(policy)},
          ${policy.source ?? null},
          ${policy.digest},
          '[]',
          ${policy.createdAt},
          ${policy.publishedAt ?? null}
        )
        ON CONFLICT (policy_id, revision) DO NOTHING
        RETURNING policy_id AS id
      `,
  });

  const getPolicyRow = SqlSchema.findOneOption({
    Request: GetRoutingPolicyInput,
    Result: RoutingPolicyJsonRow,
    execute: ({ policyId, revision }) =>
      sql`
        SELECT canonical_json AS policy
        FROM sascode_routing_policy_revisions
        WHERE policy_id = ${policyId}
          AND revision = ${revision}
      `,
  });

  const listPolicyRows = SqlSchema.findAll({
    Request: ListRoutingPoliciesInput,
    Result: RoutingPolicyJsonRow,
    execute: ({ projectId }) =>
      sql`
        SELECT revisions.canonical_json AS policy
        FROM sascode_routing_policies AS policies
        JOIN sascode_routing_policy_revisions AS revisions
          ON revisions.policy_id = policies.policy_id
        WHERE (
          (${projectId} IS NULL AND policies.project_id IS NULL) OR
          policies.project_id = ${projectId}
        )
        ORDER BY policies.updated_at DESC, policies.policy_id ASC, revisions.revision DESC
      `,
  });

  const insertDecisionRow = SqlSchema.findOneOption({
    Request: RoutingDecision,
    Result: InsertedIdRow,
    execute: (decision) =>
      sql`
        INSERT INTO sascode_routing_decisions (
          decision_id,
          workflow_id,
          work_unit_id,
          policy_id,
          policy_revision,
          role_id,
          candidates_json,
          selected_target_json,
          fallback_order_json,
          constraints_json,
          rationale,
          override_json,
          decided_at
        )
        VALUES (
          ${decision.id},
          ${decision.workflowId},
          ${decision.workUnitId},
          ${decision.policyId},
          ${decision.policyRevision},
          ${decision.roleId},
          ${JSON.stringify(decision.candidates)},
          ${JSON.stringify(decision.selected)},
          ${JSON.stringify(decision.fallbackOrder)},
          ${JSON.stringify(decision.constraints)},
          ${decision.rationale},
          ${decision.override === undefined ? null : JSON.stringify(decision.override)},
          ${decision.decidedAt}
        )
        ON CONFLICT (decision_id) DO NOTHING
        RETURNING decision_id AS id
      `,
  });

  const getDecisionRow = SqlSchema.findOneOption({
    Request: GetRoutingDecisionInput,
    Result: RoutingDecisionDbRow,
    execute: ({ decisionId }) =>
      sql`
        SELECT
          decision_id AS id,
          workflow_id AS "workflowId",
          work_unit_id AS "workUnitId",
          policy_id AS "policyId",
          policy_revision AS "policyRevision",
          role_id AS "roleId",
          candidates_json AS candidates,
          selected_target_json AS selected,
          fallback_order_json AS "fallbackOrder",
          constraints_json AS constraints,
          rationale,
          override_json AS override,
          decided_at AS "decidedAt"
        FROM sascode_routing_decisions
        WHERE decision_id = ${decisionId}
      `,
  });

  const listDecisionRowsByWorkUnit = SqlSchema.findAll({
    Request: ListWorkUnitRoutingDecisionsInput,
    Result: RoutingDecisionDbRow,
    execute: ({ workUnitId }) =>
      sql`
        SELECT
          decision_id AS id,
          workflow_id AS "workflowId",
          work_unit_id AS "workUnitId",
          policy_id AS "policyId",
          policy_revision AS "policyRevision",
          role_id AS "roleId",
          candidates_json AS candidates,
          selected_target_json AS selected,
          fallback_order_json AS "fallbackOrder",
          constraints_json AS constraints,
          rationale,
          override_json AS override,
          decided_at AS "decidedAt"
        FROM sascode_routing_decisions
        WHERE work_unit_id = ${workUnitId}
        ORDER BY decided_at DESC, decision_id ASC
      `,
  });

  const upsertConnection: RoutingRepositoryShape["upsertConnection"] = (connection) =>
    upsertConnectionRow(connection).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "RoutingRepository.upsertConnection:query",
          "RoutingRepository.upsertConnection:decode",
        ),
      ),
    );

  const getConnection: RoutingRepositoryShape["getConnection"] = (connectionId) =>
    selectConnectionRow({ connectionId }).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "RoutingRepository.getConnection:query",
          "RoutingRepository.getConnection:decode",
        ),
      ),
    );

  const listConnections: RoutingRepositoryShape["listConnections"] = () =>
    listConnectionRows().pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "RoutingRepository.listConnections:query",
          "RoutingRepository.listConnections:decode",
        ),
      ),
    );

  const saveCapabilitySnapshot: RoutingRepositoryShape["saveCapabilitySnapshot"] = (input) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          const connection = yield* selectConnectionRow({
            connectionId: input.snapshot.connectionId,
          });
          if (Option.isNone(connection)) {
            return false;
          }
          const inserted = yield* insertCapabilitySnapshotRow(input);
          if (Option.isNone(inserted)) {
            return false;
          }
          yield* updateConnectionSnapshotRow({
            connectionId: input.snapshot.connectionId,
            snapshotId: input.snapshot.id,
            updatedAt: input.snapshot.discoveredAt,
          });
          return true;
        }),
      )
      .pipe(
        Effect.mapError(
          toPersistenceSqlOrDecodeError(
            "RoutingRepository.saveCapabilitySnapshot:transaction",
            "RoutingRepository.saveCapabilitySnapshot:decode",
          ),
        ),
      );

  const getCapabilitySnapshot: RoutingRepositoryShape["getCapabilitySnapshot"] = (input) =>
    getCapabilitySnapshotRow(input).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "RoutingRepository.getCapabilitySnapshot:query",
          "RoutingRepository.getCapabilitySnapshot:decode",
        ),
      ),
    );

  const listCurrentCapabilitySnapshots: RoutingRepositoryShape["listCurrentCapabilitySnapshots"] =
    () =>
      listCurrentCapabilitySnapshotRows().pipe(
        Effect.mapError(
          toPersistenceSqlOrDecodeError(
            "RoutingRepository.listCurrentCapabilitySnapshots:query",
            "RoutingRepository.listCurrentCapabilitySnapshots:decode",
          ),
        ),
      );

  const publishPolicy: RoutingRepositoryShape["publishPolicy"] = (policy) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          yield* insertPolicyHeaderRow(policy);
          return Option.isSome(yield* insertPolicyRevisionRow(policy));
        }),
      )
      .pipe(
        Effect.mapError(
          toPersistenceSqlOrDecodeError(
            "RoutingRepository.publishPolicy:transaction",
            "RoutingRepository.publishPolicy:decode",
          ),
        ),
      );

  const getPolicy: RoutingRepositoryShape["getPolicy"] = (input) =>
    getPolicyRow(input).pipe(
      Effect.map(Option.map((row) => row.policy)),
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "RoutingRepository.getPolicy:query",
          "RoutingRepository.getPolicy:decode",
        ),
      ),
    );

  const listPolicies: RoutingRepositoryShape["listPolicies"] = (input) =>
    listPolicyRows(input).pipe(
      Effect.map((rows) => rows.map((row) => row.policy)),
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "RoutingRepository.listPolicies:query",
          "RoutingRepository.listPolicies:decode",
        ),
      ),
    );

  const saveDecision: RoutingRepositoryShape["saveDecision"] = (decision) =>
    insertDecisionRow(decision).pipe(
      Effect.map(Option.isSome),
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "RoutingRepository.saveDecision:query",
          "RoutingRepository.saveDecision:decode",
        ),
      ),
    );

  const getDecision: RoutingRepositoryShape["getDecision"] = (input) =>
    getDecisionRow(input).pipe(
      Effect.map(Option.map(toRoutingDecision)),
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "RoutingRepository.getDecision:query",
          "RoutingRepository.getDecision:decode",
        ),
      ),
    );

  const listDecisionsByWorkUnit: RoutingRepositoryShape["listDecisionsByWorkUnit"] = (input) =>
    listDecisionRowsByWorkUnit(input).pipe(
      Effect.map((rows) => rows.map(toRoutingDecision)),
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "RoutingRepository.listDecisionsByWorkUnit:query",
          "RoutingRepository.listDecisionsByWorkUnit:decode",
        ),
      ),
    );

  return {
    upsertConnection,
    getConnection,
    listConnections,
    saveCapabilitySnapshot,
    getCapabilitySnapshot,
    listCurrentCapabilitySnapshots,
    publishPolicy,
    getPolicy,
    listPolicies,
    saveDecision,
    getDecision,
    listDecisionsByWorkUnit,
  } satisfies RoutingRepositoryShape;
});

export const RoutingRepositoryLive = Layer.effect(
  RoutingRepository,
  makeRoutingRepository,
);
