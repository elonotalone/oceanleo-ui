// A save that is cut off: edit offline, see the error, go back online, then reload the page
// before the retry finishes. Reopen and watch the top-bar state and the save calls for 60 s.
// Pass: the reopened editor never shows "saved" until a revision commit (or draft) returns 2xx.
// args: id:<artifactId> (a document)
import { guardProduction, openFromLibrary, saveLauncher, saveLedger, sleep, writeJson } from "./_w04-lib.mjs";

async function observe(page, calls, log, label, ms) {
  const seen = [];
  const started = Date.now();
  while (Date.now() - started < ms) {
    const info = await saveLauncher(page).catch(() => null);
    if (info && seen.at(-1)?.state !== info.state) {
      const committed = calls.some((c) => c.at >= started && c.status >= 200 && c.status < 300 && /\/revisions$|\/database\/upload$/.test(c.path));
      seen.push({ t: Date.now() - started, state: info.state, title: info.title, committedBefore: committed });
      log("SAVE-STATE", label, info.state, info.title, "committedBefore", committed);
    }
    await sleep(300);
  }
  return seen;
}

export default async function ({ page, context, log, shot, helpers, args, outDir }) {
  await guardProduction(context, log);
  const needle = args[0];
  const calls = saveLedger(page, log);
  const marker = `W04-interrupted-${Math.random().toString(36).slice(2, 7)}`;
  await openFromLibrary(page, helpers, needle, log);
  await page.getByText(/^(Opening|正在打开)/).first().waitFor({ state: "hidden", timeout: 60000 }).catch(() => {});
  await context.setOffline(true);
  const editor = page.locator(".ProseMirror.oleo-richdoc").first();
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type(marker, { delay: 20 });
  const offline = await observe(page, calls, log, "offline", 6000);
  await shot("interrupted-1-offline");
  await context.setOffline(false);
  await page.reload({ waitUntil: "domcontentloaded" });
  log("reloaded while the save was still owed");
  const reopenAt = Date.now();
  await openFromLibrary(page, helpers, needle, log);
  const reopened = await observe(page, calls, log, "reopened", 60000);
  await shot("interrupted-2-reopened");
  const text = await page.evaluate(() => document.body.innerText || "");
  const report = {
    marker,
    offline,
    reopened,
    markerVisibleAfterReopen: text.includes(marker),
    callsAfterReopen: calls.filter((c) => c.at >= reopenAt),
  };
  writeJson(outDir, "interrupted-save", report);
  log("REPORT", JSON.stringify({ marker, markerVisibleAfterReopen: report.markerVisibleAfterReopen, commits: report.callsAfterReopen.length }));
}
