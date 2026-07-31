import { Effect } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_provider_connections (
      connection_id TEXT PRIMARY KEY,
      provider_key TEXT NOT NULL,
      display_name TEXT NOT NULL,
      connection_kind TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      priority INTEGER NOT NULL,
      config_json TEXT NOT NULL,
      last_capability_snapshot_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_provider_connections_enabled_priority
    ON sascode_provider_connections (enabled, priority DESC, provider_key, connection_id)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_capability_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      provider_key TEXT NOT NULL,
      provider_kind TEXT,
      display_name TEXT NOT NULL,
      connection_kind TEXT NOT NULL,
      health TEXT NOT NULL,
      health_detail TEXT,
      models_json TEXT NOT NULL,
      quota_json TEXT NOT NULL,
      authenticated_account_label TEXT,
      digest TEXT NOT NULL,
      discovered_at TEXT NOT NULL,
      expires_at TEXT,
      FOREIGN KEY (connection_id)
        REFERENCES sascode_provider_connections(connection_id)
        ON DELETE CASCADE
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_capability_snapshots_connection_time
    ON sascode_capability_snapshots (connection_id, discovered_at DESC, snapshot_id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_capability_snapshots_health_expiry
    ON sascode_capability_snapshots (health, expires_at, connection_id)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_routing_policies (
      policy_id TEXT PRIMARY KEY,
      project_id TEXT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_routing_policies_project
    ON sascode_routing_policies (project_id, updated_at DESC, policy_id)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_routing_policy_revisions (
      policy_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      canonical_json TEXT NOT NULL,
      source_text TEXT,
      digest TEXT NOT NULL,
      diagnostics_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      published_at TEXT,
      PRIMARY KEY (policy_id, revision),
      UNIQUE (policy_id, digest),
      FOREIGN KEY (policy_id)
        REFERENCES sascode_routing_policies(policy_id)
        ON DELETE CASCADE
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_routing_policy_bindings (
      scope_kind TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      policy_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      bound_at TEXT NOT NULL,
      bound_by TEXT NOT NULL,
      PRIMARY KEY (scope_kind, scope_id),
      FOREIGN KEY (policy_id, revision)
        REFERENCES sascode_routing_policy_revisions(policy_id, revision)
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_routing_decisions (
      decision_id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      work_unit_id TEXT NOT NULL,
      policy_id TEXT NOT NULL,
      policy_revision INTEGER NOT NULL,
      role_id TEXT NOT NULL,
      candidates_json TEXT NOT NULL,
      selected_target_json TEXT NOT NULL,
      fallback_order_json TEXT NOT NULL,
      constraints_json TEXT NOT NULL,
      rationale TEXT NOT NULL,
      override_json TEXT,
      decided_at TEXT NOT NULL,
      FOREIGN KEY (workflow_id)
        REFERENCES sascode_projection_workflows(workflow_id)
        ON DELETE CASCADE,
      FOREIGN KEY (work_unit_id)
        REFERENCES sascode_projection_work_units(work_unit_id)
        ON DELETE CASCADE,
      FOREIGN KEY (policy_id, policy_revision)
        REFERENCES sascode_routing_policy_revisions(policy_id, revision)
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_routing_decisions_work_unit
    ON sascode_routing_decisions (work_unit_id, decided_at DESC, decision_id)
  `;
});
