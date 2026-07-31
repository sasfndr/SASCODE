import { Effect } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_permission_grants (
      grant_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      thread_id TEXT,
      workflow_id TEXT,
      work_unit_id TEXT,
      profile TEXT NOT NULL,
      capabilities_json TEXT NOT NULL,
      boundary_json TEXT NOT NULL,
      granted_by TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revoked_at TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_permission_grants_scope_active
    ON sascode_permission_grants (
      project_id,
      workflow_id,
      work_unit_id,
      revoked_at,
      created_at DESC
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_step_up_requests (
      request_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      thread_id TEXT,
      workflow_id TEXT,
      work_unit_id TEXT,
      status TEXT NOT NULL,
      requested_capabilities_json TEXT NOT NULL,
      risk TEXT NOT NULL,
      reason TEXT NOT NULL,
      consequence TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      resolved_at TEXT,
      resolved_by TEXT,
      decision_reason TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_step_up_requests_pending
    ON sascode_step_up_requests (status, project_id, requested_at, request_id)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_secret_refs (
      secret_ref TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      provider_key TEXT,
      project_id TEXT,
      vault_backend TEXT NOT NULL,
      vault_locator TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      revoked_at TEXT
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_browser_profiles (
      browser_profile_id TEXT PRIMARY KEY,
      project_id TEXT,
      name TEXT NOT NULL,
      partition_key TEXT NOT NULL UNIQUE,
      persistent INTEGER NOT NULL,
      allowed_hosts_json TEXT NOT NULL,
      blocked_hosts_json TEXT NOT NULL,
      contains_authenticated_state INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_browser_instances (
      browser_instance_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      browser_profile_id TEXT NOT NULL,
      backend TEXT NOT NULL,
      status TEXT NOT NULL,
      control_owner_json TEXT NOT NULL,
      tabs_json TEXT NOT NULL,
      assigned_workflow_id TEXT,
      assigned_work_unit_id TEXT,
      evidence_ids_json TEXT NOT NULL,
      recording_enabled INTEGER NOT NULL,
      last_error TEXT,
      runtime_generation INTEGER NOT NULL DEFAULT 0,
      authorization_epoch INTEGER NOT NULL DEFAULT 0,
      control_lease_expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      stopped_at TEXT,
      FOREIGN KEY (browser_profile_id)
        REFERENCES sascode_browser_profiles(browser_profile_id)
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_browser_instances_project_status
    ON sascode_browser_instances (project_id, status, updated_at DESC)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_module_manifests (
      module_id TEXT NOT NULL,
      version TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      origin TEXT NOT NULL,
      signature TEXT,
      installed_at TEXT NOT NULL,
      removed_at TEXT,
      PRIMARY KEY (module_id, version)
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_module_instances (
      module_instance_id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL,
      module_version TEXT NOT NULL,
      project_id TEXT,
      status TEXT NOT NULL,
      placement TEXT NOT NULL,
      configuration_json TEXT NOT NULL,
      state_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (module_id, module_version)
        REFERENCES sascode_module_manifests(module_id, version)
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_module_instances_project_status
    ON sascode_module_instances (project_id, status, updated_at DESC)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_attention_items (
      fingerprint TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      workflow_id TEXT,
      work_unit_id TEXT,
      state TEXT NOT NULL,
      priority TEXT NOT NULL,
      interruption_class TEXT NOT NULL,
      reason_code TEXT NOT NULL,
      summary TEXT NOT NULL,
      recommended_action TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT,
      snoozed_until TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_attention_active_priority
    ON sascode_attention_items (
      project_id,
      resolved_at,
      priority,
      updated_at DESC,
      fingerprint
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_attention_preferences (
      scope_kind TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      focus_mode TEXT NOT NULL,
      muted_reason_codes_json TEXT NOT NULL,
      system_notifications_enabled INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (scope_kind, scope_id)
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_audit_records (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      audit_record_id TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL,
      thread_id TEXT,
      workflow_id TEXT,
      work_unit_id TEXT,
      actor_kind TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      outcome TEXT NOT NULL,
      risk TEXT NOT NULL,
      resources_json TEXT NOT NULL,
      reason TEXT,
      correlation_id TEXT,
      occurred_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_audit_scope_sequence
    ON sascode_audit_records (project_id, workflow_id, work_unit_id, sequence)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_audit_correlation
    ON sascode_audit_records (correlation_id, sequence)
    WHERE correlation_id IS NOT NULL
  `;
});
