import {
  AuditRecordId,
  IsoDateTime,
  SascodeAuthorizationDecision,
  SascodePermissionCapability,
  SascodePermissionGrant,
  SascodeResourceRef,
  SascodeRiskLevel,
  SascodeScope,
  StepUpRequestId,
} from "@synara/contracts";
import { Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";
import type { CapabilityBrokerDomainError } from "../Errors.ts";
import { ResolveStepUpRequestInput } from "./CapabilityRepository.ts";

export const AuthorizeCapabilityInput = Schema.Struct({
  auditRecordId: AuditRecordId,
  stepUpRequestId: StepUpRequestId,
  scope: SascodeScope,
  actorKind: Schema.Literals(["human", "agent", "system", "module"]),
  actorId: Schema.String,
  capability: SascodePermissionCapability,
  resources: Schema.Array(SascodeResourceRef),
  risk: SascodeRiskLevel,
  reason: Schema.String,
  consequence: Schema.String,
  isolatedExecution: Schema.Boolean,
  correlationId: Schema.optional(Schema.NullOr(Schema.String)),
  occurredAt: IsoDateTime,
});
export type AuthorizeCapabilityInput =
  typeof AuthorizeCapabilityInput.Type;

export const ResolveCapabilityStepUpInput = Schema.Struct({
  resolution: ResolveStepUpRequestInput,
  grant: Schema.optional(SascodePermissionGrant),
});
export type ResolveCapabilityStepUpInput =
  typeof ResolveCapabilityStepUpInput.Type;

export type CapabilityBrokerError =
  | CapabilityBrokerDomainError
  | ProjectionRepositoryError;

export interface CapabilityBrokerShape {
  readonly authorize: (
    input: AuthorizeCapabilityInput,
  ) => Effect.Effect<SascodeAuthorizationDecision, CapabilityBrokerError>;

  readonly resolveStepUp: (
    input: ResolveCapabilityStepUpInput,
  ) => Effect.Effect<void, CapabilityBrokerError>;
}

export class CapabilityBroker extends ServiceMap.Service<
  CapabilityBroker,
  CapabilityBrokerShape
>()("sascode/Services/CapabilityBroker") {}
