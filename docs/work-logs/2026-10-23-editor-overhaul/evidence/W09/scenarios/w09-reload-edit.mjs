// W09: after save → reload, does a new edit still save (and never sit on "Saved" while dirty)?
// Usage: mint.sh | OUT_DIR=/tmp/w09-r node harness/run.mjs evidence/W09/scenarios/w09-reload-edit.mjs <rootId>
export default async function ({ page, context, log, shot, helpers, args }) {
  const [rootId] = args;
  await context.route((url) => /^(?:www\.|api\.)?oceanleo\.com$|(?:^|\.)oceanleo\.cn$/i.test(url.hostname), (r) => r.abort());
  const t0 = Date.now();
  const stamp = () => ((Date.now() - t0) / 1000).toFixed(1);
  page.on("response", (response) => {
    const m = response.request().method();
    const url = response.url();
    if (m !== "GET" && /\/v1\/artifacts\/|snapshot/.test(url)) log("net", stamp(), m, url.replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "").slice(0, 90), response.status());
  });
  const attrs = async () => page.evaluate(async () => {
    const stage = document.querySelector("[data-editor-loading]");
    const launcher = document.querySelector("[data-workspace-save-launcher]");
    const idb = await new Promise((resolve) => {
      const req = indexedDB.open("oceanleo-advanced-recovery");
      req.onerror = () => resolve(["open-failed"]);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("drafts")) return resolve([]);
        const all = db.transaction("drafts").objectStore("drafts").getAll();
        all.onsuccess = () => resolve(all.result.map((r) => `${r.key.slice(-20)}|rev=${r.revision}|at=${new Date(r.updatedAt).toISOString().slice(11, 23)}`));
        all.onerror = () => resolve(["read-failed"]);
      };
    });
    return `state=${launcher?.getAttribute("data-save-state")} ${stage ? ["loading", "dirty", "revision", "collab-tick", "layer-count", "remote-delta"].map((k) => `${k}=${stage.getAttribute(`data-editor-${k}`)}`).join(",") : "no-stage"} idb=${JSON.stringify(idb)} notice=${JSON.stringify(document.querySelector("[data-editor-loading]")?.closest("[data-inline-editor]")?.querySelector("[role=status]")?.textContent?.slice(0, 80) || "")}`;
  });
  const open = async () => {
    for (let i = 0; i < 60 && !(await page.locator("[data-editor-loading='false']").count()); i += 1) {
      const edit = page.locator('button[aria-label*="Edit"], button[aria-label*="编辑"]').first();
      if (await edit.isVisible().catch(() => false)) await edit.click().catch(() => {});
      await page.waitForTimeout(2000);
    }
    await page.waitForTimeout(3000);
  };
  const flip = async (id) => {
    const box = await page.locator("[data-editor-loading] canvas").first().boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(800);
    await page.locator(`[data-selection-control-id="${id}"] button`).first().click();
    log("edit", stamp(), id);
  };
  const watchFor = async (tag, seconds) => {
    let last = "";
    for (let i = 0; i < seconds * 2; i += 1) {
      const line = await attrs();
      if (line !== last) log("attrs", tag, stamp(), line);
      last = line;
      await page.waitForTimeout(500);
    }
  };
  await helpers.gotoApp(page, `/library?item=${rootId}`);
  await open();
  await watchFor("open", 4);
  await flip("flip-x");
  await watchFor("edit1", 30);
  await page.reload({ waitUntil: "domcontentloaded" });
  await open();
  await watchFor("reload", 6);
  await flip("flip-y");
  await watchFor("edit2", 40);
  await shot("reload-edit-end");
}
