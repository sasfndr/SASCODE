import { createHash } from "node:crypto";

import {
  CapabilitySnapshotId,
  type ProviderCapabilitySnapshot,
  type ProviderModelDescriptor,
  type SascodeModelDescriptor,
} from "@synara/contracts";
import { Effect, Layer, Option } from "effect";

import { ProviderDiscoveryService } from "../../provider/Services/ProviderDiscoveryService.ts";
import {
  ProviderCapabilitySync,
  type ProviderCapabilitySyncShape,
} from "../Services/ProviderCapabilitySync.ts";
import { RoutingRepository } from "../Services/RoutingRepository.ts";

const KNOWN_MODEL_FAMILIES = [
  "opus",
  "sonnet",
  "haiku",
  "gemini",
  "glm",
  "qwen",
  "gpt",
  "grok",
  "deepseek",
  "mistral",
  "llama",
] as const;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
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

const sha256 = (value: unknown): string =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");

function inferFamily(
  model: ProviderModelDescriptor,
  aliases: Readonly<Record<string, string>>,
): string {
  const alias = aliases[model.slug] ?? aliases[model.resolvedModel ?? ""];
  if (alias) return alias;
  const searchable = `${model.slug} ${model.resolvedModel ?? ""} ${model.name}`.toLowerCase();
  return (
    KNOWN_MODEL_FAMILIES.find((family) => searchable.includes(family)) ??
    model.upstreamProviderId ??
    model.slug
  );
}

function modelOptionDefaults(
  model: ProviderModelDescriptor,
): Readonly<Record<string, string>> {
  const options: Record<string, string> = {};
  if (model.defaultReasoningEffort) {
    options.reasoningEffort = model.defaultReasoningEffort;
  }
  if (model.defaultContextWindow) {
    options.contextWindow = model.defaultContextWindow;
  }
  if (model.supportsFastMode === true) {
    options.fastMode = "false";
  }
  if (model.supportsThinkingToggle === true) {
    options.thinking = "true";
  }
  return options;
}

function capabilityModel(
  model: ProviderModelDescriptor,
  input: Parameters<ProviderCapabilitySyncShape["sync"]>[0],
): SascodeModelDescriptor {
  return {
    slug: model.resolvedModel ?? model.slug,
    family: inferFamily(model, input.familyAliases),
    displayName: model.name,
    capability: {
      activities: [...input.profile.activities],
      inputModalities: [...input.profile.inputModalities],
      outputModalities: [...input.profile.outputModalities],
      tools: [...input.profile.tools],
      supportsReasoningControl:
        (model.supportedReasoningEfforts?.length ?? 0) > 0 ||
        model.supportsThinkingToggle === true,
      supportsSessionResume: input.profile.supportsSessionResume,
      supportsThreadImport: input.profile.supportsThreadImport,
      supportsStructuredOutput: input.profile.supportsStructuredOutput,
      supportsStreaming: input.profile.supportsStreaming,
    },
    optionDefaults: modelOptionDefaults(model),
  };
}

const makeProviderCapabilitySync = Effect.gen(function* () {
  const discovery = yield* ProviderDiscoveryService;
  const routing = yield* RoutingRepository;

  const sync: ProviderCapabilitySyncShape["sync"] = (input) =>
    Effect.gen(function* () {
      yield* routing.upsertConnection(input.connection);
      const discovered = yield* discovery.listModels({
        provider: input.providerKind,
        ...(input.binaryPath === undefined ? {} : { binaryPath: input.binaryPath }),
        ...(input.apiEndpoint === undefined ? {} : { apiEndpoint: input.apiEndpoint }),
        ...(input.agentDir === undefined ? {} : { agentDir: input.agentDir }),
        ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
      });
      const models = discovered.models.map((model) => capabilityModel(model, input));
      const inferredHealth: ProviderCapabilitySnapshot["health"] =
        discovered.source === "disabled"
          ? "unavailable"
          : discovered.source === "unsupported"
            ? "degraded"
            : models.length === 0
              ? "degraded"
              : "ready";
      const digest = sha256({
        connectionId: input.connection.id,
        providerKey: input.connection.providerKey,
        providerKind: input.providerKind,
        models,
        quota: input.quota,
        health: input.health ?? inferredHealth,
        source: discovered.source,
      });
      const snapshot: ProviderCapabilitySnapshot = {
        id: CapabilitySnapshotId.makeUnsafe(
          `capability-${input.connection.id}-${digest.slice(0, 20)}`,
        ),
        connectionId: input.connection.id,
        providerKey: input.connection.providerKey,
        providerKind: input.providerKind,
        displayName: input.connection.displayName,
        connectionKind: input.connection.connectionKind,
        health: input.health ?? inferredHealth,
        healthDetail:
          input.healthDetail ??
          (models.length === 0
            ? `Model discovery returned no models (${discovered.source ?? "unknown source"}).`
            : null),
        models,
        quota: [...input.quota],
        authenticatedAccountLabel: input.authenticatedAccountLabel ?? null,
        discoveredAt: input.discoveredAt,
        expiresAt: input.expiresAt ?? null,
      };
      const inserted = yield* routing.saveCapabilitySnapshot({ snapshot, digest });
      if (inserted) return snapshot;

      const existing = yield* routing.getCapabilitySnapshot({
        snapshotId: snapshot.id,
      });
      return Option.getOrElse(existing, () => snapshot);
    });

  return { sync } satisfies ProviderCapabilitySyncShape;
});

export const ProviderCapabilitySyncLive = Layer.effect(
  ProviderCapabilitySync,
  makeProviderCapabilitySync,
);
