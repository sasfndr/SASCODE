import { Effect } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_work_unit_execution_specs (
      work_unit_id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      digest TEXT NOT NULL,
      spec_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workflow_id)
        REFERENCES sascode_projection_workflows(workflow_id)
        ON DELETE CASCADE,
      FOREIGN KEY (work_unit_id)
        REFERENCES sascode_projection_work_units(work_unit_id)
        ON DELETE CASCADE
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_execution_specs_workflow
    ON sascode_work_unit_execution_specs (workflow_id, updated_at, work_unit_id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_execution_specs_runnable
    ON sascode_work_unit_execution_specs (updated_at, work_unit_id)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_result_verifications (
      result_packet_id TEXT PRIMARY KEY,
      verification_json TEXT NOT NULL,
      verified_at TEXT NOT NULL,
      FOREIGN KEY (result_packet_id)
        REFERENCES sascode_result_packets(result_packet_id)
        ON DELETE CASCADE
    )
  `;
});
