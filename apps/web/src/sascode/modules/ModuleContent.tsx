// FILE: sascode/modules/ModuleContent.tsx
// Purpose: Resolves a placement to its renderer, lazily, and suspends what is
//          not on screen.
// Layer: Module host.
//
// Heavy modules mount lazily and unmount when hidden rather than merely being
// display:none — that is what actually stops decoding, polling, and audio.
// Modules that map onto an inherited panel say so and open it, instead of
// shipping a second implementation of Diff, Terminal, or Browser.

import { Suspense, lazy, useMemo } from "react";
import type { ProjectId, SascodeWorkspaceModulePlacement } from "@synara/contracts";
import { useQuery } from "@tanstack/react-query";

import {
  providerCapabilitiesQueryOptions,
  projectSnapshotQueryOptions,
  refreshProviderCapabilities,
} from "../queries/sascodeQueries";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { moduleDefinition, type SascodeModuleType } from "./moduleRegistry";
import {
  ContextEvidenceModule,
  NotesModule,
  ProviderUsageModule,
  TimerModule,
} from "./WorkspaceModules";

const MusicModule = lazy(async () => ({
  default: (await import("./MediaModules")).MusicModule,
}));
const VideoModule = lazy(async () => ({
  default: (await import("./MediaModules")).VideoModule,
}));

export interface ModuleContentProps {
  placement: SascodeWorkspaceModulePlacement;
  visible: boolean;
  projectId: ProjectId | null;
  onConfigure: (patch: Record<string, string>) => void;
}

export function ModuleContent({ placement, visible, projectId, onConfigure }: ModuleContentProps) {
  const type = placement.moduleType as SascodeModuleType;
  const definition = moduleDefinition(type);
  const configuration = useMemo(
    () => ({ ...placement.configuration }) as Record<string, string>,
    [placement.configuration],
  );

  if (definition?.heavy && !visible) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[11px]" style={{ color: "var(--sas-text-muted)" }}>
          Suspended while hidden
        </p>
      </div>
    );
  }

  switch (type) {
    case "notes":
      return <NotesModule configuration={configuration} onConfigure={onConfigure} />;
    case "timer":
      return <TimerModule configuration={configuration} onConfigure={onConfigure} />;
    case "music":
      return (
        <Suspense fallback={<ModuleLoading />}>
          <MusicModule visible={visible} configuration={configuration} onConfigure={onConfigure} />
        </Suspense>
      );
    case "video":
      return (
        <Suspense fallback={<ModuleLoading />}>
          <VideoModule visible={visible} configuration={configuration} onConfigure={onConfigure} />
        </Suspense>
      );
    case "provider-usage":
      return <ProviderUsagePanel />;
    case "context-evidence":
      return <ContextEvidencePanel projectId={projectId} />;
    case "agent-chat":
    case "session-surface":
    case "session-shelf":
      return <CoreModuleNotice title={definition?.title ?? type} />;
    default:
      return <InheritedPanelNotice title={definition?.title ?? type} />;
  }
}

function ModuleLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <span className="text-[11px]" style={{ color: "var(--sas-text-muted)" }}>
        Loading
      </span>
    </div>
  );
}

function ProviderUsagePanel() {
  const queryClient = useQueryClient();
  const capabilities = useQuery(providerCapabilitiesQueryOptions());
  const [refreshing, setRefreshing] = useState(false);
  const [failures, setFailures] = useState<ReadonlyArray<{ provider: string; detail: string }>>([]);

  return (
    <ProviderUsageModule
      snapshots={capabilities.data ?? []}
      refreshing={refreshing || capabilities.isFetching}
      failures={failures}
      onRefresh={() => {
        setRefreshing(true);
        void refreshProviderCapabilities(queryClient)
          .then((result) => setFailures(result.failures.map((entry) => ({ ...entry }))))
          .finally(() => setRefreshing(false));
      }}
    />
  );
}

function ContextEvidencePanel({ projectId }: { projectId: ProjectId | null }) {
  const snapshot = useQuery(projectSnapshotQueryOptions(projectId));
  return <ContextEvidenceModule snapshot={snapshot.data ?? null} />;
}

function CoreModuleNotice({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center p-4 text-center">
      <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--sas-text-secondary)" }}>
        {title} is placed by the workspace. Move and resize it here; it renders live once you leave
        Edit Space.
      </p>
    </div>
  );
}

function InheritedPanelNotice({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center p-4 text-center">
      <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--sas-text-secondary)" }}>
        {title} opens inside the active session, where it has that session&apos;s working directory,
        branch, and permissions. Use the context lens to show it.
      </p>
    </div>
  );
}
