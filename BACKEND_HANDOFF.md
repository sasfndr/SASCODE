# SASCODE Backend Handoff

Status: implemented, persisted, boot-verified, and ready for the frontend build.

This document is the engineering contract between the SASCODE backend and the
frontend implementation. The backend is the source of truth for orchestration,
model routing, permissions, evidence, browser ownership, modules, live
attention, and workspace layout. The frontend should present and operate this
state; it must not recreate these rules locally.

Read this document together with:

- `CLAUDE.md` — the complete Stillspace design, branding, interaction, and UX
  contract.
- `PRODUCT_VISION.md` — the full product and systems vision.
- `packages/contracts/src/sascode/` — executable Effect schemas and TypeScript
  types.
- `packages/contracts/src/rpc.ts` — typed WebSocket RPC declarations.
- `packages/contracts/src/ipc.ts` — the renderer-facing `NativeApi`.
- `apps/server/src/sascode/` — the backend implementation.

---

## 1. What is implemented

The local-first backend foundation is complete:

- Durable multi-project workflows and directed work-unit graphs.
- Idempotent Director commands and an append-only event stream.
- Automatic model delegation by role, activity, capability, health, policy,
  quota metadata, and user override.
- Design-led default routing:
  - UX planning: Claude Fable, then Sonnet, then Opus.
  - Interface implementation: Claude Opus, then Fable, then Sonnet.
  - Backend and systems: Codex/GPT, then Gemini, then GLM/Qwen/Kimi.
  - Independent review: a provider different from the implementation provider.
- Live discovery of configured Codex, Claude Code, Cursor, Gemini/Antigravity,
  Grok, Droid, Kilo, OpenCode, and Pi runtimes.
- Subscription-CLI, API, ACP, local-runtime, and remote-runtime connection
  semantics.
- Durable execution specifications, task contracts, isolated worktrees,
  provider threads, retries, fallback routing, and restart recovery.
- Context artifacts, decision records, evidence records, quality-gate runs, and
  immutable result packets.
- A bound result-submission MCP tool for delegated agents.
- Project-scoped permission profiles, capability grants, resource boundaries,
  step-up decisions, and audit records.
- Browser profiles, browser instances, human/agent control ownership, leases,
  authorization epochs, runtime generations, and evidence references.
- Signed/built-in/local module manifests, module instances, permission-gated
  activation, singleton enforcement, suspension, and state updates.
- Workspace and project attention snapshots with focus modes and interruption
  policies.
- Durable Stillspace layouts, theme spectrum, project modes, module geometry,
  active sessions, and dual-project state.
- One-call project bootstrap and one-call design-led feature workflow creation.
- A stable renderer-facing `NativeApi.sascode` namespace.

This foundation preserves Synara's existing provider sessions, chat streaming,
terminals, Git/worktree operations, browser automation, External MCP,
diagnostics, recovery, settings, and provider-usage surfaces.

---

## 2. Architecture and ownership

```text
React renderer
  |
  | ensureNativeApi().sascode.*
  v
Typed Effect RPC schemas
  |
  v
SascodeApi
  |
  +-- Director + command/event store
  +-- WorkUnitOrchestrator + ModelRouter
  +-- AttemptDispatcher + provider thread launcher
  +-- ResultIngestion + TaskContracts
  +-- Context/Evidence repositories
  +-- CapabilityBroker + permission/audit repositories
  +-- BrowserWorkspace
  +-- ModuleRuntime
  +-- AttentionEngine
  +-- WorkspaceLayoutRepository
```

Backend ownership is strict:

- The backend decides whether a work unit is ready.
- The backend decides which configured model target is eligible and preferred.
- The backend persists every execution specification before lifecycle changes.
- The backend launches and recovers provider attempts.
- The backend verifies result packets and advances dependent work.
- The backend enforces permission and concurrency boundaries.
- The backend owns durable layout revision and compare-and-swap behavior.
- The frontend owns presentation, input intent, optimistic feedback, animation,
  and local ephemeral interaction state.

