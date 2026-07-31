import {
  ProjectId,
  ProviderConnectionId,
  type ProviderConnection,
} from "@synara/contracts";
import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import {
  ProviderDiscoveryService,
  type ProviderDiscoveryServiceShape,
} from "../../provider/Services/ProviderDiscoveryService.ts";
import { ProviderCapabilitySync } from "../Services/ProviderCapabilitySync.ts";
import { RoutingRepository } from "../Services/RoutingRepository.ts";
import { ProviderCapabilitySyncLive } from "./ProviderCapabilitySync.ts";
import { RoutingRepositoryLive } from "./RoutingRepository.ts";

const unusedDiscoveryOperation = () =>
  Effect.die(new Error("Unexpected provider discovery operation."));

const ProviderDiscoveryTest = Layer.succeed(ProviderDiscoveryService, {
  getComposerCapabilities: unusedDiscoveryOperation,
  listCommands: unusedDiscoveryOperation,
  listSkills: unusedDiscoveryOperation,
  listPlugins: unusedDiscoveryOperation,
  readPlugin: unusedDiscoveryOperation,
  listAgents: unusedDiscoveryOperation,
  listModels: () =>
    Effect.succeed({
      source: "antigravity-cli",
      cached: false,
      models: [
        {
          slug: "gemini-3-ultra",
          name: "Gemini 3 Ultra",
          description: "Subscription model",
          supportedReasoningEfforts: [
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
          ],
          defaultReasoningEffort: "high",
          supportsThinkingToggle: true,
        },
      ],
    }),
} satisfies ProviderDiscoveryServiceShape);

const routingLayer = RoutingRepositoryLive.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
);

const capabilitySyncLayer = it.layer(
  Layer.mergeAll(
    ProviderCapabilitySyncLive.pipe(
      Layer.provide(ProviderDiscoveryTest),
      Layer.provide(routingLayer),
    ),
    routingLayer,
    SqlitePersistenceMemory,
  ),
);

const connection: ProviderConnection = {
  id: ProviderConnectionId.makeUnsafe("connection-gemini-ultra"),
  providerKey: "gemini",
  displayName: "Google AI Ultra",
  connectionKind: "subscription-cli",
  enabled: true,
  priority: 80,
  config: {
    credentialMode: "antigravity-subscription",
    projectId: ProjectId.makeUnsafe("project-provider-sync"),
  },
  lastCapabilitySnapshotId: null,
  createdAt: "2026-07-30T05:00:00.000Z",
  updatedAt: "2026-07-30T05:00:00.000Z",
};

capabilitySyncLayer("ProviderCapabilitySync", (it) => {
  it.effect("publishes live subscription models into the routing capability graph", () =>
    Effect.gen(function* () {
      const sync = yield* ProviderCapabilitySync;
      const routing = yield* RoutingRepository;
      const input = {
        connection,
        providerKind: "antigravity" as const,
        profile: {
          activities: [
            "ux-planning",
            "visual-design",
            "frontend-implementation",
            "backend-implementation",
          ] as const,
          tools: ["file-read", "file-write", "shell", "git", "browser"] as const,
          inputModalities: ["text", "image"] as const,
          outputModalities: ["text"] as const,
          supportsSessionResume: true,
          supportsThreadImport: false,
          supportsStructuredOutput: true,
          supportsStreaming: true,
        },
        familyAliases: {},
        quota: [{ label: "subscription", usedFraction: 0.1 }],
        authenticatedAccountLabel: "sas",
        cwd: "/tmp/sascode",
        discoveredAt: "2026-07-30T05:01:00.000Z",
        expiresAt: "2026-07-30T05:06:00.000Z",
      };

      const snapshot = yield* sync.sync(input);
      const repeated = yield* sync.sync(input);

      assert.strictEqual(repeated.id, snapshot.id);
      assert.strictEqual(snapshot.providerKey, "gemini");
      assert.strictEqual(snapshot.providerKind, "antigravity");
      assert.strictEqual(snapshot.health, "ready");
      assert.strictEqual(snapshot.models[0]?.slug, "gemini-3-ultra");
      assert.strictEqual(snapshot.models[0]?.family, "gemini");
      assert.strictEqual(
        snapshot.models[0]?.optionDefaults?.reasoningEffort,
        "high",
      );
      assert.isTrue(
        snapshot.models[0]?.capability.tools.includes("browser") ?? false,
      );
      assert.deepStrictEqual(yield* routing.listCurrentCapabilitySnapshots(), [
        snapshot,
      ]);
    }),
  );
});
