import { createHash } from "node:crypto";

import {
  AgentRoleId,
  ContextArtifactId,
  PermissionGrantId,
  RoutingPolicyId,
  type ContextArtifact,
  type RoutingPolicy,
  type SascodeBootstrapProjectInput,
  type SascodePermissionCapability,
  type SascodePermissionGrant,
} from "@synara/contracts";

export interface SascodeProjectDefaults {
  readonly policy: RoutingPolicy;
  readonly permissionGrant: SascodePermissionGrant;
  readonly contextArtifacts: ReadonlyArray<ContextArtifact>;
}

const ALL_PERMISSIONS: ReadonlyArray<SascodePermissionCapability> = [
  "read-files",
  "write-files",
  "run-safe-commands",
  "run-arbitrary-commands",
  "manage-git",
  "create-worktrees",
  "use-network",
  "control-browser",
  "use-authenticated-browser",
  "upload-files",
  "download-files",
  "manage-processes",
  "read-secrets",
  "use-secrets",
  "install-dependencies",
  "modify-system",
  "publish-code",
  "deploy",
  "send-external-messages",
  "spend-money",
];

const TRUSTED_BUILD_PERMISSIONS: ReadonlyArray<SascodePermissionCapability> = [
  "read-files",
  "write-files",
  "run-safe-commands",
  "run-arbitrary-commands",
  "manage-git",
  "create-worktrees",
  "use-network",
  "control-browser",
  "use-authenticated-browser",
  "upload-files",
  "download-files",
  "manage-processes",
  "install-dependencies",
];

const SAFE_BUILD_PERMISSIONS: ReadonlyArray<SascodePermissionCapability> = [
  "read-files",
  "write-files",
  "run-safe-commands",
  "manage-git",
  "create-worktrees",
];

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

const digest = (value: unknown): string =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");

function permissionCapabilities(
  profile: SascodeBootstrapProjectInput["permissionProfile"],
): ReadonlyArray<SascodePermissionCapability> {
  switch (profile) {
    case "observe":
      return ["read-files"];
    case "safe-build":
      return SAFE_BUILD_PERMISSIONS;
    case "trusted-build":
      return TRUSTED_BUILD_PERMISSIONS;
    case "full-access-isolated":
      return ALL_PERMISSIONS;
    case "custom":
      return [];
  }
}

function contextArtifact(input: {
  readonly id: string;
  readonly projectId: SascodeBootstrapProjectInput["projectId"];
  readonly kind: ContextArtifact["kind"];
  readonly title: string;
  readonly version: number;
  readonly content: string;
  readonly tags: ReadonlyArray<string>;
  readonly occurredAt: string;
}): ContextArtifact {
  return {
    id: ContextArtifactId.makeUnsafe(input.id),
    projectId: input.projectId,
    kind: input.kind,
    title: input.title,
    version: input.version,
    content: input.content,
    contentHash: digest(input.content),
    tags: [...input.tags],
    active: true,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  };
}