Never put model-family selection, dependency reconciliation, permission
authorization, retry rules, or workflow completion logic into React
components.

---

## 3. Renderer entry point

Use:

```ts
import { ensureNativeApi } from "~/nativeApi";

const sascode = ensureNativeApi().sascode;
```

The client contract is `SascodeClientApi` in:

```text
packages/contracts/src/sascode/api.ts
```

The browser WebSocket adapter is implemented in:

```text
apps/web/src/wsNativeApi.ts
apps/web/src/wsTransport.ts
```

Do not instantiate a second WebSocket client. Do not call internal transport
methods from components.

---

## 4. Complete SASCODE renderer API

All mutation RPCs require the authenticated session owner. Read APIs remain
available through the authenticated local client.

### Snapshots and catalog

| Client method | Wire method | Result |
| --- | --- | --- |
| `getWorkspaceSnapshot(input)` | `sascode.getWorkspaceSnapshot` | Workspace attention plus provider capability snapshots |
| `getProjectSnapshot(input)` | `sascode.getProjectSnapshot` | Workflows, attention, browsers, modules, layout, and active grants |
| `getWorkflow(input)` | `sascode.getWorkflow` | One workflow or `null` |
| `listProviderCapabilities()` | `sascode.listProviderCapabilities` | Current discovered provider/model snapshots |
| `refreshProviderCapabilities(input)` | `sascode.refreshProviderCapabilities` | Fresh snapshots plus per-provider discovery failures |
| `listEvents(input)` | `sascode.listEvents` | Cursor-bounded Director events |

### Director and execution

| Client method | Wire method | Result |
| --- | --- | --- |
| `executeDirectorCommand(input)` | `sascode.executeDirectorCommand` | Idempotent command result and emitted event |
| `scheduleWorkUnit(input)` | `sascode.scheduleWorkUnit` | Scheduled, already-active, retry-exhausted, or not-ready |
| `runWorkflow(input)` | `sascode.runWorkflow` | Bounded scheduling batch |
| `submitResult(input)` | `sascode.submitResult` | Verification, final attempt state, and downstream scheduling batch |
| `dispatchAttempt(input)` | `sascode.dispatchAttempt` | Attached/launched attempt and recovery flag |
| `subscribeEvents(input, listener)` | `sascode.subscribeEvents` | Replay-then-live Director event stream |

`subscribeEvents` returns an unsubscribe function. The client advances its
cursor as events arrive and resumes from the last observed sequence after a
transport reconnect. Event application must still be idempotent: ignore any
event whose sequence has already been applied.

### Policy, context, and permissions

| Client method | Wire method | Result |
| --- | --- | --- |
| `publishRoutingPolicy(input)` | `sascode.publishRoutingPolicy` | Whether a new revision was persisted |
| `upsertContextArtifact(input)` | `sascode.upsertContextArtifact` | `void` |
| `savePermissionGrant(input)` | `sascode.savePermissionGrant` | Whether a new grant was persisted |

### Browser Workspace

| Client method | Wire method | Result |
| --- | --- | --- |
| `saveBrowserProfile(input)` | `sascode.saveBrowserProfile` | Durable profile |
| `createBrowserInstance(input)` | `sascode.createBrowserInstance` | Durable browser instance |
| `acquireBrowserControl(input)` | `sascode.acquireBrowserControl` | Authorization decision, instance, acquired flag |
| `releaseBrowserControl(input)` | `sascode.releaseBrowserControl` | Updated instance |
| `updateBrowserInstance(input)` | `sascode.updateBrowserInstance` | Updated instance |

### Module runtime

| Client method | Wire method | Result |
| --- | --- | --- |
| `installModule(input)` | `sascode.installModule` | Persisted manifest |
| `instantiateModule(input)` | `sascode.instantiateModule` | Module instance |
| `activateModule(input)` | `sascode.activateModule` | Authorization decisions, instance, activated flag |
| `updateModuleInstance(input)` | `sascode.updateModuleInstance` | Updated instance |

### Product-level commands

