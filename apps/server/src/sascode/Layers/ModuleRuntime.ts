import type {
  SascodePermissionCapability,
  SascodeRiskLevel,
} from "@synara/contracts";
import { Effect, Layer, Option } from "effect";

import {
  ModuleInstanceConflictError,
  ModuleManifestInvariantError,
  ModuleNotFoundError,
} from "../Errors.ts";
import { CapabilityBroker } from "../Services/CapabilityBroker.ts";
import { ModuleRepository } from "../Services/ModuleRepository.ts";
import { ModuleRuntime, type ModuleRuntimeShape } from "../Services/ModuleRuntime.ts";

const HIGH_RISK_MODULE_CAPABILITIES: ReadonlySet<SascodePermissionCapability> =
  new Set([
    "run-arbitrary-commands",
    "read-secrets",
    "use-secrets",
    "modify-system",
    "publish-code",
    "deploy",
    "send-external-messages",
    "spend-money",
  ]);

const capabilityRisk = (
  capability: SascodePermissionCapability,
): SascodeRiskLevel =>
  HIGH_RISK_MODULE_CAPABILITIES.has(capability) ? "high" : "medium";

const makeModuleRuntime = Effect.gen(function* () {
  const repository = yield* ModuleRepository;
  const capabilities = yield* CapabilityBroker;

  const install: ModuleRuntimeShape["install"] = (input) =>
    Effect.gen(function* () {
      if (
        input.manifest.origin === "signed-third-party" &&
        input.manifest.signature == null
      ) {
        return yield* new ModuleManifestInvariantError({
          moduleId: input.manifest.id,
          detail: "Signed third-party modules require a manifest signature.",
        });
      }
      if (
        input.manifest.origin !== "built-in" &&
        input.manifest.entrypoint.startsWith("http://")
      ) {
        return yield* new ModuleManifestInvariantError({
          moduleId: input.manifest.id,
          detail: "Non-built-in modules cannot use an insecure HTTP entrypoint.",
        });
      }
      if (!(yield* repository.installManifest(input))) {
        return yield* new ModuleManifestInvariantError({
          moduleId: input.manifest.id,
          detail: `Version ${input.manifest.version} is already installed.`,
        });
      }
      return input.manifest;
    });

  const instantiate: ModuleRuntimeShape["instantiate"] = (instance) =>
    Effect.gen(function* () {
      const manifest = yield* repository.getManifest({
        moduleId: instance.moduleId,
        version: instance.moduleVersion,
      });
      if (Option.isNone(manifest)) {
        return yield* new ModuleNotFoundError({
          entityKind: "manifest",
          entityId: `${instance.moduleId}@${instance.moduleVersion}`,
        });
      }
      if (
        !manifest.value.placements.includes(instance.placement) ||
        instance.status !== "installed"
      ) {
        return yield* new ModuleInstanceConflictError({
          instanceId: instance.id,
          detail:
            "The initial placement is unsupported or the instance is not in installed state.",
        });
      }
      if (manifest.value.singletonPerProject) {
        const existing = yield* repository.listInstances({
          projectId: instance.projectId ?? null,
        });
        if (
          existing.some(
            (candidate) =>
              candidate.moduleId === instance.moduleId &&
              candidate.status !== "removed",
          )
        ) {
          return yield* new ModuleInstanceConflictError({
            instanceId: instance.id,
            detail: "The module is a singleton in this project.",
          });
        }
      }
      if (!(yield* repository.createInstance(instance))) {
        return yield* new ModuleInstanceConflictError({
          instanceId: instance.id,
          detail: "The module instance identity already exists.",
        });
      }
      return instance;
    });

  const activate: ModuleRuntimeShape["activate"] = (input) =>
    Effect.gen(function* () {
      const instanceOption = yield* repository.getInstance({
        instanceId: input.instanceId,
      });
      if (Option.isNone(instanceOption)) {
        return yield* new ModuleNotFoundError({
          entityKind: "instance",
          entityId: input.instanceId,
        });
      }
      const instance = instanceOption.value;
      const manifestOption = yield* repository.getManifest({
        moduleId: instance.moduleId,
        version: instance.moduleVersion,
      });
      if (Option.isNone(manifestOption)) {
        return yield* new ModuleNotFoundError({
          entityKind: "manifest",
          entityId: `${instance.moduleId}@${instance.moduleVersion}`,
        });
      }
      const manifest = manifestOption.value;
      if (manifest.requiredPermissions.length > 0 && instance.projectId == null) {
        return yield* new ModuleInstanceConflictError({
          instanceId: instance.id,
          detail: "Permissioned modules must be scoped to a project.",
        });
      }

      const decisions = yield* Effect.forEach(
        manifest.requiredPermissions,
        (capability) => {
          const envelope = input.authorizations.find(
            (candidate) => candidate.capability === capability,
          );
          if (!envelope || instance.projectId == null) {
            return Effect.succeed(null);
          }
          return capabilities
            .authorize({
              auditRecordId: envelope.auditRecordId,
              stepUpRequestId: envelope.stepUpRequestId,
              scope: { projectId: instance.projectId },
              actorKind: "module",
              actorId: envelope.actorId,
              capability,
              resources: [
                {
                  kind: "artifact",
                  uri: `module:${instance.moduleId}@${instance.moduleVersion}`,
                },
              ],
              risk: capabilityRisk(capability),
              reason: envelope.reason,
              consequence: envelope.consequence,
              isolatedExecution: input.isolatedExecution,
              correlationId: envelope.correlationId ?? null,
              occurredAt: input.occurredAt,
            })
            .pipe(Effect.map((decision) => decision));
        },
        { concurrency: 1 },
      );
      const authorizationDecisions = decisions.filter(
        (decision): decision is NonNullable<typeof decision> => decision !== null,
      );
      const activated =
        authorizationDecisions.length === manifest.requiredPermissions.length &&
        authorizationDecisions.every((decision) => decision.outcome === "allowed");
      if (!activated) {
        return {
          instance,
          authorizations: authorizationDecisions,
          activated: false,
        };
      }
      const updated = {
        ...instance,
        status: "active" as const,
        updatedAt: input.occurredAt,
      };
      if (
        !(yield* repository.updateInstance({
          instance: updated,
          expectedUpdatedAt: input.expectedUpdatedAt,
        }))
      ) {
        return yield* new ModuleInstanceConflictError({
          instanceId: instance.id,
          detail: "The module state changed before activation committed.",
        });
      }
      return {
        instance: updated,
        authorizations: authorizationDecisions,
        activated: true,
      };
    });

  const update: ModuleRuntimeShape["update"] = (input) =>
    Effect.gen(function* () {
      const currentOption = yield* repository.getInstance({
        instanceId: input.instance.id,
      });
      if (Option.isNone(currentOption)) {
        return yield* new ModuleNotFoundError({
          entityKind: "instance",
          entityId: input.instance.id,
        });
      }
      const current = currentOption.value;
      if (
        current.moduleId !== input.instance.moduleId ||
        current.moduleVersion !== input.instance.moduleVersion ||
        current.projectId !== input.instance.projectId ||
        current.createdAt !== input.instance.createdAt
      ) {
        return yield* new ModuleInstanceConflictError({
          instanceId: input.instance.id,
          detail:
            "Module identity, version, project scope, and creation time are immutable.",
        });
      }
      const manifest = yield* repository.getManifest({
        moduleId: current.moduleId,
        version: current.moduleVersion,
      });
      if (
        Option.isNone(manifest) ||
        !manifest.value.placements.includes(input.instance.placement)
      ) {
        return yield* new ModuleInstanceConflictError({
          instanceId: input.instance.id,
          detail: "The requested module placement is not supported.",
        });
      }
      if (
        input.instance.status === "active" &&
        current.status !== "active"
      ) {
        return yield* new ModuleInstanceConflictError({
          instanceId: input.instance.id,
          detail:
            "Inactive modules must use the permission-checked activation operation.",
        });
      }
      if (
        !(yield* repository.updateInstance({
          instance: input.instance,
          expectedUpdatedAt: input.expectedUpdatedAt,
        }))
      ) {
        return yield* new ModuleInstanceConflictError({
          instanceId: input.instance.id,
          detail:
            "The module state changed before the optimistic update committed.",
        });
      }
      return input.instance;
    });

  return { install, instantiate, activate, update } satisfies ModuleRuntimeShape;
});

export const ModuleRuntimeLive = Layer.effect(
  ModuleRuntime,
  makeModuleRuntime,
);
