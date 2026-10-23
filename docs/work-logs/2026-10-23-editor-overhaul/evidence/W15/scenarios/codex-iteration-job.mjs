import assert from "node:assert/strict";
import { GAME_ID, guardProduction, openGame, sleep } from "./_w15-lib.mjs";

// One real paid submission only. Reload and transport interruption must recover
// its owner-private receipt; neither action may create another paid request.
export default async function ({ page, context, log, shot, helpers, args }) {
  await guardProduction(context, log);
  const submit = args[0] === "submit";
  const expectedPosts = submit ? 1 : 0;
  let posts = 0, polls = 0, latestReads = 0, receipt = null, saved = null, failure = null;
  const started = Date.now();
  const states = new Set();
  page.on("response", async (response) => {
    const request = response.request();
    const path = new URL(request.url()).pathname;
    if (!path.startsWith(`/v1/game-generate/${GAME_ID}/iterations`)) return;
    const payload = await response.json().catch(() => null);
    if (!submit && payload?.jobId) receipt = payload;
    if (request.method() === "POST") {
      posts++;
      assert.equal(response.status(), 202);
      receipt = payload;
      log("submission", JSON.stringify({ status: response.status(), jobId: payload?.jobId, state: payload?.state, base: payload?.expectedRevisionId }));
    } else {
      polls++;
      if (path.endsWith("/latest")) latestReads++;
    }
    if (payload?.state && !states.has(payload.state)) { states.add(payload.state); log("state", payload.state); }
    if (payload?.state === "succeeded") saved = payload.result?.artifact;
    if (payload?.state === "failed" || payload?.state === "unconfirmed") failure = payload;
  });
  await openGame(page, helpers, log);
  log("game-runtime", JSON.stringify(await page.evaluate(() => {
    const element = document.querySelector("[data-editor-adapter='game']");
    const key = element && Object.keys(element).find(key => key.startsWith("__reactFiber$"));
    let root = key && element[key];
    while (root?.return) root = root.return;
    const stack = [root], seen = new Set();
    while (stack.length) {
      const entry = stack.pop(); if (!entry || seen.has(entry)) continue; seen.add(entry);
      if (entry.type?.name === "GameLegacyRoute") {
        const item = entry.memoizedProps?.item, hooks = [];
        for (let hook = entry.memoizedState, i = 0; hook && i < 35; hook = hook.next, i++) {
          if (typeof hook.memoizedState === "function") hooks.push({ index: i, name: hook.memoizedState.name, supportsResume: hook.memoizedState.supportsResume });
        }
        return { artifactId: item?.artifactId, revisionId: item?.revisionId, artifactRevision: item?.artifact?.revisionId, hooks };
      }
      stack.push(entry.child, entry.sibling);
    }
    return { component: "not-found" };
  })));
  const header = page.locator("[data-advanced-workbench-header], [data-plugin-chrome-header]").first();
  const titleBefore = await header.locator("input").evaluateAll(inputs => inputs[0]?.value || "");
  log("headerBefore", (await header.innerText()).replace(/\s+/g, " ").slice(0, 180));
  const drawer = page.locator("[data-edit-bar-drawer]").first();
  if (!(await page.locator("#game-prompt").isVisible().catch(() => false))) await drawer.click();
  if (submit) {
    await page.locator("#game-prompt").fill("保留现有玩法，把星星改成绿色，收集时显示 +1 提示。");
    await page.locator("#game-prompt ~ button").first().click();
  }
  for (let i = 0; i < 120 && !receipt; i++) await sleep(500);
  assert.ok(receipt?.jobId, "short submission must return a receipt");
  assert.equal(posts, expectedPosts);
  if (!saved) await page.locator("[data-testid=game-play-notice]").waitFor({ timeout: 30000 });
  await shot("job-running");
  await sleep(20_000);
  await context.setOffline(true);
  await sleep(18_000);
  log("offlineNotice", await page.locator("[data-testid=game-play-notice]").innerText().catch(() => ""));
  await shot("job-offline");
  await context.setOffline(false);
  // Browser reload discards its poll loop; server work must remain independent.
  await page.reload({ waitUntil: "domcontentloaded" });
  await openGame(page, helpers, log);
  if (!(await page.locator("#game-prompt").isVisible().catch(() => false))) await page.locator("[data-edit-bar-drawer]").first().click();
  log("reopened", JSON.stringify({ posts, polls, latestReads }));
  assert.equal(posts, expectedPosts, "reload must not submit another generation");
  await shot("job-reopened");
  let lastMinute = -1;
  while (!saved && !failure && Date.now() - started < 25 * 60_000) {
    const minute = Math.floor((Date.now() - started) / 60_000);
    if (minute !== lastMinute) { lastMinute = minute; log("waiting", JSON.stringify({ elapsedSeconds: Math.round((Date.now() - started) / 1000), posts, polls, latestReads })); }
    await sleep(2000);
  }
  assert.equal(failure, null, JSON.stringify(failure));
  assert.ok(saved?.revisionId, "job must confirm an actual saved revision");
  assert.notEqual(saved.revisionId, receipt.expectedRevisionId);
  assert.equal(saved.artifactId, GAME_ID);
  assert.equal(posts, expectedPosts);
  assert.ok(latestReads >= 2, "open and reload must read an owner-bound latest receipt");
  await sleep(4000);
  log("saved", JSON.stringify({ elapsedSeconds: Math.round((Date.now() - started) / 1000), jobId: receipt.jobId, revisionId: saved.revisionId, title: saved.title, posts, polls, latestReads, titleBefore }));
  log("saveState", await helpers.saveState(page));
  await shot("job-saved");
  await page.reload({ waitUntil: "domcontentloaded" });
  await openGame(page, helpers, log);
  await sleep(4000);
  assert.equal(posts, expectedPosts, "reopening a completed receipt must not create another job");
  log("finalReopen", JSON.stringify({ posts, polls, latestReads, saveState: await helpers.saveState(page) }));
  await shot("job-final-reopen");
}
