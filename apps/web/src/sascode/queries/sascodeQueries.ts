// FILE: sascode/queries/sascodeQueries.ts
// Purpose: The single typed TanStack Query surface over `NativeApi.sascode`.
// Layer: Data access. Components never call the transport directly.
//
// Every option factory here is a `queryOptions(...)` so keys and result types
// stay in one place and invalidation from the Director event adapter can target
// exactly one project or workflow instead of blowing the whole cache.

import type {
  ProjectId,
  ProviderCapabilitySnapshot,
  SascodeBootstrapProjectInput,
  SascodeProjectSnapshot,
  SascodeSaveWorkspaceLayoutInput,
  SascodeStartFeatureInput,
  SascodeWorkspaceLayout,
  SascodeWorkspaceSnapshot,
  Workflow,
  WorkflowId,
} from "@synara/contracts";
import { queryOptions, type QueryClient } from "@tanstack/react-query";

import { ensureNativeApi } from "~/nativeApi";

const sascodeApi = () => ensureNativeApi().sascode;

export const sascodeQueryKeys = {
  all: ["sascode"] as const,
  workspace: (projectIds: ReadonlyArray<ProjectId>) =>
    ["sascode", "workspace", [...projectIds].sort().join("|")] as const,
  workspaceRoot: ["sascode", "workspace"] as const,
  project: (projectId: ProjectId | null) => ["sascode", "project", projectId] as const,
  projectRoot: ["sascode", "project"] as const,
  workflow: (workflowId: WorkflowId | null) => ["sascode", "workflow", workflowId] as const,
  workflowRoot: ["sascode", "workflow"] as const,
  capabilities: ["sascode", "provider-capabilities"] as const,
  layout: (projectId: ProjectId | null) => ["sascode", "layout", projectId] as const,
  layoutRoot: ["sascode", "layout"] as const,
};

/**
 * Attention and capability health for every project the workspace knows about.
 * This is what keeps cross-project presence alive while the user works inside a
 * single project space, so it must stay cheap and must not be gated on the
 * active project.
 */
export function workspaceSnapshotQueryOptions(projectIds: ReadonlyArray<ProjectId>) {
  return queryOptions({
    queryKey: sascodeQueryKeys.workspace(projectIds),
    queryFn: async (): Promise<SascodeWorkspaceSnapshot> =>
      sascodeApi().getWorkspaceSnapshot({
        projectIds: [...projectIds],
        now: new Date().toISOString(),
      }),
    enabled: projectIds.length > 0,
    // The Director event stream drives freshness; this interval is only a
    // safety net for a dropped subscription.
    refetchInterval: 60_000,
    staleTime: 5_000,
  });
}

export function projectSnapshotQueryOptions(projectId: ProjectId | null) {
  return queryOptions({
    queryKey: sascodeQueryKeys.project(projectId),
    queryFn: async (): Promise<SascodeProjectSnapshot> => {
      if (!projectId) throw new Error("projectSnapshotQueryOptions requires a projectId");
      return sascodeApi().getProjectSnapshot({ projectId, now: new Date().toISOString() });
    },
    enabled: projectId !== null,
    staleTime: 3_000,
  });
}

export function workflowQueryOptions(workflowId: WorkflowId | null) {
  return queryOptions({
    queryKey: sascodeQueryKeys.workflow(workflowId),
    queryFn: async (): Promise<Workflow | null> => {
      if (!workflowId) return null;
      return sascodeApi().getWorkflow({ workflowId });
    },
    enabled: workflowId !== null,
    staleTime: 3_000,
  });
}

/**
 * Live provider/model discovery. Never hard-code a model here — routing targets
 * are only ever drawn from what the installed runtimes actually report.
 */
export function providerCapabilitiesQueryOptions() {
  return queryOptions({
    queryKey: sascodeQueryKeys.capabilities,
    queryFn: async (): Promise<ReadonlyArray<ProviderCapabilitySnapshot>> =>
      sascodeApi().listProviderCapabilities(),
    staleTime: 30_000,
  });
}

export function workspaceLayoutQueryOptions(projectId: ProjectId | null) {
  return queryOptions({
    queryKey: sascodeQueryKeys.layout(projectId),
    queryFn: async (): Promise<SascodeWorkspaceLayout | null> => {
      if (!projectId) return null;
      return sascodeApi().getWorkspaceLayout({ projectId });
    },
    enabled: projectId !== null,
    // Layout is written by this client; only a conflict or another window
    // changes it underneath us, and both paths refetch explicitly.
    staleTime: Number.POSITIVE_INFINITY,
  });
}

// ── Mutations ────────────────────────────────────────────────────────

export async function refreshProviderCapabilities(queryClient: QueryClient) {
  const result = await sascodeApi().refreshProviderCapabilities({
    occurredAt: new Date().toISOString(),
  });
  // A partial refresh must never be shown as "no providers": seed the cache with
  // the snapshots we did get and surface the failures alongside them.
  if (result.snapshots.length > 0) {
    queryClient.setQueryData(sascodeQueryKeys.capabilities, result.snapshots);
  }
  return result;
}

export async function bootstrapProject(input: SascodeBootstrapProjectInput) {
  return sascodeApi().bootstrapProject(input);
}

export async function startFeature(input: SascodeStartFeatureInput) {
  return sascodeApi().startFeature(input);
}

export async function saveWorkspaceLayout(input: SascodeSaveWorkspaceLayoutInput) {
  return sascodeApi().saveWorkspaceLayout(input);
}

export async function resolveAttentionItem(fingerprint: string) {
  const now = new Date().toISOString();
  return sascodeApi().resolveAttentionItem({
    fingerprint,
    resolvedAt: now,
    updatedAt: now,
  });
}

export async function saveAttentionPreference(
  input: Parameters<ReturnType<typeof sascodeApi>["saveAttentionPreference"]>[0],
) {
  return sascodeApi().saveAttentionPreference(input);
}

export async function scheduleWorkUnit(
  spec: Parameters<ReturnType<typeof sascodeApi>["scheduleWorkUnit"]>[0]["spec"],
) {
  return sascodeApi().scheduleWorkUnit({ spec, occurredAt: new Date().toISOString() });
}

export async function runWorkflow(workflowId: WorkflowId, limit: number) {
  return sascodeApi().runWorkflow({
    workflowId,
    limit,
    occurredAt: new Date().toISOString(),
  });
}

// ── Invalidation helpers ─────────────────────────────────────────────

export function invalidateSascodeProject(queryClient: QueryClient, projectId: ProjectId) {
  return queryClient.invalidateQueries({ queryKey: sascodeQueryKeys.project(projectId) });
}

export function invalidateSascodeWorkflow(queryClient: QueryClient, workflowId: WorkflowId) {
  return queryClient.invalidateQueries({ queryKey: sascodeQueryKeys.workflow(workflowId) });
}

export function invalidateSascodeWorkspaceAttention(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: sascodeQueryKeys.workspaceRoot });
}
