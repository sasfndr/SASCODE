import {
  AuditRecordId,
  PermissionGrantId,
  ProjectId,
  StepUpRequestId,
  WorkflowId,
  WorkUnitId,
} from "@synara/contracts";
import { assert, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { CapabilityBroker } from "../Services/CapabilityBroker.ts";
import { CapabilityRepository } from "../Services/CapabilityRepository.ts";
import { CapabilityBrokerLive } from "./CapabilityBroker.ts";
import { CapabilityRepositoryLive } from "./CapabilityRepository.ts";

const capabilityRepositoryLayer = CapabilityRepositoryLive.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
);

const capabilityLayer = it.layer(
  Layer.mergeAll(
    CapabilityBrokerLive.pipe(Layer.provide(capabilityRepositoryLayer)),
    capabilityRepositoryLayer,
    SqlitePersistenceMemory,
  ),
);

const now = "2026-07-30T08:00:00.000Z";
const projectId = ProjectId.makeUnsafe("project-capability-broker");
const workflowId = WorkflowId.makeUnsafe("workflow-capability-broker");
const workUnitId = WorkUnitId.makeUnsafe("work-unit-capability-broker");
const scope = { projectId, workflowId, workUnitId };

capabilityLayer("CapabilityBroker", (it) => {
  it.effect("enforces scoped isolation, creates step-ups, and audits every decision", () =>
    Effect.gen(function* () {
      const broker = yield* CapabilityBroker;
      const repository = yield* CapabilityRepository;
      const grantId = PermissionGrantId.makeUnsafe("grant-capability-broker");
      assert.isTrue(
        yield* repository.saveGrant({
          id: grantId,
          scope,
          profile: "full-access-isolated",
          capabilities: [
            "read-files",
            "write-files",
            "run-arbitrary-commands",
            "use-network",
          ],
          boundary: {
            workspaceRoots: ["/Users/sas/Documents/SASCODE"],
            allowedHosts: ["*"],
            deniedResources: [{ kind: "file", uri: "/Users/sas/Documents/SASCODE/.env" }],
            isolatedExecutionRequired: true,
            expiresAt: "2026-07-30T09:00:00.000Z",
          },
          grantedBy: "sas",
          reason: "Build SASCODE in its isolated task branch.",
          createdAt: now,
          revokedAt: null,
        }),
      );

      const allowed = yield* broker.authorize({
        auditRecordId: AuditRecordId.makeUnsafe("audit-capability-allowed"),
        stepUpRequestId: StepUpRequestId.makeUnsafe("step-up-unused"),
        scope,
        actorKind: "agent",
        actorId: "codex",
        capability: "write-files",
        resources: [
          {
            kind: "file",
            uri: "/Users/sas/Documents/SASCODE/apps/server/src/sascode/example.ts",
          },
        ],
        risk: "medium",
        reason: "Implement the scoped backend file.",
        consequence: "The task branch changes.",
        isolatedExecution: true,
        correlationId: "attempt-capability-broker",
        occurredAt: "2026-07-30T08:01:00.000Z",
      });
      assert.strictEqual(allowed.outcome, "allowed");
      assert.strictEqual(allowed.matchedGrantId, grantId);

      const networkAllowed = yield* broker.authorize({
        auditRecordId: AuditRecordId.makeUnsafe("audit-capability-network-allowed"),
        stepUpRequestId: StepUpRequestId.makeUnsafe("step-up-network-unused"),
        scope,
        actorKind: "agent",
        actorId: "codex",
        capability: "use-network",
        resources: [
          {
            kind: "url",
            uri: "https://models.example.ai/v1/catalog",
          },
        ],
        risk: "medium",
        reason: "Discover an explicitly configured model provider.",
        consequence: "The isolated agent can call the remote provider.",
        isolatedExecution: true,
        correlationId: "attempt-capability-broker",
        occurredAt: "2026-07-30T08:01:30.000Z",
      });
      assert.strictEqual(networkAllowed.outcome, "allowed");
      assert.strictEqual(networkAllowed.matchedGrantId, grantId);

      const stepUpId = StepUpRequestId.makeUnsafe("step-up-capability-broker");
      const stepUp = yield* broker.authorize({
        auditRecordId: AuditRecordId.makeUnsafe("audit-capability-step-up"),
        stepUpRequestId: stepUpId,
        scope,
        actorKind: "agent",
        actorId: "codex",
        capability: "run-arbitrary-commands",
        resources: [
          {
            kind: "file",
            uri: "/Users/sas/Documents/SASCODE/apps/server/package.json",
          },
        ],
        risk: "high",
        reason: "Run a repository script outside the isolated executor.",
        consequence: "The command can affect the host process.",
        isolatedExecution: false,
        occurredAt: "2026-07-30T08:02:00.000Z",
      });
      assert.strictEqual(stepUp.outcome, "step-up-required");
      assert.strictEqual(stepUp.stepUpRequestId, stepUpId);
      assert.strictEqual(
        Option.getOrThrow(
          yield* repository.getStepUpRequest({ requestId: stepUpId }),
        ).status,
        "pending",
      );

      const approvedGrantId = PermissionGrantId.makeUnsafe(
        "grant-capability-step-up",
      );
      yield* broker.resolveStepUp({
        resolution: {
          requestId: stepUpId,
          expectedStatus: "pending",
          nextStatus: "approved",
          resolvedAt: "2026-07-30T08:03:00.000Z",
          resolvedBy: "sas",
          decisionReason: "Approved for this isolated work unit.",
        },
        grant: {
          id: approvedGrantId,
          scope,
          profile: "full-access-isolated",
          capabilities: ["run-arbitrary-commands"],
          boundary: {
            workspaceRoots: ["/Users/sas/Documents/SASCODE"],
            allowedHosts: [],
            deniedResources: [],
            isolatedExecutionRequired: true,
            expiresAt: "2026-07-30T08:30:00.000Z",
          },
          grantedBy: "sas",
          reason: "Approved step-up.",
          createdAt: "2026-07-30T08:03:00.000Z",
          revokedAt: null,
        },
      });
      assert.strictEqual(
        Option.getOrThrow(
          yield* repository.getStepUpRequest({ requestId: stepUpId }),
        ).status,
        "approved",
      );

      const denied = yield* broker.authorize({
        auditRecordId: AuditRecordId.makeUnsafe("audit-capability-denied"),
        stepUpRequestId: StepUpRequestId.makeUnsafe("step-up-denied-unused"),
        scope,
        actorKind: "module",
        actorId: "music-player",
        capability: "read-files",
        resources: [{ kind: "file", uri: "/private/etc/hosts" }],
        risk: "low",
        reason: "Read a file outside the project.",
        consequence: "Host data could be exposed.",
        isolatedExecution: true,
        occurredAt: "2026-07-30T08:04:00.000Z",
      });
      assert.strictEqual(denied.outcome, "denied");

      const audit = yield* repository.listAuditRecords({
        projectId,
        afterSequence: 0,
        limit: 100,
      });
      assert.deepStrictEqual(
        audit.map(({ record }) => [record.action, record.outcome]),
        [
          ["capability:write-files", "allowed"],
          ["capability:use-network", "allowed"],
          ["capability:run-arbitrary-commands", "denied"],
          ["capability:read-files", "denied"],
        ],
      );
    }),
  );
});
