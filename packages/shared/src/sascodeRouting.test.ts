import {
  AgentRoleId,
  CapabilitySnapshotId,
  ProviderConnectionId,
  ProjectId,
  RoutingPolicyId,
  WorkUnitId,
  type ProviderCapabilitySnapshot,
  type RoutingPolicy,
  type SascodeModelDescriptor,
} from "@synara/contracts";
import { describe, expect, it } from "vitest";

import { evaluateRouting } from "./sascodeRouting";

const model = (
  slug: string,
  family: string,
  activities: SascodeModelDescriptor["capability"]["activities"],
  tools: SascodeModelDescriptor["capability"]["tools"],
  supportsSessionResume = true,
): SascodeModelDescriptor => ({
  slug,
  family,
  displayName: slug,
  capability: {
    activities,
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tools,
    supportsReasoningControl: true,
    supportsSessionResume,
    supportsThreadImport: false,
    supportsStructuredOutput: true,
    supportsStreaming: true,
  },
});

const snapshot = (
  providerKey: string,
  models: ReadonlyArray<SascodeModelDescriptor>,
  health: ProviderCapabilitySnapshot["health"] = "ready",
): ProviderCapabilitySnapshot => ({
  id: CapabilitySnapshotId.makeUnsafe(`snapshot-${providerKey}`),
  connectionId: ProviderConnectionId.makeUnsafe(`connection-${providerKey}`),
  providerKey,
  displayName: providerKey,
  connectionKind: "subscription-cli",
  health,
  healthDetail: null,
  models: [...models],
  quota: [],
  authenticatedAccountLabel: `${providerKey} account`,
  discoveredAt: "2026-07-30T00:00:00.000Z",
  expiresAt: "2026-07-31T00:00:00.000Z",
});

const policy: RoutingPolicy = {
  id: RoutingPolicyId.makeUnsafe("policy-design-first"),
  projectId: ProjectId.makeUnsafe("project-sascode"),
  name: "Design-first delegation",
  description: "Use Claude for visual work and coding agents for backend work.",
  revision: 1,
  roles: [
    {
      id: AgentRoleId.makeUnsafe("visual-designer"),
      key: "visual-designer",
      displayName: "Visual Designer",
      description: "Owns visual design and frontend expression.",
      activities: ["visual-design", "frontend-implementation"],
      requiredTools: ["file-read", "file-write"],
      preferredProviderKeys: ["claude"],
      preferredModelFamilies: ["opus"],
      forbiddenProviderKeys: [],
      fallbackRoleIds: [],
      defaultPermissionProfile: "trusted-build",
      defaultRisk: "medium",
    },
    {
      id: AgentRoleId.makeUnsafe("backend-engineer"),
      key: "backend-engineer",
      displayName: "Backend Engineer",
      description: "Owns server and orchestration work.",
      activities: ["backend-implementation"],
      requiredTools: ["file-read", "file-write", "shell", "git"],
      preferredProviderKeys: ["codex"],
      preferredModelFamilies: ["gpt-agentic"],
      forbiddenProviderKeys: [],
      fallbackRoleIds: [],
      defaultPermissionProfile: "full-access-isolated",
      defaultRisk: "high",
    },
  ],
  scoreWeights: {
    capability: 4,
    preference: 3,
    availability: 3,
    quality: 2,
    cost: 1,
    latency: 1,
    continuity: 1,
  },
  qualityGates: [],
  fallbackBehavior: "reroute-same-role",
  maxParallelWorkUnits: 4,
  requireDifferentProviderForIndependentReview: true,
  userOverrides: {},
  source: "design-first",
  digest: "policy-digest",
  publishedAt: "2026-07-30T00:00:00.000Z",
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-30T00:00:00.000Z",
};

const snapshots = [
  snapshot("claude", [
    model(
      "claude-opus",
      "opus",
      ["visual-design", "frontend-implementation"],
      ["file-read", "file-write", "shell"],
    ),
  ]),
  snapshot("codex", [
    model(
      "gpt-agent",
      "gpt-agentic",
      ["backend-implementation", "testing"],
      ["file-read", "file-write", "shell", "git", "worktree"],
    ),
  ]),
];

describe("evaluateRouting", () => {
  it("selects the preferred capable design model for visual work", () => {
    const result = evaluateRouting({
      policy,
      roleId: AgentRoleId.makeUnsafe("visual-designer"),
      activity: "visual-design",
      snapshots,
      now: "2026-07-30T12:00:00.000Z",
    });

    expect("_tag" in result).toBe(false);
    if ("_tag" in result) return;
    expect(result.selected?.providerKey).toBe("claude");
    expect(result.selected?.modelSlug).toBe("claude-opus");
    expect(result.fallbackOrder).toEqual([]);
  });

  it("selects the backend coding model and rejects activity mismatches", () => {
    const result = evaluateRouting({
      policy,
      roleId: AgentRoleId.makeUnsafe("backend-engineer"),
      activity: "backend-implementation",
      snapshots,
    });

    expect("_tag" in result).toBe(false);
    if ("_tag" in result) return;
    expect(result.selected?.providerKey).toBe("codex");
    expect(result.candidates.find((candidate) => candidate.target.providerKey === "claude"))
      .toMatchObject({
        eligible: false,
        score: -1,
      });
  });

  it("enforces independent-provider and health constraints", () => {
    const sourceId = WorkUnitId.makeUnsafe("work-unit-source");
    const result = evaluateRouting({
      policy,
      roleId: AgentRoleId.makeUnsafe("backend-engineer"),
      activity: "backend-implementation",
      snapshots: [
        ...snapshots,
        snapshot(
          "glm",
          [
            model(
              "glm-code",
              "glm",
              ["backend-implementation"],
              ["file-read", "file-write", "shell", "git"],
            ),
          ],
          "usage-limited",
        ),
      ],
      constraints: [
        {
          type: "different-provider-from-work-unit",
          workUnitId: sourceId,
        },
      ],
      priorProviderByWorkUnitId: new Map([[sourceId, "codex"]]),
    });

    expect("_tag" in result && result._tag).toBe("no-eligible-target");
    if (!("_tag" in result) || result._tag !== "no-eligible-target") return;
    expect(
      result.candidates.find((candidate) => candidate.target.providerKey === "codex")
        ?.rejectedReasons,
    ).toContain(`Independent review must use a different provider than ${sourceId}.`);
    expect(
      result.candidates.find((candidate) => candidate.target.providerKey === "glm")
        ?.rejectedReasons,
    ).toContain("Provider connection is usage-limited.");
  });

  it("prefers the higher-priority account when model capabilities tie", () => {
    const base = snapshots[0]!;
    const result = evaluateRouting({
      policy,
      roleId: AgentRoleId.makeUnsafe("visual-designer"),
      activity: "visual-design",
      snapshots: [
        {
          ...base,
          id: CapabilitySnapshotId.makeUnsafe("snapshot-claude-personal"),
          connectionId: ProviderConnectionId.makeUnsafe(
            "connection-claude-personal",
          ),
          connectionPriority: 50,
        },
        {
          ...base,
          id: CapabilitySnapshotId.makeUnsafe("snapshot-claude-studio"),
          connectionId: ProviderConnectionId.makeUnsafe(
            "connection-claude-studio",
          ),
          connectionPriority: 120,
        },
      ],
    });

    expect("_tag" in result).toBe(false);
    if ("_tag" in result) return;
    expect(result.selected?.connectionId).toBe("connection-claude-studio");
    expect(result.fallbackOrder[0]?.connectionId).toBe(
      "connection-claude-personal",
    );
  });
});
