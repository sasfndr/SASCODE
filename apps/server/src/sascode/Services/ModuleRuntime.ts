import {
  AuditRecordId,
  IsoDateTime,
  SascodeAuthorizationDecision,
  SascodeModuleInstance,
  SascodeModuleManifest,
  SascodePermissionCapability,
  StepUpRequestId,
} from "@synara/contracts";
import { Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";
import type { ModuleRuntimeDomainError } from "../Errors.ts";
import type { CapabilityBrokerError } from "./CapabilityBroker.ts";

export const ModuleAuthorizationEnvelope = Schema.Struct({
  capability: SascodePermissionCapability,
  auditRecordId: AuditRecordId,
  stepUpRequestId: StepUpRequestId,
  actorId: Schema.String,
  reason: Schema.String,
  consequence: Schema.String,
  correlationId: Schema.optional(Schema.NullOr(Schema.String)),
});
export type ModuleAuthorizationEnvelope =
  typeof ModuleAuthorizationEnvelope.Type;

export const InstallModuleInput = Schema.Struct({
  manifest: SascodeModuleManifest,
  installedAt: IsoDateTime,
});
export type InstallModuleInput = typeof InstallModuleInput.Type;

export const ActivateModuleInput = Schema.Struct({
  instanceId: SascodeModuleInstance.fields.id,
  expectedUpdatedAt: IsoDateTime,
  authorizations: Schema.Array(ModuleAuthorizationEnvelope),
  isolatedExecution: Schema.Boolean,
  occurredAt: IsoDateTime,
});
export type ActivateModuleInput = typeof ActivateModuleInput.Type;

export interface ModuleActivationResult {
  readonly instance: SascodeModuleInstance;
  readonly authorizations: ReadonlyArray<SascodeAuthorizationDecision>;
  readonly activated: boolean;
}

export type ModuleRuntimeError =
  | ModuleRuntimeDomainError
  | CapabilityBrokerError
  | ProjectionRepositoryError;

export interface ModuleRuntimeShape {
  readonly install: (
    input: InstallModuleInput,
  ) => Effect.Effect<SascodeModuleManifest, ModuleRuntimeError>;

  readonly instantiate: (
    instance: SascodeModuleInstance,
  ) => Effect.Effect<SascodeModuleInstance, ModuleRuntimeError>;

  readonly activate: (
    input: ActivateModuleInput,
  ) => Effect.Effect<ModuleActivationResult, ModuleRuntimeError>;

  readonly update: (
    input: {
      readonly instance: SascodeModuleInstance;
      readonly expectedUpdatedAt: string;
    },
  ) => Effect.Effect<SascodeModuleInstance, ModuleRuntimeError>;
}

export class ModuleRuntime extends ServiceMap.Service<
  ModuleRuntime,
  ModuleRuntimeShape
>()("sascode/Services/ModuleRuntime") {}
