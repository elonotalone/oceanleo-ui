// W16 _EDITOR §A.4 / §E: click every bar button once and see the effect; 素材库 click inserts a media node.
import { OWN_FORK, canvasInfo, openCanvas } from "./_w16-lib.mjs";

async function settle(page, helpers, log, label) {
  const seen = [];
  const started = Date.now();
  while (Date.now() - started < 60000) {
    const state = await helpers.saveState(page);
    if (seen[seen.length - 1] !== state) seen.push(state);
    if ((state === "saved" && seen.length > 1) || state === "error") break;
    await page.waitForTimeout(250);
  }
  log(`save:${label}`, JSON.stringify(seen));
}
const count = async (page) => (await canvasInfo(page)).nodes.length;
const bar = (page, name) => page.getByRole("button", { name }).first();

export default async function ({ page, log, shot, helpers, args }) {
  await openCanvas(page, helpers, log, args[0] || OWN_FORK);
  const start = await canvasInfo(page);
  const base = start.nodes.map((n) => n.id);
  log("start", base.length);

  // 「加节点」 → 视频
  await page.locator(".react-flow__pane").click({ position: { x: 40, y: 300 } });
  await bar(page, /^(加节点|Add node)$/).click();
  await page.locator('[data-testid=video-canvas-add-node][data-node-kind="video"]').click();
  await page.waitForTimeout(600);
  const added = (await canvasInfo(page)).nodes.find((n) => !base.includes(n.id));
  log("add-node", JSON.stringify({ count: await count(page), added }));
  await shot("s5-01-added-video-node");
  await settle(page, helpers, log, "add");

  // Lock → card says Locked, Delete disappears; Unlock.
  await page.locator(`[data-testid=video-canvas-node][data-node-id="${added.id}"]`).click();
  await bar(page, /^(锁定|Lock)$/).click();
  await page.waitForTimeout(500);
  const lockedText = (await canvasInfo(page)).nodes.find((n) => n.id === added.id)?.text;
  log("lock", JSON.stringify({ lockedText, deleteVisible: await bar(page, /^(删除|Delete)$/).isVisible().catch(() => false) }));
  await shot("s5-02-locked");
  await bar(page, /^(解锁|Unlock|锁定|Lock)$/).click();
  await page.waitForTimeout(500);
  log("unlock", JSON.stringify({ deleteVisible: await bar(page, /^(删除|Delete)$/).isVisible().catch(() => false) }));

  // Delete → gone; Undo → back; Redo → gone again.
  await bar(page, /^(删除|Delete)$/).click();
  await page.waitForTimeout(500);
  const afterDelete = await count(page);
  await bar(page, /^(撤销|Undo)$/).click();
  await page.waitForTimeout(500);
  const afterUndo = await count(page);
  await bar(page, /^(重做|Redo)$/).click();
  await page.waitForTimeout(500);
  const afterRedo = await count(page);
  log("delete-undo-redo", JSON.stringify({ afterDelete, afterUndo, afterRedo, base: base.length }));
  await settle(page, helpers, log, "delete");

  // 素材库: click the first material card → a media node appears.
  await page.locator('[data-workspace-library-panel="materials"]').first().click().catch(() => {});
  const pane = page.locator("[data-editor-fallback-pane], [data-workspace-pane='left'][data-left-panel='tool-detail']").first();
  await pane.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
  const loadedBy = Date.now() + 40000;
  while (Date.now() < loadedBy) {
    if (!(await pane.locator("[data-material-shelf-state='loading']").count()) && (await pane.locator("[draggable='true']").count())) break;
    await page.waitForTimeout(1000);
  }
  const titles = await pane.locator("[draggable='true']").evaluateAll((cards) =>
    cards.slice(0, 6).map((c) => (c.getAttribute("aria-label") || c.textContent || "").trim().slice(0, 50)));
  log("materials", JSON.stringify(titles));
  await shot("s5-03-materials");
  const before = await count(page);
  const card = pane.locator("[draggable='true']").first();
  if (await card.count()) {
    await card.click();
    let feedback = null;
    for (let i = 0; i < 30 && !feedback; i++) {
      await page.waitForTimeout(500);
      feedback = await page.evaluate(() => {
        const el = document.querySelector("[data-material-insert-feedback]");
        return el ? { kind: el.getAttribute("data-material-insert-feedback"), text: el.textContent } : null;
      });
    }
    const info = await canvasInfo(page);
    log("material", JSON.stringify({ feedback, before, after: info.nodes.length, last: info.nodes[info.nodes.length - 1] }));
    await shot("s5-04-material-inserted");
    await settle(page, helpers, log, "material");
  }
}
