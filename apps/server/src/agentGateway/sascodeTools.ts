import {
  ThreadId,
  WorkUnitResultSubmission,
} from "@synara/contracts";
import { Effect, Schema, SchemaIssue } from "effect";

import type { ResultIngestionShape } from "../sascode/Services/ResultIngestion.ts";
import { mcpToolResultError, mcpToolResultJson } from "./protocol.ts";
import { ToolInputError, errorText } from "./toolInput.ts";
import type { ToolEntry } from "./toolRuntime.ts";

export function makeAgentGatewaySascodeTools(
  ingestion: ResultIngestionShape,
): ReadonlyArray<ToolEntry> {
  return [
    {
      requiredCapability: "thread:write",
      requiresActiveTurn: true,
      definition: {
        name: "synara_submit_sascode_result",
        description:
          "Submit this assigned SASCODE attempt's structured result, evidence, and quality-gate runs. The caller thread must be the thread bound to the attempt. Call this once after completing and verifying the sealed task, before your final textual handoff.",
        inputSchema: {
          type: "object",
          properties: {
            packet: {
              type: "object",
              description:
                "Result packet matching the workflow, work unit, attempt, task contract, and contract digest in the sealed prompt.",
            },
            evidence: {
              type: "array",
              description:
                "Evidence records whose scope matches this assigned attempt.",
              items: { type: "object" },
            },
            qualityGateRuns: {
              type: "array",
              description:
                "Quality-gate runs backed by the submitted evidence.",
              items: { type: "object" },
            },
            verifiedAt: {
              type: "string",
              description: "ISO-8601 verification timestamp.",
            },
          },
          required: [
            "packet",
            "evidence",
            "qualityGateRuns",
            "verifiedAt",
          ],
          additionalProperties: false,
        },
        annotations: {
          title: "Submit SASCODE result",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      handler: (args, context) =>
        Schema.decodeUnknownEffect(WorkUnitResultSubmission)(args).pipe(
          Effect.mapError(
            (error) =>
              new ToolInputError(
                SchemaIssue.makeFormatterDefault()(error.issue),
              ),
          ),
          Effect.flatMap((submission) =>
            ingestion.submit({
              submission,
              actorKind: "agent",
              actorId: context.callerThreadId,
              expectedThreadId: ThreadId.makeUnsafe(
                context.callerThreadId,
              ),
            }),
          ),
          Effect.map(mcpToolResultJson),
          Effect.catch((error) =>
            Effect.succeed(mcpToolResultError(errorText(error))),
          ),
        ),
    },
  ];
}
