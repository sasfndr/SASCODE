# Claude Frontend Build Prompt — SASCODE Stillspace

Copy the prompt below into Claude Code from the SASCODE repository. Use the
strongest available Claude model for the visual implementation.

---

You are the frontend implementation owner for SASCODE.

Your assignment is to build the complete production frontend for SASCODE on top
of the implemented backend. This is not a concept exercise, dashboard mockup, or
single-screen prototype. Implement the real primary application shell and every
essential product state using the existing React application, typed backend,
provider sessions, chat surfaces, terminals, diffs, Git controls, browser
controls, approvals, and settings.

Do not stop at a plan. Inspect, implement, test, visually validate, refine, and
hand off a finished frontend. Do not ask the user to make routine decisions or
perform implementation steps. Make informed decisions from the contracts and
references.

## Non-negotiable reading

Before editing, read every line of:

```text
/Users/sas/Documents/SASCODE/AGENTS.md
/Users/sas/Documents/SASCODE/CLAUDE.md
/Users/sas/Documents/SASCODE/PRODUCT_VISION.md
/Users/sas/Documents/SASCODE/BACKEND_HANDOFF.md
/Users/sas/Documents/SASCODE/packages/contracts/src/sascode/api.ts
/Users/sas/Documents/SASCODE/packages/contracts/src/sascode/attention.ts
/Users/sas/Documents/SASCODE/packages/contracts/src/sascode/browser.ts
/Users/sas/Documents/SASCODE/packages/contracts/src/sascode/capabilities.ts
/Users/sas/Documents/SASCODE/packages/contracts/src/sascode/context.ts
/Users/sas/Documents/SASCODE/packages/contracts/src/sascode/directorEvents.ts
/Users/sas/Documents/SASCODE/packages/contracts/src/sascode/execution.ts
/Users/sas/Documents/SASCODE/packages/contracts/src/sascode/layout.ts
/Users/sas/Documents/SASCODE/packages/contracts/src/sascode/modules.ts
/Users/sas/Documents/SASCODE/packages/contracts/src/sascode/permissions.ts
/Users/sas/Documents/SASCODE/packages/contracts/src/sascode/routing.ts
/Users/sas/Documents/SASCODE/packages/contracts/src/sascode/workflow.ts
/Users/sas/Documents/SASCODE/packages/contracts/src/ipc.ts
/Users/sas/Documents/SASCODE/packages/contracts/src/rpc.ts
```

Inspect the current frontend architecture before choosing seams:

```text
/Users/sas/Documents/SASCODE/apps/web/src/main.tsx
/Users/sas/Documents/SASCODE/apps/web/src/router.ts
/Users/sas/Documents/SASCODE/apps/web/src/routes/__root.tsx
/Users/sas/Documents/SASCODE/apps/web/src/routes/_chat.tsx
/Users/sas/Documents/SASCODE/apps/web/src/routes/_chat.$threadId.tsx
/Users/sas/Documents/SASCODE/apps/web/src/components/ChatView.tsx
/Users/sas/Documents/SASCODE/apps/web/src/components/chat/SingleChatSurface.tsx
/Users/sas/Documents/SASCODE/apps/web/src/components/chat/SplitChatSurface.tsx
/Users/sas/Documents/SASCODE/apps/web/src/store.ts
/Users/sas/Documents/SASCODE/apps/web/src/nativeApi.ts
/Users/sas/Documents/SASCODE/apps/web/src/wsNativeApi.ts
/Users/sas/Documents/SASCODE/apps/web/src/index.css
```

Visually inspect every supplied reference image at full resolution:

