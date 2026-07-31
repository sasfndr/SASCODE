import { createHash } from "node:crypto";

import type {
  EvidenceRecord,
  QualityGateDefinition,
  QualityGateRun,
  ResultPacketVerification,
  TaskContract,
} from "@synara/contracts";
import { Effect, Layer, Option } from "effect";

import {
  DirectorEntityNotFoundError,
  ResultPacketConflictError,
  ResultPacketInvariantError,
  RoutingPolicyNotFoundError,
  TaskContractConflictError,
  TaskContractInvariantError,
} from "../Errors.ts";
import { ContextEvidenceRepository } from "../Services/ContextEvidenceRepository.ts";
import { DirectorWorkflowRepository } from "../Services/DirectorWorkflowRepository.ts";
import { RoutingRepository } from "../Services/RoutingRepository.ts";
import { TaskContracts, type TaskContractsShape } from "../Services/TaskContracts.ts";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

const digest = (value: unknown): string =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");

const resourceIdentity = (resource: {
  readonly kind: string;
  readonly uri: string;
}): string => `${resource.kind}\u0000${resource.uri}`;

const evidenceIsFresh = (
  evidence: EvidenceRecord,
  verifiedAt: string,
): boolean => evidence.expiresAt == null || evidence.expiresAt > verifiedAt;

function gateRunIsFresh(
  gate: QualityGateDefinition,
  run: QualityGateRun,
  verifiedAt: string,
): boolean {
  if (gate.freshnessSeconds === undefined || run.completedAt == null) return true;
  const ageMs =
    Date.parse(verifiedAt) - Date.parse(run.completedAt);
  return Number.isFinite(ageMs) && ageMs <= gate.freshnessSeconds * 1_000;
}

