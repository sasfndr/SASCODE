import {
  ProviderConnectionId,
  type ProviderConnection,
  type ProviderKind,
  type SascodeActivityType,
  type SascodeModelModality,
  type SascodeToolCapability,
  type ServerProviderStatus,
} from "@synara/contracts";
import { Effect, Layer } from "effect";

import { ProviderHealth } from "../../provider/Services/ProviderHealth.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { ProviderCapabilitySync } from "../Services/ProviderCapabilitySync.ts";
import {
  ProviderCatalogSync,
  type ProviderCatalogSyncShape,
} from "../Services/ProviderCatalogSync.ts";

const PROVIDERS: ReadonlyArray<ProviderKind> = [
  "codex",
  "claudeAgent",
  "cursor",
  "antigravity",
  "grok",
  "droid",
  "kilo",
  "opencode",
  "pi",
];

const ACTIVITIES: ReadonlyArray<SascodeActivityType> = [
  "product-strategy",
  "ux-planning",
  "visual-design",
  "frontend-implementation",
  "backend-implementation",
  "infrastructure",
  "data",
  "browser-operation",
  "testing",
  "code-review",
  "security-review",
  "documentation",
  "integration",
  "release",
];

const TOOLS: ReadonlyArray<SascodeToolCapability> = [
  "file-read",
  "file-write",
  "shell",
  "git",
  "worktree",
  "browser",
  "mcp",
  "subagents",
  "web-search",
];

const providerKey = (provider: ProviderKind): string => {
  switch (provider) {
    case "claudeAgent":
      return "claude";
    case "antigravity":
      return "gemini";
    default:
      return provider;
  }
};

const displayName = (provider: ProviderKind): string => {
  switch (provider) {
    case "codex":
      return "Codex subscription";
    case "claudeAgent":
      return "Claude Code subscription";
    case "antigravity":
      return "Google AI subscription";
    case "opencode":
      return "OpenCode runtime";
    case "kilo":
      return "Kilo runtime";
    case "pi":
      return "Pi runtime";
    case "cursor":
      return "Cursor subscription";
    case "grok":
      return "Grok subscription";
    case "droid":
      return "Droid subscription";
  }
};

type ProviderSettings = {
  readonly enabled: boolean;
  readonly binaryPath: string;
  readonly customModels: ReadonlyArray<string>;
  readonly serverUrl?: string;
  readonly apiEndpoint?: string;
  readonly agentDir?: string;
};

const health = (
  status: ServerProviderStatus | undefined,
): {
  readonly health:
    | "ready"
    | "degraded"
    | "needs-auth"
    | "unavailable";
  readonly detail: string | null;
} => {
  if (!status) {
    return {
      health: "degraded",
      detail: "Provider health has not been checked yet.",
    };
  }
  if (status.authStatus === "unauthenticated") {
    return {
      health: "needs-auth",
      detail: status.message ?? "Provider authentication is required.",
    };
  }
  if (!status.available) {
    return {
      health: "unavailable",
      detail: status.message ?? "Provider runtime is unavailable.",
    };
  }
  return {
    health: status.status === "ready" ? "ready" : "degraded",
    detail: status.message ?? null,
  };
};

const makeProviderCatalogSync = Effect.gen(function* () {
  const capabilitySync = yield* ProviderCapabilitySync;
  const providerHealth = yield* ProviderHealth;
  const settingsService = yield* ServerSettingsService;

  const refresh: ProviderCatalogSyncShape["refresh"] = (input) =>
    Effect.gen(function* () {
      const [settings, statuses] = yield* Effect.all([
        settingsService.getSettings,
        providerHealth.getStatuses,
      ]);
      const statusByProvider = new Map(
        statuses.map((status) => [status.provider, status]),
      );
      const snapshots = [];
      const failures: Array<{ provider: ProviderKind; detail: string }> = [];

      for (const provider of PROVIDERS) {
        const providerSettings = settings.providers[
          provider
        ] as ProviderSettings;
        if (!providerSettings.enabled) continue;
        const currentHealth = health(statusByProvider.get(provider));
        const modalities: ReadonlyArray<SascodeModelModality> = [
          "text",
          ...(["codex", "claudeAgent", "cursor", "antigravity", "grok"].includes(
            provider,
          )
            ? (["image"] as const)
            : []),
        ];
        const connectionKind =
          (provider === "opencode" || provider === "kilo") &&
          providerSettings.serverUrl
            ? "remote-runtime"
            : provider === "opencode" ||
                provider === "kilo" ||
                provider === "pi"
              ? "local-runtime"
              : "subscription-cli";
        const connection: ProviderConnection = {
          id: ProviderConnectionId.makeUnsafe(
            `provider:${provider}:default`,
          ),
          providerKey: providerKey(provider),
          displayName: displayName(provider),
          connectionKind,
          enabled: true,
          priority:
            provider === "claudeAgent" || provider === "codex"
              ? 100
              : provider === "antigravity"
                ? 90
                : 50,
          config: {
            providerKind: provider,
            credentialMode:
              connectionKind === "subscription-cli"
                ? "cli-subscription"
                : connectionKind,
            ...(providerSettings.binaryPath
              ? { binaryPath: providerSettings.binaryPath }
              : {}),
            ...(providerSettings.serverUrl
              ? { serverUrl: providerSettings.serverUrl }
              : {}),
          },
          lastCapabilitySnapshotId: null,
          createdAt: input.occurredAt,
          updatedAt: input.occurredAt,
        };
        const outcome = yield* capabilitySync
          .sync({
            connection,
            providerKind: provider,
            profile: {
              activities: [...ACTIVITIES],
              tools: [...TOOLS],
              inputModalities: [...modalities],
              outputModalities: ["text"],
              supportsSessionResume: true,
              supportsThreadImport:
                provider === "codex" || provider === "claudeAgent",
              supportsStructuredOutput: true,
              supportsStreaming: true,
            },
            familyAliases: {},
            quota: [],
            health: currentHealth.health,
            healthDetail: currentHealth.detail,
            authenticatedAccountLabel:
              statusByProvider.get(provider)?.authLabel ?? null,
            ...(providerSettings.binaryPath
              ? { binaryPath: providerSettings.binaryPath }
              : {}),
            ...(providerSettings.apiEndpoint
              ? { apiEndpoint: providerSettings.apiEndpoint }
              : {}),
            ...(providerSettings.agentDir
              ? { agentDir: providerSettings.agentDir }
              : {}),
            ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
            discoveredAt: input.occurredAt,
            expiresAt: null,
          })
          .pipe(
            Effect.match({
              onFailure: (error) => ({ error }),
              onSuccess: (snapshot) => ({ snapshot }),
            }),
          );
        if ("snapshot" in outcome) {
          snapshots.push(outcome.snapshot);
        } else {
          failures.push({
            provider,
            detail:
              outcome.error instanceof Error
                ? outcome.error.message
                : String(outcome.error),
          });
        }
      }
      return { snapshots, failures };
    });

  return { refresh } satisfies ProviderCatalogSyncShape;
});

export const ProviderCatalogSyncLive = Layer.effect(
  ProviderCatalogSync,
  makeProviderCatalogSync,
);
