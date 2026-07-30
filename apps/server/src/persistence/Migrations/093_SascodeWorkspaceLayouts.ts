import { Effect } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS sascode_workspace_layouts (
      project_id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL,
      layout_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_sascode_workspace_layouts_updated
    ON sascode_workspace_layouts (updated_at, project_id)
  `;
});
