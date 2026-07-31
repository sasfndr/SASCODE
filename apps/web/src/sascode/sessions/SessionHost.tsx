// FILE: sascode/sessions/SessionHost.tsx
// Purpose: Mounts the real Synara chat surface inside a project space.
// Layer: Shell adapter.
//
// This is the seam that lets the shell be reinvented without reimplementing the
// code harness. `SingleChatSurface` and `SplitChatSurface` are reused unchanged,
// which is what keeps streaming chat, the composer, plan/approval cards, tool
// activity, model controls, file references, diff review, Git actions,
// terminals, the browser panel, and pull requests all working.
//
// Two adaptations are needed, both handled here rather than by forking:
//
//  1. Those surfaces assume they *are* the viewport. `data-sas-session-host`
//     remaps their viewport units to the host box (see stillspace.css).
//  2. `ChatHeader` and its right dock require a `SidebarProvider` ancestor —
//     `useSidebar()` throws without one. A local provider satisfies that, scopes
//     the right dock's width measurement to this pane instead of the window,
//     and reports `open` so the header does not render a second, dead sidebar
//     toggle. No `<Sidebar>` is rendered, so no project/session sidebar exists.

import { Suspense, lazy, memo } from "react";
import type { ProjectId, ThreadId } from "@synara/contracts";

import { SidebarProvider } from "~/components/ui/sidebar";
import type { DiffRouteSearch } from "~/diffRouteSearch";
import { SessionSurfaceSkeleton } from "./SessionSurfaceSkeleton";

const SingleChatSurface = lazy(async () => ({
  default: (await import("~/components/chat/SingleChatSurface")).SingleChatSurface,
}));

const SplitChatSurface = lazy(async () => ({
  default: (await import("~/components/chat/SplitChatSurface")).SplitChatSurface,
}));

export interface SessionHostProps {
  threadId: ThreadId;
  projectId: ProjectId | null;
  search: DiffRouteSearch;
  /** Renders the inherited split surface when the route carries a split view. */
  splitViewId?: string | null;
  /** Marks which pane owns keyboard focus in a dual layout. */
  focused?: boolean;
  onFocus?: () => void;
}

export const SessionHost = memo(function SessionHost({
  threadId,
  projectId,
  search,
  splitViewId,
  focused = true,
  onFocus,
}: SessionHostProps) {
  return (
    <div
      data-sas-session-host="true"
      data-sas-gesture-opaque="true"
      onPointerDownCapture={onFocus}
      onFocusCapture={onFocus}
      className="sas-token-bridge relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden"
      style={{
        backgroundColor: "var(--sas-surface)",
        borderRadius: "var(--sas-radius-lg)",
        border: `1px solid ${focused ? "var(--sas-accent-line)" : "var(--sas-line)"}`,
        boxShadow: focused ? "var(--sas-shadow-float)" : "var(--sas-shadow-lift)",
      }}
    >
      {/* Controlled open so the inherited header treats the (absent) sidebar as
          expanded and stays quiet, rather than offering a toggle to nothing. */}
      <SidebarProvider
        open
        onOpenChange={() => {}}
        data-sidebar-side="left"
        className="!min-h-0 h-full w-full bg-transparent"
        style={{ minHeight: 0 }}
      >
        <Suspense fallback={<SessionSurfaceSkeleton />}>
          {splitViewId ? (
            <SplitChatSurface splitViewId={splitViewId} routeThreadId={threadId} />
          ) : (
            <SingleChatSurface threadId={threadId} projectId={projectId} search={search} />
          )}
        </Suspense>
      </SidebarProvider>
    </div>
  );
});
