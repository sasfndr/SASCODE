import {
  ProviderConnectionId,
  type ProviderAccount,
} from "@synara/contracts";
import { describe, expect, it } from "vitest";

import {
  providerAccountToConnection,
  providerConnectionToAccount,
  providerStartOptionsForConnection,
} from "./providerAccounts.ts";

const now = "2026-07-31T03:00:00.000Z";

describe("provider account profiles", () => {
  it("round-trips a Claude subscription profile without storing credentials", () => {
    const account: ProviderAccount = {
      id: ProviderConnectionId.makeUnsafe("provider:claudeAgent:studio"),
      providerKey: "claude",
      providerKind: "claudeAgent",
      displayName: "Claude Max — Studio",
      accountLabel: "studio@example.com",
      connectionKind: "subscription-cli",
      enabled: true,
      priority: 120,
      launchProfile: {
        binaryPath: "/opt/homebrew/bin/claude",
        configDir: "/Users/sas/.claude-studio",
      },
      lastCapabilitySnapshotId: null,
      createdAt: now,
      updatedAt: now,
    };

    const connection = providerAccountToConnection(account);
    expect(connection.config).toEqual({
      providerKind: "claudeAgent",
      credentialMode: "cli-subscription",
      accountLabel: "studio@example.com",
      binaryPath: "/opt/homebrew/bin/claude",
      configDir: "/Users/sas/.claude-studio",
    });
    expect(providerConnectionToAccount(connection)).toEqual(account);
    expect(providerStartOptionsForConnection(connection)).toEqual({
      providerConnectionId: "provider:claudeAgent:studio",
      providerAccountLabel: "studio@example.com",
      claudeAgent: {
        binaryPath: "/opt/homebrew/bin/claude",
        configDir: "/Users/sas/.claude-studio",
      },
    });
  });

  it("maps dedicated homes for every home-isolated subscription adapter", () => {
    for (const providerKind of [
      "codex",
      "cursor",
      "antigravity",
      "grok",
      "droid",
    ] as const) {
      const connection = providerAccountToConnection({
        id: ProviderConnectionId.makeUnsafe(`provider:${providerKind}:second`),
        providerKey: providerKind,
        providerKind,
        displayName: `${providerKind} second`,
        accountLabel: null,
        connectionKind: "subscription-cli",
        enabled: true,
        priority: 90,
        launchProfile: { homePath: `/profiles/${providerKind}/second` },
        lastCapabilitySnapshotId: null,
        createdAt: now,
        updatedAt: now,
      });
      const options = providerStartOptionsForConnection(connection);
      expect(options?.providerConnectionId).toBe(
        `provider:${providerKind}:second`,
      );
      expect(options?.[providerKind]?.homePath).toBe(
        `/profiles/${providerKind}/second`,
      );
    }
  });
});