```text
/Users/sas/Documents/SASCODE/design-references/branding/01-stillspace-daylight.png
/Users/sas/Documents/SASCODE/design-references/branding/02-stillspace-dusk.png
/Users/sas/Documents/SASCODE/design-references/branding/03-stillspace-nightfall.png
/Users/sas/Documents/SASCODE/design-references/branding/04-stillspace-dusk-background.png
/Users/sas/Documents/SASCODE/design-references/ui-states/01-dusk-workspace-foundation.png
/Users/sas/Documents/SASCODE/design-references/ui-states/02-official-focus-state.png
/Users/sas/Documents/SASCODE/design-references/ui-states/03-dual-session-state.png
/Users/sas/Documents/SASCODE/design-references/ui-states/04-dual-project-state.png
/Users/sas/Documents/SASCODE/design-references/ui-states/05-project-overview-state.png
/Users/sas/Documents/SASCODE/design-references/ui-states/06-personalize-space-state.png
```

The images define atmosphere, hierarchy, spatial interaction, and material
direction. They are not pixel-perfect final layouts. Improve their spacing,
readability, information clarity, professional restraint, and production
states. Do not reproduce any toy-like details.

## Repository and Git safety

Follow `AGENTS.md` exactly.

- Never edit on `main` or `master`.
- Use one isolated worktree and one unique feature branch.
- If the backend PR is not merged, branch from the backend feature branch so
  the typed `NativeApi.sascode` contract is present.
- If it is merged, branch from the latest `origin/main`.
- Preserve unrelated work.
- Inspect status and diffs before staging.
- Make coherent commits.
- Push a draft pull request early, then keep it synchronized.
- Do not bypass checks, rewrite shared history, or force-push.

## Product thesis

SASCODE is not merely a code harness. It is a calm, beautiful place for long,
focused work across multiple software projects and multiple live AI sessions.

The experience should feel:

- Minimal.
- Elegant.
- Professional.
- Calm.
- Architectural.
- Precise.
- Expensive without being decorative.
- Apple-inspired without copying macOS chrome.
- Liquid Glass without illegible blur.
- Alive without becoming noisy.

The primary atmosphere is Stillspace Dusk: warm graphite, mineral silver,
porcelain light, subtle luminous aura, restrained violet/blue accents, soft
depth, and clear typography. Daylight and Nightfall are equal first-class
states on a continuous appearance spectrum.

This interface is designed for someone who values aesthetic quality and UI/UX
above everything else and may work inside it for many hours.

## The decisive layout rule

Do not use the current industry-standard left sidebar to store projects and
sessions.

Projects are spatial workspace screens.

- One project occupies one full workspace screen.
- Horizontal navigation moves between project screens.
- On macOS, a three-finger horizontal swipe changes projects when the app can
  safely recognize the gesture.
- Wheel/trackpad gesture handling must be thresholded, direction-locked,
  velocity-aware, debounced, and must not hijack normal horizontal scrolling
  inside editors, diffs, timelines, or media.
- Provide equivalent keyboard shortcuts, command-palette actions, project
  switcher controls, and accessibility navigation.
- A three-finger upward/Mission Control-style action opens Project Overview:
  all projects become live spatial cards for quick selection.
- Because browser/Electron APIs may not reveal exact finger count, implement a
  high-quality trackpad gesture heuristic and make gestures configurable. Never
  claim hardware certainty the platform cannot provide.

Sessions inside a project are not sidebar rows.

- Other sessions appear in a clean session shelf made of live, rounded,
  rectangular status cards.
- Cards expose only the current essential state.
- Approvals and user-input actions can be handled directly on a card.
- A session card can be dragged into the center to become the active session.
- Dragging a second session to the center creates dual-session mode.
- Two projects can be placed side by side in dual-project mode.

Everything else appears only when needed, when toggled, or when spatially placed
by the user.

## Build against the real backend

The canonical renderer surface is:

```ts
const api = ensureNativeApi();
const sascode = api.sascode;
```

Do not:

- Build production behavior from mock JSON.
- Create another WebSocket.
- Call transport internals from components.
- Reimplement workflow readiness.
- Choose models with hard-coded `if` statements.
- Infer permissions locally.
- Mark work complete from a chat message alone.
- Store durable layouts only in `localStorage`.

