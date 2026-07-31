import { Effect, Layer, Option } from "effect";

import { DirectorConcurrencyConflictError } from "../Errors.ts";
import { Director } from "../Services/Director.ts";
import {
  DirectorExecutionCoordinator,
  type DirectorExecutionCoordinatorShape,
} from "../Services/DirectorExecutionCoordinator.ts";
import { ContextEvidenceRepository } from "../Services/ContextEvidenceRepository.ts";
import { DirectorWorkflowRepository } from "../Services/DirectorWorkflowRepository.ts";
import { TaskContracts } from "../Services/TaskContracts.ts";

const makeDirectorExecutionCoordinator = Effect.gen(function* () {
  const contracts = yield* TaskContracts;
  const context = yield* ContextEvidenceRepository;
  const director = yield* Director;
  const workflows = yield* DirectorWorkflowRepository;

  const commitResult: DirectorExecutionCoordinatorShape["commitResult"] = (input) =>
    Effect.gen(function* () {
      const verification = yield* contracts.recordAndVerifyResult(input);
      const verificationSaved =
        yield* context.saveResultVerification(verification);
      if (!verificationSaved) {
        const existingVerification = yield* context.getResultVerification({
          resultPacketId: input.packet.id,
        });
        if (
          Option.isNone(existingVerification) ||
          JSON.stringify(existingVerification.value) !==
            JSON.stringify(verification)
        ) {
          return yield* new DirectorConcurrencyConflictError({
            operation: "saveResultVerification",
            entityKind: "attempt",
            entityId: input.packet.attemptId,
          });
        }
      }
      const attached = yield* workflows.attachAttemptResult({
        attemptId: input.packet.attemptId,
        resultPacketId: input.packet.id,
        updatedAt: input.verifiedAt,
      });
      if (!attached) {
        const attempt = yield* workflows.getAttemptById({
          attemptId: input.packet.attemptId,
        });
        if (
          Option.isNone(attempt) ||
          attempt.value.resultPacketId !== input.packet.id
        ) {
          return yield* new DirectorConcurrencyConflictError({
            operation: "commitResult",
            entityKind: "attempt",
            entityId: input.packet.attemptId,
          });
        }
      }

      if (verification.acceptedForCompletion) {
        const attempt = yield* director.advanceAttempt({
          attemptId: input.packet.attemptId,
          nextStatus: "succeeded",
          occurredAt: input.verifiedAt,
        });
        return { verification, attempt };
      }
      if (
        input.packet.status === "failed" ||
        input.packet.status === "blocked"
      ) {
        const attempt = yield* director.advanceAttempt({
          attemptId: input.packet.attemptId,
          nextStatus: "failed",
          error: input.packet.summary,
          occurredAt: input.verifiedAt,
        });
        return { verification, attempt };
      }

      const attempt = yield* workflows.getAttemptById({
        attemptId: input.packet.attemptId,
      });
      if (Option.isNone(attempt)) {
        return yield* new DirectorConcurrencyConflictError({
          operation: "commitResult",
          entityKind: "attempt",
          entityId: input.packet.attemptId,
        });
      }
      return { verification, attempt: attempt.value };
    });

  return { commitResult } satisfies DirectorExecutionCoordinatorShape;
});

export const DirectorExecutionCoordinatorLive = Layer.effect(
  DirectorExecutionCoordinator,
  makeDirectorExecutionCoordinator,
);