| Client method | Wire method | Result |
| --- | --- | --- |
| `bootstrapProject(input)` | `sascode.bootstrapProject` | Policy, grant, context, and default layout |
| `startFeature(input)` | `sascode.startFeature` | Workflow, execution specs, initial dispatch batch |
| `getWorkspaceLayout(input)` | `sascode.getWorkspaceLayout` | Durable layout or `null` |
| `saveWorkspaceLayout(input)` | `sascode.saveWorkspaceLayout` | Saved layout |
| `saveAttentionPreference(input)` | `sascode.saveAttentionPreference` | `void` |
| `resolveAttentionItem(input)` | `sascode.resolveAttentionItem` | Whether the item was resolved |

Inputs and outputs are not duplicated here because the Effect schemas are the
canonical definitions. Import their types from `@synara/contracts`.

---

## 5. Recommended frontend data flow

Use TanStack Query for snapshots and mutations, and one small event adapter for
live invalidation/projection.

### Workspace shell

1. Read the existing orchestration shell with
   `api.orchestration.getShellSnapshot()` for projects, sessions, provider
   threads, and current chat state.
2. Read `api.sascode.getWorkspaceSnapshot({ projectIds, now })` for
   cross-project attention and model capability state.
3. Subscribe once at the workspace level:

```ts
const unsubscribe = api.sascode.subscribeEvents(
  { afterSequence: lastSequence, projectId: null },
  (event) => applyDirectorEvent(event),
);
```

4. Preserve live state for all projects even when only one project screen is
   mounted.
5. Render inactive projects from compact normalized summaries; do not keep every
   heavy chat transcript or browser webview mounted.

### Active project

Read:

```ts
api.sascode.getProjectSnapshot({ projectId, now });
```

The result supplies:

- All SASCODE workflows for the project.
- Derived attention and actionable items.
- Browser profiles and instances.
- Module instances.
- Durable Stillspace layout.
- Active permission grants.

The existing Synara orchestration snapshot supplies the underlying sessions,
messages, turns, approvals, user-input requests, diffs, provider state, and
terminal state. Join by `projectId`, `threadId`, and the attempt's attached
thread.

### Event handling

Use event sequence as the monotonic cursor. Prefer small deterministic reducer
functions:

- Update the relevant workflow/work unit/attempt when the event contains enough
  information.
- Otherwise invalidate only the corresponding project or workflow query.
- Recompute attention by refetching the project/workspace snapshot after
  lifecycle-affecting events.
- Keep event application idempotent.
- On an unexplained sequence gap, call `listEvents` from the last sequence or
  refetch the snapshot.

Do not use fixed polling for workflow lifecycle when the live stream is
available. A low-frequency reconciliation refetch is acceptable as a safety
net.

---

## 6. Director lifecycle

### Workflow states

Read the exact literals from `packages/contracts/src/sascode/workflow.ts`.
Lifecycle changes must go through the Director.

The normal feature path is:

```text
proposed -> running -> completed
                    -> failed / cancelled
```

### Work-unit execution

Every scheduled work unit has a durable `WorkUnitExecutionSpec` containing:

- Instructions.
- Acceptance criteria.
- Allowed and forbidden resources.
- Context artifact IDs.
- Permission profile and grant IDs.
- Expected artifacts.
- Routing constraints.
- Optional explicit user routing override.
- Baseline Git ref.
- Maximum attempt count.

Scheduling produces one of:

- `scheduled`
- `already-active`
- `retry-exhausted`
- `not-ready`

The Director never depends on the renderer retaining this state.

### Attempts and provider threads

For an eligible work unit, the backend:

1. Resolves a provider/model target.
2. Persists the routing decision and task contract.
3. Creates an isolated worktree when the project is a Git repository.
4. Creates and attaches a Synara provider thread.
5. Dispatches a prompt containing the sealed contract, context, dependency
   results, permission boundary, and result-submission instruction.
6. Recovers dispatchable attempts after a server restart.
7. Routes a retry/fallback when allowed.

The attempt thread is a normal Synara thread and should use the existing chat,
terminal, diff, Git, approval, and user-input UI primitives.

---

## 7. One-call project bootstrap

