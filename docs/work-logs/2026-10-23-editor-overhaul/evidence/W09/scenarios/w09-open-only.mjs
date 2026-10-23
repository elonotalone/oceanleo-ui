// W09 R3: open → wait → close → reopen → wait → reload → wait, never editing. Every POST /revisions
// is a finding (expected 0). Logs dirty / remote-delta / recovery records at each step.
// Usage: mint.sh | OUT_DIR=/tmp/w09-o node harness/run.mjs evidence/W09/scenarios/w09-open-only.mjs <rootId> [waitSeconds]
export default async function ({ page, context, log, helpers, args, shot }) {
  const [rootId, wait = "40"] = args;
  await context.route((url) => /^(?:www\.|api\.)?oceanleo\.com$|(?:^|\.)oceanleo\.cn$/i.test(url.hostname), (r) => r.abort());
  const t0 = Date.now();
  const stamp = () => ((Date.now() - t0) / 1000).toFixed(1);
  const commits = [];
  page.on("response", (r) => {
    const m = r.request().method();
    if (m !== "GET" && /\/v1\/artifacts\/[^/]+\/(revisions|staging)$|:fork$/.test(r.url().replace(/\?.*$/, ""))) {
      const path = r.url().replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "");
      if (/revisions$/.test(path)) commits.push(stamp());
      log("net", stamp(), m, path.slice(0, 90), r.status());
    }
  });
  const probe = (tag) => page.evaluate(async () => {
    const root = document.querySelector("[data-editor-loading]");
    const launcher = document.querySelector("[data-workspace-save-launcher]");
    const idb = await new Promise((resolve) => {
      const req = indexedDB.open("oceanleo-advanced-recovery");
      req.onerror = () => resolve(["open-failed"]);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("drafts")) return resolve([]);
        const all = db.transaction("drafts").objectStore("drafts").getAll();
        all.onsuccess = () => resolve(all.result.map((r) => `rev=${r.revision}`));
        all.onerror = () => resolve(["read-failed"]);
      };
    });
    return `state=${launcher?.getAttribute("data-save-state")} ${["loading", "dirty", "revision", "collab-tick", "remote-delta"].map((k) => `${k}=${root?.getAttribute(`data-editor-${k}`)}`).join(" ")} idb=${JSON.stringify(idb)}`;
  }).then((line) => log("probe", tag, stamp(), line));
  const open = async () => {
    for (let i = 0; i < 60 && !(await page.locator("[data-editor-loading='false']").count()); i += 1) {
      const retry = page.locator("[data-library-retry]").first();
      if (await retry.isVisible().catch(() => false)) await retry.click().catch(() => {});
      const edit = page.locator('button[aria-label*="Edit"], button[aria-label*="编辑"]').first();
      if (await edit.isVisible().catch(() => false)) await edit.click().catch(() => {});
      await page.waitForTimeout(2000);
    }
  };
  const hold = async (tag) => {
    for (let i = 0; i < Number(wait) / 10; i += 1) {
      await probe(`${tag}+${i * 10}s`);
      await page.waitForTimeout(10000);
    }
  };
  await helpers.gotoApp(page, `/library?item=${rootId}`);
  await open();
  await hold("open");
  await page.locator('[data-global-row-slot="close"]').first().click().catch(() => log("close-missing"));
  await page.waitForTimeout(5000);
  await helpers.gotoApp(page, `/library?item=${rootId}`);
  await open();
  await hold("reopen");
  await page.reload({ waitUntil: "domcontentloaded" });
  await open();
  await hold("reload");
  await shot("open-only-end");
  log("REPORT", JSON.stringify({ commits }));
}
