import { Effect } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_context_artifacts (
      context_artifact_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      version INTEGER NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      source_json TEXT,
      tags_json TEXT NOT NULL,
      active INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (project_id, kind, title, version)
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_context_artifacts_active
    ON sascode_context_artifacts (project_id, active, kind, updated_at DESC)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_decision_records (
      decision_record_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      thread_id TEXT,
      workflow_id TEXT,
      work_unit_id TEXT,
      status TEXT NOT NULL,
      question TEXT NOT NULL,
      decision TEXT NOT NULL,
      rationale TEXT NOT NULL,
      alternatives_json TEXT NOT NULL,
      consequences_json TEXT NOT NULL,
      supersedes_id TEXT,
      decided_by TEXT NOT NULL,
      decided_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_decisions_scope_time
    ON sascode_decision_records (project_id, workflow_id, work_unit_id, decided_at DESC)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_task_contracts (
      task_contract_id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      work_unit_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      digest TEXT NOT NULL,
      contract_json TEXT NOT NULL,
      sealed_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (work_unit_id, version),
      UNIQUE (work_unit_id, digest),
      FOREIGN KEY (workflow_id)
        REFERENCES sascode_projection_workflows(workflow_id)
        ON DELETE CASCADE,
      FOREIGN KEY (work_unit_id)
        REFERENCES sascode_projection_work_units(work_unit_id)
        ON DELETE CASCADE
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_result_packets (
      result_packet_id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      work_unit_id TEXT NOT NULL,
      attempt_id TEXT NOT NULL UNIQUE,
      task_contract_id TEXT NOT NULL,
      task_contract_digest TEXT NOT NULL,
      status TEXT NOT NULL,
      packet_json TEXT NOT NULL,
      produced_at TEXT NOT NULL,
      FOREIGN KEY (workflow_id)
        REFERENCES sascode_projection_workflows(workflow_id)
        ON DELETE CASCADE,
      FOREIGN KEY (work_unit_id)
        REFERENCES sascode_projection_work_units(work_unit_id)
        ON DELETE CASCADE,
      FOREIGN KEY (attempt_id)
        REFERENCES sascode_projection_work_unit_attempts(attempt_id)
        ON DELETE CASCADE,
      FOREIGN KEY (task_contract_id)
        REFERENCES sascode_task_contracts(task_contract_id)
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_evidence_records (
      evidence_record_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      thread_id TEXT,
      workflow_id TEXT,
      work_unit_id TEXT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      command TEXT,
      resources_json TEXT NOT NULL,
      details TEXT,
      producer TEXT NOT NULL,
      usage_json TEXT,
      content_hash TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_evidence_scope_kind_time
    ON sascode_evidence_records (
      project_id,
      workflow_id,
      work_unit_id,
      kind,
      created_at DESC
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_evidence_links (
      evidence_record_id TEXT NOT NULL,
      subject_kind TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (evidence_record_id, subject_kind, subject_id),
      FOREIGN KEY (evidence_record_id)
        REFERENCES sascode_evidence_records(evidence_record_id)
        ON DELETE CASCADE
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_evidence_links_subject
    ON sascode_evidence_links (subject_kind, subject_id, created_at)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_quality_gate_runs (
      gate_run_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      thread_id TEXT,
      workflow_id TEXT,
      work_unit_id TEXT,
      gate_json TEXT NOT NULL,
      status TEXT NOT NULL,
      evidence_ids_json TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      failure_reason TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_quality_gates_scope_status
    ON sascode_quality_gate_runs (workflow_id, work_unit_id, status, gate_run_id)
  `;
});
