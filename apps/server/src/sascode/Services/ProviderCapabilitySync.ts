import {
  IsoDateTime,
  ProviderCapabilitySnapshot,
  ProviderConnection,
  ProviderKind,
  ProviderQuotaWindow,
  SascodeActivityType,
  SascodeModelModality,
  SascodeStringMap,
  SascodeToolCapability,
} from "@synara/contracts";
import { Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";
import type { ProviderDiscoveryError } from "../../provider/Services/ProviderDiscoveryService.ts";

export const DiscoveredCapabilityProfile = Schema.Struct({
  activities: Schema.Array(SascodeActivityType),
  tools: Schema.Array(SascodeToolCapability),
  inputModalities: Schema.Array(SascodeModelModality),
  outputModalities: Schema.Array(SascodeModelModality),
  supportsSessionResume: Schema.Boolean,
  supportsThreadImport: Schema.Boolean,
  supportsStructuredOutput: Schema.Boolean,
  supportsStreaming: Schema.Boolean,
});
export type DiscoveredCapabilityProfile =
  typeof DiscoveredCapabilityProfile.Type;

export const SyncProviderCapabilityInput = Schema.Struct({
  connection: ProviderConnection,
  providerKind: ProviderKind,
  profile: DiscoveredCapabilityProfile,
  familyAliases: SascodeStringMap,
  quota: Schema.Array(ProviderQuotaWindow),
  health: Schema.optional(ProviderCapabilitySnapshot.fields.health),
  healthDetail: Schema.optional(Schema.NullOr(Schema.String)),
  authenticatedAccountLabel: Schema.optional(Schema.NullOr(Schema.String)),
  binaryPath: Schema.optional(Schema.String),
  apiEndpoint: Schema.optional(Schema.String),
  agentDir: Schema.optional(Schema.String),
  cwd: Schema.optional(Schema.String),
  discoveredAt: IsoDateTime,
  expiresAt: Schema.optional(Schema.NullOr(IsoDateTime)),
});
export type SyncProviderCapabilityInput =
  typeof SyncProviderCapabilityInput.Type;

export type ProviderCapabilitySyncError =
  | ProviderDiscoveryError
  | ProjectionRepositoryError;

export interface ProviderCapabilitySyncShape {
  readonly sync: (
    input: SyncProviderCapabilityInput,
  ) => Effect.Effect<ProviderCapabilitySnapshot, ProviderCapabilitySyncError>;
}

export class ProviderCapabilitySync extends ServiceMap.Service<
  ProviderCapabilitySync,
  ProviderCapabilitySyncShape
>()("sascode/Services/ProviderCapabilitySync") {}
