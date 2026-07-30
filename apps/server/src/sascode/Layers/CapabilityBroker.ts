import * as Path from "node:path";

import type {
  SascodeAuthorizationDecision,
  SascodePermissionCapability,
  SascodePermissionGrant,
  SascodeResourceRef,
  SascodeScope,
} from "@synara/contracts";
import { Effect, Layer, Option } from "effect";

import { StepUpRequestConflictError } from "../Errors.ts";
import { CapabilityBroker, type CapabilityBrokerShape } from "../Services/CapabilityBroker.ts";
import { CapabilityRepository } from "../Services/CapabilityRepository.ts";

const SENSITIVE_CAPABILITIES: ReadonlySet<SascodePermissionCapability> = new Set([
  "run-arbitrary-commands",
  "read-secrets",
  "use-secrets",
  "modify-system",
  "publish-code",
  "deploy",
  "send-external-messages",
  "spend-money",
]);

const scopeMatches = (
  grant: SascodePermissionGrant,
  scope: SascodeScope,
): boolean =>
  grant.scope.projectId === scope.projectId &&
  (grant.scope.threadId == null || grant.scope.threadId === scope.threadId) &&
  (grant.scope.workflowId == null || grant.scope.workflowId === scope.workflowId) &&
  (grant.scope.workUnitId == null || grant.scope.workUnitId === scope.workUnitId);

const resourceMatchesBoundary = (
  resource: SascodeResourceRef,
  grant: SascodePermissionGrant,
): boolean => {
  const denied = grant.boundary.deniedResources.some(
    (candidate) =>
      candidate.kind === resource.kind &&
      (candidate.uri === resource.uri ||
        (candidate.kind === "directory" &&
          resource.uri.startsWith(`${candidate.uri.replace(/\/+$/, "")}/`))),
  );
  if (denied) return false;

  if (resource.kind === "file" || resource.kind === "directory") {
    const target = Path.resolve(resource.uri);
    return grant.boundary.workspaceRoots.some((workspaceRoot) => {
      const root = Path.resolve(workspaceRoot);
      const relative = Path.relative(root, target);
      return relative === "" || (!relative.startsWith("..") && !Path.isAbsolute(relative));
    });
  }

  if (resource.kind === "url") {
    try {
      const host = new URL(resource.uri).hostname.toLowerCase();
      return grant.boundary.allowedHosts.some((allowedHost) => {
        const normalized = allowedHost.toLowerCase();
        return host === normalized || host.endsWith(`.${normalized}`);
      });
    } catch {
      return false;
    }
  }

  return true;
};

function grantAuthorizes(
  grant: SascodePermissionGrant,
  input: Parameters<CapabilityBrokerShape["authorize"]>[0],
): boolean {
  if (!scopeMatches(grant, input.scope)) return false;
  if (!grant.capabilities.includes(input.capability)) return false;
  if (
    grant.profile === "full-access-isolated" &&
    !grant.boundary.isolatedExecutionRequired
  ) {
    return false;
  }
  if (grant.boundary.isolatedExecutionRequired && !input.isolatedExecution) {
    return false;
  }
  return input.resources.every((resource) =>
    resourceMatchesBoundary(resource, grant),
  );
}

