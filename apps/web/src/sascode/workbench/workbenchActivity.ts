// FILE: sascode/workbench/workbenchActivity.ts
// Purpose: Project a session's raw activity feed into the three lines the
//          workbench footer shows.
// Layer: Pure derivation.
//
// The Director records far more than three events per minute. The strip is a
// glance, not a log, so this keeps only what a person watching the preview
// would actually want to know, newest first.

import type { OrchestrationThreadActivity } from "@synara/contracts";

import type { WorkbenchActivityItem } from "./WorkbenchActivityStrip";

/** Kinds that say nothing a person watching the work would act on. */
const NOISE_KINDS = new Set([
  "context-window.configured",
  "context-window.updated",
  "turn.tasks.updated",
  "account.rate-limits.updated",
]);

export function formatActivityTime(iso: string, locale?: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

export function deriveWorkbenchActivity(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
  options: { limit?: number; locale?: string } = {},
): WorkbenchActivityItem[] {
  const limit = options.limit ?? 3;
  const items: WorkbenchActivityItem[] = [];

  for (let index = activities.length - 1; index >= 0 && items.length < limit; index -= 1) {
    const activity = activities[index];
    if (!activity || NOISE_KINDS.has(activity.kind)) continue;
    items.push({
      id: activity.id,
      time: formatActivityTime(activity.createdAt, options.locale),
      text: activity.summary,
      tone: activity.tone,
    });
  }

  return items;
}
