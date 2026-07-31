# Claude prompt — SASCODE visual recovery, checkpoint one

Paste the prompt below into Claude Code while its working directory is:

```text
/Users/sas/Documents/SASCODE-stillspace
```

This is deliberately a gated first checkpoint. Do not ask Claude to rebuild all
six screens in one blind pass. The canonical workspace must first match the
selected reference closely enough to approve.

---

You are repairing a visually rejected SASCODE frontend.

The current branch contains substantial functional work worth preserving, but
its presentation is not accepted. This is not a small polish pass. Rebuild the
presentation architecture for the canonical workspace while preserving the
real backend integration, routing, session state, commands, durable layout
logic, gestures, approvals, tests, and provider behavior already implemented.

Work only in:

```text
/Users/sas/Documents/SASCODE-stillspace
```

Continue the existing branch and pull request:

```text
branch: claude/sasfndr/stillspace-frontend-20260731
PR: https://github.com/sasfndr/SASCODE/pull/2
```

Do not edit `/Users/sas/Documents/SASCODE`; it is the read-only design and
backend reference worktree for this task.

## Stop and understand the failure before editing

Read completely:

```text
/Users/sas/Documents/SASCODE/AGENTS.md
/Users/sas/Documents/SASCODE/FRONTEND_VISUAL_AUDIT_2026-07-31.md
/Users/sas/Documents/SASCODE/CLAUDE.md
/Users/sas/Documents/SASCODE/BACKEND_HANDOFF.md
```

Inspect the current implementation, especially:

```text
apps/web/src/sascode/sessions/SessionHost.tsx
apps/web/src/sascode/project-space/ProjectSpace.tsx
apps/web/src/sascode/project-space/ProjectBackdrop.tsx
apps/web/src/sascode/chat/AgentChatSheet.tsx
apps/web/src/sascode/sessions/SessionShelf.tsx
apps/web/src/sascode/shell/AmbientFrame.tsx
apps/web/src/sascode/theme/stillspace.css
```

Then open these images at full resolution. Do not rely on thumbnails:

```text
PRIMARY COMPOSITION SOURCE
/Users/sas/Documents/SASCODE/design-references/ui-states/01-dusk-workspace-foundation.png

SECONDARY FOCUS SOURCE
/Users/sas/Documents/SASCODE/design-references/ui-states/02-official-focus-state.png

MANDATORY DEFAULT BACKGROUND
/Users/sas/Documents/SASCODE/design-references/branding/04-stillspace-dusk-background.png
```

The primary source is `1487 × 1058`. It is a binding visual target for this
checkpoint—not a mood board, loose inspiration, or an invitation to invent a
different layout.

## Explicitly reverse the three decisions that caused the failure

### 1. Do not embed the complete old chat shell in the center

`SessionHost` currently mounts the full inherited
`SingleChatSurface`/`SplitChatSurface`. That creates the old Synara composer and
environment UI inside the main surface while Agent Chat creates another chat
surface.

This is visually and structurally wrong.

Refactor the reusable pieces instead:

- Agent Chat owns the active transcript, messages, tool activity, approvals,
  user input, and composer.
- The large center owns a session workbench.
- The workbench defaults to **Preview**.
- Its adjacent modes are **Changes**, **Terminal**, **Files**, and **Agents**.
- Reuse the underlying real preview/browser, diff, terminal, file, and agent
  components and state. Do not reimplement them with fake JSON.
- If the inherited chat surface is not decomposed cleanly enough, extract
  presentation-neutral transcript/composer pieces. Do not hide the old full
  shell under layers of CSS.

There must be only one visible conversation/composer hierarchy.

### 2. Do not replace the background with procedural gradients

For the canonical Stillspace Dusk preset, ship and render the exact
`04-stillspace-dusk-background.png` asset as the default full-bleed environment.

- Copy it into the web app's appropriate static asset location.
- Use `object-fit: cover`/equivalent with a stable focal point.
- Keep a restrained readability scrim.
- Do not dim it into invisibility.
- Keep flat/reduced-background accessibility alternatives.
- Keep custom project backgrounds as a later option.

Procedural gradients may supplement the image with light and scrim, but may not
replace it in the default Dusk state.

### 3. Do not preserve the current giant empty bordered canvas

Remove the enormous outlined dead zone and the generic upper-left pile of
panels. The visible environment must be composed around the four source
anchors: ambient frame, Agent Chat, preview workbench, and live session shelf.

## Binding geometry at the canonical viewport

Create a deterministic development-only visual fixture for the normal active
workspace and render it at exactly `1487 × 1058`.

Use the primary source as the geometry authority. At this viewport, the
composition should land approximately at:

- Ambient frame: `0–56px` high, visually transparent over the environment.
- Left Agent Chat: `x ≈ 90`, `y ≈ 73`, `w ≈ 410`, `h ≈ 573`.
- Main workbench: `x ≈ 510`, `y ≈ 73`, `w ≈ 885`, `h ≈ 695`.
- Right context rail: visually attached to the workbench edge around its
  vertical center; no detached generic toolbar.
