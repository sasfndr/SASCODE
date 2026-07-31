// FILE: sascode/workbench/WorkbenchAgentsPane.tsx
// Purpose: The Agents mode — who is on this work, in what order, and what is
//          still blocked.
// Layer: Presentation over the Director's own workflow read model.
//
// The dependency graph, statuses and routing are backend truth. This pane reads
// the workflow the session belongs to and renders it; it never re-derives which
// agent should run next.

import { useQuery } from "@tanstack/react-query";
import type { WorkflowId } from "@synara/contracts";

import { WorkGraph } from "../feature/WorkGraph";
import { workflowQueryOptions } from "../queries/sascodeQueries";

export interface WorkbenchAgentsPaneProps {
  /** Null for a session that is not part of a delegated workflow. */
  workflowId: WorkflowId | null;
}

export function WorkbenchAgentsPane({ workflowId }: WorkbenchAgentsPaneProps) {
  const workflow = useQuery(workflowQueryOptions(workflowId));

  if (!workflowId) {
    return (
      <PaneMessage>
        This session is not part of a delegated workflow, so there is no agent graph to show.
      </PaneMessage>
    );
  }

  if (workflow.isPending) {
    return <PaneMessage>Loading the work graph…</PaneMessage>;
  }

  if (!workflow.data) {
    return <PaneMessage>The work graph is no longer available.</PaneMessage>;
  }

  return (
    <div className="sas-scroll min-h-0 flex-1 p-3.5">
      <WorkGraph workflow={workflow.data} />
    </div>
  );
}

function PaneMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center">
      <p
        className="max-w-[38ch] text-[11.5px] leading-relaxed"
        style={{ color: "var(--sas-text-secondary)" }}
      >
        {children}
      </p>
    </div>
  );
}
