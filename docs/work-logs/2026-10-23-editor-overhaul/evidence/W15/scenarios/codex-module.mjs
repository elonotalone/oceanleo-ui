import { guardProduction, openGame } from "./_w15-lib.mjs";
export default async function ({ page, context, helpers, log }) {
  await guardProduction(context, log);
  const checks = [];
  page.on("response", response => {
    if (!/\.js(?:\?|$)/.test(response.url())) return;
    checks.push(response.text().then(code => {
      if (code.includes("runGameIteration") || code.includes("function GameLegacyRoute")) {
        log("module", JSON.stringify({ path: new URL(response.url()).pathname, runner: code.includes("runGameIteration"), resumeOptIn: code.includes("supportsResume"), resumeEffect: code.includes("resumedArtifact"), statusCopy: code.includes("修改任务正在处理中") }));
      }
    }).catch(() => {}));
  });
  page.on("request", request => { if (/game-generate/.test(request.url())) log("gameRequest", request.method(), new URL(request.url()).pathname); });
  await openGame(page, helpers, log);
  log("game-hook-probe", JSON.stringify(await page.evaluate(() => {
    const root = document.querySelector("[data-editor-adapter='game']");
    const key = root && Object.keys(root).find(key => key.startsWith("__reactFiber$"));
    let fiber = key ? root[key] : null;
    while (fiber?.return) fiber = fiber.return;
    const seen = new Set(), stack = [fiber], found = [];
    while (stack.length) {
      const entry = stack.pop(); if (!entry || seen.has(entry)) continue; seen.add(entry);
      const name = entry.type?.name || entry.type?.displayName;
      if (name === "GameLegacyRoute") {
        const item = entry.memoizedProps?.item, hooks = [];
        for (let hook = entry.memoizedState, i = 0; hook && i < 30; hook = hook.next, i++) {
          if (typeof hook.memoizedState === "function") hooks.push({ index: i, name: hook.memoizedState.name, supportsResume: hook.memoizedState.supportsResume });
        }
        found.push({ name, artifactId: item?.artifactId, revisionId: item?.revisionId, artifactRevision: item?.artifact?.revisionId, hooks });
      }
      stack.push(entry.child, entry.sibling);
    }
    return found;
  })));
  await Promise.allSettled(checks);
  log("scriptCount", checks.length);
}
