// W16: position panel (X/Y), link two nodes through their handles, offline → error → retry → saved, reopen.
import { OWN_FORK, canvasInfo, openCanvas } from "./_w16-lib.mjs";

async function waitState(page, helpers, log, label, want, timeout = 90000) {
  const seen = [];
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const state = await helpers.saveState(page);
    if (seen[seen.length - 1] !== state) seen.push(state);
    if (want.includes(state) && seen.length > 1) break;
    await page.waitForTimeout(300);
  }
  log(`save:${label}`, JSON.stringify(seen));
  return seen[seen.length - 1];
}

async function visibleButtons(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("button,[role=menuitem]")]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .map((el) => (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40))
      .filter(Boolean));
}

export default async function ({ page, context, log, shot, helpers, args }) {
  const id = args[0] || OWN_FORK;
  await openCanvas(page, helpers, log, id);
  const before = await canvasInfo(page);
  log("before", JSON.stringify(before.nodes.map((n) => [n.id, n.rect])), "edges", before.edges);

  // Position panel: put the brief back at (40, 40).
  // The R2 s2 run dragged the brief under the timeline node; click its visible lower-left corner.
  const brief = page.locator('[data-testid=video-canvas-node][data-node-id="brief"]');
  const briefBox = await brief.boundingBox();
  await brief.click({ position: { x: 8, y: briefBox.height - 4 }, force: true });
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /位置与尺寸|Position and size/ }).first().click();
  await page.waitForTimeout(600);
  await shot("s3-01-position-panel");
  const inputs = page.locator("input[type=number]");
  log("number-inputs", String(await inputs.count()));
  await inputs.nth(0).fill("40");
  await inputs.nth(0).press("Enter");
  await page.waitForTimeout(300);
  await inputs.nth(1).fill("40");
  await inputs.nth(1).press("Enter");
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await waitState(page, helpers, log, "position", ["saved", "error"]);
  const placed = await canvasInfo(page);
  log("brief-after-panel", placed.nodes.find((n) => n.id === "brief")?.rect);

  // Link brief → render through the handles.
  await page.locator(".react-flow__controls-fitview").click().catch(() => {});
  await page.waitForTimeout(800);
  const src = page.locator('.react-flow__node[data-id="brief"] .react-flow__handle.source').first();
  const dst = page.locator('.react-flow__node[data-id="render"] .react-flow__handle.target').first();
  const a = await src.boundingBox();
  const b = await dst.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const linked = await canvasInfo(page);
  log("edges-after-link", linked.edges, "brief", linked.nodes.find((n) => n.id === "brief")?.rect);
  await waitState(page, helpers, log, "link", ["saved", "error"]);
  await shot("s3-02-linked");

  // Offline → error → retry.
  await context.setOffline(true);
  await page.locator('.react-flow__edge').last().click({ force: true }).catch(() => {});
  await page.locator('[data-testid=video-canvas-node][data-node-id="shot-4"]').click();
  await page.getByRole("button", { name: /^(复制一份|Duplicate)$/ }).first().click();
  const offline = await waitState(page, helpers, log, "offline", ["error", "saved"], 60000);
  log("offline-not-saved", String(offline !== "saved"));
  await shot("s3-03-offline-error");
  await context.setOffline(false);
  await page.locator("[data-workspace-save-launcher]").first().click().catch(() => {});
  await page.waitForTimeout(800);
  log("menu", JSON.stringify(await visibleButtons(page)));
  await shot("s3-04-save-menu");
  const retry = page.getByRole("button", { name: /重试|Retry|Try again|Save now|立即保存/ })
    .or(page.getByRole("menuitem", { name: /重试|Retry|Try again|Save now|立即保存/ })).first();
  log("retry-count", String(await retry.count()));
  if (await retry.count()) await retry.click();
  await waitState(page, helpers, log, "retry", ["saved"], 90000);
  const afterRetry = await canvasInfo(page);

  await page.reload();
  await openCanvas(page, helpers, log, id);
  const reopened = await canvasInfo(page);
  log("reopen", JSON.stringify({
    nodes: [before.nodes.length, afterRetry.nodes.length, reopened.nodes.length],
    edges: [before.edges, afterRetry.edges, reopened.edges],
    brief: reopened.nodes.find((n) => n.id === "brief")?.rect,
  }));
  await shot("s3-05-reopened");
}
