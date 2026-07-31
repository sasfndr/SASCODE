// FILE: scripts/visual-capture.mjs
// Purpose: Render a SASCODE screen at an exact viewport and save a real-pixel
//          PNG, so an implementation can be compared against a design source
//          at the same size instead of against a scaled screenshot.
// Layer: Development tooling. Never imported by the app.
//
// Usage:
//   node scripts/visual-capture.mjs --url http://localhost:9944/?sascodeFixture=dusk \
//     --out /tmp/after.png [--width 1487] [--height 1058] [--wait 6000]
//
// The default viewport is the canonical review size for the Stillspace
// references (`1487 x 1058`), which is the native size of
// `design-references/ui-states/01-dusk-workspace-foundation.png`.

import { chromium } from "playwright";

const DEFAULTS = {
  width: 1487,
  height: 1058,
  wait: 6000,
  selector: "",
};

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, "");
    const value = argv[index + 1];
    if (!key || value === undefined) continue;
    args[key] = key === "width" || key === "height" || key === "wait" ? Number(value) : value;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.url || !args.out) {
  console.error("visual-capture: --url and --out are required");
  process.exit(1);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: args.width, height: args.height },
  // Capture at 1x so the PNG's pixel dimensions equal the CSS viewport and the
  // result can be diffed directly against the source image.
  deviceScaleFactor: 1,
  colorScheme: "dark",
});
const page = await context.newPage();

const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text().slice(0, 200));
});
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message.slice(0, 200)}`));

await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: 120_000 });

if (args.selector) {
  await page.waitForSelector(args.selector, { timeout: 120_000 });
}

// The dev server compiles a large module graph on first load, so settle on
// network idle before the fixed wait rather than instead of it.
await page.waitForLoadState("networkidle", { timeout: 120_000 }).catch(() => {});
await page.waitForTimeout(args.wait);

// Transient inherited notices (update prompts, provider toasts) are real app
// behaviour but are not part of the composition under review, and they land
// over the middle of the frame. Dismiss them the way a user would.
if (args.dismissToasts !== "false") {
  const dismissed = await page.evaluate(() => {
    // Scoped to the inherited toast stack only. A broader "any dismiss button"
    // sweep would also close the workspace's own decision toast, which is part
    // of the composition under review.
    const buttons = Array.from(
      document.querySelectorAll(
        '[data-slot="toast-close"], [data-slot="toast"] button[aria-label^="Close"]',
      ),
    );
    for (const button of buttons) button.click();
    return buttons.length;
  });
  if (dismissed > 0) await page.waitForTimeout(600);
}

// Fonts and the background image must be decoded before the shot, or the
// capture records a frame the user would never see.
await page.evaluate(async () => {
  await document.fonts.ready;
  const images = Array.from(document.images).filter((image) => !image.complete);
  await Promise.all(
    images.map(
      (image) =>
        new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        }),
    ),
  );
});

await page.screenshot({ path: args.out, animations: "disabled" });
await browser.close();

console.log(`visual-capture: wrote ${args.out} at ${args.width}x${args.height}`);
if (consoleErrors.length > 0) {
  console.log(`visual-capture: ${consoleErrors.length} console error(s):`);
  for (const error of consoleErrors.slice(0, 8)) console.log(`  - ${error}`);
}