export function createSascodeProjectDefaults(
  input: SascodeBootstrapProjectInput,
): SascodeProjectDefaults {
  const experienceArchitectId = AgentRoleId.makeUnsafe(
    "sascode-role:experience-architect",
  );
  const interfaceEngineerId = AgentRoleId.makeUnsafe(
    "sascode-role:interface-engineer",
  );
  const systemsEngineerId = AgentRoleId.makeUnsafe(
    "sascode-role:systems-engineer",
  );
  const browserOperatorId = AgentRoleId.makeUnsafe(
    "sascode-role:browser-operator",
  );
  const independentReviewerId = AgentRoleId.makeUnsafe(
    "sascode-role:independent-reviewer",
  );
  const releaseStewardId = AgentRoleId.makeUnsafe(
    "sascode-role:release-steward",
  );

  const policySemantic = {
    projectId: input.projectId,
    name: `${input.projectName} — design-led delegation`,
    revision: input.policyRevision,
    roles: [
      {
        id: experienceArchitectId,
        key: "experience-architect",
        displayName: "Experience Architect",
        description:
          "Shapes product intent, interaction hierarchy, UX flows, and visual direction before implementation.",
        activities: ["product-strategy", "ux-planning"] as const,
        requiredTools: ["file-read"] as const,
        preferredProviderKeys: ["claude"],
        preferredModelFamilies: ["fable", "sonnet", "opus"],
        forbiddenProviderKeys: [],
        fallbackRoleIds: [interfaceEngineerId],
        defaultPermissionProfile: "safe-build" as const,
        defaultRisk: "low" as const,
      },
      {
        id: interfaceEngineerId,
        key: "interface-engineer",
        displayName: "Interface Engineer",
        description:
          "Builds polished, production-grade interfaces with exacting visual, interaction, accessibility, and responsive quality.",
        activities: ["visual-design", "frontend-implementation"] as const,
        requiredTools: [
          "file-read",
          "file-write",
          "shell",
          "git",
          "worktree",
        ] as const,
        preferredProviderKeys: ["claude"],
        preferredModelFamilies: ["opus", "fable", "sonnet"],
        forbiddenProviderKeys: [],
        fallbackRoleIds: [experienceArchitectId, systemsEngineerId],
        defaultPermissionProfile: input.permissionProfile,
        defaultRisk: "medium" as const,
      },
      {
        id: systemsEngineerId,
        key: "systems-engineer",
        displayName: "Systems Engineer",
        description:
          "Owns backend, infrastructure, data, integrations, durability, tests, and agentic implementation work.",
        activities: [
          "backend-implementation",
          "infrastructure",
          "data",
          "integration",
        ] as const,
        requiredTools: [
          "file-read",
          "file-write",
          "shell",
          "git",
          "worktree",
        ] as const,
        preferredProviderKeys: [
          "codex",
          "gemini",
          "glm",
          "qwen",
          "kimi",
          "opencode",
          "kilo",
        ],
        preferredModelFamilies: ["gpt", "gemini", "glm", "qwen", "kimi"],
        forbiddenProviderKeys: [],
        fallbackRoleIds: [independentReviewerId],
        defaultPermissionProfile: input.permissionProfile,
        defaultRisk: "high" as const,
      },
      {
        id: browserOperatorId,
        key: "browser-operator",
        displayName: "Browser Operator",
        description:
          "Uses isolated authenticated browser instances for research, previews, QA, and controlled web operations.",
        activities: ["browser-operation"] as const,
        requiredTools: ["browser"] as const,
        preferredProviderKeys: ["gemini", "claude", "codex"],
        preferredModelFamilies: ["gemini", "opus", "fable", "gpt"],
        forbiddenProviderKeys: [],
        fallbackRoleIds: [independentReviewerId],
        defaultPermissionProfile: input.permissionProfile,
        defaultRisk: "high" as const,
      },
      {
        id: independentReviewerId,
        key: "independent-reviewer",
        displayName: "Independent Reviewer",
        description:
          "Verifies code, security, tests, accessibility, and visual fidelity with evidence from a provider independent of the implementation.",
        activities: ["testing", "code-review", "security-review"] as const,
        requiredTools: ["file-read", "shell", "git"] as const,
        preferredProviderKeys: ["gemini", "codex", "claude"],
        preferredModelFamilies: ["gemini", "gpt", "opus", "fable", "sonnet"],
        forbiddenProviderKeys: [],
        fallbackRoleIds: [systemsEngineerId],
        defaultPermissionProfile: "safe-build" as const,
        defaultRisk: "medium" as const,
      },
      {
        id: releaseStewardId,
        key: "release-steward",
        displayName: "Release Steward",
        description:
          "Produces documentation, integrates verified work, prepares releases, and records a precise operational handoff.",
        activities: ["documentation", "release"] as const,
        requiredTools: ["file-read", "file-write", "shell", "git"] as const,
        preferredProviderKeys: ["claude", "codex", "gemini"],
        preferredModelFamilies: ["opus", "fable", "sonnet", "gpt", "gemini"],
        forbiddenProviderKeys: [],
        fallbackRoleIds: [systemsEngineerId],
        defaultPermissionProfile: input.permissionProfile,
        defaultRisk: "high" as const,
      },
    ],
    scoreWeights: {
      capability: 5,
      preference: 6,
      availability: 5,
      quality: 4,
      cost: 1,
      latency: 1,
      continuity: 3,
    },
    qualityGates: [
      {
        key: "visual-fidelity",
        label: "Visual fidelity",
        evidenceKinds: [
          "visual-comparison",
          "browser-check",
          "accessibility-check",
        ] as const,
        required: false,
        blockOnFailure: true,
        freshnessSeconds: 1_800,
      },
      {
        key: "focused-verification",
        label: "Focused verification",
        evidenceKinds: ["test", "typecheck", "build"] as const,
        required: false,
        blockOnFailure: true,
        freshnessSeconds: 1_800,
      },
      {
        key: "independent-review",
        label: "Independent provider review",
        evidenceKinds: ["code-review", "security-scan"] as const,
        required: false,
        blockOnFailure: true,
        freshnessSeconds: 3_600,
      },
    ],
    fallbackBehavior: "reroute-same-role" as const,
    maxParallelWorkUnits: Math.max(
      1,
      Math.floor(input.maxParallelWorkUnits),
    ),
    requireDifferentProviderForIndependentReview: true,
    userOverrides: {
      "ui.plan": "claude/fable → claude/sonnet → claude/opus",
      "ui.build": "claude/opus → claude/fable → claude/sonnet",
      "backend.build": "codex/gpt → gemini → glm/qwen/kimi",
      "review.independent": "different provider from implementation",
    },
  };

  const policy: RoutingPolicy = {
    id: RoutingPolicyId.makeUnsafe(
      `sascode:${input.projectId}:design-led-routing`,
    ),
    projectId: input.projectId,
    name: policySemantic.name,
    description:
      "Design-first, subscription-aware delegation: Claude-family models lead UX and interface work; agentic GPT-family models lead systems work; independent providers verify the result.",
    revision: input.policyRevision,
    roles: policySemantic.roles.map((role) => ({
      ...role,
      activities: [...role.activities],
      requiredTools: [...role.requiredTools],
      fallbackRoleIds: [...role.fallbackRoleIds],
    })),
    scoreWeights: policySemantic.scoreWeights,
    qualityGates: policySemantic.qualityGates.map((gate) => ({
      ...gate,
      evidenceKinds: [...gate.evidenceKinds],
    })),
    fallbackBehavior: policySemantic.fallbackBehavior,
    maxParallelWorkUnits: policySemantic.maxParallelWorkUnits,
    requireDifferentProviderForIndependentReview:
      policySemantic.requireDifferentProviderForIndependentReview,
    userOverrides: policySemantic.userOverrides,
    source: canonicalJson({
      template: "sascode.design-led.v1",
      preferences: policySemantic.userOverrides,
    }),
    digest: digest(policySemantic),
    publishedAt: input.occurredAt,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  };

  const permissionGrant: SascodePermissionGrant = {
    id: PermissionGrantId.makeUnsafe(
      `sascode:${input.projectId}:grant:${input.permissionProfile}:r${input.policyRevision}`,
    ),
    scope: {
      projectId: input.projectId,
      threadId: null,
      workflowId: null,
      workUnitId: null,
    },
    profile: input.permissionProfile,
    capabilities: [...permissionCapabilities(input.permissionProfile)],
    boundary: {
      workspaceRoots: [...input.workspaceRoots],
      allowedHosts: [...input.allowedHosts],
      deniedResources: [],
      isolatedExecutionRequired:
        input.permissionProfile === "full-access-isolated",
      expiresAt: null,
    },
    grantedBy: "session-owner",
    reason:
      "Project permission preset explicitly selected during SASCODE project bootstrap.",
    createdAt: input.occurredAt,
    revokedAt: null,
  };

  const contextArtifacts: ContextArtifact[] = [
    contextArtifact({
      id: `sascode:${input.projectId}:project-charter`,
      projectId: input.projectId,
      kind: "project-charter",
      title: `${input.projectName} project charter`,
      version: input.policyRevision,
      content:
        input.projectCharter ??
        `${input.projectName} is a SASCODE project using design-led model delegation, evidence-backed handoffs, and isolated parallel execution.`,
      tags: ["sascode", "project", "charter"],
      occurredAt: input.occurredAt,
    }),
  ];
  if (input.designContract !== undefined) {
    contextArtifacts.push(
      contextArtifact({
        id: `sascode:${input.projectId}:design-contract`,
        projectId: input.projectId,
        kind: "design-contract",
        title: `${input.projectName} design contract`,
        version: input.policyRevision,
        content: input.designContract,
        tags: ["sascode", "design", "ui", "ux"],
        occurredAt: input.occurredAt,
      }),
    );
  }
  if (input.globalTasteProfile !== undefined) {
    contextArtifacts.push(
      contextArtifact({
        id: `sascode:${input.projectId}:taste-profile`,
        projectId: input.projectId,
        kind: "global-taste-profile",
        title: "Global taste profile",
        version: input.policyRevision,
        content: input.globalTasteProfile,
        tags: ["sascode", "taste", "brand"],
        occurredAt: input.occurredAt,
      }),
    );
  }

  return {
    policy,
    permissionGrant,
    contextArtifacts,
  };
}
