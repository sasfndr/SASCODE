// FILE: sascode/shell/WorkspaceActions.tsx
// Purpose: The two creation actions the spatial shell must own now that there
//          is no sidebar to host them: open a new session, and add a project.
// Layer: Shell adapter.
//
// Both reuse the inherited flows rather than reimplementing them, so a session
// created here is identical to one created the old way — same draft bootstrap,
// same project creation dialog, same recovery behaviour.

import { lazy, Suspense, useCallback, useState } from "react";
import type { ProjectId } from "@synara/contracts";
import { IconFolderPlus, IconPlus } from "@tabler/icons-react";

import { useHandleNewThread } from "~/hooks/useHandleNewThread";
import { createOrRecoverProjectFromPath } from "~/lib/projectCreation";
import { ensureNativeApi } from "~/nativeApi";
import { useStore } from "~/store";

const CreateProjectDialog = lazy(async () => ({
  default: (await import("~/components/CreateProjectDialog")).CreateProjectDialog,
}));

export interface NewSessionButtonProps {
  projectId: ProjectId | null;
  label?: string;
  variant?: "primary" | "quiet";
  onCreated?: () => void;
}

/** Opens a fresh session in the given project and focuses it. */
export function NewSessionButton({
  projectId,
  label = "New session",
  variant = "quiet",
  onCreated,
}: NewSessionButtonProps) {
  const { handleNewThread } = useHandleNewThread();
  const [busy, setBusy] = useState(false);

  const create = useCallback(async () => {
    if (!projectId || busy) return;
    setBusy(true);
    try {
      await handleNewThread(projectId, { fresh: true });
      onCreated?.();
    } finally {
      setBusy(false);
    }
  }, [busy, handleNewThread, onCreated, projectId]);

  return (
    <button
      type="button"
      onClick={() => void create()}
      disabled={!projectId || busy}
      className="sas-transition sas-focusable flex items-center gap-1.5 rounded-[var(--sas-radius-xs)] px-2.5 py-1.5 text-[11.5px] font-medium disabled:opacity-45"
      style={
        variant === "primary"
          ? { backgroundColor: "var(--sas-accent)", color: "var(--sas-text-on-accent)" }
          : {
              backgroundColor: "var(--sas-surface-raised)",
              color: "var(--sas-text)",
              border: "1px solid var(--sas-line-strong)",
            }
      }
    >
      <IconPlus size={13} stroke={1.8} aria-hidden="true" />
      {label}
    </button>
  );
}

export interface AddProjectButtonProps {
  variant?: "primary" | "quiet" | "card";
}

/**
 * Adds a project to the workspace. Without this the spatial shell would have no
 * way to grow past whatever the server bootstrapped, because the sidebar that
 * used to own project creation is gone.
 */
export function AddProjectButton({ variant = "quiet" }: AddProjectButtonProps) {
  const [open, setOpen] = useState(false);
  const spaces = useStore((state) => state.spaces);
  const syncServerShellSnapshot = useStore((state) => state.syncServerShellSnapshot);

  const submit = useCallback(
    async (value: { workspaceRoot: string; createIfMissing: boolean; spaceId: string | null }) => {
      const api = ensureNativeApi();
      await createOrRecoverProjectFromPath({
        api,
        workspaceRoot: value.workspaceRoot,
        createIfMissing: value.createIfMissing,
        spaceId: value.spaceId as never,
        // The shell snapshot is what the spatial viewport renders from, so the
        // new project has to be folded in before the dialog closes.
        loadSnapshot: async () => {
          const snapshot = await api.orchestration.getShellSnapshot();
          if (snapshot) syncServerShellSnapshot(snapshot);
          return snapshot;
        },
      });
    },
    [syncServerShellSnapshot],
  );

  return (
    <>
      {variant === "card" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="sas-glass-quiet sas-transition sas-focusable flex h-[min(66vh,520px)] w-[min(18vw,220px)] shrink-0 flex-col items-center justify-center gap-2"
          style={{ borderStyle: "dashed" }}
        >
          <IconFolderPlus size={20} stroke={1.4} aria-hidden="true" style={{ color: "var(--sas-text-muted)" }} />
          <span className="text-[12px]" style={{ color: "var(--sas-text-secondary)" }}>
            Add project
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="sas-transition sas-focusable flex items-center gap-1.5 rounded-[var(--sas-radius-xs)] px-2.5 py-1.5 text-[11.5px] font-medium"
          style={
            variant === "primary"
              ? { backgroundColor: "var(--sas-accent)", color: "var(--sas-text-on-accent)" }
              : {
                  backgroundColor: "var(--sas-surface-raised)",
                  color: "var(--sas-text)",
                  border: "1px solid var(--sas-line-strong)",
                }
          }
        >
          <IconFolderPlus size={13} stroke={1.8} aria-hidden="true" />
          Add project
        </button>
      )}

      {open ? (
        <Suspense fallback={null}>
          <CreateProjectDialog
            open
            spaces={spaces}
            activeSpaceId={null}
            onOpenChange={setOpen}
            onSubmit={submit as never}
          />
        </Suspense>
      ) : null}
    </>
  );
}
