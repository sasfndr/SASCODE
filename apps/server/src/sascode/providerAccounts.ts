import {
  ProviderKind,
  type ProviderAccount,
  type ProviderConnection,
  type ProviderStartOptions,
} from "@synara/contracts";
import { Schema } from "effect";

const CONFIG_KEYS = [
  "binaryPath",
  "homePath",
  "configDir",
  "apiEndpoint",
  "serverUrl",
  "agentDir",
] as const;

const compactLaunchProfile = (
  config: ProviderConnection["config"],
): ProviderAccount["launchProfile"] =>
  Object.fromEntries(
    CONFIG_KEYS.flatMap((key) => {
      const value = config[key]?.trim();
      return value ? [[key, value] as const] : [];
    }),
  );

export function providerAccountToConnection(
  account: ProviderAccount,
): ProviderConnection {
  return {
    id: account.id,
    providerKey: account.providerKey,
    displayName: account.displayName,
    connectionKind: account.connectionKind,
    enabled: account.enabled,
    priority: account.priority,
    config: {
      providerKind: account.providerKind,
      credentialMode:
        account.connectionKind === "subscription-cli"
          ? "cli-subscription"
          : account.connectionKind,
      ...(account.accountLabel === null
        ? {}
        : { accountLabel: account.accountLabel }),
      ...account.launchProfile,
    },
    lastCapabilitySnapshotId: account.lastCapabilitySnapshotId ?? null,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

export function providerConnectionToAccount(
  connection: ProviderConnection,
): ProviderAccount | null {
  const providerKind = connection.config.providerKind;
  if (!Schema.is(ProviderKind)(providerKind)) return null;
  const accountLabel = connection.config.accountLabel?.trim() || null;
  return {
    id: connection.id,
    providerKey: connection.providerKey,
    providerKind,
    displayName: connection.displayName,
    accountLabel,
    connectionKind: connection.connectionKind,
    enabled: connection.enabled,
    priority: connection.priority,
    launchProfile: compactLaunchProfile(connection.config),
    lastCapabilitySnapshotId: connection.lastCapabilitySnapshotId ?? null,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

/**
 * Translate a durable SASCODE account into provider launch options.
 *
 * The connection id is carried independently of the model so routing can
 * distinguish two accounts that expose identical model slugs.
 */
export function providerStartOptionsForConnection(
  connection: ProviderConnection,
): ProviderStartOptions | null {
  const account = providerConnectionToAccount(connection);
  if (account === null) return null;
  const common = {
    providerConnectionId: account.id,
    ...(account.accountLabel
      ? { providerAccountLabel: account.accountLabel }
      : {}),
  };
  const profile = account.launchProfile;
  switch (account.providerKind) {
    case "codex":
      return {
        ...common,
        codex: {
          ...(profile.binaryPath ? { binaryPath: profile.binaryPath } : {}),
          ...(profile.homePath ? { homePath: profile.homePath } : {}),
        },
      };
    case "claudeAgent":
      return {
        ...common,
        claudeAgent: {
          ...(profile.binaryPath ? { binaryPath: profile.binaryPath } : {}),
          ...(profile.configDir ? { configDir: profile.configDir } : {}),
        },
      };
    case "cursor":
      return {
        ...common,
        cursor: {
          ...(profile.binaryPath ? { binaryPath: profile.binaryPath } : {}),
          ...(profile.apiEndpoint ? { apiEndpoint: profile.apiEndpoint } : {}),
          ...(profile.homePath ? { homePath: profile.homePath } : {}),
        },
      };
    case "antigravity":
      return {
        ...common,
        antigravity: {
          ...(profile.binaryPath ? { binaryPath: profile.binaryPath } : {}),
          ...(profile.homePath ? { homePath: profile.homePath } : {}),
        },
      };
    case "grok":
      return {
        ...common,
        grok: {
          ...(profile.binaryPath ? { binaryPath: profile.binaryPath } : {}),
          ...(profile.homePath ? { homePath: profile.homePath } : {}),
        },
      };
    case "droid":
      return {
        ...common,
        droid: {
          ...(profile.binaryPath ? { binaryPath: profile.binaryPath } : {}),
          ...(profile.homePath ? { homePath: profile.homePath } : {}),
        },
      };
    case "kilo":
      return {
        ...common,
        kilo: {
          ...(profile.binaryPath ? { binaryPath: profile.binaryPath } : {}),
          ...(profile.serverUrl ? { serverUrl: profile.serverUrl } : {}),
        },
      };
    case "opencode":
      return {
        ...common,
        opencode: {
          ...(profile.binaryPath ? { binaryPath: profile.binaryPath } : {}),
          ...(profile.serverUrl ? { serverUrl: profile.serverUrl } : {}),
        },
      };
    case "pi":
      return {
        ...common,
        pi: {
          ...(profile.binaryPath ? { binaryPath: profile.binaryPath } : {}),
          ...(profile.agentDir ? { agentDir: profile.agentDir } : {}),
        },
      };
  }
}