Use `bootstrapProject` when a project first enters SASCODE.

Example shape:

```ts
await api.sascode.bootstrapProject({
  projectId,
  projectName: "My Product",
  workspaceRoots: ["/absolute/path/to/repository"],
  allowedHosts: ["*"],
  permissionProfile: "full-access-isolated",
  policyRevision: 1,
  maxParallelWorkUnits: 4,
  projectCharter,
  designContract,
  globalTasteProfile,
  occurredAt: new Date().toISOString(),
});
```

The operation is idempotent at the durable identity/revision boundaries. It
creates:

- A design-led routing policy.
- A project-scoped permission grant.
- A project charter.
- Optional design-contract and global-taste context artifacts.
- The default Stillspace layout.

`allowedHosts: ["*"]` means unrestricted host matching inside the selected
permission profile. It does not bypass a denied resource, missing capability,
step-up requirement, isolation requirement, spend boundary, or session-owner
check.

The `full-access-isolated` preset grants all twenty current capabilities while
requiring isolated execution. The UI should explain this clearly instead of
representing it as a magical global bypass.

---

## 8. One-call feature workflow

Use `startFeature` for the product's normal “build this” action.

```ts
const result = await api.sascode.startFeature({
  requestId: crypto.randomUUID(),
  projectId,
  title: "Beautiful onboarding",
  outcome: "A production-ready onboarding flow with persisted account setup",
  request: userPrompt,
  workspaceRoot: "/absolute/path/to/repository",
  includeFrontend: true,
  includeBackend: true,
  includeBrowserValidation: true,
  includeIndependentReview: true,
  permissionProfile: "full-access-isolated",
  policyRevision: 1,
  concurrencyLimit: 4,
  maxAttempts: 3,
  baselineGitRef: "origin/main",
  occurredAt: new Date().toISOString(),
});
```

The generated graph is:

```text
Experience plan ──> Interface build ──┐
                                      ├─> Integration ─> Browser validation ─> Independent review
Backend build ────────────────────────┘
```

The exact graph adapts to the include flags. Frontend and backend begin in
parallel where dependencies allow. The interface implementation waits for the
experience plan. Result packets from dependencies are included in downstream
contracts. Browser validation and review are downstream verification lanes.

Calling `startFeature` again with the same project and `requestId` returns the
existing workflow with `replayed: true`; it must not duplicate work.

### Manual model override

Every `WorkUnitExecutionSpec` can contain:

```ts
routingOverride: {
  actor: "session-owner",
  reason: "Use this model for the visual implementation",
  target: {
    connectionId,
    providerKey,
    providerKind,
    modelSlug,
    modelFamily,
    options,
  },
}
```

The frontend should offer an unobtrusive “Route” control on a work unit before
it is scheduled. Resolve targets from live provider capability snapshots; never
invent a provider key or model slug.

---

## 9. Default model delegation

Project bootstrap creates six roles:

| Role | Primary responsibility | Preference |
| --- | --- | --- |
| Experience Architect | Product intent, UX, hierarchy, visual plan | Claude: Fable → Sonnet → Opus |
| Interface Engineer | Production UI, motion, accessibility, responsiveness | Claude: Opus → Fable → Sonnet |
| Systems Engineer | Backend, data, integrations, durability, tests | Codex/GPT → Gemini → GLM/Qwen/Kimi |
| Browser Operator | Research, browser work, preview, QA | Gemini → Claude → Codex |
| Independent Reviewer | Code, security, tests, accessibility, visual fidelity | Different provider from implementation |
| Release Steward | Integration, documentation, release handoff | Claude → Codex → Gemini |

Routing is capability- and availability-aware. A preference is not a guarantee
that a model exists in the user's installed provider catalog.

Candidates are rejected or scored using:

- Required activity.
- Required tools.
- Provider allow/deny constraints.
- Image-input support.
- Session-resume support.
- Different-provider review requirements.
- Maximum usage fraction when quota metadata is available.
- Connection and provider health.
- Model-family and provider preference.
- Quality, cost, latency, availability, and continuity weights.

