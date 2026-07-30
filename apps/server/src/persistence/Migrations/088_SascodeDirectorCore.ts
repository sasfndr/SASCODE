import { Effect } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_director_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL,
      aggregate_kind TEXT NOT NULL,
      stream_id TEXT NOT NULL,
      stream_version INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      command_id TEXT NOT NULL,
      causation_event_id TEXT,
      correlation_id TEXT,
      actor_kind TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      UNIQUE (stream_id, stream_version)
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_director_events_type_sequence
    ON sascode_director_events (event_type, sequence)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_director_events_project_sequence
    ON sascode_director_events (project_id, sequence)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_director_events_aggregate_sequence
    ON sascode_director_events (aggregate_kind, stream_id, sequence)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_director_command_receipts (
      command_id TEXT PRIMARY KEY,
      aggregate_kind TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      result_sequence INTEGER NOT NULL,
      status TEXT NOT NULL,
      fingerprint_version INTEGER NOT NULL,
      command_fingerprint TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_director_receipts_aggregate
    ON sascode_director_command_receipts (aggregate_kind, aggregate_id, accepted_at)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_projection_workflows (
      workflow_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      outcome TEXT NOT NULL,
      status TEXT NOT NULL,
      routing_policy_id TEXT NOT NULL,
      routing_policy_revision INTEGER NOT NULL,
      graph_revision INTEGER NOT NULL,
      concurrency_limit INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      cancelled_at TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_workflows_project_status_updated
    ON sascode_projection_workflows (project_id, status, updated_at DESC, workflow_id)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_projection_work_units (
      work_unit_id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      node_key TEXT NOT NULL,
      title TEXT NOT NULL,
      outcome TEXT NOT NULL,
      activity TEXT NOT NULL,
      role_id TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      risk TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      declared_resources_json TEXT NOT NULL,
      required_evidence_kinds_json TEXT NOT NULL,
      active_attempt_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      terminal_at TEXT,
      UNIQUE (workflow_id, node_key),
      FOREIGN KEY (workflow_id)
        REFERENCES sascode_projection_workflows(workflow_id)
        ON DELETE CASCADE
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_work_units_workflow_status_sort
    ON sascode_projection_work_units (workflow_id, status, sort_order, work_unit_id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_work_units_ready_queue
    ON sascode_projection_work_units (status, priority, updated_at, work_unit_id)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_projection_workflow_edges (
      workflow_id TEXT NOT NULL,
      from_work_unit_id TEXT NOT NULL,
      to_work_unit_id TEXT NOT NULL,
      condition_kind TEXT NOT NULL,
      gate_key TEXT,
      PRIMARY KEY (workflow_id, from_work_unit_id, to_work_unit_id),
      FOREIGN KEY (workflow_id)
        REFERENCES sascode_projection_workflows(workflow_id)
        ON DELETE CASCADE,
      FOREIGN KEY (from_work_unit_id)
        REFERENCES sascode_projection_work_units(work_unit_id)
        ON DELETE CASCADE,
      FOREIGN KEY (to_work_unit_id)
        REFERENCES sascode_projection_work_units(work_unit_id)
        ON DELETE CASCADE
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_workflow_edges_to
    ON sascode_projection_workflow_edges (to_work_unit_id, from_work_unit_id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_workflow_edges_from
    ON sascode_projection_workflow_edges (from_work_unit_id, to_work_unit_id)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_projection_work_unit_attempts (
      attempt_id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      work_unit_id TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      status TEXT NOT NULL,
      routing_decision_id TEXT NOT NULL,
      task_contract_id TEXT NOT NULL,
      result_packet_id TEXT,
      thread_id TEXT,
      worktree_path TEXT,
      baseline_git_ref TEXT,
      started_at TEXT,
      settled_at TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (work_unit_id, attempt_number),
      FOREIGN KEY (workflow_id)
        REFERENCES sascode_projection_workflows(workflow_id)
        ON DELETE CASCADE,
      FOREIGN KEY (work_unit_id)
        REFERENCES sascode_projection_work_units(work_unit_id)
        ON DELETE CASCADE
    )
  `;

  yield* sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sascode_attempts_thread
    ON sascode_projection_work_unit_attempts (thread_id)
    WHERE thread_id IS NOT NULL
  `;

  yield* sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sascode_attempts_one_active
    ON sascode_projection_work_unit_attempts (work_unit_id)
    WHERE status IN (
      'preparing',
      'dispatching',
      'queued',
      'running',
      'waiting-approval',
      'verifying'
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_projection_state (
      projector TEXT PRIMARY KEY,
      last_applied_sequence INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
});
