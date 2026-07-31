# Canonical workspace — visual checkpoint one

Rebuild of the SASCODE canonical workspace presentation against
`design-references/ui-states/01-dusk-workspace-foundation.png`, captured at that
image's native **1487 × 1058**.

| | |
|---|---|
| `01-before.png` | The rejected state, same viewport. |
| `02-reference.png` | The binding source. |
| `03-after.png` | The rebuild, development visual fixture. |
| `04-side-by-side.jpg` | before → reference → after. |
| `05-overlay-50.jpg` | Reference and rebuild composited at 50%. |
| `06-after-real-backend-state.png` | The same shell on live backend state, no fixture. |

## What the three failures were, and what replaced them

**The centre held a second chat.** `SessionHost` mounted the whole inherited
`SingleChatSurface`, so the workspace rendered two composers and two sets of
environment chrome. It is gone. `SessionWorkbench` now owns the centre and shows
work output — Preview by default, with Changes, Terminal, Files and Agents
adjacent — mounting the real inherited browser, diff, terminal and explorer
panels with their real state. Agent Chat owns the only conversation hierarchy:
transcript, tool activity, file references, per-session progress, and the single
composer.

**The background was paraphrased.** `ProjectBackdrop` said in a comment that the
Dusk reference was only a source of qualities, and drew procedural gradients
instead. `04-stillspace-dusk-background.png` now ships byte-identical at
`apps/web/public/stillspace/dusk-background.png` and renders full-bleed. Light
and scrim still layer over it; they no longer stand in for it.

**The composition was not reference-led.** The giant outlined dead zone is gone.
The space is built around the four source anchors, at proportions derived from
the reference and expressed as viewport-relative clamps.

## Measured against the source

| Anchor | Reference | Rebuild |
|---|---|---|
| Workbench top edge | y 72–74 | y 72–73 |
| Chat left edge / workbench left edge | x 88–90 / 508–510 | x 89 / 509–510 |
| Shelf plane top | y 778–780 | y 779 |
| Environment below the chat sheet | rgb(55, 62, 75) | rgb(57, 63, 77) |
| Environment floor band | rgb(34, 40, 56) | rgb(30, 37, 50) |

## Known remaining differences

- The ambient frame carries fewer elements than the source, which also shows a
  workspace path, a split-mode indicator, and a clock/avatar cluster. The frame
  is structurally correct and deliberately last in the hierarchy; filling it out
  is cosmetic and was left for the frame's own pass.
- The rebuild's environment floor is a few points darker than the source.
- The source shows the chat's dock control with `Top` highlighted while the sheet
  is docked left. The rebuild highlights the dock the sheet is actually in,
  which is treated as an inconsistency in the source rather than a target.

## Reproducing

```bash
node apps/web/scripts/visual-capture.mjs --url "http://localhost:9944/?sascodeFixture=dusk" --out /tmp/after.png
```

```bash
python3 apps/web/scripts/visual-compare.py design-references/ui-states/01-dusk-workspace-foundation.png /tmp/after.png /tmp/cmp
```

The `?sascodeFixture=dusk` flag is development-only and gated a second time on
`import.meta.env.DEV`, so the fixture module is dropped from production builds
entirely. Without the flag the same components render live backend state
(`06-after-real-backend-state.png`).