Use:

- `api.orchestration.*` and the existing normalized store for projects,
  sessions, messages, turns, approvals, user input, diffs, provider sessions,
  and terminal state.
- `api.sascode.*` for workflows, work units, attempts, routing, context,
  evidence, permissions, attention, browser ownership, modules, and layouts.
- `api.server.*ProviderUsage*` for detailed provider quota/usage panels.
- `api.browser.*` for current browser process/webview operations.
- `api.sascode.*Browser*` for durable browser ownership and authorization.

Use TanStack Query for SASCODE snapshots and mutations. Add a focused event
adapter around:

```ts
api.sascode.subscribeEvents(
  { afterSequence, projectId: null },
  handleDirectorEvent,
);
```

Maintain one workspace-level subscription. Apply events idempotently, advance
the sequence cursor, invalidate only affected queries, and reconcile a detected
gap with `listEvents` or a snapshot refetch. Cross-project state must continue
updating while another project is active.

## Required information architecture

Implement these layers without a persistent project/session sidebar.

### 1. Ambient app frame

The app frame contains only what remains globally useful:

- Window drag region and desktop window controls.
- Current project identity.
- Quiet project position/neighbor affordance.
- Search/command entry.
- Provider/connection health.
- Global attention indicator.
- Project Overview trigger.
- Theme/Edit Space trigger.

The frame must be nearly invisible during focus. Avoid a toolbar full of equal
weight buttons.

### 2. Project space

Each project screen contains:

- A project aura/background.
- The active session work surface.
- A draggable chat surface that can live at the top or left.
- Contextual code, diff, terminal, browser, evidence, or file tools.
- A compact live session shelf.
- Project-level attention that remains calm until action is needed.
- Temporary lenses and drawers rather than permanent panels.

The active surface remains a true code-harness interface. Preserve messages,
composer, tools, model controls, approvals, files, diffs, terminal, Git, browser,
and generated artifacts.

### 3. Session shelf

Session cards must show, through progressive disclosure:

- Session title and role.
- Model/provider.
- Working/waiting/approval/input/review/failure/complete state.
- Concise current activity.
- Elapsed or updated time.
- Diff/change summary when useful.
- Direct approval/input buttons where safe.
- Expand, focus, split, route, pause/interrupt, and close actions when relevant.

Cards should feel alive through content and subtle material changes, not
constant animation. Do not turn them into miniature dashboards.

### 4. Context lens

Files, terminal, diff, browser, evidence, routing rationale, work graph, and
provider usage should open as:

- A temporary lens.
- A drawer.
- A floating card.
- A split region.
- A placed Edit Space module.

Choose the smallest mode that supports the task. Preserve all inherited
functionality.

### 5. Attention layer

Use the backend's attention states and effective interruption classes.

- Working/observing: ambient.
- Waiting on dependency: quiet and explanatory.
- Needs input/approval: clear and actionable.
- Ready for review: visible but not alarming.
- Failed: unmistakable, calm, and recoverable.
- Complete: brief acknowledgement, then settle.

Honor focus modes, suppression, system-notification preference, reduced motion,
and no-pulsing requirements.

## Required product states

Build and visually validate all of these as the same application in different
states.

### State A — Dusk workspace foundation

- One active project.
- One active chat/session.
- Session shelf visible but restrained.
- Project identity and cross-project presence.
- No unnecessary tools open.
- Dusk atmosphere close to the foundation reference.

### State B — Official focus state

- Maximum calm.
- Active session dominates.
- Chat/composer and current agent activity remain legible.
- Secondary chrome recedes.
- A temporary code/diff/terminal lens can appear without turning the whole app
  into an IDE grid.

### State C — Dual-session state

- Two sessions from one project.
- Created by dragging a session card to the active surface or an equivalent
  accessible command.
- Resizable division.
- Clear active-focus ownership.
- Each session retains approvals, composer, and tool access.
- Easy collapse back to one session.

