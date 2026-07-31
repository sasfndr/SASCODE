// FILE: sascode/api/rpcError.ts
// Purpose: Turns a wire-level failure into something a person can act on.
// Layer: Data adapter.
//
// RPC failures arrive as typed `WsRpcError` values, not `Error` instances, so
// `error instanceof Error` silently discards the reason and leaves the user
// with "something went wrong". The permission contract is explicit that the UI
// must show reason and consequence — that starts with not throwing the reason
// away.

interface WireErrorShape {
  code?: unknown;
  message?: unknown;
  detail?: unknown;
  cause?: unknown;
  error?: unknown;
  data?: unknown;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Extracts the most specific human-readable message available, walking one
 * level into nested `cause`/`error`/`data` payloads.
 */
export function describeRpcError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;

  if (typeof error === "string" && error.trim().length > 0) return error.trim();

  if (error && typeof error === "object") {
    const shape = error as WireErrorShape;
    const direct =
      readString(shape.message) ?? readString(shape.detail) ?? readString(shape.code);
    if (direct) {
      const code = readString(shape.code);
      // A bare code is unhelpful on its own but useful appended to a message.
      return code && direct !== code ? `${direct} (${code})` : direct;
    }
    for (const nested of [shape.cause, shape.error, shape.data]) {
      if (nested && typeof nested === "object") {
        const inner = nested as WireErrorShape;
        const message = readString(inner.message) ?? readString(inner.detail);
        if (message) return message;
      }
    }
  }

  return fallback;
}

/**
 * True when a failure looks like the project has not been bootstrapped yet, so
 * callers can offer the setup step instead of a dead end.
 */
export function looksLikeMissingProjectSetup(error: unknown): boolean {
  const message = describeRpcError(error, "").toLowerCase();
  return (
    message.includes("routing policy") ||
    message.includes("not found") ||
    message.includes("no policy") ||
    message.includes("permission grant")
  );
}