The routing decision persists its candidates, selected target, fallback order,
rationale, constraints, and override attribution.

---

## 10. Provider connections and subscriptions

SASCODE delegates through the provider runtimes already configured in Synara.
The catalog distinguishes:

- `subscription-cli`
- `api`
- `acp`
- `local-runtime`
- `remote-runtime`

Consumer subscriptions are not interchangeable with developer APIs:

- Claude Code Max is used through an authenticated Claude Code runtime.
- Codex plans are used through the configured Codex runtime.
- A Google AI Ultra consumer plan only exposes Gemini models to SASCODE if the
  installed Google/Antigravity CLI makes those models available under that
  account. It does not automatically create a Gemini API key or API billing
  entitlement.
- GLM, Qwen, Kimi, Kilo, OpenCode, and other runtimes must be installed,
  enabled, and authenticated in the provider settings.

Always display live discovered models and authentication status. Never advertise
a model merely because a provider brand is configured.

Provider usage UI should continue using the existing:

```ts
api.server.getProviderUsageSnapshot(...)
api.server.listProviderUsage(...)
```

SASCODE capability snapshots currently represent routing health and may include
quota windows when a provider adapter supplies them. The inherited usage API is
the authoritative UI source for the detailed rate-limit panels.

---

## 11. Context, evidence, and result packets

Context is durable and referenced by ID, not repeatedly pasted from the full
repository.

Context artifact kinds include:

- Global taste profile.
- Project charter.
- Design contract.
- Architecture.
- Decision ledger.
- Session working set.
- Evidence ledger.
- Resume capsule.
- Custom.

Evidence kinds include tests, type checks, lint, builds, security scans, diff
reviews, code reviews, browser checks, visual comparisons, accessibility,
performance, deployment, approvals, manual observations, and artifacts.

Delegated agents submit an immutable result packet with:

- Status: complete, partial, failed, or blocked.
- Summary.
- Changed resources.
- Decisions and evidence.
- Commands run.
- Risks and unresolved questions.
- Next action.
- Usage metadata when available.
- Production timestamp.

### Bound agent result MCP

Delegated attempt threads receive:

```text
synara_submit_sascode_result
```

The tool is bound to the exact attempt thread. An agent cannot submit a result
for another thread's attempt. Submission is atomic and idempotent. The backend
verifies the task-contract digest, evidence, quality gates, and acceptance
requirements before completing the attempt and scheduling downstream work.

The frontend normally observes this through the event stream and snapshots. It
should not ask users to manually copy agent summaries between sessions.

---

## 12. Attention and long-focus behavior

Attention states:

- `quiet`
- `working`
- `observing`
- `waiting-dependency`
- `needs-input`
- `needs-approval`
- `ready-review`
- `failed`
- `complete`

Interruption classes:

- `silent`
- `ambient`
- `in-app`
- `system`

Focus modes:

- `deep-focus`
- `balanced`
- `supervision`
- `do-not-disturb`

The workspace snapshot includes every requested project's attention snapshot.
This is the basis of ambient cross-project presence while the user works inside
another project.

The UI must:

- Keep working/quiet progress ambient.
- Surface approval, input, review, and failure with clear hierarchy.
- Respect suppression and the effective interruption class from the backend.
- Avoid continuously pulsing or flashing status.
- Resolve items through `resolveAttentionItem`, not by hiding them only in local
  component state.

---

## 13. Durable Stillspace layout

`SascodeWorkspaceLayout` persists:

- Project ID, version, and revision.
- Preset key.
- Theme settings.
- Workspace mode.
- Layout mode.
- Module placements and geometry.
- Active thread IDs.
- Optional secondary project ID.
- Snap-to-grid and hidden-module behavior.
- Creator/update timestamps.

Workspace modes:

- `focus`
- `dual-session`
- `dual-project`
- `edit-space`
- `project-overview`

Layout modes:

- `freeform`
- `structured`
- `focus`

Theme settings:

