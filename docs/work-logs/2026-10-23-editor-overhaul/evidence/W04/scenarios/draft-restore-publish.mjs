// W08-to-W04 #1: an edit that only reached the server draft (「已保存」 from the draft tier) must
// still become a revision when the page is reloaded before the 20 s idle publish.
// Steps: edit 1 (version) → edit 2 (draft) → reload at once → reopen → watch 60 s for a commit.
// args: id:<artifactId> (a rich document)
import { guardProduction, openFromLibrary, saveLauncher, saveLedger, sleep, waitForSettled, writeJson } from "./_w04-lib.mjs";

async function type(page, marker) {
  const editor = page.locator(".ProseMirror.oleo-richdoc").first();
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type(marker, { delay: 20 });
}

export default async function ({ page, context, log, shot, helpers, args, outDir }) {
  await guardProduction(context, log);
  const needle = args[0];
  const calls = saveLedger(page, log);
  const tag = Math.random().toString(36).slice(2, 7);
  const markers = [`W04-draftpub-a-${tag}`, `W04-draftpub-b-${tag}`];
  await openFromLibrary(page, helpers, needle, log);
  await page.getByText(/^(Opening|正在打开)/).first().waitFor({ state: "hidden", timeout: 60000 }).catch(() => {});
  await type(page, markers[0]);
  await waitForSettled(page, log, { label: "edit1" });
  const commitStart = Date.now();
  while (Date.now() - commitStart < 40000 && !calls.some((c) => /\/revisions$/.test(c.path) && c.status === 200)) await sleep(500);
  await sleep(2000);
  const beforeSecond = calls.length;
  await type(page, markers[1]);
  const second = await waitForSettled(page, log, { label: "edit2" });
  const secondCalls = calls.slice(beforeSecond).map((c) => `${c.path} ${c.status}`);
  log("edit2 settled", second.state, JSON.stringify(secondCalls));
  await page.reload({ waitUntil: "domcontentloaded" });
  const reopenAt = Date.now();
  await openFromLibrary(page, helpers, needle, log);
  const seen = [];
  while (Date.now() - reopenAt < 75000) {
    const info = await saveLauncher(page).catch(() => null);
    if (info && seen.at(-1)?.state !== info.state) {
      seen.push({ t: Date.now() - reopenAt, state: info.state });
      log("SAVE-STATE reopened", info.state, info.title);
    }
    if (calls.some((c) => c.at >= reopenAt && /\/revisions$/.test(c.path) && c.status === 200)) break;
    await sleep(500);
  }
  await sleep(3000);
  await shot("draft-restore-publish");
  const report = { markers, secondCalls, seen, commitsAfterReopen: calls.filter((c) => c.at >= reopenAt) };
  writeJson(outDir, "draft-restore-publish", report);
  log("REPORT", JSON.stringify({ markers, commitsAfterReopen: report.commitsAfterReopen.map((c) => `${c.path} ${c.status}`) }));
}
