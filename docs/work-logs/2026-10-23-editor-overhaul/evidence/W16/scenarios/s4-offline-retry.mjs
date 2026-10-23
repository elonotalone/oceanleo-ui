// W16 §5.4: offline edit → 保存失败 (never 已保存) → back online → retry → 已保存 → reopen keeps it.
import { OWN_FORK, canvasInfo, openCanvas } from "./_w16-lib.mjs";

async function waitState(page, helpers, log, label, want, timeout = 90000) {
  const seen = [];
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const state = await helpers.saveState(page);
    if (seen[seen.length - 1] !== state) seen.push(state);
    if (want.includes(state) && seen.length > 1) break;
    await page.waitForTimeout(250);
  }
  log(`save:${label}`, JSON.stringify(seen));
  return seen[seen.length - 1];
}

export default async function ({ page, context, log, shot, helpers, args }) {
  const id = args[0] || OWN_FORK;
  await openCanvas(page, helpers, log, id);
  const before = await canvasInfo(page);
  log("before", before.nodes.length, before.edges, before.saveState);
  await context.setOffline(true);
  // Delete the newest duplicate if one exists, else duplicate shot-4: either way a real change.
  const extra = before.nodes.find((n) => !["brief", "shot-1", "shot-2", "shot-3", "shot-4", "sequence", "render"].includes(n.id));
  const targetId = extra ? extra.id : "shot-4";
  await page.locator(`[data-testid=video-canvas-node][data-node-id="${targetId}"]`).click({ force: true });
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: extra ? /^(删除|Delete)$/ : /^(复制一份|Duplicate)$/ }).first().click();
  log("action", extra ? `delete ${targetId}` : "duplicate shot-4");
  const offline = await waitState(page, helpers, log, "offline", ["error", "saved"], 60000);
  log("offline-never-saved", String(offline !== "saved"));
  await shot("s4-01-offline-error");
  await context.setOffline(false);
  await page.locator("[data-workspace-save-launcher]").first().click().catch(() => {});
  await page.waitForTimeout(700);
  await shot("s4-02-save-menu");
  const menu = await page.evaluate(() =>
    [...document.querySelectorAll("button,[role=menuitem]")]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .map((el) => (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40)).filter(Boolean));
  log("menu", JSON.stringify(menu));
  const retry = page.locator("button,[role=menuitem]").filter({ hasText: /重试|retry/i }).first();
  log("retry-count", String(await retry.count()));
  if (await retry.count()) await retry.click();
  const after = await waitState(page, helpers, log, "retry", ["saved"], 90000);
  const mid = await canvasInfo(page);
  await shot("s4-03-after-retry");
  await page.reload();
  await openCanvas(page, helpers, log, id);
  const reopened = await canvasInfo(page);
  log("result", JSON.stringify({ after, nodes: [before.nodes.length, mid.nodes.length, reopened.nodes.length] }));
}
