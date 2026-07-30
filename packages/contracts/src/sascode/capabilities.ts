import { Schema } from "effect";

import { IsoDateTime, TrimmedNonEmptyString } from "../baseSchemas";
import { ProviderKind } from "../orchestration";
import {
  CapabilitySnapshotId,
  ProviderConnectionId,
  SascodeActivityType,
  SascodeStringMap,
} from "./core";

export const ProviderConnectionKind = Schema.Literals([
  "subscription-cli",
  "api",
  "acp",
  "local-runtime",
  "remote-runtime",
]);
export type ProviderConnectionKind = typeof ProviderConnectionKind.Type;

export const ProviderConnectionHealth = Schema.Literals([
  "ready",
  "degraded",
  "rate-limited",
  "usage-limited",
  "needs-auth",
  "unavailable",
]);
export type ProviderConnectionHealth = typeof ProviderConnectionHealth.Type;

export const SascodeModelModality = Schema.Literals(["text", "image", "audio", "video"]);
export type SascodeModelModality = typeof SascodeModelModality.Type;

export const SascodeToolCapability = Schema.Literals([
  "file-read",
  "file-write",
  "shell",
  "git",
  "worktree",
  "browser",
  "computer-use",
  "mcp",
  "subagents",
  "image-generation",
  "web-search",
]);
export type SascodeToolCapability = typeof SascodeToolCapability.Type;

export const SascodeModelCapability = Schema.Struct({
  activities: Schema.Array(SascodeActivityType).check(Schema.isMaxLength(64)),
  inputModalities: Schema.Array(SascodeModelModality).check(Schema.isMaxLength(8)),
  outputModalities: Schema.Array(SascodeModelModality).check(Schema.isMaxLength(8)),
  tools: Schema.Array(SascodeToolCapability).check(Schema.isMaxLength(32)),
  contextWindowTokens: Schema.optional(Schema.Number),
  supportsReasoningControl: Schema.Boolean,
  supportsSessionResume: Schema.Boolean,
  supportsThreadImport: Schema.Boolean,
  supportsStructuredOutput: Schema.Boolean,
  supportsStreaming: Schema.Boolean,
});
export type SascodeModelCapability = typeof SascodeModelCapability.Type;

export const SascodeModelDescriptor = Schema.Struct({
  slug: TrimmedNonEmptyString,
  family: TrimmedNonEmptyString,
  displayName: TrimmedNonEmptyString,
  capability: SascodeModelCapability,
  optionDefaults: Schema.optional(SascodeStringMap),
  deprecated: Schema.optional(Schema.Boolean),
});
export type SascodeModelDescriptor = typeof SascodeModelDescriptor.Type;

export const ProviderQuotaWindow = Schema.Struct({
  label: TrimmedNonEmptyString,
  usedFraction: Schema.optional(Schema.Number),
  remaining: Schema.optional(Schema.Number),
  resetsAt: Schema.optional(Schema.NullOr(IsoDateTime)),
});
export type ProviderQuotaWindow = typeof ProviderQuotaWindow.Type;

export const ProviderCapabilitySnapshot = Schema.Struct({
  id: CapabilitySnapshotId,
  connectionId: ProviderConnectionId,
  providerKey: TrimmedNonEmptyString,
  providerKind: Schema.optional(ProviderKind),
  displayName: TrimmedNonEmptyString,
  connectionKind: ProviderConnectionKind,
  health: ProviderConnectionHealth,
  healthDetail: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  models: Schema.Array(SascodeModelDescriptor).check(Schema.isMaxLength(512)),
  quota: Schema.Array(ProviderQuotaWindow).check(Schema.isMaxLength(32)),
  authenticatedAccountLabel: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  discoveredAt: IsoDateTime,
  expiresAt: Schema.optional(Schema.NullOr(IsoDateTime)),
});
export type ProviderCapabilitySnapshot = typeof ProviderCapabilitySnapshot.Type;

export const ProviderConnection = Schema.Struct({
  id: ProviderConnectionId,
  providerKey: TrimmedNonEmptyString,
  displayName: TrimmedNonEmptyString,
  connectionKind: ProviderConnectionKind,
  enabled: Schema.Boolean,
  priority: Schema.Number,
  config: SascodeStringMap,
  lastCapabilitySnapshotId: Schema.optional(Schema.NullOr(CapabilitySnapshotId)),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ProviderConnection = typeof ProviderConnection.Type;

export const ResolvedModelTarget = Schema.Struct({
  connectionId: ProviderConnectionId,
  providerKey: TrimmedNonEmptyString,
  providerKind: Schema.optional(ProviderKind),
  modelSlug: TrimmedNonEmptyString,
  modelFamily: TrimmedNonEmptyString,
  options: SascodeStringMap,
});
export type ResolvedModelTarget = typeof ResolvedModelTarget.Type;
