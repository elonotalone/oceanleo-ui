// W09 diagnostic: which local recovery records survive a save → close → reopen, and does
// reopening then pause autosave ("最新服务器草稿暂时无法恢复")?
// Usage: mint.sh | OUT_DIR=/tmp/w09-d node harness/run.mjs evidence/W09/scenarios/w09-recovery-diag.mjs <rootId> [idleSeconds]
export default async function ({ page, context, log, shot, helpers, args }) {
  const [rootId, idle = "25"] = args;
  await context.route((url) => /^(?:www\.|api\.)?oceanleo\.com$|(?:^|\.)oceanleo\.cn$/i.test(url.hostname), (r) => r.abort());
  const t0 = Date.now();
  const stamp = () => ((Date.now() - t0) / 1000).toFixed(1);
  page.on("response", (response) => {
    const m = response.request().method();
    const url = response.url();
    if (/agent_tasks|notifications|presence|heartbeat|_next\//.test(url)) return;
    if (response.status() >= 400 || (m !== "GET" && /\/v1\//.test(url))) log("net", stamp(), m, url.replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "").slice(0, 90), response.status());
  });
  const dump = async (tag) => {
    const info = await page.evaluate(async () => {
      const ls = Object.keys(localStorage).filter((k) => /image|fabric|draft|recovery/i.test(k)).map((k) => `${k}:${localStorage.getItem(k)?.length}`);
      const idb = await new Promise((resolve) => {
        const req = indexedDB.open("oceanleo-advanced-recovery");
        req.onerror = () => resolve(["open-failed"]);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("drafts")) return resolve([]);
          const all = db.transaction("drafts").objectStore("drafts").getAll();
          all.onsuccess = () => resolve(all.result.map((r) => `${r.key}|rev=${r.revision}|at=${new Date(r.updatedAt).toISOString()}`));
          all.onerror = () => resolve(["read-failed"]);
        };
      });
      const launcher = document.querySelector("[data-workspace-save-launcher]");
      const stage = document.querySelector("[data-editor-loading]");
      const ed = stage ? ["dirty", "revision", "collab-tick", "remote-delta"].map((k) => `${k}=${stage.getAttribute(`data-editor-${k}`)}`).join(",") : "no-stage";
      return { state: launcher?.getAttribute("data-save-state") || null, title: launcher?.getAttribute("title") || null, ed, ls, idb };
    });
    log("dump", tag, stamp(), JSON.stringify(info));
  };
  const open = async () => {
    await helpers.gotoApp(page, `/library?item=${rootId}`);
    for (let i = 0; i < 30 && !(await page.locator("[data-editor-loading]").count()); i += 1) {
      const edit = page.locator('[data-artifact-action="edit"], button[aria-label^="编辑"], button[aria-label^="Edit"]').or(page.locator("button").filter({ hasText: /^(编辑|Edit)$/ })).first();
      if (await edit.count()) await edit.click().catch(() => {});
      await page.waitForTimeout(2000);
    }
    await page.waitForFunction(() => document.querySelector("[data-editor-loading]")?.getAttribute("data-editor-loading") === "false", null, { timeout: 150000 });
  };
  const flip = async (id) => {
    const box = await page.locator("[data-editor-loading] canvas").first().boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(800);
    await page.locator(`[data-selection-control-id="${id}"] button`).first().click();
    log("edit", stamp(), id);
    await page.waitForTimeout(500);
    await helpers.waitSaved(page, { timeout: 90000 });
  };
  await open();
  for (let i = 0; i < 4; i += 1) { await dump(`open+${i * 2}s`); await page.waitForTimeout(2000); }
  await flip("flip-x");
  await dump("after-save1");
  await flip("flip-y");
  await dump("after-save2");
  await page.waitForTimeout(Number(idle) * 1000);
  await dump("after-idle");
  await page.locator('[data-global-row-slot="close"]').first().click().catch(() => log("close-missing"));
  await page.waitForTimeout(6000);
  await dump("after-close");
  await open();
  for (let i = 0; i < 6; i += 1) { await dump(`reopen+${i * 2}s`); await page.waitForTimeout(2000); }
  await shot("diag-reopen");
}