### State D — Dual-project state

- Two project spaces side by side.
- Independent active sessions and attention.
- Clear boundary and focus target.
- Cross-project drag semantics only where safe.
- No confusion about which project owns a command, file, model, terminal, or
  approval.

### State E — Project Overview

- Mission Control-like spatial project cards.
- Live status and attention summaries.
- Visually beautiful at a glance.
- Search/filter and keyboard navigation.
- Drag/reorder if supported by durable state.
- Immediate transition into the selected project.
- Heavy transcript/browser/module trees remain suspended while live summaries
  update.

### State F — Personalize/Edit Space

- A clear Edit Space mode.
- Every module can be selected, moved, resized, layered, hidden, docked, and
  repositioned within valid bounds.
- Snap guides and optional grid.
- Module library.
- Daylight/Dusk/Nightfall theme spectrum.
- Glass opacity, contrast, radius, density, motion, background dim, status
  intensity, and aura controls.
- Save, cancel, reset layout, restore theme, recover off-screen modules, and
  exit controls.
- Optimistic local movement with revision-safe durable saves.

### Additional production states

Also implement:

- First run and project bootstrap.
- Empty project.
- New session.
- Loading/skeleton.
- Offline/reconnecting.
- Provider missing authentication.
- Preferred model unavailable with fallback explanation.
- Workflow running.
- Dependency waiting.
- Approval.
- User input.
- Route override.
- Partial result.
- Retry/fallback.
- Failure/recovery.
- Ready for review.
- Completed workflow.
- Layout revision conflict.
- Browser human/agent control handoff.
- Module permission request/denial/error.
- Reduced transparency.
- Reduced motion.
- High contrast.

## Theme and material system

Create a coherent token system, not scattered one-off utility values.

### Spectrum

Implement continuous interpolation:

```text
0.00 Daylight
0.50 Dusk
1.00 Nightfall
```

The slider should affect:

- Background luminance.
- Surface luminance.
- Text and secondary-text contrast.
- Glass tint.
- Border/rim light.
- Shadow depth.
- Aura saturation.
- Code/terminal surface.
- Scrim and overlay strength.

Persist the number in `layout.theme.spectrum`. Do not reduce it to only a
binary dark-mode toggle. The user may still select quick Daylight, Dusk, and
Nightfall stops.

### Liquid Glass

Use:

- Translucent surfaces only where spatial context exists behind them.
- Fine inner light and subtle outer border.
- Restrained blur.
- Tonal hierarchy before shadow.
- Rounded cards with a consistent radius scale.
- Soft, realistic depth.
- Opaque fallback under reduced transparency or insufficient contrast.

Avoid:

- Blur on every surface.
- Neon gradients.
- Thick glowing borders.
- Bubble-like controls.
- Over-rounded toy components.
- Excessive shadows.
- Fake reflections.
- Low-contrast gray text.

### Background

The Dusk background reference is the main atmospheric source. Build a resilient
background treatment:

- Project-specific aura layer.
- Optional image/background layer.
- Noise/mineral texture only if extremely subtle.
- Readability scrim.
- Reduced-background and flat-surface accessibility alternatives.
- No large media decode or continuous animation for hidden projects.

### Typography

Use a calm, modern interface sans for primary UI and preserve JetBrains Mono
for code/terminal content. Establish a small, deliberate type scale. Avoid huge
dashboard headings and tiny metadata. Use weight, spacing, and opacity with
excellent contrast.

### Icons

Use the existing icon library consistently. Prefer simple line icons. Do not
decorate every label. Always provide accessible names and tooltips where the
meaning is not obvious.

## Motion and gestures

Motion should explain spatial change:

- Project swipe.
- Project Overview expansion/collapse.
- Session card pickup and placement.
- Focus-to-split transition.
- Module docking/resizing.
- Context lens arrival.
- Attention escalation.
- Daylight/Dusk/Nightfall interpolation.

