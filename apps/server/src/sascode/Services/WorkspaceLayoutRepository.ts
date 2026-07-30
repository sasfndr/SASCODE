import {
  ProjectId,
  SascodeSaveWorkspaceLayoutInput,
  SascodeWorkspaceLayout,
} from "@synara/contracts";
import { Option, Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";
import type { WorkspaceLayoutConflictError } from "../Errors.ts";

export const GetWorkspaceLayoutInput = Schema.Struct({
  projectId: ProjectId,
});
export type GetWorkspaceLayoutInput =
  typeof GetWorkspaceLayoutInput.Type;

export interface WorkspaceLayoutRepositoryShape {
  readonly getLayout: (
    input: GetWorkspaceLayoutInput,
  ) => Effect.Effect<
    Option.Option<SascodeWorkspaceLayout>,
    ProjectionRepositoryError
  >;

  readonly saveLayout: (
    input: SascodeSaveWorkspaceLayoutInput,
  ) => Effect.Effect<
    SascodeWorkspaceLayout,
    ProjectionRepositoryError | WorkspaceLayoutConflictError
  >;
}

export class WorkspaceLayoutRepository extends ServiceMap.Service<
  WorkspaceLayoutRepository,
  WorkspaceLayoutRepositoryShape
>()("sascode/Services/WorkspaceLayoutRepository") {}
