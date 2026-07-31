import {
  IsoDateTime,
  ProjectAttentionSnapshot,
  ProjectId,
  WorkspaceAttentionSnapshot,
} from "@synara/contracts";
import { Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";

export const GetProjectAttentionSnapshotInput = Schema.Struct({
  projectId: ProjectId,
  now: IsoDateTime,
});
export type GetProjectAttentionSnapshotInput =
  typeof GetProjectAttentionSnapshotInput.Type;

export const GetWorkspaceAttentionSnapshotInput = Schema.Struct({
  projectIds: Schema.Array(ProjectId),
  now: IsoDateTime,
});
export type GetWorkspaceAttentionSnapshotInput =
  typeof GetWorkspaceAttentionSnapshotInput.Type;

export interface AttentionEngineShape {
  readonly getProjectSnapshot: (
    input: GetProjectAttentionSnapshotInput,
  ) => Effect.Effect<ProjectAttentionSnapshot, ProjectionRepositoryError>;

  readonly getWorkspaceSnapshot: (
    input: GetWorkspaceAttentionSnapshotInput,
  ) => Effect.Effect<WorkspaceAttentionSnapshot, ProjectionRepositoryError>;
}

export class AttentionEngine extends ServiceMap.Service<
  AttentionEngine,
  AttentionEngineShape
>()("sascode/Services/AttentionEngine") {}
