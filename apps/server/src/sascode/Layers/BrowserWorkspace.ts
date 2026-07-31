import { Effect, Layer, Option } from "effect";

import {
  BrowserProfileConflictError,
  BrowserWorkspaceConflictError,
  BrowserWorkspaceNotFoundError,
} from "../Errors.ts";
import {
  BrowserWorkspace,
  type BrowserWorkspaceShape,
} from "../Services/BrowserWorkspace.ts";
import { BrowserWorkspaceRepository } from "../Services/BrowserWorkspaceRepository.ts";
import { CapabilityBroker } from "../Services/CapabilityBroker.ts";

const makeBrowserWorkspace = Effect.gen(function* () {
  const repository = yield* BrowserWorkspaceRepository;
  const capabilities = yield* CapabilityBroker;

  const saveProfile: BrowserWorkspaceShape["saveProfile"] = (profile) =>
    Effect.gen(function* () {
      if (!(yield* repository.saveProfile(profile))) {
        return yield* new BrowserProfileConflictError({
          profileId: profile.id,
        });
      }
      return profile;
    });

  const createInstance: BrowserWorkspaceShape["createInstance"] = (instance) =>
    Effect.gen(function* () {
      const profile = yield* repository.getProfile({
        profileId: instance.profileId,
      });
      if (Option.isNone(profile)) {
        return yield* new BrowserWorkspaceNotFoundError({
          entityKind: "profile",
          entityId: instance.profileId,
        });
      }
      if (
        profile.value.projectId != null &&
        profile.value.projectId !== instance.projectId
      ) {
        return yield* new BrowserWorkspaceConflictError({
          instanceId: instance.id,
          detail: "The browser profile belongs to another project.",
        });
      }
      if (
        instance.controlOwner.kind !== "none" ||
        instance.authorizationEpoch !== 0 ||
        instance.controlLeaseExpiresAt != null
      ) {
        return yield* new BrowserWorkspaceConflictError({
          instanceId: instance.id,
          detail:
            "A new browser instance must begin unowned at authorization epoch zero.",
        });
      }
      if (!(yield* repository.createInstance(instance))) {
        return yield* new BrowserWorkspaceConflictError({
          instanceId: instance.id,
          detail: "The browser instance identity already exists.",
        });
      }
      return instance;
    });

  const acquireControl: BrowserWorkspaceShape["acquireControl"] = (input) =>
    Effect.gen(function* () {
      const current = yield* repository.getInstance({
        instanceId: input.instanceId,
      });
      if (Option.isNone(current)) {
        return yield* new BrowserWorkspaceNotFoundError({
          entityKind: "instance",
          entityId: input.instanceId,
        });
      }
      if (input.owner.kind === "none") {
        return yield* new BrowserWorkspaceConflictError({
          instanceId: input.instanceId,
          detail: "Acquire control requires a human or agent owner.",
        });
      }
      const profile = yield* repository.getProfile({
        profileId: current.value.profileId,
      });
      if (Option.isNone(profile)) {
        return yield* new BrowserWorkspaceNotFoundError({
          entityKind: "profile",
          entityId: current.value.profileId,
        });
      }
      const authorization = yield* capabilities.authorize({
        auditRecordId: input.auditRecordId,
        stepUpRequestId: input.stepUpRequestId,
        scope: {
          projectId: current.value.projectId,
          workflowId: current.value.assignedWorkflowId ?? null,
          workUnitId: current.value.assignedWorkUnitId ?? null,
          threadId:
            input.owner.kind === "agent" ? input.owner.threadId : null,
        },
        actorKind: input.actorKind,
        actorId: input.actorId,
        capability: profile.value.containsAuthenticatedState
          ? "use-authenticated-browser"
          : "control-browser",
        resources: [{ kind: "browser", uri: current.value.id }],
        risk: profile.value.containsAuthenticatedState ? "high" : "medium",
        reason: input.reason,
        consequence: input.consequence,
        isolatedExecution: current.value.backend !== "local-visible",
        correlationId: input.correlationId ?? null,
        occurredAt: input.occurredAt,
      });
      if (authorization.outcome !== "allowed") {
        return {
          authorization,
          instance: current.value,
          acquired: false,
        };
      }
      const acquired = yield* repository.acquireControl({
        instanceId: input.instanceId,
        owner: input.owner,
        expectedAuthorizationEpoch: input.expectedAuthorizationEpoch,
        leaseExpiresAt: input.leaseExpiresAt,
        now: input.occurredAt,
      });
      if (Option.isNone(acquired)) {
        return yield* new BrowserWorkspaceConflictError({
          instanceId: input.instanceId,
          detail:
            "The control epoch changed or another unexpired owner holds the browser lease.",
        });
      }
      return {
        authorization,
        instance: acquired.value,
        acquired: true,
      };
    });

  const releaseControl: BrowserWorkspaceShape["releaseControl"] = (input) =>
    repository.releaseControl(input).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.fail(
              new BrowserWorkspaceConflictError({
                instanceId: input.instanceId,
                detail:
                  "The control epoch changed before the lease could be released.",
              }),
            ),
          onSome: Effect.succeed,
        }),
      ),
    );

  const updateInstance: BrowserWorkspaceShape["updateInstance"] = (input) =>
    Effect.gen(function* () {
      if (!(yield* repository.updateInstance(input))) {
        return yield* new BrowserWorkspaceConflictError({
          instanceId: input.instance.id,
          detail:
            "The runtime generation or authorization epoch changed before the browser snapshot could be saved.",
        });
      }
      const updated = yield* repository.getInstance({
        instanceId: input.instance.id,
      });
      if (Option.isNone(updated)) {
        return yield* new BrowserWorkspaceNotFoundError({
          entityKind: "instance",
          entityId: input.instance.id,
        });
      }
      return updated.value;
    });

  return {
    saveProfile,
    createInstance,
    acquireControl,
    releaseControl,
    updateInstance,
  } satisfies BrowserWorkspaceShape;
});

export const BrowserWorkspaceLive = Layer.effect(
  BrowserWorkspace,
  makeBrowserWorkspace,
);
