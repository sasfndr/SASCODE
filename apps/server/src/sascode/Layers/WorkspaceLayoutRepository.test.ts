import {
  ProjectId,
  type SascodeWorkspaceLayout,
} from "@synara/contracts";
import { assert, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { WorkspaceLayoutRepository } from "../Services/WorkspaceLayoutRepository.ts";
import { WorkspaceLayoutRepositoryLive } from "./WorkspaceLayoutRepository.ts";

const projectId = ProjectId.makeUnsafe("project-workspace-layout");
const now = "2026-07-30T20:00:00.000Z";
const layout: SascodeWorkspaceLayout = {
  projectId,
  version: 1,
  revision: 1,
  presetKey: "stillspace",
  theme: {
    spectrum: 0.5,
    projectAura: "stillspace-dusk",
    glassOpacity: 0.72,
    contrast: 1,
    cornerRadius: 24,
    density: "comfortable",
    motion: "subtle",
    backgroundDim: 0.22,
    statusIntensity: 0.65,
  },
  mode: "focus",
  layoutMode: "freeform",
  modules: [
    {
      id: "agent-chat",
      moduleType: "agent-chat",
      moduleInstanceId: null,
      x: 0.05,
      y: 0.08,
      width: 0.65,
      height: 0.8,
      dock: "floating",
      zIndex: 10,
      hiddenWhenInactive: false,
      permissionScope: ["read-files"],
      configuration: {},
    },
  ],
  activeThreadIds: [],
  secondaryProjectId: null,
  snapToGrid: true,
  hideInactiveModules: true,
  updatedBy: "sas",
  createdAt: now,
  updatedAt: now,
};

const testLayer = it.layer(
  Layer.mergeAll(
    WorkspaceLayoutRepositoryLive.pipe(
      Layer.provideMerge(SqlitePersistenceMemory),
    ),
    SqlitePersistenceMemory,
  ),
);

testLayer("WorkspaceLayoutRepository", (it) => {
  it.effect("persists layouts idempotently and enforces optimistic revisions", () =>
    Effect.gen(function* () {
      const repository = yield* WorkspaceLayoutRepository;

      assert.deepStrictEqual(
        yield* repository.saveLayout({
          layout,
          expectedRevision: 0,
        }),
        layout,
      );
      assert.deepStrictEqual(
        yield* repository.saveLayout({
          layout,
          expectedRevision: 0,
        }),
        layout,
      );
      assert.deepStrictEqual(
        Option.getOrThrow(yield* repository.getLayout({ projectId })),
        layout,
      );

      const updated: SascodeWorkspaceLayout = {
        ...layout,
        revision: 2,
        mode: "dual-session",
        activeThreadIds: [],
        updatedAt: "2026-07-30T20:01:00.000Z",
      };
      assert.deepStrictEqual(
        yield* repository.saveLayout({
          layout: updated,
          expectedRevision: 1,
        }),
        updated,
      );

      const stale = yield* repository
        .saveLayout({
          layout: {
            ...updated,
            revision: 2,
            mode: "edit-space",
          },
          expectedRevision: 1,
        })
        .pipe(Effect.exit);
      assert.strictEqual(stale._tag, "Failure");
      if (stale._tag === "Failure") {
        assert.match(String(stale.cause), /WorkspaceLayoutConflictError/);
      }
    }),
  );
});
