// FILE: sascode/fixture/FixtureWorkbenchPanes.tsx
// Purpose: Still, deterministic stand-ins for the four workbench modes, used
//          only by the development visual fixture.
// Layer: Development tooling.
//
// Production mounts the real browser, diff, terminal and explorer panels — see
// `SessionWorkbench`. These exist because those panels need a live session, a
// worktree and a running dev server to show anything, none of which can be held
// still for a screenshot comparison. They are frozen on purpose: no clock, no
// randomness, no fetching.
//
// This module is only ever imported from `duskWorkspaceFixture`, which is itself
// behind an `import.meta.env.DEV` dynamic import, so none of it reaches a
// production bundle.

import { DUSK_BACKGROUND_URL } from "../project-space/ProjectEnvironment";

/** The preview: the workspace's own environment, which is what the session is building. */
export function FixturePreview() {
  return (
    <div className="relative size-full overflow-hidden">
      <img
        src={DUSK_BACKGROUND_URL}
        alt=""
        className="absolute inset-0 size-full"
        style={{ objectFit: "cover", objectPosition: "62% 58%" }}
      />

      {/* The dual-session drop guide, which the reference state shows open. */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-[36%]"
        style={{ borderLeft: "1px dashed color-mix(in srgb, white 34%, transparent)" }}
      />
      <p
        aria-hidden="true"
        className="absolute top-1/2 left-[36%] w-[220px] -translate-x-1/2 -translate-y-1/2 text-center text-[12.5px] leading-[1.5]"
        style={{ color: "color-mix(in srgb, white 78%, transparent)" }}
      >
        Drop another session here
        <br />
        for dual-session mode
      </p>
    </div>
  );
}

const CHANGED_FILES = [
  { path: "src/sascode/shell/WorkspaceShell.tsx", added: 84, removed: 12 },
  { path: "src/sascode/layout/useProjectLayout.ts", added: 41, removed: 6 },
  { path: "src/sascode/sessions/SessionShelf.tsx", added: 33, removed: 27 },
  { path: "src/sascode/theme/stillspace.css", added: 12, removed: 4 },
];

export function FixtureChanges() {
  return (
    <div className="sas-scroll min-h-0 flex-1 p-3.5">
      <ul className="space-y-1">
        {CHANGED_FILES.map((file) => (
          <li
            key={file.path}
            className="flex items-center gap-3 rounded-[var(--sas-radius-xs)] px-3 py-2"
            style={{ backgroundColor: "var(--sas-surface-sunken)" }}
          >
            <span className="sas-numeric truncate text-[12px]" style={{ color: "var(--sas-text)" }}>
              {file.path}
            </span>
            <span className="sas-numeric ms-auto shrink-0 text-[11.5px]" style={{ color: "var(--sas-live)" }}>
              +{file.added}
            </span>
            <span className="sas-numeric shrink-0 text-[11.5px]" style={{ color: "var(--sas-blocked)" }}>
              −{file.removed}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TERMINAL_LINES = [
  "$ bun run test --filter sascode",
  "  ✓ layoutGeometry  12 passed",
  "  ✓ sessionCards     9 passed",
  "  ✓ spectrum        14 passed",
  "",
  "  35 passed in 1.84s",
  "$ ",
];

export function FixtureTerminal() {
  return (
    <div
      className="sas-scroll min-h-0 flex-1 p-4"
      style={{ backgroundColor: "var(--sas-code-surface)" }}
    >
      <pre className="sas-numeric text-[12px] leading-[1.65]" style={{ color: "var(--sas-text-secondary)" }}>
        {TERMINAL_LINES.join("\n")}
      </pre>
    </div>
  );
}

const FILE_TREE = [
  { depth: 0, name: "sascode", kind: "dir" as const },
  { depth: 1, name: "chat", kind: "dir" as const },
  { depth: 2, name: "AgentChatSheet.tsx", kind: "file" as const },
  { depth: 2, name: "AgentTranscript.tsx", kind: "file" as const },
  { depth: 1, name: "workbench", kind: "dir" as const },
  { depth: 2, name: "SessionWorkbench.tsx", kind: "file" as const },
  { depth: 1, name: "theme", kind: "dir" as const },
  { depth: 2, name: "stillspace.css", kind: "file" as const },
];

export function FixtureFiles() {
  return (
    <div className="sas-scroll min-h-0 flex-1 p-3.5">
      <ul>
        {FILE_TREE.map((entry) => (
          <li
            key={`${entry.depth}:${entry.name}`}
            className="truncate py-[3px] text-[12px]"
            style={{
              paddingInlineStart: entry.depth * 16 + 8,
              color: entry.kind === "dir" ? "var(--sas-text)" : "var(--sas-text-secondary)",
            }}
          >
            {entry.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
