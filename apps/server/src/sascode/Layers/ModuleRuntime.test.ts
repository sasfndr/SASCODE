import {
  AuditRecordId,
  ModuleId,
  ModuleInstanceId,
  PermissionGrantId,
  ProjectId,
  StepUpRequestId,
} from "@synara/contracts";
import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { CapabilityRepository } from "../Services/CapabilityRepository.ts";
import { ModuleRepository } from "../Services/ModuleRepository.ts";
import { ModuleRuntime } from "../Services/ModuleRuntime.ts";
import { CapabilityBrokerLive } from "./CapabilityBroker.ts";
import { CapabilityRepositoryLive } from "./CapabilityRepository.ts";
import { ModuleRepositoryLive } from "./ModuleRepository.ts";
import { ModuleRuntimeLive } from "./ModuleRuntime.ts";

const capabilityRepositoryLayer = CapabilityRepositoryLive.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
);
const moduleRepositoryLayer = ModuleRepositoryLive.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
);
const moduleDependencies = Layer.mergeAll(
  moduleRepositoryLayer,
  CapabilityBrokerLive.pipe(Layer.provide(capabilityRepositoryLayer)),
);

const moduleLayer = it.layer(
  Layer.mergeAll(
    ModuleRuntimeLive.pipe(Layer.provide(moduleDependencies)),
    moduleDependencies,
    capabilityRepositoryLayer,
    SqlitePersistenceMemory,
  ),
);

const projectId = ProjectId.makeUnsafe("project-module-runtime");
const moduleId = ModuleId.makeUnsafe("module-music-player");
const instanceId = ModuleInstanceId.makeUnsafe("module-instance-music-player");

moduleLayer("ModuleRuntime", (it) => {
  it.effect("installs, scopes, authorizes, and activates a draggable module", () =>
    Effect.gen(function* () {
      const runtime = yield* ModuleRuntime;
      const modules = yield* ModuleRepository;
      const capabilities = yield* CapabilityRepository;

      yield* capabilities.saveGrant({
        id: PermissionGrantId.makeUnsafe("grant-module-network"),
        scope: { projectId },
        profile: "safe-build",
        capabilities: ["use-network"],
        boundary: {
          workspaceRoots: [],
          allowedHosts: ["api.spotify.com"],
          deniedResources: [],
          isolatedExecutionRequired: false,
          expiresAt: "2026-07-30T12:00:00.000Z",
        },
        grantedBy: "sas",
        reason: "Allow the music module to load playback metadata.",
        createdAt: "2026-07-30T11:00:00.000Z",
        revokedAt: null,
      });
      const manifest = yield* runtime.install({
        manifest: {
          id: moduleId,
          version: "1.0.0",
          name: "Music Player",
          description: "A focus-friendly music player card.",
          category: "media",
          origin: "built-in",
          entrypoint: "builtin://music-player",
          placements: ["canvas", "floating", "drawer"],
          requiredPermissions: ["use-network"],
          backgroundExecution: true,
          singletonPerProject: true,
          signature: null,
        },
        installedAt: "2026-07-30T11:00:00.000Z",
      });
      assert.strictEqual(manifest.name, "Music Player");

      const instance = yield* runtime.instantiate({
        id: instanceId,
        moduleId,
        moduleVersion: "1.0.0",
        projectId,
        status: "installed",
        placement: "floating",
        configuration: { width: "420", height: "160" },
        state: { playback: "paused" },
        createdAt: "2026-07-30T11:01:00.000Z",
        updatedAt: "2026-07-30T11:01:00.000Z",
      });
      assert.strictEqual(instance.status, "installed");

      const activation = yield* runtime.activate({
        instanceId,
        expectedUpdatedAt: instance.updatedAt,
        authorizations: [
          {
            capability: "use-network",
            auditRecordId: AuditRecordId.makeUnsafe("audit-module-network"),
            stepUpRequestId: StepUpRequestId.makeUnsafe("step-up-module-network"),
            actorId: "module-music-player",
            reason: "Load playback metadata.",
            consequence: "The module can access its configured music API.",
          },
        ],
        isolatedExecution: true,
        occurredAt: "2026-07-30T11:02:00.000Z",
      });
      assert.isTrue(activation.activated);
      assert.strictEqual(activation.instance.status, "active");
      assert.strictEqual(activation.authorizations[0]?.outcome, "allowed");

      const suspended = yield* runtime.update({
        instance: {
          ...activation.instance,
          status: "suspended",
          state: { playback: "paused", track: "focus" },
          updatedAt: "2026-07-30T11:02:30.000Z",
        },
        expectedUpdatedAt: activation.instance.updatedAt,
      });
      assert.strictEqual(suspended.status, "suspended");

      const persisted = yield* modules.getInstance({ instanceId });
      assert.strictEqual(persisted._tag, "Some");
      if (persisted._tag === "Some") {
        assert.strictEqual(persisted.value.status, "suspended");
        assert.strictEqual(persisted.value.state.track, "focus");
      }
    }),
  );

  it.effect("rejects unsigned third-party manifests", () =>
    Effect.gen(function* () {
      const runtime = yield* ModuleRuntime;
      const failure = yield* runtime
        .install({
          manifest: {
            id: ModuleId.makeUnsafe("module-unsigned-third-party"),
            version: "1.0.0",
            name: "Unsigned",
            description: "An unsigned module.",
            category: "custom",
            origin: "signed-third-party",
            entrypoint: "https://example.com/module.js",
            placements: ["canvas"],
            requiredPermissions: [],
            backgroundExecution: false,
            singletonPerProject: false,
            signature: null,
          },
          installedAt: "2026-07-30T11:03:00.000Z",
        })
        .pipe(Effect.flip);
      assert.strictEqual(failure._tag, "ModuleManifestInvariantError");
    }),
  );
});
