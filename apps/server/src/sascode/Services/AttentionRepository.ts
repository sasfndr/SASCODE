import {
  AttentionItem,
  AttentionPreference,
  ProjectId,
} from "@synara/contracts";
import { Option, Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";

export const ListProjectAttentionInput = Schema.Struct({
  projectId: ProjectId,
  now: Schema.String,
});
export type ListProjectAttentionInput =
  typeof ListProjectAttentionInput.Type;

export const ResolveAttentionItemInput = Schema.Struct({
  fingerprint: Schema.String,
  resolvedAt: Schema.String,
  updatedAt: Schema.String,
});
export type ResolveAttentionItemInput =
  typeof ResolveAttentionItemInput.Type;

export const GetAttentionPreferenceInput = Schema.Struct({
  projectId: Schema.NullOr(ProjectId),
});
export type GetAttentionPreferenceInput =
  typeof GetAttentionPreferenceInput.Type;

export interface AttentionRepositoryShape {
  readonly upsertItem: (
    item: AttentionItem,
  ) => Effect.Effect<void, ProjectionRepositoryError>;

  readonly listActiveItems: (
    input: ListProjectAttentionInput,
  ) => Effect.Effect<ReadonlyArray<AttentionItem>, ProjectionRepositoryError>;

  readonly resolveItem: (
    input: ResolveAttentionItemInput,
  ) => Effect.Effect<boolean, ProjectionRepositoryError>;

  readonly savePreference: (
    preference: AttentionPreference,
  ) => Effect.Effect<void, ProjectionRepositoryError>;

  readonly getPreference: (
    input: GetAttentionPreferenceInput,
  ) => Effect.Effect<Option.Option<AttentionPreference>, ProjectionRepositoryError>;
}

export class AttentionRepository extends ServiceMap.Service<
  AttentionRepository,
  AttentionRepositoryShape
>()("sascode/Services/AttentionRepository") {}
