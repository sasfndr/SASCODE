import { Effect } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { columnExists } from "./schemaHelpers.ts";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  if (!(yield* columnExists(sql, "projection_thread_sessions", "provider_connection_id"))) {
    yield* sql`
      ALTER TABLE projection_thread_sessions
      ADD COLUMN provider_connection_id TEXT
    `;
  }
  if (!(yield* columnExists(sql, "projection_thread_sessions", "provider_account_label"))) {
    yield* sql`
      ALTER TABLE projection_thread_sessions
      ADD COLUMN provider_account_label TEXT
    `;
  }
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_thread_sessions_provider_connection
    ON projection_thread_sessions(provider_connection_id)
  `;
});