- Session shelf: `x ≈ 50`, `y ≈ 780`, `w ≈ 1378`, `h ≈ 168`.
- Neighbor project edge reveals: narrow, visible slivers at both sides.
- Decision toast: lower-right, above the bottom safe area.

These values are guides for reconstructing the source at the same viewport.
Judge the final result from the screenshot, not by satisfying numbers in code.

The primary hierarchy must be unmistakable:

1. illuminated environment and preview;
2. active session/workbench;
3. Agent Chat;
4. live session shelf;
5. quiet global chrome.

## Binding visual language

### Environment

- The Dusk image supplies most of the scene's visual weight.
- Preserve its horizon, architecture, warm edge lighting, cool mineral sky,
  and sense of depth.
- The application must feel inhabitable, not like a black admin dashboard.

### Glass

- Floating surfaces reveal the environment beneath them.
- Use cool neutral translucent fills, not opaque navy cards.
- Use a fine one-pixel rim/highlight and a soft large-radius shadow.
- Use blur and saturation only where a real image sits behind the glass.
- Avoid glass nested inside glass. Use quieter inset rows inside a glass parent.
- Corners are generous and consistent, but the app is not a collection of
  unrelated pills.

### Stable work surface

- The workbench can use a darker matte/translucent plane for legibility.
- Its Preview mode must still show the active application/environment clearly.
- The top mode switcher is compact, attached to the workbench, and visually
  subordinate to the preview.

### Typography and controls

- Primary text must be crisp and immediately readable.
- Secondary text is quiet, never disabled-looking.
- Do not reduce contrast merely to seem minimal.
- Maintain comfortable pointer targets even when icons are visually small.
- Status color is semantic and restrained.

### Density

- Use the source's generous breathing room and deliberate grouping.
- Do not create a huge unused void.
- Do not add a dashboard grid, permanent sidebar, generic stat cards, or
  equal-weight toolbar.

## Deterministic reference fixture

Live backend state cannot reliably reproduce a design reference. Add an
explicit development/test-only visual fixture that feeds the real presentation
components with deterministic data:

- one active project named `Workspace shell`;
- an active Opus implementation session at 62%;
- one Fable UI-direction item with an image attachment;
- one queued GPT systems session;
- four live shelf cards including one approval;
- preview/changes/terminal/files modes;
- one decision toast;
- left and right neighboring project edge reveals.

The fixture must never become production data or a production fallback. It is a
visual QA surface for the same components production uses.

## Required working method

1. Capture the current implementation at `1487 × 1058`.
2. Save it as the explicit “before” screenshot.
3. Implement only the canonical normal workspace in this checkpoint.
4. Capture the rebuilt state at the same viewport.
5. Create a side-by-side comparison containing:
   - the source `01-dusk-workspace-foundation.png`;
   - the rebuilt screenshot.
6. Also create a 50%-opacity overlay or equivalent diff view.
7. Inspect the combined comparison and correct visible differences.
8. Repeat until the major anchors, proportions, atmosphere, hierarchy, and
   materials match.

Do not call a screenshot “close enough” merely because:

- the elements have similar names;
- the tests pass;
- the layout is responsive;
- the colors are vaguely dark;
- glass and rounded corners are present.

## Acceptance criteria for checkpoint one

The checkpoint is accepted only when:

- The exact Dusk background is clearly visible.
- There is one conversation/composer, inside Agent Chat.
- The center is a preview-first workbench, not the old full chat shell.
- The four primary anchors occupy the same visual roles and similar proportions
  as the primary source.
- The shelf contains substantial live session cards, not an empty pill.
- Text and icons are comfortably legible.
- Glass reads as illuminated translucent material rather than opaque dark
  plastic.
- The giant outlined empty canvas is gone.
- No permanent project/session sidebar appears.
- Existing real backend/session commands still work outside the visual fixture.
- Focus, reduced motion, and reduced transparency have not regressed.

## Scope discipline

For this checkpoint:

- Do not build the other five reference states yet.
- Do not add unrelated product features.
- Do not redesign settings, billing, marketing, or secondary administration.
- Do not merge the account-pool/backend PR while doing this visual correction.
- Do not discard the functional work from the existing frontend branch.
- Do not report test totals as visual proof.

You may refactor presentation seams substantially where the current composition
is structurally wrong.

## Handoff and mandatory stop

Run focused tests and the production web build allowed by repository
instructions. Visually verify the production bundle.

Commit and push the canonical visual checkpoint to the existing frontend branch
and update PR #2 with:

- what presentation architecture changed;
- the before screenshot;
- the reference image;
- the after screenshot;
- the side-by-side comparison;
- remaining known visual differences.

Then **stop**. Do not continue to dual-session, dual-project, overview, Edit
Space, Daylight, or Nightfall until the user approves this canonical
composition.
