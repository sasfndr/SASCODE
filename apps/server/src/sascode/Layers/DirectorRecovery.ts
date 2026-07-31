import { Effect, Layer, Option } from "effect";

import { AttemptDispatcher } from "../Services/AttemptDispatcher.ts";
import {
  DirectorRecovery,
  type DirectorRecoveryShape,
} from "../Services/DirectorRecovery.ts";
import { DirectorWorkflowRepository } from "../Services/DirectorWorkflowRepository.ts";

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const makeDirectorRecovery = Effect.gen(function* () {
  const repository = yield* DirectorWorkflowRepository;
  const dispatcher = yield* AttemptDispatcher;

  const recover: DirectorRecoveryShape["recover"] = (input) =>
    Effect.gen(function* () {
      const attempts = yield* repository.listRecoverableAttempts({
        limit: input.limit,
      });
      const outcomes = yield* Effect.forEach(
        attempts,
        (attempt) =>
          dispatcher
            .dispatch({
              attemptId: attempt.id,
              occurredAt: input.occurredAt,
            })
            .pipe(
              Effect.map((result) => ({
                attemptId: result.attempt.id,
                status: result.attempt.status,
                recovered: true,
                error: null,
              })),
              Effect.catch((error) =>
                repository
                  .getAttemptById({ attemptId: attempt.id })
                  .pipe(
                    Effect.map((current) => ({
                      attemptId: attempt.id,
                      status: Option.isSome(current)
                        ? current.value.status
                        : attempt.status,
                      recovered: false,
                      error: errorText(error),
                    })),
                  ),
              ),
            ),
        { concurrency: 1 },
      );
      return {
        scanned: attempts.length,
        recovered: outcomes.filter((outcome) => outcome.recovered).length,
        failed: outcomes.filter((outcome) => !outcome.recovered).length,
        outcomes,
        completedAt: input.occurredAt,
      };
    });

  return { recover } satisfies DirectorRecoveryShape;
});

export const DirectorRecoveryLive = Layer.effect(
  DirectorRecovery,
  makeDirectorRecovery,
);