Use spring-like or carefully eased motion with restrained distance and
duration. Interactions must remain interruptible. Never delay actual work behind
ceremonial animation.

Required safeguards:

- `prefers-reduced-motion`.
- No parallax requirement.
- No continuously moving background.
- No pulsing status loops.
- Gesture thresholds and cancellation.
- Do not trigger project navigation while dragging/resizing.
- Do not trigger it from horizontal editor/diff/media scrolling.
- Keyboard and button equivalents for every gesture.

## Drag, resize, and spatial behavior

The repository already includes dnd-kit. Use it where appropriate and create a
small layout engine around the durable `SascodeWorkspaceLayout`.

Required:

- Pointer and keyboard dragging.
- Resize handles with minimum/maximum constraints.
- Collision-safe placement.
- Viewport clamping.
- Off-screen recovery.
- Optional snap-to-grid.
- Dock previews.
- Z-order selection.
- Stable focus handling.
- Touch support where practical.
- No layout save on every frame.

Persist on:

- Drag end.
- Resize end.
- Dock/undock.
- Mode change.
- Explicit Done.
- Short idle debounce for grouped settings.

Handle `expectedRevision` conflicts without erasing the user's unsaved layout.

## Music, video, and custom modules

Implement a real module-host surface compatible with backend module
instances/placements.

Initial modules:

- Spotify or generic music player.
- YouTube/video viewer.
- Browser.
- Files/diff.
- Terminal.
- Provider usage.
- Context/evidence.

Rules:

- Optional modules lazy-load.
- Hidden modules suspend expensive rendering.
- Hidden video pauses.
- Audio is muted/stopped until explicitly played according to platform rules.
- External embeds use safe origins and clear permission boundaries.
- Media never becomes the visual focal point unless the user makes it so.
- Modules must have keyboard-accessible move/resize controls.
- A denied permission produces an elegant recoverable state, not a broken
  rectangle.

The backend supplies module manifests, lifecycle, permissions, and state
contracts. The frontend supplies visual hosts and built-in renderers. Do not
fake a third-party marketplace.

## First-run flow

Create a short, beautiful setup flow that:

1. Discovers or selects the existing Synara project.
2. Selects the workspace root.
3. Shows live provider connections and models.
4. Offers the recommended `full-access-isolated` profile with an honest
   explanation.
5. Accepts or derives the project charter, design contract, and taste profile.
6. Calls `api.sascode.bootstrapProject`.
7. Enters the project space.

Do not make users configure routing tables before they can work. The default
design-led policy is already created by the backend.

## New feature flow

The primary action should feel as simple as starting a focused work session.

Capture:

- Title.
- Desired outcome.
- Request.
- Frontend/backend inclusion.
- Browser validation.
- Independent review.
- Permission profile.
- Optional advanced model routing and concurrency.

Then call `api.sascode.startFeature`.

Immediately present:

- The generated work graph.
- Which lanes began.
- Which lanes are waiting.
- Selected provider/model per scheduled lane.
- Routing rationale on demand.
- Session cards as provider attempts attach.

The graph is supporting information, not the permanent main screen. Let users
return to actual work quickly.

## Model routing UI

The backend automatically routes. The UI should make delegation legible without
making it burdensome.

Show:

- Role.
- Activity.
- Selected provider/model.
- Short routing rationale.
- Fallback order on demand.
- Health/auth/usage warning.
- Whether independent review is on a different provider.

Allow:

- Explicit per-work-unit route override before scheduling.
- Reset to automatic.
- Project routing-policy inspection/editing in an advanced surface.
- Refresh provider capabilities.

Populate every target from `listProviderCapabilities` or
`refreshProviderCapabilities`. Never hard-code that “Opus 5” or “Fable 5”
exists. If the installed runtime reports a matching family, prefer it according
to policy. If not, show the actual selected fallback.

## Preserve the code-harness core

