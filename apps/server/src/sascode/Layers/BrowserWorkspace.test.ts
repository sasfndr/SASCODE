import {
  AuditRecordId,
  BrowserInstanceId,
  BrowserProfileId,
  PermissionGrantId,
  ProjectId,
  StepUpRequestId,
  ThreadId,
  WorkflowId,
  WorkUnitId,
} from "@synara/contracts";
import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { BrowserWorkspace } from "../Services/BrowserWorkspace.ts";
import { BrowserWorkspaceRepository } from "../Services/BrowserWorkspaceRepository.ts";
import { CapabilityRepository } from "../Services/CapabilityRepository.ts";
import { BrowserWorkspaceLive } from "./BrowserWorkspace.ts";
import { BrowserWorkspaceRepositoryLive } from "./BrowserWorkspaceRepository.ts";
import { CapabilityBrokerLive } from "./CapabilityBroker.ts";
import { CapabilityRepositoryLive } from "./CapabilityRepository.ts";

const capabilityRepositoryLayer = CapabilityRepositoryLive.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
);
const browserRepositoryLayer = BrowserWorkspaceRepositoryLive.pipe(
  Layer.provideMerge(SqlitePersistenceMemory),
);
const capabilityBrokerLayer = CapabilityBrokerLive.pipe(
  Layer.provide(capabilityRepositoryLayer),
);
const browserDependencies = Layer.mergeAll(
  browserRepositoryLayer,
  capabilityBrokerLayer,
);

const browserLayer = it.layer(
  Layer.mergeAll(
    BrowserWorkspaceLive.pipe(Layer.provide(browserDependencies)),
    browserDependencies,
    capabilityRepositoryLayer,
    SqlitePersistenceMemory,
  ),
);

const projectId = ProjectId.makeUnsafe("project-browser-workspace");
const workflowId = WorkflowId.makeUnsafe("workflow-browser-workspace");
const workUnitId = WorkUnitId.makeUnsafe("work-unit-browser-workspace");
const profileId = BrowserProfileId.makeUnsafe("profile-browser-workspace");
const instanceId = BrowserInstanceId.makeUnsafe("instance-browser-workspace");

browserLayer("BrowserWorkspace", (it) => {
  it.effect("isolates authenticated profiles and serializes control through leases", () =>
    Effect.gen(function* () {
      const browser = yield* BrowserWorkspace;
      const repository = yield* BrowserWorkspaceRepository;
      const capabilities = yield* CapabilityRepository;

      yield* capabilities.saveGrant({
        id: PermissionGrantId.makeUnsafe("grant-browser-workspace"),
        scope: { projectId, workflowId, workUnitId },
        profile: "full-access-isolated",
        capabilities: ["use-authenticated-browser"],
        boundary: {
          workspaceRoots: [],
          allowedHosts: ["github.com"],
          deniedResources: [],
          isolatedExecutionRequired: true,
          expiresAt: "2026-07-30T10:00:00.000Z",
        },
        grantedBy: "sas",
        reason: "Use the isolated authenticated browser for this work unit.",
        createdAt: "2026-07-30T09:00:00.000Z",
        revokedAt: null,
      });
      yield* browser.saveProfile({
        id: profileId,
        projectId,
        name: "Authenticated GitHub",
        partitionKey: "persist:sascode:project-browser-workspace:github",
        persistent: true,
        allowedHosts: ["github.com"],
        blockedHosts: [],
        containsAuthenticatedState: true,
        createdAt: "2026-07-30T09:00:00.000Z",
        updatedAt: "2026-07-30T09:00:00.000Z",
      });
      yield* browser.createInstance({
        id: instanceId,
        projectId,
        profileId,
        backend: "local-isolated",
        status: "ready",
        controlOwner: { kind: "none" },
        tabs: [],
        assignedWorkflowId: workflowId,
        assignedWorkUnitId: workUnitId,
        evidenceIds: [],
        recordingEnabled: true,
        runtimeGeneration: 0,
        authorizationEpoch: 0,
        controlLeaseExpiresAt: null,
        lastError: null,
        createdAt: "2026-07-30T09:00:00.000Z",
        updatedAt: "2026-07-30T09:00:00.000Z",
        stoppedAt: null,
      });

      const acquired = yield* browser.acquireControl({
        auditRecordId: AuditRecordId.makeUnsafe("audit-browser-agent-one"),
        stepUpRequestId: StepUpRequestId.makeUnsafe("step-up-browser-agent-one"),
        instanceId,
        owner: {
          kind: "agent",
          threadId: ThreadId.makeUnsafe("thread-browser-agent-one"),
          workflowId,
          workUnitId,
        },
        expectedAuthorizationEpoch: 0,
        leaseExpiresAt: "2026-07-30T09:10:00.000Z",
        actorKind: "agent",
        actorId: "codex",
        reason: "Verify the GitHub integration.",
        consequence: "The agent can act in an authenticated browser profile.",
        correlationId: "attempt-browser-one",
        occurredAt: "2026-07-30T09:01:00.000Z",
      });
      assert.isTrue(acquired.acquired);
      assert.strictEqual(acquired.instance.authorizationEpoch, 1);
      assert.strictEqual(acquired.instance.status, "agent-controlled");

      const conflict = yield* browser
        .acquireControl({
          auditRecordId: AuditRecordId.makeUnsafe("audit-browser-agent-two"),
          stepUpRequestId: StepUpRequestId.makeUnsafe("step-up-browser-agent-two"),
          instanceId,
          owner: {
            kind: "agent",
            threadId: ThreadId.makeUnsafe("thread-browser-agent-two"),
            workflowId,
            workUnitId,
          },
          expectedAuthorizationEpoch: 1,
          leaseExpiresAt: "2026-07-30T09:10:00.000Z",
          actorKind: "agent",
          actorId: "claude",
          reason: "Attempt concurrent control.",
          consequence: "Concurrent control could corrupt browser state.",
          occurredAt: "2026-07-30T09:02:00.000Z",
        })
        .pipe(Effect.flip);
      assert.strictEqual(conflict._tag, "BrowserWorkspaceConflictError");

      const released = yield* browser.releaseControl({
        instanceId,
        expectedAuthorizationEpoch: 1,
        now: "2026-07-30T09:03:00.000Z",
      });
      assert.strictEqual(released.authorizationEpoch, 2);
      assert.deepStrictEqual(released.controlOwner, { kind: "none" });

      const persisted = yield* repository.getInstance({ instanceId });
      assert.strictEqual(persisted._tag, "Some");
    }),
  );
});