const makeTaskContracts = Effect.gen(function* () {
  const context = yield* ContextEvidenceRepository;
  const workflows = yield* DirectorWorkflowRepository;
  const routing = yield* RoutingRepository;

  const seal: TaskContractsShape["seal"] = (input) =>
    Effect.gen(function* () {
      const workUnitOption = yield* workflows.getWorkUnitById({
        workUnitId: input.workUnitId,
      });
      if (Option.isNone(workUnitOption)) {
        return yield* new DirectorEntityNotFoundError({
          entityKind: "work-unit",
          entityId: input.workUnitId,
        });
      }
      const workUnit = workUnitOption.value;
      if (workUnit.status !== "routing") {
        return yield* new TaskContractInvariantError({
          workUnitId: workUnit.id,
          detail: `Task contracts can only be sealed while routing; current state is ${workUnit.status}.`,
        });
      }
      const workflowOption = yield* workflows.getById({
        workflowId: workUnit.workflowId,
      });
      if (Option.isNone(workflowOption)) {
        return yield* new DirectorEntityNotFoundError({
          entityKind: "workflow",
          entityId: workUnit.workflowId,
        });
      }
      const workflow = workflowOption.value;
      const allowedResourceKeys = new Set(
        input.allowedResources.map(resourceIdentity),
      );
      const missingDeclaredResource = workUnit.declaredResources.find(
        (resource) => !allowedResourceKeys.has(resourceIdentity(resource)),
      );
      if (missingDeclaredResource) {
        return yield* new TaskContractInvariantError({
          workUnitId: workUnit.id,
          detail:
            `Declared resource ${missingDeclaredResource.kind}:${missingDeclaredResource.uri} ` +
            "is absent from the allowed resource boundary.",
        });
      }

      const activeContext = yield* context.listActiveContextArtifacts({
        projectId: workflow.projectId,
      });
      const activeContextIds = new Set(activeContext.map((artifact) => artifact.id));
      const missingContextId = input.contextArtifactIds.find(
        (artifactId) => !activeContextIds.has(artifactId),
      );
      if (missingContextId) {
        return yield* new TaskContractInvariantError({
          workUnitId: workUnit.id,
          detail: `Context artifact ${missingContextId} is missing, inactive, or belongs to another project.`,
        });
      }

      const dependencyPackets = yield* Effect.forEach(
        input.dependencyResultPacketIds,
        (resultPacketId) => context.getResultPacket({ resultPacketId }),
        { concurrency: 1 },
      );
      const missingDependencyIndex = dependencyPackets.findIndex(Option.isNone);
      if (missingDependencyIndex >= 0) {
        return yield* new TaskContractInvariantError({
          workUnitId: workUnit.id,
          detail:
            `Dependency result packet ` +
            `${input.dependencyResultPacketIds[missingDependencyIndex]} does not exist.`,
        });
      }
      const invalidDependency = dependencyPackets
        .filter(Option.isSome)
        .map((packet) => packet.value)
        .find(
          (packet) =>
            packet.workflowId !== workflow.id || packet.status !== "complete",
        );
      if (invalidDependency) {
        return yield* new TaskContractInvariantError({
          workUnitId: workUnit.id,
          detail:
            `Dependency result packet ${invalidDependency.id} is incomplete or belongs to another workflow.`,
        });
      }

      const semanticContract = {
        workflowId: workflow.id,
        workUnitId: workUnit.id,
        version: input.version,
        activity: workUnit.activity,
        roleId: workUnit.roleId,
        outcome: workUnit.outcome,
        instructions: input.instructions,
        acceptanceCriteria: input.acceptanceCriteria,
        allowedResources: input.allowedResources,
        forbiddenResources: input.forbiddenResources,
        contextArtifactIds: input.contextArtifactIds,
        dependencyResultPacketIds: input.dependencyResultPacketIds,
        requiredEvidenceKinds: workUnit.requiredEvidenceKinds,
        baselineGitRef: input.baselineGitRef,
        permissionProfile: input.permissionProfile,
        permissionGrantIds: input.permissionGrantIds,
        risk: workUnit.risk,
        expectedArtifacts: input.expectedArtifacts,
      };
      const contract: TaskContract = {
        id: input.taskContractId,
        ...semanticContract,
        digest: digest(semanticContract),
        sealedAt: input.occurredAt,
        createdAt: input.occurredAt,
      };
      if (!(yield* context.saveTaskContract(contract))) {
        return yield* new TaskContractConflictError({
          taskContractId: contract.id,
        });
      }
      return contract;
    });

  const recordAndVerifyResult: TaskContractsShape["recordAndVerifyResult"] = (input) =>
    Effect.gen(function* () {
      const packet = input.packet;
      const attemptOption = yield* workflows.getAttemptById({
        attemptId: packet.attemptId,
      });
      if (Option.isNone(attemptOption)) {
        return yield* new DirectorEntityNotFoundError({
          entityKind: "attempt",
          entityId: packet.attemptId,
        });
      }
      const attempt = attemptOption.value;
      if (attempt.status !== "verifying") {
        return yield* new ResultPacketInvariantError({
          workUnitId: packet.workUnitId,
          detail:
            `Attempt ${attempt.id} must be in verifying state before a result can be recorded; ` +
            `current state is ${attempt.status}.`,
        });
      }
      const contractOption = yield* context.getTaskContract({
        taskContractId: packet.taskContractId,
      });
      if (Option.isNone(contractOption)) {
        return yield* new ResultPacketInvariantError({
          workUnitId: packet.workUnitId,
          detail: `Task contract ${packet.taskContractId} does not exist.`,
        });
      }
      const contract = contractOption.value;
      if (
        attempt.workflowId !== packet.workflowId ||
        attempt.workUnitId !== packet.workUnitId ||
        attempt.taskContractId !== packet.taskContractId ||
        contract.workflowId !== packet.workflowId ||
        contract.workUnitId !== packet.workUnitId ||
        contract.digest !== packet.taskContractDigest
      ) {
        return yield* new ResultPacketInvariantError({
          workUnitId: packet.workUnitId,
          detail:
            "Attempt, workflow, work unit, task contract, or contract digest identity does not match.",
        });
      }

      const workflowOption = yield* workflows.getById({
        workflowId: packet.workflowId,
      });
      if (Option.isNone(workflowOption)) {
        return yield* new DirectorEntityNotFoundError({
          entityKind: "workflow",
          entityId: packet.workflowId,
        });
      }
      const workflow = workflowOption.value;
      const policyOption = yield* routing.getPolicy({
        policyId: workflow.routingPolicyId,
        revision: workflow.routingPolicyRevision,
      });
      if (Option.isNone(policyOption)) {
        return yield* new RoutingPolicyNotFoundError({
          policyId: workflow.routingPolicyId,
          revision: workflow.routingPolicyRevision,
        });
      }

      const evidence = yield* context.listEvidenceByWorkUnit({
        workUnitId: packet.workUnitId,
      });
      const evidenceById = new Map(evidence.map((record) => [record.id, record]));
      const packetEvidence = packet.evidenceIds
        .map((evidenceId) => evidenceById.get(evidenceId))
        .filter((record): record is EvidenceRecord => record !== undefined);
      const issues: ResultPacketVerification["issues"][number][] = [];

      for (const evidenceId of packet.evidenceIds) {
        if (!evidenceById.has(evidenceId)) {
          issues.push({
            code: "evidence-missing",
            message: `Evidence ${evidenceId} does not exist in the work-unit evidence ledger.`,
            blocking: true,
          });
        }
      }
      for (const requiredKind of contract.requiredEvidenceKinds) {
        const passed = packetEvidence.some(
          (record) =>
            record.kind === requiredKind &&
            record.status === "passed" &&
            evidenceIsFresh(record, input.verifiedAt),
        );
        if (!passed) {
          issues.push({
            code: "required-evidence-missing",
            message: `No fresh passing ${requiredKind} evidence is attached.`,
            blocking: true,
          });
        }
      }
      for (const record of packetEvidence) {
        if (record.status !== "passed") {
          issues.push({
            code: "evidence-not-passing",
            message: `Evidence ${record.id} is ${record.status}.`,
            blocking: true,
          });
        } else if (!evidenceIsFresh(record, input.verifiedAt)) {
          issues.push({
            code: "evidence-expired",
            message: `Evidence ${record.id} has expired.`,
            blocking: true,
          });
        }
      }

      const gateRuns = yield* context.listQualityGateRunsByWorkUnit({
        workUnitId: packet.workUnitId,
      });
      const passedGateKeys: string[] = [];
      for (const gate of policyOption.value.qualityGates.filter(
        (definition) => definition.required,
      )) {
        const passedRun = gateRuns.find(
          (run) =>
            run.gate.key === gate.key &&
            run.status === "passed" &&
            gateRunIsFresh(gate, run, input.verifiedAt) &&
            run.evidenceIds.every((evidenceId) =>
              packet.evidenceIds.includes(evidenceId),
            ),
        );
        if (!passedRun) {
          issues.push({
            code: "quality-gate-not-passed",
            message: `Required quality gate ${gate.label} has not passed with attached evidence.`,
            blocking: gate.blockOnFailure,
          });
        } else {
          passedGateKeys.push(gate.key);
        }
      }
      if (packet.status !== "complete") {
        issues.push({
          code: "result-incomplete",
          message: `Result packet status is ${packet.status}.`,
          blocking: true,
        });
      }
      if (packet.unresolvedQuestions.length > 0) {
        issues.push({
          code: "unresolved-questions",
          message: "The result packet contains unresolved questions.",
          blocking: false,
        });
      }

      if (!(yield* context.saveResultPacket(packet))) {
        return yield* new ResultPacketConflictError({
          resultPacketId: packet.id,
        });
      }
      return {
        packet,
        acceptedForCompletion: !issues.some((issue) => issue.blocking),
        issues,
        passedGateKeys,
        verifiedAt: input.verifiedAt,
      };
    });

  return { seal, recordAndVerifyResult } satisfies TaskContractsShape;
});

export const TaskContractsLive = Layer.effect(TaskContracts, makeTaskContracts);
