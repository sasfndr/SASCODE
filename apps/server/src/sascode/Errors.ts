import {
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
