// W16 §5 save protocol on the acceptance account's own video canvas:
// move → saved → rename → saved → link → saved → reload: all three stay; offline → error → retry → saved.
import { OWN_FORK, canvasInfo, openCanvas } from "./_w16-lib.mjs";

async function trackSaved(page, helpers, log, label, { timeout = 90000 } = {}) {
  const seen = [];
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const state = await helpers.saveState(page);
    if (seen[seen.length - 1] !== state) seen.push(state);
    if (state === "saved" && seen.length > 1) break;
    if (state === "error") break;
    await page.waitForTimeout(300);
  }
  log(`save:${label}`, JSON.stringify(seen));
  return seen[seen.length - 1];
}

async function dragNode(page, id, dx, dy) {
  const box = await page.locator(`[data-testid=video-canvas-node][data-node-id="${id}"]`).boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + 12;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 6 });
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
}

export default async function ({ page, context, log, shot, helpers, args }) {
  const id = args[0] || OWN_FORK;
  const stamp = new Date().toISOString().slice(11, 19);
  await openCanvas(page, helpers, log, id);
  const before = await canvasInfo(page);
  log("before", JSON.stringify(before.nodes.map((n) => [n.id, n.rect])), "edges", before.edges);

  // 1. move a node
  await dragNode(page, "shot-1", 0, 90);
  log("after-move-immediate-state", await helpers.saveState(page));
  await trackSaved(page, helpers, log, "move");

  // 2. rename a node through the edit bar's node settings panel
  await page.locator('[data-testid=video-canvas-node][data-node-id="shot-2"]').click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /节点参数|Node settings/ }).first().click();
  const name = page.locator("textarea").first();
  await name.fill(`[W16] 论据 ${stamp}`);
  await name.blur();
  await page.waitForTimeout(500);
  await trackSaved(page, helpers, log, "rename");
  await page.keyboard.press("Escape");

  // 3. connect brief → render
  const src = page.locator('.react-flow__node[data-id="brief"] .react-flow__handle.source').first();
  const dst = page.locator('.react-flow__node[data-id="render"] .react-flow__handle.target').first();
  const a = await src.boundingBox();
  const b = await dst.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const linked = await canvasInfo(page);
  log("edges-after-link", linked.edges);
  await trackSaved(page, helpers, log, "link");
  await shot("s2-01-after-three-saves");
  const saved = await canvasInfo(page);

  // reopen (full page reload)
  await page.reload();
  await openCanvas(page, helpers, log, id);
  const reopened = await canvasInfo(page);
  const pos = (info, nid) => info.nodes.find((n) => n.id === nid)?.rect;
  log("reopen", JSON.stringify({
    moveKept: pos(reopened, "shot-1") === pos(saved, "shot-1") && pos(saved, "shot-1") !== pos(before, "shot-1"),
    shot1: [pos(before, "shot-1"), pos(saved, "shot-1"), pos(reopened, "shot-1")],
    renameKept: reopened.nodes.some((n) => n.text.includes(`[W16] 论据 ${stamp}`)),
    edges: [before.edges, saved.edges, reopened.edges],
  }));
  await shot("s2-02-reopened");

  // 4. offline → error → retry → saved
  await context.setOffline(true);
  await dragNode(page, "shot-3", 0, 70);
  const offline = await trackSaved(page, helpers, log, "offline", { timeout: 60000 });
  await shot("s2-03-offline");
  await context.setOffline(false);
  if (offline === "error") {
    const launcher = page.locator("[data-workspace-save-launcher]").first();
    await launcher.click().catch(() => {});
    await page.waitForTimeout(600);
    const retry = page.getByRole("button", { name: /重试|Retry|Try again/ }).first();
    log("retry-button", String(await retry.count()));
    if (await retry.count()) await retry.click();
    await trackSaved(page, helpers, log, "retry");
  }
  await shot("s2-04-after-retry");
  const final = await canvasInfo(page);
  log("final", JSON.stringify({ shot3: [pos(reopened, "shot-3"), pos(final, "shot-3")], state: final.saveState }));
}
