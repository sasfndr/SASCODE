import type {
  ProviderKind,
  ServerProviderStatus,
} from "@synara/contracts";
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
      const result = yield* catalog.refresh({
        occurredAt: now,
        cwd: "/tmp/sascode",
      });

      assert.deepStrictEqual(result.failures, []);
      assert.deepStrictEqual(
        result.snapshots.map((snapshot) => snapshot.providerKey),
        ["codex", "claude", "gemini"],
      );
      assert.deepStrictEqual(
        result.snapshots.map(
          (snapshot) => snapshot.models[0]?.family,
        ),
        ["gpt", "opus", "gemini"],
      );
      assert.isTrue(
        result.snapshots.every(
          (snapshot) =>
            snapshot.connectionKind === "subscription-cli" &&
            snapshot.models[0]?.capability.tools.includes("mcp"),
        ),
      );
    }),
  );
});