- `spectrum` for continuous Daylight → Dusk → Nightfall interpolation.
- Project aura.
- Glass opacity.
- Contrast.
- Corner radius.
- Density.
- Motion.
- Background dim.
- Status intensity.

Module placement persists `x`, `y`, `width`, `height`, dock edge, z-index,
visibility behavior, permission scope, and configuration.

### Save semantics

`saveWorkspaceLayout` requires `expectedRevision`. Treat a revision conflict as
a recoverable collaboration conflict:

1. Refetch the durable layout.
2. Preserve the user's unsaved local edit state.
3. Reconcile or show a concise conflict choice.
4. Save against the new revision.

Throttle pointer-move updates locally and persist at meaningful boundaries:
drag end, resize end, mode transition, explicit Done, or short idle debounce.
Never send an RPC for every animation frame.

---

## 14. Browser Workspace boundary

The SASCODE browser domain is the durable control plane for:

- Profiles and authentication-state classification.
- Local-visible, local-isolated, or remote-hosted backends.
- Instance status.
- Human versus agent control ownership.
- Control leases.
- Concurrency-safe authorization and runtime epochs.
- Workflow/work-unit assignment.
- Evidence attachment.

The inherited Synara browser API remains the process/webview automation adapter:

```ts
api.browser.*
```

The frontend should combine both layers:

- `api.sascode.*Browser*` for durable ownership, policy, assignment, and state.
- `api.browser.*` for the actual current desktop browser panel/webview controls.

Do not imply that creating a `BrowserInstance` alone starts a Chromium process.
The process adapter and the durable SASCODE record are intentionally separate.

---

## 15. Module runtime boundary

The backend module runtime validates and persists:

- Built-in, signed-third-party, and local origins.
- Entrypoints and supported placements.
- Required permission capabilities.
- Background execution.
- Singleton-per-project behavior.
- Installation and instance lifecycle.
- Permission-gated activation.
- Optimistic instance updates.

The frontend still needs to implement the visual host and built-in module
renderers. Initial built-in modules should include:

- Session shelf.
- Agent chat.
- Files/diff.
- Terminal.
- Browser.
- Spotify or generic music player.
- YouTube/video.
- Provider usage.
- Context/evidence lens.

Third-party marketplace discovery, payments, publisher verification, and public
distribution are launch-layer work, not part of this local-first backend
foundation. Do not fake a marketplace in the primary product UI.

---

## 16. Permissions and secrets

Permission profiles:

- `observe`
- `safe-build`
- `trusted-build`
- `full-access-isolated`
- `custom`

The twenty capability literals live in
`packages/contracts/src/sascode/permissions.ts`.

Permission grants are scoped by project/thread/workflow/work unit and bounded
by:

- Allowed workspace roots.
- Allowed hosts.
- Denied resources.
- Required isolation.
- Optional spend maximum.
- Optional expiry.

High-risk actions can return:

- `allowed`
- `denied`
- `step-up-required`

The frontend must show reason and consequence, not a generic “permission
needed” dialog.

`SascodeSecretRef` is a metadata contract for OS keychain, encrypted-file, or
external-vault references. Raw secret material must never enter chat messages,
result packets, event payloads, frontend persistence, screenshots, or logs.
Provider authentication continues through each provider's existing secure
runtime configuration. Do not build a plaintext “secret vault” in React.

---

## 17. External MCP

External MCP lets another client such as Claude Code connect to the running
Synara/SASCODE environment. It is a remote-control and task bridge, not a
different model provider and not an extra reasoning pass by itself.

The current External MCP surface intentionally exposes the existing bounded
Synara task operations: overview/capabilities, project listing, and
create/read/wait for one task. The full SASCODE project bootstrap and
multi-lane `startFeature` control plane is currently exposed to the authenticated
renderer through `NativeApi.sascode`.

Therefore:

- A user can work entirely from Claude Code through the existing task bridge.
- Work done directly in the SASCODE UI or directly through External MCP does
  not inherently consume more model tokens; token use depends on which agent
  turns are actually launched and how much context they receive.
- The focused SASCODE model-delegation workflow should be started from the
  authenticated app UI until a separately capacity-governed multi-agent
  External MCP command is implemented.

