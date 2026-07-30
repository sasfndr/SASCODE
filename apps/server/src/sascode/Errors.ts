import {
  AgentRoleId,
  ResultPacketId,
  RoutingPolicyId,
  TaskContractId,
  WorkflowId,
  WorkUnitId,
} from "@synara/contracts";
import { Schema } from "effect";

export const DirectorWorkflowGraphIssue = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  workUnitIds: Schema.Array(WorkUnitId),
});
export type DirectorWorkflowGraphIssue = typeof DirectorWorkflowGraphIssue.Type;

export class DirectorWorkflowValidationError extends Schema.TaggedErrorClass<DirectorWorkflowValidationError>()(
  "DirectorWorkflowValidationError",
  {
    workflowId: WorkflowId,
    issues: Schema.Array(DirectorWorkflowGraphIssue),
  },
) {
  override get message(): string {
    return `Workflow ${this.workflowId} is invalid: ${this.issues.map((issue) => issue.message).join(" ")}`;
  }
}

export const DirectorEntityKind = Schema.Literals([
  "workflow",
  "work-unit",
  "attempt",
]);
export type DirectorEntityKind = typeof DirectorEntityKind.Type;

export class DirectorEntityNotFoundError extends Schema.TaggedErrorClass<DirectorEntityNotFoundError>()(
  "DirectorEntityNotFoundError",
  {
    entityKind: DirectorEntityKind,
    entityId: Schema.String,
  },
) {
  override get message(): string {
    return `${this.entityKind} ${this.entityId} does not exist.`;
  }
}

export class DirectorStateTransitionError extends Schema.TaggedErrorClass<DirectorStateTransitionError>()(
  "DirectorStateTransitionError",
  {
    entityKind: DirectorEntityKind,
    entityId: Schema.String,
    fromStatus: Schema.String,
    toStatus: Schema.String,
    detail: Schema.String,
  },
) {
  override get message(): string {
    return (
      `Cannot transition ${this.entityKind} ${this.entityId} from ` +
      `${this.fromStatus} to ${this.toStatus}: ${this.detail}`
    );
  }
}

export class DirectorConcurrencyConflictError extends Schema.TaggedErrorClass<DirectorConcurrencyConflictError>()(
  "DirectorConcurrencyConflictError",
  {
    operation: Schema.String,
    entityKind: DirectorEntityKind,
    entityId: Schema.String,
  },
) {
  override get message(): string {
    return (
      `${this.operation} lost an optimistic concurrency race for ` +
      `${this.entityKind} ${this.entityId}.`
    );
  }
}

export class DirectorIdentityConflictError extends Schema.TaggedErrorClass<DirectorIdentityConflictError>()(
  "DirectorIdentityConflictError",
  {
    entityKind: DirectorEntityKind,
    entityId: Schema.String,
  },
) {
  override get message(): string {
    return `${this.entityKind} ${this.entityId} already exists with a different identity.`;
  }
}

export type DirectorDomainError =
  | DirectorWorkflowValidationError
  | DirectorEntityNotFoundError
  | DirectorStateTransitionError
  | DirectorConcurrencyConflictError
  | DirectorIdentityConflictError;

export class RoutingPolicyNotFoundError extends Schema.TaggedErrorClass<RoutingPolicyNotFoundError>()(
  "RoutingPolicyNotFoundError",
  {
    policyId: RoutingPolicyId,
    revision: Schema.Number,
  },
) {
  override get message(): string {
    return `Routing policy ${this.policyId} revision ${this.revision} does not exist.`;
  }
}

export class RoutingRoleNotFoundError extends Schema.TaggedErrorClass<RoutingRoleNotFoundError>()(
  "RoutingRoleNotFoundError",
  {
    policyId: RoutingPolicyId,
    revision: Schema.Number,
    roleId: AgentRoleId,
  },
) {
  override get message(): string {
    return (
      `Role ${this.roleId} does not exist in routing policy ` +
      `${this.policyId} revision ${this.revision}.`
    );
  }
}

export class NoEligibleRoutingTargetError extends Schema.TaggedErrorClass<NoEligibleRoutingTargetError>()(
  "NoEligibleRoutingTargetError",
  {
    workflowId: WorkflowId,
    workUnitId: WorkUnitId,
    reasons: Schema.Array(Schema.String),
  },
) {
  override get message(): string {
    return `No model is eligible for work unit ${this.workUnitId}: ${this.reasons.join(" ")}`;
  }
}

export class RoutingInvariantError extends Schema.TaggedErrorClass<RoutingInvariantError>()(
  "RoutingInvariantError",
  {
    workUnitId: WorkUnitId,
    detail: Schema.String,
  },
) {
  override get message(): string {
    return `Cannot route work unit ${this.workUnitId}: ${this.detail}`;
  }
}

export class RoutingDecisionConflictError extends Schema.TaggedErrorClass<RoutingDecisionConflictError>()(
  "RoutingDecisionConflictError",
  {
    decisionId: Schema.String,
  },
) {
  override get message(): string {
    return `Routing decision ${this.decisionId} already exists and is immutable.`;
  }
}

export type ModelRouterDomainError =
  | DirectorEntityNotFoundError
  | RoutingPolicyNotFoundError
  | RoutingRoleNotFoundError
  | NoEligibleRoutingTargetError
  | RoutingInvariantError
  | RoutingDecisionConflictError;

export class TaskContractInvariantError extends Schema.TaggedErrorClass<TaskContractInvariantError>()(
  "TaskContractInvariantError",
  {
    workUnitId: WorkUnitId,
    detail: Schema.String,
  },
) {
  override get message(): string {
    return `Cannot seal task contract for ${this.workUnitId}: ${this.detail}`;
  }
}

export class TaskContractConflictError extends Schema.TaggedErrorClass<TaskContractConflictError>()(
  "TaskContractConflictError",
  {
    taskContractId: TaskContractId,
  },
) {
  override get message(): string {
    return `Task contract ${this.taskContractId} already exists and is immutable.`;
  }
}

export class ResultPacketInvariantError extends Schema.TaggedErrorClass<ResultPacketInvariantError>()(
  "ResultPacketInvariantError",
  {
    workUnitId: WorkUnitId,
    detail: Schema.String,
  },
) {
  override get message(): string {
    return `Result packet for ${this.workUnitId} is invalid: ${this.detail}`;
  }
}

export class ResultPacketConflictError extends Schema.TaggedErrorClass<ResultPacketConflictError>()(
  "ResultPacketConflictError",
  {
    resultPacketId: ResultPacketId,
  },
) {
  override get message(): string {
    return `Result packet ${this.resultPacketId} already exists and is immutable.`;
  }
}

export type TaskContractDomainError =
  | DirectorEntityNotFoundError
  | RoutingPolicyNotFoundError
  | TaskContractInvariantError
  | TaskContractConflictError
  | ResultPacketInvariantError
  | ResultPacketConflictError;
