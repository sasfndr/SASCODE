import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("SASCODE backend migrations", (it) => {
  it.effect("creates every bounded-context table", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations();

      const rows = yield* sql<{ readonly name: string }>`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name LIKE 'sascode_%'
        ORDER BY name
      `;

      assert.deepStrictEqual(
        rows.map((row) => row.name),
        [
          "sascode_attention_items",
          "sascode_attention_preferences",
          "sascode_audit_records",
          "sascode_browser_instances",
          "sascode_browser_profiles",
          "sascode_capability_snapshots",
          "sascode_context_artifacts",
          "sascode_decision_records",
          "sascode_director_command_receipts",
          "sascode_director_events",
          "sascode_evidence_links",
          "sascode_evidence_records",
          "sascode_module_instances",
          "sascode_module_manifests",
          "sascode_permission_grants",
          "sascode_projection_state",
          "sascode_projection_work_unit_attempts",
          "sascode_projection_work_units",
          "sascode_projection_workflow_edges",
          "sascode_projection_workflows",
          "sascode_provider_connections",
          "sascode_quality_gate_runs",
          "sascode_result_packets",
          "sascode_result_verifications",
          "sascode_routing_decisions",
          "sascode_routing_policies",
          "sascode_routing_policy_bindings",
          "sascode_routing_policy_revisions",
          "sascode_secret_refs",
          "sascode_step_up_requests",
          "sascode_task_contracts",
          "sascode_work_unit_execution_specs",
          "sascode_workspace_layouts",
        ],
      );
    }),
  );

  it.effect("enforces one active attempt per work unit while allowing retries after settlement", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations();
      const now = "2026-07-30T04:30:00.000Z";

      yield* sql`
        INSERT INTO sascode_projection_workflows (
          workflow_id, project_id, title, outcome, status,
          routing_policy_id, routing_policy_revision, graph_revision,
          concurrency_limit, created_by, created_at, updated_at
        ) VALUES (
          'workflow-one-active', 'project-1', 'Build backend', 'Ship a backend', 'running',
          'policy-1', 1, 1, 4, 'user:sas', ${now}, ${now}
        )
      `;
      yield* sql`
        INSERT INTO sascode_projection_work_units (
          work_unit_id, workflow_id, node_key, title, outcome, activity, role_id,
          status, priority, risk, sort_order, declared_resources_json,
          required_evidence_kinds_json, created_at, updated_at
        ) VALUES (
          'work-unit-one-active', 'workflow-one-active', 'backend', 'Build backend',
          'Ship a backend', 'backend-implementation', 'role-backend',
          'running', 'high', 'medium', 0, '[]', '["test"]', ${now}, ${now}
        )
      `;
      yield* sql`
        INSERT INTO sascode_projection_work_unit_attempts (
          attempt_id, workflow_id, work_unit_id, attempt_number, status,
          routing_decision_id, task_contract_id, created_at, updated_at
        ) VALUES (
          'attempt-1', 'workflow-one-active', 'work-unit-one-active', 1, 'running',
          'route-1', 'contract-1', ${now}, ${now}
        )
      `;

      const competingAttempt = yield* Effect.exit(sql`
        INSERT INTO sascode_projection_work_unit_attempts (
          attempt_id, workflow_id, work_unit_id, attempt_number, status,
          routing_decision_id, task_contract_id, created_at, updated_at
        ) VALUES (
          'attempt-2', 'workflow-one-active', 'work-unit-one-active', 2, 'dispatching',
          'route-2', 'contract-2', ${now}, ${now}
        )
      `);
      assert.strictEqual(competingAttempt._tag, "Failure");

      yield* sql`
        UPDATE sascode_projection_work_unit_attempts
        SET status = 'failed', settled_at = ${now}, updated_at = ${now}
        WHERE attempt_id = 'attempt-1'
      `;
      yield* sql`
        INSERT INTO sascode_projection_work_unit_attempts (
          attempt_id, workflow_id, work_unit_id, attempt_number, status,
          routing_decision_id, task_contract_id, created_at, updated_at
        ) VALUES (
          'attempt-2', 'workflow-one-active', 'work-unit-one-active', 2, 'dispatching',
          'route-2', 'contract-2', ${now}, ${now}
        )
      `;

      const attempts = yield* sql<{ readonly id: string; readonly status: string }>`
        SELECT attempt_id AS id, status
        FROM sascode_projection_work_unit_attempts
        ORDER BY attempt_number
      `;
      assert.deepStrictEqual(attempts, [
        { id: "attempt-1", status: "failed" },
        { id: "attempt-2", status: "dispatching" },
      ]);
    }),
  );

  it.effect("isolates browser profile partitions", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations();
      const now = "2026-07-30T04:30:00.000Z";

      yield* sql`
        INSERT INTO sascode_browser_profiles (
          browser_profile_id, project_id, name, partition_key, persistent,
          allowed_hosts_json, blocked_hosts_json, contains_authenticated_state,
          created_at, updated_at
        ) VALUES (
          'profile-1', 'project-1', 'Development', 'persist:sascode-browser-opaque-1', 1,
          '[]', '[]', 1, ${now}, ${now}
        )
      `;
      const duplicatePartition = yield* Effect.exit(sql`
        INSERT INTO sascode_browser_profiles (
          browser_profile_id, project_id, name, partition_key, persistent,
          allowed_hosts_json, blocked_hosts_json, contains_authenticated_state,
          created_at, updated_at
        ) VALUES (
          'profile-2', 'project-2', 'Production', 'persist:sascode-browser-opaque-1', 1,
          '[]', '[]', 1, ${now}, ${now}
        )
      `);

      assert.strictEqual(duplicatePartition._tag, "Failure");
    }),
  );
});
