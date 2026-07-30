import { Schema } from "effect";

import { IsoDateTime, TrimmedNonEmptyString } from "../baseSchemas";
import {
  PermissionGrantId,
  SascodeResourceRef,
  SascodeRiskLevel,
  SascodeScope,
  StepUpRequestId,
} from "./core";

export const SascodePermissionProfile = Schema.Literals([
  "observe",
  "safe-build",
  "trusted-build",
  "full-access-isolated",
  "custom",
]);
export type SascodePermissionProfile = typeof SascodePermissionProfile.Type;

export const SascodePermissionCapability = Schema.Literals([
  "read-files",
  "write-files",
  "run-safe-commands",
  "run-arbitrary-commands",
  "manage-git",
  "create-worktrees",
  "use-network",
  "control-browser",
  "use-authenticated-browser",
  "upload-files",
  "download-files",
  "manage-processes",
  "read-secrets",
  "use-secrets",
  "install-dependencies",
  "modify-system",
  "publish-code",
  "deploy",
  "send-external-messages",
  "spend-money",
]);
export type SascodePermissionCapability = typeof SascodePermissionCapability.Type;

export const SascodePermissionBoundary = Schema.Struct({
  workspaceRoots: Schema.Array(TrimmedNonEmptyString).check(Schema.isMaxLength(64)),
  allowedHosts: Schema.Array(TrimmedNonEmptyString).check(Schema.isMaxLength(128)),
  deniedResources: Schema.Array(SascodeResourceRef).check(Schema.isMaxLength(128)),
  isolatedExecutionRequired: Schema.Boolean,
  maxSpendMicros: Schema.optional(Schema.Number),
  expiresAt: Schema.optional(Schema.NullOr(IsoDateTime)),
});
export type SascodePermissionBoundary = typeof SascodePermissionBoundary.Type;

export const SascodePermissionGrant = Schema.Struct({
  id: PermissionGrantId,
  scope: SascodeScope,
  profile: SascodePermissionProfile,
  capabilities: Schema.Array(SascodePermissionCapability).check(Schema.isMaxLength(64)),
  boundary: SascodePermissionBoundary,
  grantedBy: TrimmedNonEmptyString,
  reason: TrimmedNonEmptyString,
  createdAt: IsoDateTime,
  revokedAt: Schema.optional(Schema.NullOr(IsoDateTime)),
});
export type SascodePermissionGrant = typeof SascodePermissionGrant.Type;

export const SascodeStepUpStatus = Schema.Literals([
  "pending",
  "approved",
  "denied",
  "expired",
  "cancelled",
]);
export type SascodeStepUpStatus = typeof SascodeStepUpStatus.Type;

export const SascodeStepUpRequest = Schema.Struct({
  id: StepUpRequestId,
  scope: SascodeScope,
  status: SascodeStepUpStatus,
  requestedCapabilities: Schema.Array(SascodePermissionCapability).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(64),
  ),
  risk: SascodeRiskLevel,
  reason: TrimmedNonEmptyString,
  consequence: TrimmedNonEmptyString,
  requestedAt: IsoDateTime,
  resolvedAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  resolvedBy: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
});
export type SascodeStepUpRequest = typeof SascodeStepUpRequest.Type;
