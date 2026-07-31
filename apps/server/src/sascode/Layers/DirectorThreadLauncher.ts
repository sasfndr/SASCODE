import {
  ModelSelection,
  ProviderConnectionId,
  type ProviderKind,
  type ServerProviderStatus,
  SynaraCreateThreadsResult,
  ThreadId,
} from "@synara/contracts";
import { Effect, Layer, Option, Schema, SchemaIssue } from "effect";

import { AgentGatewayOperationRepository } from "../../agentGateway/Services/AgentGatewayOperationRepository.ts";
import { makeCreateThreadsHandler } from "../../agentGateway/creationCoordinator.ts";
import {
  PROVIDER_KINDS,
  ToolInputError,
  errorText,
} from "../../agentGateway/toolInput.ts";
import type { AgentGatewayProviderAvailability } from "../../agentGateway/targetResolver.ts";
import { ServerConfig } from "../../config.ts";
import { GitCore } from "../../git/Services/GitCore.ts";
import { OrchestrationEngineService } from "../../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../../orchestration/Services/ProjectionSnapshotQuery.ts";
import { ProviderDiscoveryService } from "../../provider/Services/ProviderDiscoveryService.ts";
import { ProviderHealth } from "../../provider/Services/ProviderHealth.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { DirectorThreadLaunchError } from "../Errors.ts";
import {
  DirectorThreadLauncher,
  type DirectorThreadLauncherShape,
} from "../Services/DirectorThreadLauncher.ts";
import { RoutingRepository } from "../Services/RoutingRepository.ts";
import { providerStartOptionsForConnection } from "../providerAccounts.ts";

const coerceOptionValue = (value: string): string | number | boolean => {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return value;
};

