import {
  BrowserControlOwner,
  BrowserInstance,
  BrowserInstanceId,
  BrowserProfile,
  BrowserProfileId,
  IsoDateTime,
  ProjectId,
} from "@synara/contracts";
import { Option, Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";

export const GetBrowserProfileInput = Schema.Struct({
  profileId: BrowserProfileId,
});
export type GetBrowserProfileInput = typeof GetBrowserProfileInput.Type;

export const ListBrowserProfilesInput = Schema.Struct({
  projectId: Schema.NullOr(ProjectId),
});
export type ListBrowserProfilesInput = typeof ListBrowserProfilesInput.Type;

export const GetBrowserInstanceInput = Schema.Struct({
  instanceId: BrowserInstanceId,
});
export type GetBrowserInstanceInput = typeof GetBrowserInstanceInput.Type;

export const ListBrowserInstancesInput = Schema.Struct({
  projectId: ProjectId,
});
export type ListBrowserInstancesInput = typeof ListBrowserInstancesInput.Type;

export const AcquireBrowserControlInput = Schema.Struct({
  instanceId: BrowserInstanceId,
  owner: BrowserControlOwner,
  expectedAuthorizationEpoch: Schema.Number,
  leaseExpiresAt: IsoDateTime,
  now: IsoDateTime,
});
export type AcquireBrowserControlInput =
  typeof AcquireBrowserControlInput.Type;

export const ReleaseBrowserControlInput = Schema.Struct({
  instanceId: BrowserInstanceId,
  expectedAuthorizationEpoch: Schema.Number,
  now: IsoDateTime,
});
export type ReleaseBrowserControlInput =
  typeof ReleaseBrowserControlInput.Type;

export const UpdateBrowserInstanceInput = Schema.Struct({
  instance: BrowserInstance,
  expectedRuntimeGeneration: Schema.Number,
  expectedAuthorizationEpoch: Schema.Number,
});
export type UpdateBrowserInstanceInput =
  typeof UpdateBrowserInstanceInput.Type;

export interface BrowserWorkspaceRepositoryShape {
  readonly saveProfile: (
    profile: BrowserProfile,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  readonly getProfile: (
    input: GetBrowserProfileInput,
  ) => Effect.Effect<Option.Option<BrowserProfile>, ProjectionRepositoryError>;

  readonly listProfiles: (
    input: ListBrowserProfilesInput,
  ) => Effect.Effect<ReadonlyArray<BrowserProfile>, ProjectionRepositoryError>;

  readonly createInstance: (
    instance: BrowserInstance,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  readonly getInstance: (
    input: GetBrowserInstanceInput,
  ) => Effect.Effect<Option.Option<BrowserInstance>, ProjectionRepositoryError>;

  readonly listInstances: (
    input: ListBrowserInstancesInput,
  ) => Effect.Effect<ReadonlyArray<BrowserInstance>, ProjectionRepositoryError>;

  readonly acquireControl: (
    input: AcquireBrowserControlInput,
  ) => Effect.Effect<Option.Option<BrowserInstance>, ProjectionRepositoryError>;

  readonly releaseControl: (
    input: ReleaseBrowserControlInput,
  ) => Effect.Effect<Option.Option<BrowserInstance>, ProjectionRepositoryError>;

  readonly updateInstance: (
    input: UpdateBrowserInstanceInput,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;
}

export class BrowserWorkspaceRepository extends ServiceMap.Service<
  BrowserWorkspaceRepository,
  BrowserWorkspaceRepositoryShape
>()("sascode/Services/BrowserWorkspaceRepository") {}
