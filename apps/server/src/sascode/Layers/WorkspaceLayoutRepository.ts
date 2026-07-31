import {
  ProjectId,
  SascodeSaveWorkspaceLayoutInput,
  SascodeWorkspaceLayout,
} from "@synara/contracts";
import { Effect, Layer, Option, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceSqlOrDecodeError } from "../../persistence/Errors.ts";
import { WorkspaceLayoutConflictError } from "../Errors.ts";
import {
  GetWorkspaceLayoutInput,
  WorkspaceLayoutRepository,
  type WorkspaceLayoutRepositoryShape,
} from "../Services/WorkspaceLayoutRepository.ts";

const LayoutRow = Schema.Struct({
  layout: Schema.fromJsonString(SascodeWorkspaceLayout),
});

const UpdatedProjectRow = Schema.Struct({
  projectId: ProjectId,
});

const makeWorkspaceLayoutRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const getLayoutRow = SqlSchema.findOneOption({
    Request: GetWorkspaceLayoutInput,
    Result: LayoutRow,
    execute: ({ projectId }) =>
      sql`
        SELECT layout_json AS layout
        FROM sascode_workspace_layouts
        WHERE project_id = ${projectId}
      `,
  });

  const insertLayoutRow = SqlSchema.findOneOption({
    Request: SascodeWorkspaceLayout,
    Result: UpdatedProjectRow,
    execute: (layout) =>
      sql`
        INSERT INTO sascode_workspace_layouts (
          project_id,
          revision,
          layout_json,
          created_at,
          updated_at
        )
        VALUES (
          ${layout.projectId},
          ${layout.revision},
          ${JSON.stringify(layout)},
          ${layout.createdAt},
          ${layout.updatedAt}
        )
        ON CONFLICT (project_id) DO NOTHING
        RETURNING project_id AS "projectId"
      `,
  });

  const updateLayoutRow = SqlSchema.findOneOption({
    Request: SascodeSaveWorkspaceLayoutInput,
    Result: UpdatedProjectRow,
    execute: ({ layout, expectedRevision }) =>
      sql`
        UPDATE sascode_workspace_layouts
        SET
          revision = ${layout.revision},
          layout_json = ${JSON.stringify(layout)},
          updated_at = ${layout.updatedAt}
        WHERE project_id = ${layout.projectId}
          AND revision = ${expectedRevision}
        RETURNING project_id AS "projectId"
      `,
  });

  const mapError = (operation: string) =>
    toPersistenceSqlOrDecodeError(
      `${operation}:query`,
      `${operation}:decode`,
    );

  const getLayout: WorkspaceLayoutRepositoryShape["getLayout"] = (input) =>
    getLayoutRow(input).pipe(
      Effect.map(Option.map(({ layout }) => layout)),
      Effect.mapError(mapError("WorkspaceLayoutRepository.getLayout")),
    );

  const saveLayout: WorkspaceLayoutRepositoryShape["saveLayout"] = (input) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          const existing = yield* getLayoutRow({
            projectId: input.layout.projectId,
          });
          if (Option.isNone(existing)) {
            if (input.expectedRevision !== 0 || input.layout.revision !== 1) {
              return yield* new WorkspaceLayoutConflictError({
                projectId: input.layout.projectId,
                expectedRevision: input.expectedRevision,
                detail:
                  "A new layout must use expected revision 0 and revision 1.",
              });
            }
            if (Option.isNone(yield* insertLayoutRow(input.layout))) {
              return yield* new WorkspaceLayoutConflictError({
                projectId: input.layout.projectId,
                expectedRevision: input.expectedRevision,
                detail: "Another writer created the layout first.",
              });
            }
            return input.layout;
          }

          if (
            JSON.stringify(existing.value.layout) ===
            JSON.stringify(input.layout)
          ) {
            return existing.value.layout;
          }
          if (
            input.layout.revision !== input.expectedRevision + 1
          ) {
            return yield* new WorkspaceLayoutConflictError({
              projectId: input.layout.projectId,
              expectedRevision: input.expectedRevision,
              detail:
                "The next layout revision must increment the expected revision by one.",
            });
          }
          if (Option.isNone(yield* updateLayoutRow(input))) {
            return yield* new WorkspaceLayoutConflictError({
              projectId: input.layout.projectId,
              expectedRevision: input.expectedRevision,
              detail: "The layout changed during an optimistic update.",
            });
          }
          return input.layout;
        }),
      )
      .pipe(
        Effect.mapError((error) =>
          error instanceof WorkspaceLayoutConflictError
            ? error
            : mapError("WorkspaceLayoutRepository.saveLayout")(error),
        ),
      );

  return {
    getLayout,
    saveLayout,
  } satisfies WorkspaceLayoutRepositoryShape;
});

export const WorkspaceLayoutRepositoryLive = Layer.effect(
  WorkspaceLayoutRepository,
  makeWorkspaceLayoutRepository,
);