const makeDirectorThreadLauncher = Effect.gen(function* () {
  const snapshotQuery = yield* ProjectionSnapshotQuery;
  const orchestrationEngine = yield* OrchestrationEngineService;
  const git = yield* GitCore;
  const providerDiscovery = yield* ProviderDiscoveryService;
  const operationRepository = yield* AgentGatewayOperationRepository;
  const serverConfig = yield* ServerConfig;
  const providerHealth = yield* ProviderHealth;
  const serverSettings = yield* ServerSettingsService;
  const routing = yield* RoutingRepository;

  const loadProviderAvailabilities = Effect.gen(function* () {
    const [settings, statuses] = yield* Effect.all([
      serverSettings.getSettings,
      providerHealth.getStatuses,
    ]);
    const statusByProvider = new Map<ProviderKind, ServerProviderStatus>(
      statuses.map((status) => [status.provider, status]),
    );
    return new Map<ProviderKind, AgentGatewayProviderAvailability>(
      PROVIDER_KINDS.map((provider) => {
        const status = statusByProvider.get(provider);
        return [
          provider,
          {
            enabled: settings.providers[provider].enabled,
            ...(status
              ? {
                  available: status.available,
                  authStatus: status.authStatus,
                  ...(status.message ? { message: status.message } : {}),
                }
              : {}),
          },
        ] as const;
      }),
    );
  });

  const requireThreadShell = (threadId: string) =>
    snapshotQuery.getThreadShellById(ThreadId.makeUnsafe(threadId)).pipe(
      Effect.mapError((error) => new ToolInputError(errorText(error))),
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.fail(new ToolInputError(`Thread "${threadId}" was not found.`)),
          onSome: Effect.succeed,
        }),
      ),
    );

  const runCreateThreads = yield* makeCreateThreadsHandler({
    snapshotQuery,
    orchestrationEngine,
    git,
    providerDiscovery,
    operationRepository,
    serverConfig,
    loadProviderAvailabilities,
    requireThreadShell,
    resolveProviderStartOptions: (connectionId, provider) =>
      routing
        .getConnection(ProviderConnectionId.makeUnsafe(connectionId))
        .pipe(
          Effect.flatMap(
            Option.match({
              onNone: () =>
                Effect.fail(
                  new Error(`Provider connection "${connectionId}" was not found.`),
                ),
              onSome: (connection) => {
                const options = providerStartOptionsForConnection(connection);
                if (
                  options === null ||
                  connection.config.providerKind !== provider ||
                  !connection.enabled
                ) {
                  return Effect.fail(
                    new Error(
                      `Provider connection "${connectionId}" is disabled or does not belong to "${provider}".`,
                    ),
                  );
                }
                return Effect.succeed(options);
              },
            }),
          ),
        ),
  });

  const launch: DirectorThreadLauncherShape["launch"] = (input) =>
    Effect.gen(function* () {
      if (input.target.providerKind == null) {
        return yield* new DirectorThreadLaunchError({
          attemptId: input.attemptId,
          code: "provider-adapter-missing",
          detail: `Provider ${input.target.providerKey} has no Synara runtime adapter.`,
          retryable: false,
          operationMayHaveCommitted: false,
        });
      }

      const rawTarget = {
        provider: input.target.providerKind,
        model: input.target.modelSlug,
        ...(Object.keys(input.target.options).length === 0
          ? {}
          : {
              options: Object.fromEntries(
                Object.entries(input.target.options).map(([key, value]) => [
                  key,
                  coerceOptionValue(value),
                ]),
              ),
            }),
      };
      const modelSelection = yield* Schema.decodeUnknownEffect(ModelSelection)(
        rawTarget,
      ).pipe(
        Effect.mapError(
          (error) =>
            new DirectorThreadLaunchError({
              attemptId: input.attemptId,
              code: "model-selection-invalid",
              detail: SchemaIssue.makeFormatterDefault()(error.issue),
              retryable: false,
              operationMayHaveCommitted: false,
            }),
        ),
      );

      const response = yield* runCreateThreads(
        {
          requestId: input.requestId,
          threads: [
            {
              projectId: input.projectId,
              prompt: input.prompt,
              title: input.title,
              target: modelSelection,
              providerConnectionId: input.target.connectionId,
              environment: input.environment,
              ...(input.baseRef == null ? {} : { baseRef: input.baseRef }),
              runtimeMode: input.runtimeMode,
            },
          ],
        },
        {
          kind: "internal-director",
          directorId: input.attemptId,
          allowedProjectIds: new Set([input.projectId]),
          assertAuthority: () => Effect.void,
        },
      );

      const textContent = response.content.find(
        (entry) => entry.type === "text",
      );
      if (response.isError || textContent == null) {
        return yield* new DirectorThreadLaunchError({
          attemptId: input.attemptId,
          code: "thread-creation-failed",
          detail: textContent?.text ?? "The thread creation saga returned no result.",
          retryable: true,
          operationMayHaveCommitted: false,
        });
      }

      const parsed = yield* Effect.try({
        try: () => JSON.parse(textContent.text),
        catch: (cause) =>
          new DirectorThreadLaunchError({
            attemptId: input.attemptId,
            code: "thread-creation-result-invalid",
            detail: errorText(cause),
            retryable: true,
            operationMayHaveCommitted: true,
          }),
      });
      const result = yield* Schema.decodeUnknownEffect(SynaraCreateThreadsResult)(
        parsed,
      ).pipe(
        Effect.mapError(
          (error) =>
            new DirectorThreadLaunchError({
              attemptId: input.attemptId,
              code: "thread-creation-result-invalid",
              detail: SchemaIssue.makeFormatterDefault()(error.issue),
              retryable: true,
              operationMayHaveCommitted: true,
            }),
        ),
      );
      const thread = result.threads[0];
      if (thread == null) {
        return yield* new DirectorThreadLaunchError({
          attemptId: input.attemptId,
          code: "thread-creation-result-empty",
          detail: "The durable creation saga completed without a thread.",
          retryable: true,
          operationMayHaveCommitted: true,
        });
      }
      return {
        operationId: result.operationId,
        threadId: thread.threadId,
        worktreePath: thread.worktreePath,
        baselineGitRef: input.baseRef,
      };
    });

  return { launch } satisfies DirectorThreadLauncherShape;
});

export const DirectorThreadLauncherLive = Layer.effect(
  DirectorThreadLauncher,
  makeDirectorThreadLauncher,
);
