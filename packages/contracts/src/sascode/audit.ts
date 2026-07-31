import { Schema } from "effect";

import { IsoDateTime, TrimmedNonEmptyString } from "../baseSchemas";
import {
  AuditRecordId,
  SascodeResourceRef,
  SascodeRiskLevel,
  SascodeScope,
} from "./core";

export const SascodeAuditOutcome = Schema.Literals([
  "allowed",
  "denied",
  "succeeded",
  "failed",
  "cancelled",
]);
export type SascodeAuditOutcome = typeof SascodeAuditOutcome.Type;

export const SascodeAuditRecord = Schema.Struct({
  id: AuditRecordId,
  scope: SascodeScope,
  actorKind: Schema.Literals(["human", "agent", "system", "module"]),
  actorId: TrimmedNonEmptyString,
  action: TrimmedNonEmptyString,
  outcome: SascodeAuditOutcome,
  risk: SascodeRiskLevel,
  resources: Schema.Array(SascodeResourceRef).check(Schema.isMaxLength(256)),
  reason: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  correlationId: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  occurredAt: IsoDateTime,
});
export type SascodeAuditRecord = typeof SascodeAuditRecord.Type;
