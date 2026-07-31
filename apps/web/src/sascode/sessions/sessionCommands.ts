// FILE: sascode/sessions/sessionCommands.ts
// Purpose: The real orchestration commands the SASCODE shell issues on behalf
//          of a session — sending a turn, interrupting, resolving approvals.
// Layer: Command adapter.
//
// These go through the same `orchestration.dispatchCommand` path the inherited
// composer uses, so a message sent from the cross-session sheet is
// indistinguishable from one typed into the session's own composer.

import type { ModelSelection, ProviderApprovalDecision, ThreadId } from "@synara/contracts";

import { ensureNativeApi } from "~/nativeApi";
import { newCommandId, newMessageId } from "~/lib/utils";

export interface SendTurnInput {
  threadId: ThreadId;
  text: string;
  modelSelection?: ModelSelection;
  runtimeMode: "full-access" | "read-only" | (string & {});
  interactionMode: string;
}

/** Starts a turn on an existing thread. Rejects empty text rather than sending. */
export async function sendSessionTurn(input: SendTurnInput): Promise<boolean> {
  const text = input.text.trim();
  if (text.length === 0) return false;

  await ensureNativeApi().orchestration.dispatchCommand({
    type: "thread.turn.start",
    commandId: newCommandId(),
    threadId: input.threadId,
    message: {
      messageId: newMessageId(),
      role: "user",
      text,
      attachments: [],
    },
    ...(input.modelSelection ? { modelSelection: input.modelSelection } : {}),
    runtimeMode: input.runtimeMode,
    interactionMode: input.interactionMode,
    createdAt: new Date().toISOString(),
  } as never);
  return true;
}

/**
 * Fans one message out to several sessions.
 * Failures are collected rather than thrown so one unreachable session cannot
 * silently swallow the rest of a "send to both" dispatch.
 */
export async function sendSessionTurnToMany(
  inputs: ReadonlyArray<SendTurnInput>,
): Promise<{ sent: number; failed: ReadonlyArray<{ threadId: ThreadId; error: string }> }> {
  const failed: Array<{ threadId: ThreadId; error: string }> = [];
  let sent = 0;
  for (const input of inputs) {
    try {
      if (await sendSessionTurn(input)) sent += 1;
    } catch (error) {
      failed.push({
        threadId: input.threadId,
        error: error instanceof Error ? error.message : "Send failed",
      });
    }
  }
  return { sent, failed };
}

export async function interruptSession(threadId: ThreadId): Promise<void> {
  await ensureNativeApi().orchestration.dispatchCommand({
    type: "thread.turn.interrupt",
    commandId: newCommandId(),
    threadId,
    createdAt: new Date().toISOString(),
  } as never);
}

export async function stopSessionRuntime(threadId: ThreadId): Promise<void> {
  await ensureNativeApi().orchestration.dispatchCommand({
    type: "thread.session.stop",
    commandId: newCommandId(),
    threadId,
    createdAt: new Date().toISOString(),
  } as never);
}

export async function respondToApproval(input: {
  threadId: ThreadId;
  requestId: string;
  decision: ProviderApprovalDecision;
}): Promise<void> {
  await ensureNativeApi().orchestration.dispatchCommand({
    type: "thread.approval.respond",
    commandId: newCommandId(),
    threadId: input.threadId,
    requestId: input.requestId,
    decision: input.decision,
    createdAt: new Date().toISOString(),
  } as never);
}
