import {
  SascodeResourceRef,
  Workflow,
  WorkUnit,
  WorkUnitAttempt,
  type WorkUnitAttemptStatus,
  WorkUnitDependency,
} from "@synara/contracts";
import { Effect, Layer, Option, Schema, Struct } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceSqlOrDecodeError } from "../../persistence/Errors.ts";
import {
  AttachDirectorAttemptThreadInput,
  DirectorWorkflowRepository,
  GetDirectorAttemptInput,
  GetDirectorWorkflowInput,
  GetDirectorWorkUnitInput,
  ListDirectorWorkflowsInput,
  ListDirectorWorkUnitAttemptsInput,
  TransitionDirectorAttemptInput,
  TransitionDirectorWorkflowInput,
  TransitionDirectorWorkUnitInput,
  type DirectorWorkflowRepositoryShape,
} from "../Services/DirectorWorkflowRepository.ts";

const WorkflowRow = Schema.Struct(
  Struct.omit(Workflow.fields, ["workUnits", "dependencies"]),
);
type WorkflowRow = typeof WorkflowRow.Type;

const WorkUnitDbRow = WorkUnit.mapFields(
  Struct.assign({
    declaredResources: Schema.fromJsonString(Schema.Array(SascodeResourceRef)),
    requiredEvidenceKinds: Schema.fromJsonString(Schema.Array(Schema.String)),
  }),
);

const InsertedIdRow = Schema.Struct({ id: Schema.String });
const WorkUnitAttemptSlotRow = Schema.Struct({
  workflowId: Workflow.fields.id,
  activeAttemptId: Schema.NullOr(WorkUnitAttempt.fields.id),
});

const TERMINAL_ATTEMPT_STATUSES: ReadonlySet<WorkUnitAttemptStatus> = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "abandoned",
]);

const makeDirectorWorkflowRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const insertWorkflowRow = SqlSchema.findOneOption({
    Request: Workflow,
    Result: InsertedIdRow,
    execute: (workflow) =>
      sql`
        INSERT INTO sascode_projection_workflows (
          workflow_id,
          project_id,
          title,
          outcome,
          status,
          routing_policy_id,
          routing_policy_revision,
          graph_revision,
          concurrency_limit,
          created_by,
          created_at,
          updated_at,
          started_at,
          completed_at,
          cancelled_at
        )
        VALUES (
          ${workflow.id},
          ${workflow.projectId},
          ${workflow.title},
          ${workflow.outcome},
          ${workflow.status},
          ${workflow.routingPolicyId},
          ${workflow.routingPolicyRevision},
          ${workflow.graphRevision},
          ${workflow.concurrencyLimit},
          ${workflow.createdBy},
          ${workflow.createdAt},
          ${workflow.updatedAt},
          ${workflow.startedAt ?? null},
          ${workflow.completedAt ?? null},
          NULL
        )
        ON CONFLICT (workflow_id) DO NOTHING
        RETURNING workflow_id AS id
      `,
  });

  const insertWorkUnitRow = SqlSchema.void({
    Request: WorkUnit,
    execute: (workUnit) =>
      sql`
        INSERT INTO sascode_projection_work_units (
          work_unit_id,
          workflow_id,
          node_key,
          title,
          outcome,
          activity,
          role_id,
          status,
          priority,
          risk,
          sort_order,
          declared_resources_json,
          required_evidence_kinds_json,
          active_attempt_id,
          created_at,
          updated_at,
          terminal_at
        )
        VALUES (
          ${workUnit.id},
          ${workUnit.workflowId},
          ${workUnit.key},
          ${workUnit.title},
          ${workUnit.outcome},
          ${workUnit.activity},
          ${workUnit.roleId},
          ${workUnit.status},
          ${workUnit.priority},
          ${workUnit.risk},
          ${workUnit.sortOrder},
          ${JSON.stringify(workUnit.declaredResources)},
          ${JSON.stringify(workUnit.requiredEvidenceKinds)},
          ${workUnit.activeAttemptId ?? null},
          ${workUnit.createdAt},
          ${workUnit.updatedAt},
          ${workUnit.terminalAt ?? null}
        )
      `,
  });

  const insertDependencyRow = SqlSchema.void({
    Request: Schema.Struct({
      workflowId: Workflow.fields.id,
      dependency: WorkUnitDependency,
    }),
    execute: ({ workflowId, dependency }) =>
      sql`
        INSERT INTO sascode_projection_workflow_edges (
          workflow_id,
          from_work_unit_id,
          to_work_unit_id,
          condition_kind,
          gate_key
        )
        VALUES (
          ${workflowId},
          ${dependency.fromWorkUnitId},
          ${dependency.toWorkUnitId},
          ${dependency.condition},
          ${dependency.gateKey ?? null}
        )
      `,
  });

  const getWorkflowRow = SqlSchema.findOneOption({
    Request: GetDirectorWorkflowInput,
    Result: WorkflowRow,
    execute: ({ workflowId }) =>
      sql`
        SELECT
          workflow_id AS id,
          project_id AS "projectId",
          title,
          outcome,
          status,
          routing_policy_id AS "routingPolicyId",
          routing_policy_revision AS "routingPolicyRevision",
          graph_revision AS "graphRevision",
          concurrency_limit AS "concurrencyLimit",
          created_by AS "createdBy",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          started_at AS "startedAt",
          completed_at AS "completedAt"
        FROM sascode_projection_workflows
        WHERE workflow_id = ${workflowId}
      `,
  });

  const listWorkflowRowsByProject = SqlSchema.findAll({
    Request: ListDirectorWorkflowsInput,
    Result: WorkflowRow,
    execute: ({ projectId }) =>
      sql`
        SELECT
          workflow_id AS id,
          project_id AS "projectId",
          title,
          outcome,
          status,
          routing_policy_id AS "routingPolicyId",
          routing_policy_revision AS "routingPolicyRevision",
          graph_revision AS "graphRevision",
          concurrency_limit AS "concurrencyLimit",
          created_by AS "createdBy",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          started_at AS "startedAt",
          completed_at AS "completedAt"
        FROM sascode_projection_workflows
        WHERE project_id = ${projectId}
        ORDER BY updated_at DESC, workflow_id ASC
      `,
  });

  const listWorkUnitRowsByWorkflow = SqlSchema.findAll({
    Request: GetDirectorWorkflowInput,
    Result: WorkUnitDbRow,
    execute: ({ workflowId }) =>
      sql`
        SELECT
          work_unit_id AS id,
          workflow_id AS "workflowId",
          node_key AS key,
          title,
          outcome,
          activity,
          role_id AS "roleId",
          status,
          priority,
          risk,
          sort_order AS "sortOrder",
          declared_resources_json AS "declaredResources",
          required_evidence_kinds_json AS "requiredEvidenceKinds",
          active_attempt_id AS "activeAttemptId",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          terminal_at AS "terminalAt"
        FROM sascode_projection_work_units
        WHERE workflow_id = ${workflowId}
        ORDER BY sort_order ASC, work_unit_id ASC
      `,
  });

  const getWorkUnitRow = SqlSchema.findOneOption({
    Request: GetDirectorWorkUnitInput,
    Result: WorkUnitDbRow,
    execute: ({ workUnitId }) =>
      sql`
        SELECT
          work_unit_id AS id,
          workflow_id AS "workflowId",
          node_key AS key,
          title,
          outcome,
          activity,
          role_id AS "roleId",
          status,
          priority,
          risk,
          sort_order AS "sortOrder",
          declared_resources_json AS "declaredResources",
          required_evidence_kinds_json AS "requiredEvidenceKinds",
          active_attempt_id AS "activeAttemptId",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          terminal_at AS "terminalAt"
        FROM sascode_projection_work_units
        WHERE work_unit_id = ${workUnitId}
      `,
  });

  const listDependencyRowsByWorkflow = SqlSchema.findAll({
    Request: GetDirectorWorkflowInput,
    Result: WorkUnitDependency,
    execute: ({ workflowId }) =>
      sql`
        SELECT
          from_work_unit_id AS "fromWorkUnitId",
          to_work_unit_id AS "toWorkUnitId",
          condition_kind AS condition,
          gate_key AS "gateKey"
        FROM sascode_projection_workflow_edges
        WHERE workflow_id = ${workflowId}
        ORDER BY from_work_unit_id ASC, to_work_unit_id ASC
      `,
  });

  const listAttemptRowsByWorkUnit = SqlSchema.findAll({
    Request: ListDirectorWorkUnitAttemptsInput,
    Result: WorkUnitAttempt,
    execute: ({ workUnitId }) =>
      sql`
        SELECT
          attempt_id AS id,
          workflow_id AS "workflowId",
          work_unit_id AS "workUnitId",
          attempt_number AS "attemptNumber",
          status,
          routing_decision_id AS "routingDecisionId",
          task_contract_id AS "taskContractId",
          result_packet_id AS "resultPacketId",
          thread_id AS "threadId",
          worktree_path AS "worktreePath",
          baseline_git_ref AS "baselineGitRef",
          started_at AS "startedAt",
          settled_at AS "settledAt",
          error,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM sascode_projection_work_unit_attempts
        WHERE work_unit_id = ${workUnitId}
        ORDER BY attempt_number ASC, attempt_id ASC
      `,
  });

  const getAttemptRow = SqlSchema.findOneOption({
    Request: GetDirectorAttemptInput,
    Result: WorkUnitAttempt,
    execute: ({ attemptId }) =>
      sql`
        SELECT
          attempt_id AS id,
          workflow_id AS "workflowId",
          work_unit_id AS "workUnitId",
          attempt_number AS "attemptNumber",
          status,
          routing_decision_id AS "routingDecisionId",
          task_contract_id AS "taskContractId",
          result_packet_id AS "resultPacketId",
          thread_id AS "threadId",
          worktree_path AS "worktreePath",
          baseline_git_ref AS "baselineGitRef",
          started_at AS "startedAt",
          settled_at AS "settledAt",
          error,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM sascode_projection_work_unit_attempts
        WHERE attempt_id = ${attemptId}
      `,
  });

  const transitionWorkflowRow = SqlSchema.findOneOption({
    Request: TransitionDirectorWorkflowInput,
    Result: InsertedIdRow,
    execute: (input) =>
      sql`
        UPDATE sascode_projection_workflows
        SET
          status = ${input.nextStatus},
          updated_at = ${input.updatedAt},
          started_at = COALESCE(${input.startedAt ?? null}, started_at),
          completed_at = COALESCE(${input.completedAt ?? null}, completed_at),
          cancelled_at = CASE
            WHEN ${input.nextStatus} = 'cancelled' THEN ${input.updatedAt}
            ELSE cancelled_at
          END
        WHERE workflow_id = ${input.workflowId}
          AND status = ${input.expectedStatus}
        RETURNING workflow_id AS id
      `,
  });

  const transitionWorkUnitRow = SqlSchema.findOneOption({
    Request: TransitionDirectorWorkUnitInput,
    Result: InsertedIdRow,
    execute: (input) =>
      sql`
        UPDATE sascode_projection_work_units
        SET
          status = ${input.nextStatus},
          updated_at = ${input.updatedAt},
          terminal_at = ${input.terminalAt ?? null}
        WHERE work_unit_id = ${input.workUnitId}
          AND status = ${input.expectedStatus}
        RETURNING work_unit_id AS id
      `,
  });

  const insertAttemptRow = SqlSchema.findOneOption({
    Request: WorkUnitAttempt,
    Result: InsertedIdRow,
    execute: (attempt) =>
      sql`
        INSERT INTO sascode_projection_work_unit_attempts (
          attempt_id,
          workflow_id,
          work_unit_id,
          attempt_number,
          status,
          routing_decision_id,
          task_contract_id,
          result_packet_id,
          thread_id,
          worktree_path,
          baseline_git_ref,
          started_at,
          settled_at,
          error,
          created_at,
          updated_at
        )
        VALUES (
          ${attempt.id},
          ${attempt.workflowId},
          ${attempt.workUnitId},
          ${attempt.attemptNumber},
          ${attempt.status},
          ${attempt.routingDecisionId},
          ${attempt.taskContractId},
          ${attempt.resultPacketId ?? null},
          ${attempt.threadId ?? null},
          ${attempt.worktreePath ?? null},
          ${attempt.baselineGitRef ?? null},
          ${attempt.startedAt ?? null},
          ${attempt.settledAt ?? null},
          ${attempt.error ?? null},
          ${attempt.createdAt},
          ${attempt.updatedAt}
        )
        ON CONFLICT (attempt_id) DO NOTHING
        RETURNING attempt_id AS id
      `,
  });

  const getWorkUnitAttemptSlotRow = SqlSchema.findOneOption({
    Request: Schema.Struct({ workUnitId: WorkUnit.fields.id }),
    Result: WorkUnitAttemptSlotRow,
    execute: ({ workUnitId }) =>
      sql`
        SELECT
          workflow_id AS "workflowId",
          active_attempt_id AS "activeAttemptId"
        FROM sascode_projection_work_units
        WHERE work_unit_id = ${workUnitId}
      `,
  });

  const activateWorkUnitAttemptRow = SqlSchema.findOneOption({
    Request: Schema.Struct({
      workUnitId: WorkUnit.fields.id,
      attemptId: WorkUnitAttempt.fields.id,
      updatedAt: WorkUnitAttempt.fields.updatedAt,
    }),
    Result: InsertedIdRow,
    execute: ({ workUnitId, attemptId, updatedAt }) =>
      sql`
        UPDATE sascode_projection_work_units
        SET
          active_attempt_id = ${attemptId},
          updated_at = ${updatedAt}
        WHERE work_unit_id = ${workUnitId}
          AND active_attempt_id IS NULL
        RETURNING work_unit_id AS id
      `,
  });

  const transitionAttemptRow = SqlSchema.findOneOption({
    Request: TransitionDirectorAttemptInput,
    Result: InsertedIdRow,
    execute: (input) =>
      sql`
        UPDATE sascode_projection_work_unit_attempts
        SET
          status = ${input.nextStatus},
          updated_at = ${input.updatedAt},
          started_at = COALESCE(${input.startedAt ?? null}, started_at),
          settled_at = ${input.settledAt ?? null},
          error = ${input.error ?? null}
        WHERE attempt_id = ${input.attemptId}
          AND status = ${input.expectedStatus}
        RETURNING attempt_id AS id
      `,
  });

  const clearActiveWorkUnitAttemptRow = SqlSchema.void({
    Request: Schema.Struct({
      workUnitId: WorkUnit.fields.id,
      attemptId: WorkUnitAttempt.fields.id,
      updatedAt: WorkUnitAttempt.fields.updatedAt,
    }),
    execute: ({ workUnitId, attemptId, updatedAt }) =>
      sql`
        UPDATE sascode_projection_work_units
        SET
          active_attempt_id = NULL,
          updated_at = CASE WHEN updated_at > ${updatedAt} THEN updated_at ELSE ${updatedAt} END
        WHERE work_unit_id = ${workUnitId}
          AND active_attempt_id = ${attemptId}
      `,
  });

  const getAttemptWorkUnitRow = SqlSchema.findOneOption({
    Request: Schema.Struct({ attemptId: WorkUnitAttempt.fields.id }),
    Result: Schema.Struct({ workUnitId: WorkUnit.fields.id }),
    execute: ({ attemptId }) =>
      sql`
        SELECT work_unit_id AS "workUnitId"
        FROM sascode_projection_work_unit_attempts
        WHERE attempt_id = ${attemptId}
      `,
  });

  const attachAttemptThreadRow = SqlSchema.findOneOption({
    Request: AttachDirectorAttemptThreadInput,
    Result: InsertedIdRow,
    execute: (input) =>
      sql`
        UPDATE sascode_projection_work_unit_attempts
        SET
          thread_id = ${input.threadId},
          worktree_path = COALESCE(${input.worktreePath ?? null}, worktree_path),
          baseline_git_ref = COALESCE(${input.baselineGitRef ?? null}, baseline_git_ref),
          updated_at = ${input.updatedAt}
        WHERE attempt_id = ${input.attemptId}
          AND thread_id IS NULL
        RETURNING attempt_id AS id
      `,
  });

  const loadWorkflow = (row: WorkflowRow) =>
    Effect.gen(function* () {
      const workUnits = yield* listWorkUnitRowsByWorkflow({ workflowId: row.id });
      const dependencies = yield* listDependencyRowsByWorkflow({ workflowId: row.id });
      return {
        ...row,
        workUnits,
        dependencies,
      } satisfies Workflow;
    });

  const createGraph: DirectorWorkflowRepositoryShape["createGraph"] = (workflow) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          const inserted = yield* insertWorkflowRow(workflow);
          if (Option.isNone(inserted)) {
            return false;
          }
          yield* Effect.forEach(workflow.workUnits, insertWorkUnitRow, { concurrency: 1 });
          yield* Effect.forEach(
            workflow.dependencies,
            (dependency) => insertDependencyRow({ workflowId: workflow.id, dependency }),
            { concurrency: 1 },
          );
          return true;
        }),
      )
      .pipe(
        Effect.mapError(
          toPersistenceSqlOrDecodeError(
            "DirectorWorkflowRepository.createGraph:transaction",
            "DirectorWorkflowRepository.createGraph:decode",
          ),
        ),
      );

  const getById: DirectorWorkflowRepositoryShape["getById"] = (input) =>
    getWorkflowRow(input).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.succeed(Option.none()),
          onSome: (row) => loadWorkflow(row).pipe(Effect.map(Option.some)),
        }),
      ),
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "DirectorWorkflowRepository.getById:query",
          "DirectorWorkflowRepository.getById:decode",
        ),
      ),
    );

  const listByProject: DirectorWorkflowRepositoryShape["listByProject"] = (input) =>
    listWorkflowRowsByProject(input).pipe(
      Effect.flatMap((rows) =>
        Effect.forEach(rows, loadWorkflow, {
          concurrency: 1,
        }),
      ),
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "DirectorWorkflowRepository.listByProject:query",
          "DirectorWorkflowRepository.listByProject:decode",
        ),
      ),
    );

  const getWorkUnitById: DirectorWorkflowRepositoryShape["getWorkUnitById"] = (input) =>
    getWorkUnitRow(input).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "DirectorWorkflowRepository.getWorkUnitById:query",
          "DirectorWorkflowRepository.getWorkUnitById:decode",
        ),
      ),
    );

  const listAttemptsByWorkUnit: DirectorWorkflowRepositoryShape["listAttemptsByWorkUnit"] = (
    input,
  ) =>
    listAttemptRowsByWorkUnit(input).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "DirectorWorkflowRepository.listAttemptsByWorkUnit:query",
          "DirectorWorkflowRepository.listAttemptsByWorkUnit:decode",
        ),
      ),
    );

  const getAttemptById: DirectorWorkflowRepositoryShape["getAttemptById"] = (input) =>
    getAttemptRow(input).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "DirectorWorkflowRepository.getAttemptById:query",
          "DirectorWorkflowRepository.getAttemptById:decode",
        ),
      ),
    );

  const transitionWorkflow: DirectorWorkflowRepositoryShape["transitionWorkflow"] = (input) =>
    transitionWorkflowRow(input).pipe(
      Effect.map(Option.isSome),
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "DirectorWorkflowRepository.transitionWorkflow:query",
          "DirectorWorkflowRepository.transitionWorkflow:decode",
        ),
      ),
    );

  const transitionWorkUnit: DirectorWorkflowRepositoryShape["transitionWorkUnit"] = (input) =>
    transitionWorkUnitRow(input).pipe(
      Effect.map(Option.isSome),
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "DirectorWorkflowRepository.transitionWorkUnit:query",
          "DirectorWorkflowRepository.transitionWorkUnit:decode",
        ),
      ),
    );

  const insertAttempt: DirectorWorkflowRepositoryShape["insertAttempt"] = (attempt) =>
    sql.withTransaction(
      Effect.gen(function* () {
        const slot = yield* getWorkUnitAttemptSlotRow({ workUnitId: attempt.workUnitId });
        if (
          Option.isNone(slot) ||
          slot.value.workflowId !== attempt.workflowId ||
          slot.value.activeAttemptId !== null
        ) {
          return false;
        }
        const inserted = yield* insertAttemptRow(attempt);
        if (Option.isNone(inserted)) {
          return false;
        }
        const activated = yield* activateWorkUnitAttemptRow({
          workUnitId: attempt.workUnitId,
          attemptId: attempt.id,
          updatedAt: attempt.updatedAt,
        });
        return Option.isSome(activated);
      }),
    ).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "DirectorWorkflowRepository.insertAttempt:transaction",
          "DirectorWorkflowRepository.insertAttempt:decode",
        ),
      ),
    );

  const transitionAttempt: DirectorWorkflowRepositoryShape["transitionAttempt"] = (input) =>
    sql.withTransaction(
      Effect.gen(function* () {
        const workUnit = yield* getAttemptWorkUnitRow({ attemptId: input.attemptId });
        if (Option.isNone(workUnit)) {
          return false;
        }
        const projectedWorkUnit = yield* getWorkUnitRow({
          workUnitId: workUnit.value.workUnitId,
        });
        if (Option.isNone(projectedWorkUnit)) {
          return false;
        }
        const expectsWorkUnitTransition =
          input.expectedWorkUnitStatus !== undefined ||
          input.nextWorkUnitStatus !== undefined;
        if (
          expectsWorkUnitTransition &&
          (input.expectedWorkUnitStatus === undefined ||
            input.nextWorkUnitStatus === undefined ||
            projectedWorkUnit.value.status !== input.expectedWorkUnitStatus)
        ) {
          return false;
        }
        const transitioned = yield* transitionAttemptRow(input);
        if (Option.isNone(transitioned)) {
          return false;
        }
        if (
          input.expectedWorkUnitStatus !== undefined &&
          input.nextWorkUnitStatus !== undefined
        ) {
          const workUnitTransitioned = yield* transitionWorkUnitRow({
            workUnitId: workUnit.value.workUnitId,
            expectedStatus: input.expectedWorkUnitStatus,
            nextStatus: input.nextWorkUnitStatus,
            terminalAt: input.workUnitTerminalAt,
            updatedAt: input.updatedAt,
          });
          if (Option.isNone(workUnitTransitioned)) {
            return yield* Effect.fail(
              new Error(
                "The work-unit state changed while its attempt lifecycle was committing.",
              ),
            );
          }
        }
        if (TERMINAL_ATTEMPT_STATUSES.has(input.nextStatus)) {
          yield* clearActiveWorkUnitAttemptRow({
            workUnitId: workUnit.value.workUnitId,
            attemptId: input.attemptId,
            updatedAt: input.updatedAt,
          });
        }
        return true;
      }),
    ).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "DirectorWorkflowRepository.transitionAttempt:transaction",
          "DirectorWorkflowRepository.transitionAttempt:decode",
        ),
      ),
    );

  const attachAttemptThread: DirectorWorkflowRepositoryShape["attachAttemptThread"] = (input) =>
    attachAttemptThreadRow(input).pipe(
      Effect.map(Option.isSome),
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "DirectorWorkflowRepository.attachAttemptThread:query",
          "DirectorWorkflowRepository.attachAttemptThread:decode",
        ),
      ),
    );

  return {
    createGraph,
    getById,
    listByProject,
    getWorkUnitById,
    listAttemptsByWorkUnit,
    getAttemptById,
    transitionWorkflow,
    transitionWorkUnit,
    insertAttempt,
    transitionAttempt,
    attachAttemptThread,
  } satisfies DirectorWorkflowRepositoryShape;
});

export const DirectorWorkflowRepositoryLive = Layer.effect(
  DirectorWorkflowRepository,
  makeDirectorWorkflowRepository,
);
