import {
  AgentRoleId,
  AuditRecordId,
  BrowserInstanceId,
  BrowserProfileId,
  DirectorCommandId,
  ModuleId,
  ModuleInstanceId,
  ProjectId,
  ResultPacketId,
  RoutingPolicyId,
  StepUpRequestId,
  TaskContractId,
  WorkflowId,
  WorkUnitAttemptId,
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

export class DirectorCommandIdentityCollisionError extends Schema.TaggedErrorClass<DirectorCommandIdentityCollisionError>()(
  "DirectorCommandIdentityCollisionError",
  {
    commandId: DirectorCommandId,
    detail: Schema.String,
  },
) {
  override get message(): string {
    return `Director command ${this.commandId} has a conflicting identity: ${this.detail}`;
  }
}

export class DirectorEventInvariantError extends Schema.TaggedErrorClass<DirectorEventInvariantError>()(
  "DirectorEventInvariantError",
  {
    commandId: DirectorCommandId,
    detail: Schema.String,
  },
) {
  override get message(): string {
    return `Director command ${this.commandId} could not commit an event: ${this.detail}`;
  }
}

export class DirectorThreadLaunchError extends Schema.TaggedErrorClass<DirectorThreadLaunchError>()(
  "DirectorThreadLaunchError",
  {
    attemptId: WorkUnitAttemptId,
    code: Schema.String,
    detail: Schema.String,
    retryable: Schema.Boolean,
    operationMayHaveCommitted: Schema.Boolean,
  },
) {
  override get message(): string {
    return `Thread launch failed for attempt ${this.attemptId}: ${this.detail}`;
  }
}

export class DirectorDispatchInvariantError extends Schema.TaggedErrorClass<DirectorDispatchInvariantError>()(
  "DirectorDispatchInvariantError",
  {
    attemptId: WorkUnitAttemptId,
    detail: Schema.String,
  },
) {
  override get message(): string {
    return `Attempt ${this.attemptId} cannot be dispatched: ${this.detail}`;
  }
}

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

export class WorkUnitExecutionSpecConflictError extends Schema.TaggedErrorClass<WorkUnitExecutionSpecConflictError>()(
  "WorkUnitExecutionSpecConflictError",
  {
    workUnitId: WorkUnitId,
    revision: Schema.Number,
    detail: Schema.String,
  },
) {
  override get message(): string {
    return (
      `Execution spec ${this.workUnitId}@${this.revision} conflicts with ` +
      `durable execution intent: ${this.detail}`
    );
  }
}

export class WorkUnitExecutionInvariantError extends Schema.TaggedErrorClass<WorkUnitExecutionInvariantError>()(
  "WorkUnitExecutionInvariantError",
  {
    workUnitId: WorkUnitId,
    detail: Schema.String,
  },
) {
  override get message(): string {
    return `Cannot orchestrate work unit ${this.workUnitId}: ${this.detail}`;
  }
}

export class CapabilityAuditConflictError extends Schema.TaggedErrorClass<CapabilityAuditConflictError>()(
  "CapabilityAuditConflictError",
  {
    auditRecordId: AuditRecordId,
  },
) {
  override get message(): string {
    return `Audit record ${this.auditRecordId} already exists.`;
  }
}

export class StepUpRequestConflictError extends Schema.TaggedErrorClass<StepUpRequestConflictError>()(
  "StepUpRequestConflictError",
  {
    requestId: StepUpRequestId,
  },
) {
  override get message(): string {
    return `Step-up request ${this.requestId} already exists or changed concurrently.`;
  }
}

export type CapabilityBrokerDomainError =
  | CapabilityAuditConflictError
  | StepUpRequestConflictError;

export class BrowserWorkspaceNotFoundError extends Schema.TaggedErrorClass<BrowserWorkspaceNotFoundError>()(
  "BrowserWorkspaceNotFoundError",
  {
    entityKind: Schema.Literals(["profile", "instance"]),
    entityId: Schema.String,
  },
) {
  override get message(): string {
    return `Browser ${this.entityKind} ${this.entityId} does not exist.`;
  }
}

export class BrowserWorkspaceConflictError extends Schema.TaggedErrorClass<BrowserWorkspaceConflictError>()(
  "BrowserWorkspaceConflictError",
  {
    instanceId: BrowserInstanceId,
    detail: Schema.String,
  },
) {
  override get message(): string {
    return `Browser instance ${this.instanceId} conflict: ${this.detail}`;
  }
}

export class BrowserProfileConflictError extends Schema.TaggedErrorClass<BrowserProfileConflictError>()(
  "BrowserProfileConflictError",
  {
    profileId: BrowserProfileId,
  },
) {
  override get message(): string {
    return `Browser profile ${this.profileId} conflicts with an existing profile or partition.`;
  }
}

export type BrowserWorkspaceDomainError =
  | BrowserWorkspaceNotFoundError
  | BrowserWorkspaceConflictError
  | BrowserProfileConflictError;

export class ModuleManifestInvariantError extends Schema.TaggedErrorClass<ModuleManifestInvariantError>()(
  "ModuleManifestInvariantError",
  {
    moduleId: ModuleId,
    detail: Schema.String,
  },
) {
  override get message(): string {
    return `Module ${this.moduleId} manifest is invalid: ${this.detail}`;
  }
}

export class ModuleInstanceConflictError extends Schema.TaggedErrorClass<ModuleInstanceConflictError>()(
  "ModuleInstanceConflictError",
  {
    instanceId: ModuleInstanceId,
    detail: Schema.String,
  },
) {
  override get message(): string {
    return `Module instance ${this.instanceId} conflict: ${this.detail}`;
  }
}

export class ModuleNotFoundError extends Schema.TaggedErrorClass<ModuleNotFoundError>()(
  "ModuleNotFoundError",
  {
    entityKind: Schema.Literals(["manifest", "instance"]),
    entityId: Schema.String,
  },
) {
  override get message(): string {
    return `Module ${this.entityKind} ${this.entityId} does not exist.`;
  }
}

export type ModuleRuntimeDomainError =
  | ModuleManifestInvariantError
  | ModuleInstanceConflictError
  | ModuleNotFoundError;

export class WorkspaceLayoutConflictError extends Schema.TaggedErrorClass<WorkspaceLayoutConflictError>()(
  "WorkspaceLayoutConflictError",
  {
    projectId: ProjectId,
    expectedRevision: Schema.Number,
    detail: Schema.String,
  },
) {
  override get message(): string {
    return (
      `Workspace layout ${this.projectId} revision ${this.expectedRevision} ` +
      `conflicts with durable state: ${this.detail}`
    );
  }
}