The redesign must retain all important inherited product capability:

- Streaming multi-provider chat.
- Composer and attachments.
- Plan and approval cards.
- User-input requests.
- Tool activity.
- Model and effort selection.
- File references and previews.
- Diff review and inline comments.
- Git actions and worktrees.
- Terminals.
- Browser panel and annotations.
- Split sessions.
- Pull requests.
- Provider setup, authentication, health, updates, and usage.
- Settings.
- Shortcuts.
- Diagnostics and recovery.
- External MCP settings.

Reuse proven logic and components. Restyle, recompose, and wrap them where
needed. Do not delete functionality merely because it does not appear in a
reference image.

Settings and secondary administrative routes may use a conventional contained
navigation pattern. The prohibition on a left project/session sidebar applies
to the primary work shell.

## Component architecture

Keep the implementation maintainable. Establish a bounded SASCODE frontend
domain, for example:

```text
apps/web/src/sascode/
  api/
  queries/
  events/
  state/
  shell/
  project-space/
  sessions/
  attention/
  layout/
  modules/
  routing/
  browser/
  onboarding/
  theme/
  testing/
```

The exact structure may adapt to existing conventions, but enforce these
boundaries:

- Typed API/query layer.
- Live event adapter.
- Durable layout versus ephemeral interaction state.
- Project navigation.
- Session presentation.
- Attention presentation.
- Theme/material tokens.
- Module host.
- Gesture controller.
- Backend-independent pure derivation functions.

Avoid giant components, prop-drilling across the shell, duplicated selectors,
and component-local copies of server truth.

Use the existing Zustand store only where it is the right source. Use TanStack
Query for server snapshots. Use small local state for transient gestures,
dragging, overlays, and animation.

## Performance requirements

- Keep project swipe and resize interaction responsive at 60fps on a modern Mac.
- Avoid unbounded backdrop filters.
- Virtualize long histories and large lists using existing patterns.
- Do not mount every project's full transcript.
- Keep lightweight cross-project summaries live.
- Lazy-load media, browser, diff, terminal, and overview-heavy modules.
- Suspend hidden modules.
- Pause hidden video.
- Avoid unnecessary React-wide subscriptions.
- Use stable selectors and query keys.
- Avoid rerendering all session cards for one token stream.
- Respect the existing React Compiler/tooling assumptions.

## Accessibility requirements

Meet at least WCAG 2.2 AA intent for the primary workflows.

- Full keyboard navigation.
- Visible focus.
- Semantic landmarks.
- Accessible names.
- Correct dialog/focus trapping.
- Announced approval/input/failure state changes without chatter.
- Keyboard alternatives for drag, resize, swipe, split, and overview.
- Reduced motion.
- Reduced transparency.
- High contrast.
- Comfortable text size.
- No color-only status.
- Minimum hit targets.
- Recovery from user customization.

Every gesture-only interaction is a bug.

## Implementation sequence

Work through these phases, committing coherent checkpoints.

### Phase 1 — Contract and integration spine

- Add the SASCODE query/mutation layer around `NativeApi.sascode`.
- Add workspace and project snapshot queries.
- Add the replay/live Director event adapter.
- Join attempts to existing Synara threads.
- Add deterministic selectors for project/session/attention cards.
- Add first-run bootstrap and new-feature mutations.
- Cover the adapters and reducers with focused tests.

### Phase 2 — Stillspace tokens and shell

- Build theme tokens and spectrum interpolation.
- Build the project-space viewport and ambient frame.
- Remove the primary project/session sidebar dependency from the work shell.
- Preserve desktop drag regions/window controls.
- Build project switching and keyboard equivalents.
- Implement Dusk foundation first, then Daylight/Nightfall.

### Phase 3 — Session work surface

- Recompose the real chat surface inside the active project.
- Build the session shelf from live threads/attempts.
- Add action states for approval, input, review, retry, and failure.
- Add draggable chat top/left behavior.
- Preserve files, diff, terminal, Git, browser, tools, and composer.

