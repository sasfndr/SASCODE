import {
  ProjectId,
  SascodeBootstrapProjectResult,
} from "@synara/contracts";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { createSascodeProjectDefaults } from "./projectDefaults.ts";

const input = {
  projectId: ProjectId.makeUnsafe("project-sascode-defaults"),
  projectName: "SASCODE",
  workspaceRoots: ["/Users/sas/Documents/SASCODE"],
  allowedHosts: ["*"],
  permissionProfile: "full-access-isolated" as const,
  policyRevision: 1,
  maxParallelWorkUnits: 6,
  projectCharter: "Build the most beautiful and organized code harness.",
  designContract: "Minimal, calm, liquid-glass, spatial, and hierarchy-first.",
  globalTasteProfile: "Design quality is the first product constraint.",
  occurredAt: "2026-07-30T18:30:00.000Z",
};

describe("SASCODE project defaults", () => {
  it("creates a schema-valid design-led policy and full isolated permission grant", () => {
    const defaults = createSascodeProjectDefaults(input);
    const decoded = Schema.decodeUnknownSync(SascodeBootstrapProjectResult)({
      ...defaults,
      contextArtifacts: [...defaults.contextArtifacts],
      policyCreated: true,
      permissionGrantCreated: true,
      layoutCreated: true,
    });

    expect(decoded.policy.maxParallelWorkUnits).toBe(6);
    expect(decoded.policy.requireDifferentProviderForIndependentReview).toBe(true);
    expect(decoded.permissionGrant.capabilities).toHaveLength(20);
    expect(decoded.permissionGrant.boundary).toMatchObject({
      workspaceRoots: ["/Users/sas/Documents/SASCODE"],
      allowedHosts: ["*"],
      isolatedExecutionRequired: true,
    });
    expect(decoded.contextArtifacts.map(({ kind }) => kind)).toEqual([
      "project-charter",
      "design-contract",
      "global-taste-profile",
    ]);
    expect(decoded.layout).toMatchObject({
      presetKey: "stillspace",
      mode: "focus",
      layoutMode: "freeform",
    });
    expect(decoded.layout.modules.map(({ moduleType }) => moduleType)).toEqual([
      "agent-chat",
      "session-shelf",
    ]);

    const uiPlan = decoded.policy.roles.find(
      ({ key }) => key === "experience-architect",
    );
    const uiBuild = decoded.policy.roles.find(
      ({ key }) => key === "interface-engineer",
    );
    const backend = decoded.policy.roles.find(
      ({ key }) => key === "systems-engineer",
    );
    expect(uiPlan?.preferredModelFamilies.slice(0, 3)).toEqual([
      "fable",
      "sonnet",
      "opus",
    ]);
    expect(uiBuild?.preferredModelFamilies.slice(0, 3)).toEqual([
      "opus",
      "fable",
      "sonnet",
    ]);
    expect(backend?.preferredProviderKeys.slice(0, 2)).toEqual([
      "codex",
      "gemini",
    ]);
  });

  it("is deterministic for the same project bootstrap request", () => {
    const first = createSascodeProjectDefaults(input);
    const second = createSascodeProjectDefaults(input);
    expect(second).toEqual(first);
    expect(first.policy.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(
      first.contextArtifacts.every(({ contentHash }) =>
        /^[0-9a-f]{64}$/.test(contentHash),
      ),
    ).toBe(true);
  });
});