This boundary is deliberate: exposing a multi-agent launch command externally
requires reservation and concurrency semantics beyond the existing one-task
MCP transaction.

---

## 18. Errors, concurrency, and recovery

Frontend expectations:

- RPC failures are typed `WsRpcError` values at the wire boundary.
- Mutations may be idempotent and return “already existed” semantics.
- Layout and browser updates use expected revision/generation/authorization
  values and can conflict.
- Provider discovery can partially succeed and return failures for missing or
  unauthenticated CLIs.
- An unavailable preferred model should not fail the entire project if an
  eligible fallback exists.
- A server restart rehydrates durable plans and recovers dispatchable attempts.
- Cursor subscriptions replay persisted events before switching to live events.

Never silently reset state after a conflict. Never convert a partial provider
refresh into “no providers.” Preserve last known data and show the actionable
failure.

---

## 19. Database and migration lineage

SASCODE uses migrations:

- `088_SascodeDirectorCore`
- `089_SascodeRouting`
- `090_SascodeContextEvidence`
- `091_SascodeCapabilityKernel`
- `092_SascodeExecutionPlans`
- `093_SascodeWorkspaceLayouts`

The schema covers events, command receipts, workflows, work units, attempts,
routing policies and decisions, context/evidence, capability snapshots,
permissions/audit, browser records, modules, execution plans, task contracts,
result packets, attention preferences/items, and layouts.

Do not add browser `localStorage` as a second source of truth for any of these
domains.

---

## 20. Existing frontend architecture to preserve

The app already uses:

- React 19.
- TypeScript.
- Vite.
- Tailwind CSS 4.
- TanStack Router.
- TanStack Query.
- Zustand.
- Effect schemas and RPC.
- Base UI.
- dnd-kit.
- Existing chat, terminal, diff, Git, approvals, provider, browser, settings,
  automation, and pull-request components.

Important files:

```text
apps/web/src/main.tsx
apps/web/src/router.ts
apps/web/src/routes/__root.tsx
apps/web/src/routes/_chat.tsx
apps/web/src/routes/_chat.$threadId.tsx
apps/web/src/components/chat/SingleChatSurface.tsx
apps/web/src/components/chat/SplitChatSurface.tsx
apps/web/src/components/ChatView.tsx
apps/web/src/store.ts
apps/web/src/wsNativeApi.ts
apps/web/src/nativeApi.ts
apps/web/src/index.css
```

The current left sidebar is an inherited layout, not a product constraint. The
new primary SASCODE shell should replace project/session navigation without
deleting useful underlying controls or settings routes.

---

## 21. Verification evidence

Backend verification completed before handoff:

- Focused SASCODE contract, RPC, server, gateway, and web adapter suites:
  23 test files and 77 tests passed after the renderer-client addition.
- Migration lineage check passed.
- A clean temporary home/database boot ran every migration through 093.
- The server reached startup-ready state.
- `/health` returned success with push bus, keybindings, terminal
  subscriptions, and orchestration subscriptions ready.
- Missing provider CLI binaries in the clean temporary environment were
  reported as provider discovery failures without preventing server startup.

Do not reinterpret a missing optional provider binary as a SASCODE backend
failure.

---

## 22. Frontend definition of backend correctness

The frontend integration is correct when:

- It uses `ensureNativeApi().sascode`.
- It renders real project/workflow/session state rather than production mocks.
- It joins SASCODE attempts to existing Synara threads.
- It subscribes once and applies events idempotently.
- It can bootstrap a project and start a feature workflow.
- It displays automatic routing and allows an explicit route override.
- It surfaces dependency, progress, approval, input, review, failure, and
  completion states.
- It persists layout changes with revision safety.
- It respects permission, browser-control, and module-activation outcomes.
- It preserves cross-project attention while heavy inactive project views are
  suspended.
- It keeps inherited terminals, diffs, Git, browser, provider setup, usage,
  settings, authentication, diagnostics, and recovery functional.

The UI may be radically redesigned. The backend contract may not be bypassed.
