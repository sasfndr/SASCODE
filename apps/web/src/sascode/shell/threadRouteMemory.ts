// FILE: sascode/shell/threadRouteMemory.ts
// Purpose: Keeps cold-start thread restoration working now that the SASCODE
//          shell replaces the sidebar that used to record it.
// Layer: Shell adapter.
//
// `RestoreOrCreateChatRoute` reads `lastThreadRoute` out of the inherited
// sidebar UI state to decide where a fresh launch lands. That value was only
// ever written by `Sidebar.tsx`. The SASCODE work shell does not mount it, so
// without this the app would silently forget the last session on every restart.

import type { ThreadId } from "@synara/contracts";

import { persistSidebarUiState, readSidebarUiState } from "~/components/Sidebar.uiState";

let lastWritten: string | null = null;

/**
 * Records the route a cold start should return to.
 *
 * Writes are deduplicated because this runs on every navigation, and the
 * underlying store serialises the whole sidebar UI state each time.
 */
export function rememberSascodeThreadRoute(
  threadId: ThreadId,
  splitViewId: string | null,
): void {
  const signature = `${threadId}:${splitViewId ?? ""}`;
  if (signature === lastWritten) return;
  lastWritten = signature;

  try {
    const current = readSidebarUiState();
    persistSidebarUiState({
      ...current,
      lastThreadRoute: {
        threadId,
        ...(splitViewId ? { splitViewId } : {}),
      },
    } as never);
  } catch {
    // Restoration is a convenience; never let it break navigation.
  }
}
