// FILE: sascode/fixture/useVisualFixture.ts
// Purpose: The single, hard-gated entry point to the development visual fixture.
// Layer: Development tooling.
//
// Two gates, both required:
//
//  1. `import.meta.env.DEV` — a compile-time constant, so the whole branch
//     (including the dynamic import) is dead code in a production build and the
//     fixture chunk is never emitted. The fixture cannot ship even by accident.
//  2. `?sascodeFixture=dusk` — so an ordinary development session still shows
//     real backend state, and invented sessions can never be mistaken for live
//     ones while debugging.
//
// The fixture loads asynchronously, so the first paint is always the real
// workspace. That is deliberate: if the flag is ever left on somewhere it should
// not be, what renders first is the truth.

import { useEffect, useState } from "react";

import type { VisualFixture } from "./duskWorkspaceFixture";

export const VISUAL_FIXTURE_PARAM = "sascodeFixture";

// Read at module scope, before the router has a chance to normalise the URL and
// drop a search param it does not know about. Reading this inside an effect
// looked correct and silently never matched.
const FIXTURE_REQUESTED =
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get(VISUAL_FIXTURE_PARAM) === "dusk";

export function useVisualFixture(): VisualFixture | null {
  const [fixture, setFixture] = useState<VisualFixture | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!FIXTURE_REQUESTED) return;

    let cancelled = false;
    void import("./duskWorkspaceFixture").then((module) => {
      if (!cancelled) setFixture(module.buildDuskWorkspaceFixture());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return fixture;
}

export type { VisualFixture };
