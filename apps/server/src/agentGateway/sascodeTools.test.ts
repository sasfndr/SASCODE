import {
  ProjectId,
  ResultPacketId,
  RoutingDecisionId,
  TaskContractId,
  ThreadId,
  WorkflowId,
  WorkUnitAttemptId,
  WorkUnitId,
  type WorkUnitResultSubmission,
} from "@synara/contracts";
import { assert, it } from "@effect/vitest";
import { Effect } from "effect";

import type { ResultIngestionShape } from "../sascode/Services/ResultIngestion.ts";
import { makeAgentGatewaySascodeTools } from "./sascodeTools.ts";
import type { ToolContext } from "./toolRuntime.ts";

const now = "2026-07-30T17:00:00.000Z";
const projectId = ProjectId.makeUnsafe("project-sascode-tool");
const workflowId = WorkflowId.makeUnsafe("workflow-sascode-tool");
const workUnitId = WorkUnitId.makeUnsafe("work-unit-sascode-tool");
const attemptId = WorkUnitAttemptId.makeUnsafe("attempt-sascode-tool");
const taskContractId = TaskContractId.makeUnsafe("task-sascode-tool");
const threadId = ThreadId.makeUnsafe("thread-sascode-tool");

const submission: WorkUnitResultSubmission = {
  packet: {
    id: ResultPacketId.makeUnsafe("result-sascode-tool"),
    workflowId,
    workUnitId,
    attemptId,
    taskContractId,
    taskContractDigest: "sealed-digest",
    status: "complete",
    summary: "The task is complete.",
    changedResources: [],
    decisionIds: [],
    evidenceIds: [],
    commandsRun: [],
    risks: [],
    unresolvedQuestions: [],
    nextAction: null,
    producedAt: now,
  },
  evidence: [],
  qualityGateRuns: [],
  verifiedAt: now,
};

it.effect("binds SASCODE result submission to the calling provider thread", () =>
  Effect.gen(function* () {
    const received: Parameters<ResultIngestionShape["submit"]>[0][] = [];
    const attempt = {
      id: attemptId,
      workflowId,
      workUnitId,
      attemptNumber: 1,
      status: "succeeded" as const,
      routingDecisionId: RoutingDecisionId.makeUnsafe(
        "routing-sascode-tool",
      ),
      taskContractId,
      resultPacketId: submission.packet.id,
      threadId,
      worktreePath: "/tmp/sascode-tool",
      baselineGitRef: "origin/main",
      startedAt: now,
      settledAt: now,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    const ingestion: ResultIngestionShape = {
      submit: (input) =>
        Effect.sync(() => {
          received.push(input);
          return {
            verification: {
              packet: submission.packet,
              acceptedForCompletion: true,
              issues: [],
              passedGateKeys: [],
              verifiedAt: now,
            },
            attempt,
            downstream: {
              scanned: 0,
              scheduled: 0,
              active: 0,
              exhausted: 0,
              deferred: 0,
              results: [],
            },
            replayed: false,
          };
        }),
    };
    const tool = makeAgentGatewaySascodeTools(ingestion)[0]!;
    const context: ToolContext = {
      principal: {
        kind: "provider-session",
        sessionKey: "session-sascode-tool",
        threadId,
        provider: "codex",
        turnId: "turn-sascode-tool",
      },
      callerThreadId: threadId,
      callerSessionKey: "session-sascode-tool",
      callerProvider: "codex",
      callerCapabilities: new Set(["thread:write"]),
      callerTurnId: "turn-sascode-tool",
      assertCallerTurnActive: () => Effect.void,
      jsonRpcRequestId: 1,
    };

    const result = yield* tool.handler(submission, context);
    assert.isFalse(result.isError ?? false);
    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0]?.actorKind, "agent");
    assert.strictEqual(received[0]?.actorId, threadId);
    assert.strictEqual(received[0]?.expectedThreadId, threadId);
  }),
);
