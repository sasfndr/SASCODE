import {
  ContextArtifact,
  DecisionRecord,
  EvidenceRecord,
  IsoDateTime,
  QualityGateDefinition,
  QualityGateRun,
  ResultPacket,
  SascodeResourceRef,
  SascodeUsage,
  TaskContract,
  ThreadId,
  WorkflowId,
  WorkUnitId,
} from "@synara/contracts";
import { Effect, Layer, Option, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceSqlOrDecodeError } from "../../persistence/Errors.ts";
import {
  ContextEvidenceRepository,
  EvidenceSubjectLink,
  GetResultPacketByAttemptInput,
  GetResultPacketInput,
  GetTaskContractInput,
  ListProjectContextInput,
  ListWorkUnitEvidenceInput,
  SaveEvidenceRecordInput,
  type ContextEvidenceRepositoryShape,
} from "../Services/ContextEvidenceRepository.ts";

const InsertedIdRow = Schema.Struct({ id: Schema.String });

const ContextArtifactDbRow = Schema.Struct({
  id: ContextArtifact.fields.id,
  projectId: ContextArtifact.fields.projectId,
  kind: ContextArtifact.fields.kind,
  title: ContextArtifact.fields.title,
  version: ContextArtifact.fields.version,
  content: ContextArtifact.fields.content,
  contentHash: ContextArtifact.fields.contentHash,
  source: Schema.NullOr(Schema.fromJsonString(SascodeResourceRef)),
  tags: Schema.fromJsonString(ContextArtifact.fields.tags),
  active: Schema.Number,
  createdAt: ContextArtifact.fields.createdAt,
  updatedAt: ContextArtifact.fields.updatedAt,
});
type ContextArtifactDbRow = typeof ContextArtifactDbRow.Type;

const TaskContractJsonRow = Schema.Struct({
  contract: Schema.fromJsonString(TaskContract),
});

const ResultPacketJsonRow = Schema.Struct({
  packet: Schema.fromJsonString(ResultPacket),
});

const EvidenceRecordDbRow = Schema.Struct({
  id: EvidenceRecord.fields.id,
  projectId: EvidenceRecord.fields.scope.fields.projectId,
  threadId: Schema.NullOr(ThreadId),
  workflowId: Schema.NullOr(WorkflowId),
  workUnitId: Schema.NullOr(WorkUnitId),
  kind: EvidenceRecord.fields.kind,
  status: EvidenceRecord.fields.status,
  summary: EvidenceRecord.fields.summary,
  command: Schema.NullOr(Schema.String),
  resources: Schema.fromJsonString(Schema.Array(SascodeResourceRef)),
  details: Schema.NullOr(Schema.String),
  producer: EvidenceRecord.fields.producer,
  usage: Schema.NullOr(Schema.fromJsonString(SascodeUsage)),
  createdAt: EvidenceRecord.fields.createdAt,
  expiresAt: Schema.NullOr(IsoDateTime),
});
type EvidenceRecordDbRow = typeof EvidenceRecordDbRow.Type;

const QualityGateRunDbRow = Schema.Struct({
  id: QualityGateRun.fields.id,
  projectId: QualityGateRun.fields.scope.fields.projectId,
  threadId: Schema.NullOr(ThreadId),
  workflowId: Schema.NullOr(WorkflowId),
  workUnitId: Schema.NullOr(WorkUnitId),
  gate: Schema.fromJsonString(QualityGateDefinition),
  status: QualityGateRun.fields.status,
  evidenceIds: Schema.fromJsonString(QualityGateRun.fields.evidenceIds),
  startedAt: Schema.NullOr(IsoDateTime),
  completedAt: Schema.NullOr(IsoDateTime),
  failureReason: Schema.NullOr(Schema.String),
});
type QualityGateRunDbRow = typeof QualityGateRunDbRow.Type;

const toContextArtifact = (row: ContextArtifactDbRow): ContextArtifact => {
  const { source, active, ...artifact } = row;
  return {
    ...artifact,
    ...(source === null ? {} : { source }),
    active: active !== 0,
  };
};

