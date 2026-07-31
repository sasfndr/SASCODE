# SASCODE frontend visual audit — 2026-07-31

## Audit scope

This audit compares the current SASCODE work shell shown in the user-supplied
Chrome screenshot against the intended Stillspace Dusk interface in:

- `design-references/ui-states/01-dusk-workspace-foundation.png`
- `design-references/ui-states/02-official-focus-state.png`
- `design-references/branding/04-stillspace-dusk-background.png`

The screenshot shows one desktop state. Interaction, keyboard behavior, motion,
responsive reflow, and screen-reader semantics cannot be confirmed from this
evidence alone.

## Verdict

**Visually rejected. This requires a presentation-architecture rebuild, not a
polish pass.**

The implementation contains useful functional work, but the rendered result
does not preserve the reference composition, hierarchy, material quality, or
emotional tone. It uses some of the same nouns—glass, floating chat, rounded
cards—without reproducing the system those elements belong to.

## What is worth preserving

- The primary shell avoids a permanent project/session sidebar.
- Project navigation, the session shelf, Edit Space, and draggable module logic
  have useful functional foundations.
- The right-side context rail and the floating chat concept are directionally
  aligned with the reference.
- The implementation is connected to real backend/session state rather than
  being only a static mock.

These strengths are architectural. They do not make the current visual output
acceptable.

## Structural failures

### 1. The central surface has the wrong responsibility

The current `SessionHost` embeds the complete inherited
`SingleChatSurface`/`SplitChatSurface` in the center. The separate Agent Chat
sheet then creates a second chat/composer hierarchy.

The reference is unambiguous:

- Chat and agent communication live in the glass sheet on the left/top.
- The large central surface is work output, with **Preview** as the dominant
  default and Changes, Terminal, Files, and Agents as adjacent modes.

The current duplicate-chat structure is the main reason it still feels like
Synara placed inside translucent boxes rather than a new harness.

### 2. The background was interpreted instead of used

`ProjectBackdrop.tsx` explicitly says the Dusk reference is only a source of
qualities and replaces it with procedural gradients. The result is a nearly
black empty plane.

In the reference, the architectural environment is not decoration. It supplies:

- the scene's depth;
- the warm/cool light that makes the glass believable;
- the visual anchor for the preview surface;
- the calm, inhabitable feeling of a place rather than a dashboard.

The exact Dusk background asset must be the default baseline during this
fidelity rebuild. Custom backgrounds and procedural alternatives can remain
later options.

### 3. The composition is not reference-led

The intended normal workspace has four dominant anchors:

1. a quiet ambient frame;
2. a compact Agent Chat sheet;
3. a large preview-first work surface;
4. a live card shelf spanning the bottom.

The current state instead presents:

- one enormous outlined empty canvas;
- overlapping panels without a clear spatial grid;
- a tiny empty-state pill where the live session card shelf should be;
- most important content compressed into the upper-left quarter;
- a large dead zone with no visual or functional purpose.

### 4. The glass reads as opaque plastic

The current cards use dark, high-opacity fills over an almost equally dark
canvas. There is no visible scene underneath for blur, refraction, edge light,
or depth to act on. Nested panels further flatten the hierarchy.

The reference glass depends on:

- a visible illuminated background;
- low-opacity cool neutral fills;
- a fine top/inner rim;
- restrained blur and saturation;
- soft shadows;
- clear separation between floating glass and stable matte work surfaces.

### 5. Typography and controls disappear

The screenshot has extremely low-contrast labels, body copy, icons, dividers,
and empty-state text. Many controls read as disabled even when interactive.
Tiny icon-only targets and quiet text also make the shell feel unfinished.

The reference is restrained, not faint. Primary content is crisp, secondary
content remains readable, and status colors carry meaning without becoming
neon.

### 6. The state used for validation does not match the source state

The current screenshot is effectively an empty/idle project state, while the
primary references show active sessions and a visible preview. A generic empty
state cannot be used to claim fidelity to an active-work reference.

The frontend needs deterministic development fixtures for every reference
state, rendered through the same production presentation components:

- Dusk workspace foundation;
- focus;
- dual session;
- dual project;
- project overview;
- Edit Space.

## Accessibility risks visible in the screenshot

- Secondary text and icons appear too faint against their surfaces.
- Several controls appear smaller than a comfortable pointer target.
- State and action affordances rely heavily on subtle color/opacity changes.
- The extremely dim shell risks making focus indication and disabled versus
  enabled state difficult to distinguish.

Keyboard order, focus trapping, reduced motion, zoom behavior, semantics, and
actual contrast ratios still require implementation-level verification.

## Required correction

Do not add more decoration to the current composition.

1. Preserve real data adapters, commands, session state, gestures, and durable
   layouts.
2. Replace the presentation composition.
3. Use the exact background asset for the canonical Dusk preset.
4. Split the inherited chat surface into reusable transcript/composer/workbench
   parts instead of embedding the whole old shell.
5. Make Preview the dominant central mode.
6. Rebuild one canonical state at `1487 × 1058` first.
7. Compare the implementation and source at the same viewport using screenshots
   and overlays.
8. Do not proceed to the other states until the canonical composition receives
   visual approval.