### Phase 4 — Spatial modes

- Dual-session.
- Dual-project.
- Project Overview.
- Gesture controller and accessibility alternatives.
- Mode transitions and focus ownership.

### Phase 5 — Edit Space and modules

- Durable layout adapter.
- Move/resize/dock/z-order.
- Theme drawer and full customization.
- Module library and built-in hosts.
- Music and video modules.
- Reset/recovery/conflict behavior.

### Phase 6 — Production states and refinement

- First run, empty/loading/offline/auth/usage/fallback states.
- Permission and browser ownership flows.
- Routing detail and override UI.
- Accessibility pass.
- Reduced motion/transparency/high contrast.
- Performance profiling.
- Visual refinement against every reference.

### Phase 7 — Verification

- Focused unit/component tests.
- Browser interaction tests for critical flows.
- Production build.
- Real backend smoke test.
- Visual screenshots for all required states at desktop dimensions.
- Narrow/mobile sanity checks where supported.
- Independent frontend review.
- Fix every task-caused failure and serious visual issue.

## Visual validation protocol

Do not judge the interface from source code.

Run it, open it in a real browser or desktop runtime, and inspect screenshots at
minimum for:

- Dusk foundation.
- Focus.
- Dual session.
- Dual project.
- Project Overview.
- Edit Space.
- Daylight.
- Nightfall.
- Approval.
- Failure/recovery.
- First run.

Compare against the supplied references for:

- Calmness.
- Hierarchy.
- Density.
- Material restraint.
- Corner/radius consistency.
- Readability.
- Spatial logic.
- Professional credibility.

Refine until the interface looks like a real premium code harness, not a design
exercise, generic SaaS dashboard, game launcher, toy, or macOS imitation.

## Test expectations

Add focused tests for at least:

- Event replay/deduplication/gap recovery.
- Project snapshot normalization.
- Attempt-to-thread joins.
- Attention derivation/presentation.
- Theme spectrum interpolation.
- Project gesture threshold/cancellation.
- Session drag-to-focus and drag-to-split logic.
- Dual-project ownership.
- Layout revision conflict handling.
- Off-screen module recovery.
- Reduced-motion behavior.
- Route/bootstrap restoration.

Use the repository's permitted commands and obey `AGENTS.md` restrictions. Do
not run prohibited broad commands. Run the narrowest meaningful verification,
then the repository-approved production build and browser checks.

## Definition of done

Do not declare completion until:

- The primary shell has no permanent project/session left sidebar.
- Projects work as spatial screens.
- Project Overview works.
- One project and cross-project live state update correctly.
- Session cards are live and actionable.
- One session, dual-session, and dual-project modes work.
- Chat can be positioned top or left.
- The real backend can bootstrap a project and start a feature.
- Automatic routing and explicit override are visible.
- Approvals, input, retry, review, failure, and completion are usable.
- Edit Space persists draggable/resizable modules and theme settings.
- Daylight, Dusk, and Nightfall are polished.
- Music/video/browser/terminal/diff modules behave safely.
- Inherited code-harness functionality remains operational.
- Accessibility alternatives exist for every gesture and drag action.
- Loading, empty, offline, auth, conflict, and failure states are complete.
- Focused tests pass.
- The production build succeeds.
- All required visual states have been inspected and refined.
- The branch is synchronized, pushed, and represented by one complete pull
  request.

## Final handoff

At the end, report:

- The product outcome, not just a list of files.
- Branch and commit hashes.
- Pull request.
- Architecture decisions.
- Backend APIs integrated.
- Required states completed.
- Screenshots/visual evidence.
- Tests and build commands with results.
- Accessibility and performance checks.
- Any true remaining limitation.

Do not leave placeholder production data, dead controls, hidden broken routes,
or a “phase two” for core requirements. Build the complete Stillspace frontend.

---

End of prompt.
