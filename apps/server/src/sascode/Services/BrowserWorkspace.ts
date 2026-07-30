import {
  AuditRecordId,
  BrowserControlOwner,
  BrowserInstance,
  BrowserInstanceId,
  BrowserProfile,
  IsoDateTime,
  SascodeAuthorizationDecision,
  StepUpRequestId,
} from "@synara/contracts";
import { Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";
import type { BrowserWorkspaceDomainError } from "../Errors.ts";
import type { CapabilityBrokerError } from "./CapabilityBroker.ts";
import {
  ReleaseBrowserControlInput,
  UpdateBrowserInstanceInput,
} from "./BrowserWorkspaceRepository.ts";

export const AcquireBrowserWorkspaceControlInput = Schema.Struct({
  auditRecordId: AuditRecordId,
  stepUpRequestId: StepUpRequestId,
  instanceId: BrowserInstanceId,
  owner: BrowserControlOwner,
  expectedAuthorizationEpoch: Schema.Number,
  leaseExpiresAt: IsoDateTime,
  actorKind: Schema.Literals(["human", "agent", "system", "module"]),
  actorId: Schema.String,
  reason: Schema.String,
  consequence: Schema.String,
  correlationId: Schema.optional(Schema.NullOr(Schema.String)),
  occurredAt: IsoDateTime,
});
export type AcquireBrowserWorkspaceControlInput =
  typeof AcquireBrowserWorkspaceControlInput.Type;

export interface BrowserControlAcquisition {
  readonly authorization: SascodeAuthorizationDecision;
  readonly instance: BrowserInstance;
  readonly acquired: boolean;
}

export type BrowserWorkspaceError =
  | BrowserWorkspaceDomainError
  | CapabilityBrokerError
  | ProjectionRepositoryError;

export interface BrowserWorkspaceShape {
  readonly saveProfile: (
    profile: BrowserProfile,
  ) => Effect.Effect<BrowserProfile, BrowserWorkspaceError>;

  readonly createInstance: (
    instance: BrowserInstance,
  ) => Effect.Effect<BrowserInstance, BrowserWorkspaceError>;

  readonly acquireControl: (
    input: AcquireBrowserWorkspaceControlInput,
  ) => Effect.Effect<BrowserControlAcquisition, BrowserWorkspaceError>;

  readonly releaseControl: (
    input: ReleaseBrowserControlInput,
  ) => Effect.Effect<BrowserInstance, BrowserWorkspaceError>;

  readonly updateInstance: (
    input: UpdateBrowserInstanceInput,
  ) => Effect.Effect<BrowserInstance, BrowserWorkspaceError>;
}

export class BrowserWorkspace extends ServiceMap.Service<
  BrowserWorkspace,
  BrowserWorkspaceShape
>()("sascode/Services/BrowserWorkspace") {}
