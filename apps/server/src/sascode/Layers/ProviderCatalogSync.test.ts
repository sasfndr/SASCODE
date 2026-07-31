import type {
  ProviderKind,
  ServerProviderStatus,
} from "@synara/contracts";
import { ProviderConnectionId } from "@synara/contracts";
import { assert, it } from "@effect/vitest";
import { Effect, Layer, Stream } from "effect";

import {
  ProviderDiscoveryService,
  type ProviderDiscoveryServiceShape,
} from "../../provider/Services/ProviderDiscoveryService.ts";
import {
  ProviderHealth,
  type ProviderHealthShape,
} from "../../provider/Services/ProviderHealth.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { ProviderCatalogSync } from "../Services/ProviderCatalogSync.ts";
import { RoutingRepository } from "../Services/RoutingRepository.ts";
import { ProviderCapabilitySyncLive } from "./ProviderCapabilitySync.ts";
import { ProviderCatalogSyncLive } from "./ProviderCatalogSync.ts";
import { RoutingRepositoryLive } from "./RoutingRepository.ts";

const now = "2026-07-30T18:00:00.000Z";
const enabledProviders: ReadonlyArray<ProviderKind> = [
  "codex",
  "claudeAgent",
  "antigravity",
];

const status = (provider: ProviderKind): ServerProviderStatus => ({
  provider,
  status: "ready",
  available: true,
  authStatus: "authenticated",
  authType: "subscription",
  authLabel: "sas",
  checkedAt: now,
});

const unused = () => Effect.die(new Error("Unexpected discovery call."));
const discoveryLayer = Layer.succeed(ProviderDiscoveryService, {
  getComposerCapabilities: unused,
  listCommands: unused,
  listSkills: unused,
  listPlugins: unused,
  readPlugin: unused,
  listAgents: unused,
  listModels: ({ provider }) =>
    Effect.succeed({
      source: `${provider}-cli`,
      cached: false,
      models: [
        {
          slug:
            provider === "codex"
              ? "gpt-5.6-sol"
              : provider === "claudeAgent"
                ? "claude-opus-5"
                : "gemini-3-ultra",
          name:
            provider === "codex"
              ? "GPT-5.6"
              : provider === "claudeAgent"
                ? "Claude Opus 5"
                : "Gemini 3 Ultra",
        },
      ],
    }),
} satisfies ProviderDiscoveryServiceShape);

const healthLayer = Layer.succeed(ProviderHealth, {
  getStatuses: Effect.succeed(enabledProviders.map(status)),
  refresh: Effect.succeed(enabledProviders.map(status)),
  updateProvider: unused,
  streamChanges: Stream.empty,
} satisfies ProviderHealthShape);

const settingsLayer = ServerSettingsService.layerTest({
  providers: {
    codex: { enabled: true },
    claudeAgent: { enabled: true },
    antigravity: { enabled: true },
    cursor: { enabled: false },
    grok: { enabled: false },
    droid: { enabled: false },
    kilo: { enabled: false },
    opencode: { enabled: false },
    pi: { enabled: false },
  },
});

const routingLayer = RoutingRepositoryLive.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
);
const capabilityLayer = ProviderCapabilitySyncLive.pipe(
  Layer.provide(discoveryLayer),
  Layer.provide(routingLayer),
);
const catalogLayer = it.layer(
  Layer.mergeAll(
    ProviderCatalogSyncLive.pipe(
      Layer.provide(capabilityLayer),
      Layer.provide(healthLayer),
      Layer.provide(settingsLayer),
      Layer.provide(routingLayer),
    ),
    capabilityLayer,
    routingLayer,
    SqlitePersistenceMemory,
  ),
);

catalogLayer("ProviderCatalogSync", (it) => {
  it.effect("discovers configured subscription CLIs into one model catalog", () =>
    Effect.gen(function* () {
      const catalog = yield* ProviderCatalogSync;
      const routing = yield* RoutingRepository;
      yield* routing.upsertConnection({
        id: ProviderConnectionId.makeUnsafe(
          "provider:claudeAgent:second-max",
        ),
        providerKey: "claude",
        displayName: "Claude Max — second account",
        connectionKind: "subscription-cli",
        enabled: true,
        priority: 110,
        config: {
          providerKind: "claudeAgent",
          credentialMode: "cli-subscription",
          accountLabel: "second@example.com",
          configDir: "/profiles/claude/second",
        },
        lastCapabilitySnapshotId: null,
        createdAt: now,
        updatedAt: now,
      });
      const result = yield* catalog.refresh({
        occurredAt: now,
        cwd: "/tmp/sascode",
      });

      assert.deepStrictEqual(result.failures, []);
      assert.deepStrictEqual(
        result.snapshots.map((snapshot) => snapshot.providerKey),
        ["claude", "claude", "codex", "gemini"],
      );
      assert.deepStrictEqual(
        result.snapshots.map(
          (snapshot) => snapshot.models[0]?.family,
        ),
        ["opus", "opus", "gpt", "gemini"],
      );
      assert.strictEqual(
        result.snapshots.filter(
          (snapshot) => snapshot.providerKind === "claudeAgent",
        ).length,
        2,
      );
      assert.include(
        result.snapshots.map(
          (snapshot) => snapshot.authenticatedAccountLabel,
        ),
        "second@example.com",
      );
      assert.isTrue(
        result.snapshots.every(
          (snapshot) =>
            snapshot.connectionKind === "subscription-cli" &&
            snapshot.models[0]?.capability.tools.includes("mcp"),
        ),
      );

      const defaultClaudeId = ProviderConnectionId.makeUnsafe(
        "provider:claudeAgent:default",
      );
      const defaultClaude = yield* routing.getConnection(defaultClaudeId);
      assert.strictEqual(defaultClaude._tag, "Some");
      if (defaultClaude._tag === "Some") {
        yield* routing.upsertConnection({
          ...defaultClaude.value,
          enabled: false,
          updatedAt: now,
        });
      }
      const refreshed = yield* catalog.refresh({
        occurredAt: now,
        cwd: "/tmp/sascode",
      });
      assert.notInclude(
        refreshed.snapshots.map((snapshot) => snapshot.connectionId),
        defaultClaudeId,
      );
      const disabledDefault = yield* routing.getConnection(defaultClaudeId);
      assert.strictEqual(disabledDefault._tag, "Some");
      if (disabledDefault._tag === "Some") {
        assert.isFalse(disabledDefault.value.enabled);
      }
    }),
  );
});
