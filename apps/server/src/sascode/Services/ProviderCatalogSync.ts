import {
  IsoDateTime,
  ProviderCatalogRefreshResult,
  ServerSettingsError,
} from "@synara/contracts";
import { Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProviderCapabilitySyncError } from "./ProviderCapabilitySync.ts";

export type ProviderCatalogSyncError =
  | ProviderCapabilitySyncError
  | ServerSettingsError;

export const RefreshProviderCatalogInput = Schema.Struct({
  occurredAt: IsoDateTime,
  cwd: Schema.optional(Schema.String),
});
export type RefreshProviderCatalogInput =
  typeof RefreshProviderCatalogInput.Type;

export interface ProviderCatalogSyncShape {
  readonly refresh: (
    input: RefreshProviderCatalogInput,
  ) => Effect.Effect<ProviderCatalogRefreshResult, ProviderCatalogSyncError>;
}

export class ProviderCatalogSync extends ServiceMap.Service<
  ProviderCatalogSync,
  ProviderCatalogSyncShape
>()("sascode/Services/ProviderCatalogSync") {}
