import type {
  ProjectId,
  ResolvedModelTarget,
  ThreadId,
  WorkUnitAttemptId,
} from "@synara/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";

import type { DirectorThreadLaunchError } from "../Errors.ts";

export interface LaunchDirectorThreadInput {
  readonly requestId: string;
  readonly attemptId: WorkUnitAttemptId;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly prompt: string;
  readonly target: ResolvedModelTarget;
  readonly environment: "local" | "worktree";
  readonly baseRef: string | null;
  readonly runtimeMode: "approval-required" | "full-access";
}

export interface LaunchedDirectorThread {
  readonly operationId: string;
  readonly threadId: ThreadId;
  readonly worktreePath: string | null;
  readonly baselineGitRef: string | null;
}

export interface DirectorThreadLauncherShape {
  readonly launch: (
    input: LaunchDirectorThreadInput,
  ) => Effect.Effect<LaunchedDirectorThread, DirectorThreadLaunchError>;
}

export class DirectorThreadLauncher extends ServiceMap.Service<
  DirectorThreadLauncher,
  DirectorThreadLauncherShape
>()("sascode/Services/DirectorThreadLauncher") {}