const toEvidenceRecord = (row: EvidenceRecordDbRow): EvidenceRecord => ({
  id: row.id,
  scope: {
    projectId: row.projectId,
    ...(row.threadId === null ? {} : { threadId: row.threadId }),
    ...(row.workflowId === null ? {} : { workflowId: row.workflowId }),
    ...(row.workUnitId === null ? {} : { workUnitId: row.workUnitId }),
  },
  kind: row.kind,
  status: row.status,
  summary: row.summary,
  command: row.command,
  resources: row.resources,
  ...(row.details === null ? {} : { details: row.details }),
  producer: row.producer,
  ...(row.usage === null ? {} : { usage: row.usage }),
  createdAt: row.createdAt,
  expiresAt: row.expiresAt,
});

const toQualityGateRun = (row: QualityGateRunDbRow): QualityGateRun => ({
  id: row.id,
  scope: {
    projectId: row.projectId,
    ...(row.threadId === null ? {} : { threadId: row.threadId }),
    ...(row.workflowId === null ? {} : { workflowId: row.workflowId }),
    ...(row.workUnitId === null ? {} : { workUnitId: row.workUnitId }),
  },
  gate: row.gate,
  status: row.status,
  evidenceIds: row.evidenceIds,
  startedAt: row.startedAt,
  completedAt: row.completedAt,
  failureReason: row.failureReason,
});

const makeContextEvidenceRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertContextArtifactRow = SqlSchema.void({
    Request: ContextArtifact,
    execute: (artifact) =>
      sql`
        INSERT INTO sascode_context_artifacts (
          context_artifact_id,
          project_id,
          kind,
          title,
          version,
          content,
          content_hash,
          source_json,
          tags_json,
          active,
          created_at,
          updated_at
        )
        VALUES (
          ${artifact.id},
          ${artifact.projectId},
          ${artifact.kind},
          ${artifact.title},
          ${artifact.version},
          ${artifact.content},
          ${artifact.contentHash},
          ${artifact.source === undefined ? null : JSON.stringify(artifact.source)},
          ${JSON.stringify(artifact.tags)},
          ${artifact.active ? 1 : 0},
          ${artifact.createdAt},
          ${artifact.updatedAt}
        )
        ON CONFLICT (context_artifact_id)
        DO UPDATE SET
          content = excluded.content,
          content_hash = excluded.content_hash,
          source_json = excluded.source_json,
          tags_json = excluded.tags_json,
          active = excluded.active,
          updated_at = excluded.updated_at
      `,
  });

  const listActiveContextArtifactRows = SqlSchema.findAll({
    Request: ListProjectContextInput,
    Result: ContextArtifactDbRow,
    execute: ({ projectId }) =>
      sql`
        SELECT
          context_artifact_id AS id,
          project_id AS "projectId",
          kind,
          title,
          version,
          content,
          content_hash AS "contentHash",
          source_json AS source,
          tags_json AS tags,
          active,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM sascode_context_artifacts
        WHERE project_id = ${projectId}
          AND active = 1
        ORDER BY kind ASC, updated_at DESC, context_artifact_id ASC
      `,
  });

  const insertDecisionRecordRow = SqlSchema.findOneOption({
    Request: DecisionRecord,
    Result: InsertedIdRow,
    execute: (record) =>
      sql`
        INSERT INTO sascode_decision_records (
          decision_record_id,
          project_id,
          thread_id,
          workflow_id,
          work_unit_id,
          status,
          question,
          decision,
          rationale,
          alternatives_json,
          consequences_json,
          supersedes_id,
          decided_by,
          decided_at
        )
        VALUES (
          ${record.id},
          ${record.scope.projectId},
          ${record.scope.threadId ?? null},
          ${record.scope.workflowId ?? null},
          ${record.scope.workUnitId ?? null},
          ${record.status},
          ${record.question},
          ${record.decision},
          ${record.rationale},
          ${JSON.stringify(record.alternatives)},
          ${JSON.stringify(record.consequences)},
          ${record.supersedesId ?? null},
          ${record.decidedBy},
          ${record.decidedAt}
        )
        ON CONFLICT (decision_record_id) DO NOTHING
        RETURNING decision_record_id AS id
      `,
  });

  const insertTaskContractRow = SqlSchema.findOneOption({
    Request: TaskContract,
    Result: InsertedIdRow,
    execute: (contract) =>
      sql`
        INSERT INTO sascode_task_contracts (
          task_contract_id,
          workflow_id,
          work_unit_id,
          version,
          digest,
          contract_json,
          sealed_at,
          created_at
        )
        VALUES (
          ${contract.id},
          ${contract.workflowId},
          ${contract.workUnitId},
          ${contract.version},
          ${contract.digest},
          ${JSON.stringify(contract)},
          ${contract.sealedAt ?? null},
          ${contract.createdAt}
        )
        ON CONFLICT (task_contract_id) DO NOTHING
        RETURNING task_contract_id AS id
      `,
  });

  const getTaskContractRow = SqlSchema.findOneOption({
    Request: GetTaskContractInput,
    Result: TaskContractJsonRow,
    execute: ({ taskContractId }) =>
      sql`
        SELECT contract_json AS contract
        FROM sascode_task_contracts
        WHERE task_contract_id = ${taskContractId}
      `,
  });

  const insertResultPacketRow = SqlSchema.findOneOption({
    Request: ResultPacket,
    Result: InsertedIdRow,
    execute: (packet) =>
      sql`
        INSERT INTO sascode_result_packets (
          result_packet_id,
          workflow_id,
          work_unit_id,
          attempt_id,
          task_contract_id,
          task_contract_digest,
          status,
          packet_json,
          produced_at
        )
        VALUES (
          ${packet.id},
          ${packet.workflowId},
          ${packet.workUnitId},
          ${packet.attemptId},
          ${packet.taskContractId},
          ${packet.taskContractDigest},
          ${packet.status},
          ${JSON.stringify(packet)},
          ${packet.producedAt}
        )
        ON CONFLICT (result_packet_id) DO NOTHING
        RETURNING result_packet_id AS id
      `,
  });

  const getResultPacketRow = SqlSchema.findOneOption({
    Request: GetResultPacketInput,
    Result: ResultPacketJsonRow,
    execute: ({ resultPacketId }) =>
      sql`
        SELECT packet_json AS packet
        FROM sascode_result_packets
        WHERE result_packet_id = ${resultPacketId}
      `,
  });

  const getResultPacketByAttemptRow = SqlSchema.findOneOption({
    Request: GetResultPacketByAttemptInput,
    Result: ResultPacketJsonRow,
    execute: ({ attemptId }) =>
      sql`
        SELECT packet_json AS packet
        FROM sascode_result_packets
        WHERE attempt_id = ${attemptId}
      `,
  });

  const insertEvidenceRecordRow = SqlSchema.findOneOption({
    Request: SaveEvidenceRecordInput,
    Result: InsertedIdRow,
    execute: ({ evidence, contentHash }) =>
      sql`
        INSERT INTO sascode_evidence_records (
          evidence_record_id,
          project_id,
          thread_id,
          workflow_id,
          work_unit_id,
          kind,
          status,
          summary,
          command,
          resources_json,
          details,
          producer,
          usage_json,
          content_hash,
          created_at,
          expires_at
        )
        VALUES (
          ${evidence.id},
          ${evidence.scope.projectId},
          ${evidence.scope.threadId ?? null},
          ${evidence.scope.workflowId ?? null},
          ${evidence.scope.workUnitId ?? null},
          ${evidence.kind},
          ${evidence.status},
          ${evidence.summary},
          ${evidence.command ?? null},
          ${JSON.stringify(evidence.resources)},
          ${evidence.details ?? null},
          ${evidence.producer},
          ${evidence.usage === undefined ? null : JSON.stringify(evidence.usage)},
          ${contentHash ?? null},
          ${evidence.createdAt},
          ${evidence.expiresAt ?? null}
        )
        ON CONFLICT (evidence_record_id) DO NOTHING
        RETURNING evidence_record_id AS id
      `,
  });

  const insertEvidenceLinkRow = SqlSchema.void({
    Request: Schema.Struct({
      evidenceId: EvidenceRecord.fields.id,
      link: EvidenceSubjectLink,
      createdAt: EvidenceRecord.fields.createdAt,
    }),
    execute: ({ evidenceId, link, createdAt }) =>
      sql`
        INSERT INTO sascode_evidence_links (
          evidence_record_id,
          subject_kind,
          subject_id,
          created_at
        )
        VALUES (
          ${evidenceId},
          ${link.subjectKind},
          ${link.subjectId},
          ${createdAt}
        )
        ON CONFLICT DO NOTHING
      `,
  });

  const listEvidenceRowsByWorkUnit = SqlSchema.findAll({
    Request: ListWorkUnitEvidenceInput,
    Result: EvidenceRecordDbRow,
    execute: ({ workUnitId }) =>
      sql`
        SELECT
          evidence_record_id AS id,
          project_id AS "projectId",
          thread_id AS "threadId",
          workflow_id AS "workflowId",
          work_unit_id AS "workUnitId",
          kind,
          status,
          summary,
          command,
          resources_json AS resources,
          details,
          producer,
          usage_json AS usage,
          created_at AS "createdAt",
          expires_at AS "expiresAt"
        FROM sascode_evidence_records
        WHERE work_unit_id = ${workUnitId}
        ORDER BY created_at DESC, evidence_record_id ASC
      `,
  });

  const insertQualityGateRunRow = SqlSchema.findOneOption({
    Request: QualityGateRun,
    Result: InsertedIdRow,
    execute: (run) =>
      sql`
        INSERT INTO sascode_quality_gate_runs (
          gate_run_id,
          project_id,
          thread_id,
          workflow_id,
          work_unit_id,
          gate_json,
          status,
          evidence_ids_json,
          started_at,
          completed_at,
          failure_reason
        )
        VALUES (
          ${run.id},
          ${run.scope.projectId},
          ${run.scope.threadId ?? null},
          ${run.scope.workflowId ?? null},
          ${run.scope.workUnitId ?? null},
          ${JSON.stringify(run.gate)},
          ${run.status},
          ${JSON.stringify(run.evidenceIds)},
          ${run.startedAt ?? null},
          ${run.completedAt ?? null},
          ${run.failureReason ?? null}
        )
        ON CONFLICT (gate_run_id) DO NOTHING
        RETURNING gate_run_id AS id
      `,
  });

  const listQualityGateRowsByWorkUnit = SqlSchema.findAll({
    Request: ListWorkUnitEvidenceInput,
    Result: QualityGateRunDbRow,
    execute: ({ workUnitId }) =>
      sql`
        SELECT
          gate_run_id AS id,
          project_id AS "projectId",
          thread_id AS "threadId",
          workflow_id AS "workflowId",
          work_unit_id AS "workUnitId",
          gate_json AS gate,
          status,
          evidence_ids_json AS "evidenceIds",
          started_at AS "startedAt",
          completed_at AS "completedAt",
          failure_reason AS "failureReason"
        FROM sascode_quality_gate_runs
        WHERE work_unit_id = ${workUnitId}
        ORDER BY gate_run_id ASC
      `,
  });

  const mapRepositoryError = (operation: string) =>
    toPersistenceSqlOrDecodeError(
      `${operation}:query`,
      `${operation}:decode`,
    );

  const upsertContextArtifact: ContextEvidenceRepositoryShape["upsertContextArtifact"] = (
    artifact,
  ) =>
    upsertContextArtifactRow(artifact).pipe(
      Effect.mapError(
        mapRepositoryError("ContextEvidenceRepository.upsertContextArtifact"),
      ),
    );

  const listActiveContextArtifacts: ContextEvidenceRepositoryShape["listActiveContextArtifacts"] =
    (input) =>
      listActiveContextArtifactRows(input).pipe(
        Effect.map((rows) => rows.map(toContextArtifact)),
        Effect.mapError(
          mapRepositoryError(
            "ContextEvidenceRepository.listActiveContextArtifacts",
          ),
        ),
      );

  const saveDecisionRecord: ContextEvidenceRepositoryShape["saveDecisionRecord"] = (record) =>
    insertDecisionRecordRow(record).pipe(
      Effect.map(Option.isSome),
      Effect.mapError(
        mapRepositoryError("ContextEvidenceRepository.saveDecisionRecord"),
      ),
    );

  const saveTaskContract: ContextEvidenceRepositoryShape["saveTaskContract"] = (contract) =>
    insertTaskContractRow(contract).pipe(
      Effect.map(Option.isSome),
      Effect.mapError(
        mapRepositoryError("ContextEvidenceRepository.saveTaskContract"),
      ),
    );

  const getTaskContract: ContextEvidenceRepositoryShape["getTaskContract"] = (input) =>
    getTaskContractRow(input).pipe(
      Effect.map(Option.map((row) => row.contract)),
      Effect.mapError(
        mapRepositoryError("ContextEvidenceRepository.getTaskContract"),
      ),
    );

  const saveResultPacket: ContextEvidenceRepositoryShape["saveResultPacket"] = (packet) =>
    insertResultPacketRow(packet).pipe(
      Effect.map(Option.isSome),
      Effect.mapError(
        mapRepositoryError("ContextEvidenceRepository.saveResultPacket"),
      ),
    );

  const getResultPacket: ContextEvidenceRepositoryShape["getResultPacket"] = (input) =>
    getResultPacketRow(input).pipe(
      Effect.map(Option.map((row) => row.packet)),
      Effect.mapError(
        mapRepositoryError("ContextEvidenceRepository.getResultPacket"),
      ),
    );

  const getResultPacketByAttempt: ContextEvidenceRepositoryShape["getResultPacketByAttempt"] = (
    input,
  ) =>
    getResultPacketByAttemptRow(input).pipe(
      Effect.map(Option.map((row) => row.packet)),
      Effect.mapError(
        mapRepositoryError(
          "ContextEvidenceRepository.getResultPacketByAttempt",
        ),
      ),
    );

  const saveEvidenceRecord: ContextEvidenceRepositoryShape["saveEvidenceRecord"] = (input) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          const inserted = yield* insertEvidenceRecordRow(input);
          if (Option.isNone(inserted)) return false;
          yield* Effect.forEach(
            input.links,
            (link) =>
              insertEvidenceLinkRow({
                evidenceId: input.evidence.id,
                link,
                createdAt: input.evidence.createdAt,
              }),
            { concurrency: 1 },
          );
          return true;
        }),
      )
      .pipe(
        Effect.mapError(
          mapRepositoryError("ContextEvidenceRepository.saveEvidenceRecord"),
        ),
      );

  const listEvidenceByWorkUnit: ContextEvidenceRepositoryShape["listEvidenceByWorkUnit"] = (
    input,
  ) =>
    listEvidenceRowsByWorkUnit(input).pipe(
      Effect.map((rows) => rows.map(toEvidenceRecord)),
      Effect.mapError(
        mapRepositoryError("ContextEvidenceRepository.listEvidenceByWorkUnit"),
      ),
    );

  const saveQualityGateRun: ContextEvidenceRepositoryShape["saveQualityGateRun"] = (run) =>
    insertQualityGateRunRow(run).pipe(
      Effect.map(Option.isSome),
      Effect.mapError(
        mapRepositoryError("ContextEvidenceRepository.saveQualityGateRun"),
      ),
    );

  const listQualityGateRunsByWorkUnit: ContextEvidenceRepositoryShape["listQualityGateRunsByWorkUnit"] =
    (input) =>
      listQualityGateRowsByWorkUnit(input).pipe(
        Effect.map((rows) => rows.map(toQualityGateRun)),
        Effect.mapError(
          mapRepositoryError(
            "ContextEvidenceRepository.listQualityGateRunsByWorkUnit",
          ),
        ),
      );

  return {
    upsertContextArtifact,
    listActiveContextArtifacts,
    saveDecisionRecord,
    saveTaskContract,
    getTaskContract,
    saveResultPacket,
    getResultPacket,
    getResultPacketByAttempt,
    saveEvidenceRecord,
    listEvidenceByWorkUnit,
    saveQualityGateRun,
    listQualityGateRunsByWorkUnit,
  } satisfies ContextEvidenceRepositoryShape;
});

export const ContextEvidenceRepositoryLive = Layer.effect(
  ContextEvidenceRepository,
  makeContextEvidenceRepository,
);