const makeCapabilityBroker = Effect.gen(function* () {
  const repository = yield* CapabilityRepository;

  const appendAudit = (
    input: Parameters<CapabilityBrokerShape["authorize"]>[0],
    decision: SascodeAuthorizationDecision,
  ) =>
    Effect.gen(function* () {
      if (yield* repository.hasAuditRecord(input.auditRecordId)) return;
      yield* repository.appendAudit({
        id: input.auditRecordId,
        scope: input.scope,
        actorKind: input.actorKind,
        actorId: input.actorId,
        action: `capability:${input.capability}`,
        outcome: decision.outcome === "allowed" ? "allowed" : "denied",
        risk: input.risk,
        resources: input.resources,
        reason: decision.reason,
        correlationId: input.correlationId ?? null,
        occurredAt: input.occurredAt,
      });
    });

  const authorize: CapabilityBrokerShape["authorize"] = (input) =>
    Effect.gen(function* () {
      const grants = yield* repository.listActiveGrants({
        projectId: input.scope.projectId,
        now: input.occurredAt,
      });
      const matchingGrant = grants.find((grant) => grantAuthorizes(grant, input));
      if (matchingGrant) {
        const decision: SascodeAuthorizationDecision = {
          outcome: "allowed",
          capability: input.capability,
          matchedGrantId: matchingGrant.id,
          stepUpRequestId: null,
          reason: `Authorized by scoped grant ${matchingGrant.id}.`,
          decidedAt: input.occurredAt,
        };
        yield* appendAudit(input, decision);
        return decision;
      }

      const requiresStepUp =
        input.risk === "high" ||
        input.risk === "critical" ||
        SENSITIVE_CAPABILITIES.has(input.capability);
      if (requiresStepUp) {
        const saved = yield* repository.saveStepUpRequest({
          id: input.stepUpRequestId,
          scope: input.scope,
          status: "pending",
          requestedCapabilities: [input.capability],
          risk: input.risk,
          reason: input.reason,
          consequence: input.consequence,
          requestedAt: input.occurredAt,
          resolvedAt: null,
          resolvedBy: null,
          decisionReason: null,
        });
        if (!saved) {
          const existing = yield* repository.getStepUpRequest({
            requestId: input.stepUpRequestId,
          });
          if (
            Option.isNone(existing) ||
            existing.value.status !== "pending" ||
            !existing.value.requestedCapabilities.includes(input.capability)
          ) {
            return yield* new StepUpRequestConflictError({
              requestId: input.stepUpRequestId,
            });
          }
        }
        const decision: SascodeAuthorizationDecision = {
          outcome: "step-up-required",
          capability: input.capability,
          matchedGrantId: null,
          stepUpRequestId: input.stepUpRequestId,
          reason:
            "No active scoped grant covers this high-risk capability and resource boundary.",
          decidedAt: input.occurredAt,
        };
        yield* appendAudit(input, decision);
        return decision;
      }

      const decision: SascodeAuthorizationDecision = {
        outcome: "denied",
        capability: input.capability,
        matchedGrantId: null,
        stepUpRequestId: null,
        reason:
          "No active scoped grant covers this capability and resource boundary.",
        decidedAt: input.occurredAt,
      };
      yield* appendAudit(input, decision);
      return decision;
    });

  const resolveStepUp: CapabilityBrokerShape["resolveStepUp"] = (input) =>
    Effect.gen(function* () {
      const request = yield* repository.getStepUpRequest({
        requestId: input.resolution.requestId,
      });
      if (Option.isNone(request) || request.value.status !== "pending") {
        return yield* new StepUpRequestConflictError({
          requestId: input.resolution.requestId,
        });
      }
      if (input.resolution.nextStatus === "approved") {
        if (
          input.grant === undefined ||
          input.grant.scope.projectId !== request.value.scope.projectId ||
          !request.value.requestedCapabilities.every((capability) =>
            input.grant!.capabilities.includes(capability),
          )
        ) {
          return yield* new StepUpRequestConflictError({
            requestId: input.resolution.requestId,
          });
        }
      }
      const resolved = yield* repository.resolveStepUpRequest(input.resolution);
      if (!resolved) {
        return yield* new StepUpRequestConflictError({
          requestId: input.resolution.requestId,
        });
      }
      if (
        input.resolution.nextStatus === "approved" &&
        input.grant !== undefined &&
        !(yield* repository.saveGrant(input.grant))
      ) {
        return yield* new StepUpRequestConflictError({
          requestId: input.resolution.requestId,
        });
      }
    });

  return { authorize, resolveStepUp } satisfies CapabilityBrokerShape;
});

export const CapabilityBrokerLive = Layer.effect(
  CapabilityBroker,
  makeCapabilityBroker,
);
