// Where does the extra revision after a page reload come from? Edit once (deck bold), wait for the
// commit, dump the local recovery store, reload, dump again, open the editor and watch 45 s.
// args: id:<artifactId> (a deck in my library)
import { guardProduction, openFromLibrary, saveLedger, sleep, waitForSettled, writeJson } from "./_w04-lib.mjs";

const dumpRecovery = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const request = indexedDB.open("oceanleo-advanced-recovery");
        request.onerror = () => resolve({ error: "open failed" });
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("drafts")) return resolve([]);
          const all = db.transaction("drafts").objectStore("drafts").getAll();
          all.onsuccess = () => resolve(all.result.map((r) => ({ key: r.key, revision: r.revision, updatedAt: r.updatedAt })));
          all.onerror = () => resolve({ error: "read failed" });
        };
      }),
  );

export default async function ({ page, context, log, shot, helpers, args, outDir }) {
  await guardProduction(context, log);
  const needle = args[0];
  const calls = saveLedger(page, log);
  await openFromLibrary(page, helpers, needle, log);
  const text = page.locator("[data-deck-canvas] [data-deck-element][data-element-type=text]").first();
  await text.click({ force: true });
  await sleep(800);
  await page.locator('[data-selection-control-id="italic"] button, button[data-selection-control-id="italic"]').first().click();
  await waitForSettled(page, log, { label: "edit" });
  await sleep(25000);
  const beforeReload = await dumpRecovery(page);
  log("recovery before reload", JSON.stringify(beforeReload));
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(5000);
  const afterReload = await dumpRecovery(page);
  log("recovery after reload", JSON.stringify(afterReload));
  const reopenAt = Date.now();
  await openFromLibrary(page, helpers, needle, log);
  await sleep(45000);
  const commits = calls.filter((c) => c.at >= reopenAt && /\/revisions$/.test(c.path)).map((c) => `${c.status} +${c.at - reopenAt}ms`);
  writeJson(outDir, "reload-extra-revision", { beforeReload, afterReload, commits });
  log("REPORT", JSON.stringify({ beforeReload: beforeReload.length, afterReload: afterReload.length, commits }));
}
