// W08 save protocol (00-dispatch.md §5, items 1 and 4) for one document.
// Usage:
//   bash harness/mint.sh | OUT_DIR=/tmp/w08-x THEME=light \
//     node harness/run.mjs evidence/W08/scenarios/save-protocol.mjs <artifactId> <label> [offline]
// Edits the document twice, waits for a server-confirmed "saved" after each,
// closes, reopens and reloads, and checks both edits are still in the body.
// With "offline": also edits while offline, expects "error", reconnects, retries.

const BODY = ".oleo-richdoc";

async function saveStateNow(page) {
  return page
    .locator("[data-workspace-save-launcher]")
    .first()
    .getAttribute("data-save-state", { timeout: 1500 })
    .catch(() => null);
}

/** Wait for a real transition: leave "saved" first (or time out), then settle. */
async function waitForSaveCycle(page, log, label, { timeout = 90000 } = {}) {
  const started = Date.now();
  const seen = [];
  let left = false;
  while (Date.now() - started < timeout) {
    const state = await saveStateNow(page);
    if (seen[seen.length - 1] !== state) {
      seen.push(state);
      log(label, "state", String(state), `${((Date.now() - started) / 1000).toFixed(1)}s`);
    }
    if (state && state !== "saved") left = true;
    if (left && (state === "saved" || state === "error")) break;
    if (!left && Date.now() - started > 15000) break;
    await page.waitForTimeout(300);
  }
  const title = await page
    .locator("[data-workspace-save-launcher]")
    .first()
    .getAttribute("title", { timeout: 1500 })
    .catch(() => "");
  return { states: seen, final: seen[seen.length - 1], left, title };
}

async function openDocument(page, helpers, log, artifactId) {
  await helpers.gotoApp(page, `/library?item=${encodeURIComponent(artifactId)}`);
  const body = page.locator(BODY).first();
  await body.waitFor({ state: "visible", timeout: 120000 });
  // The stage drops aria-busy once the source is in.
  await page
    .locator("[role=region][aria-busy=false]")
    .first()
    .waitFor({ timeout: 60000 })
    .catch(() => log("warn", "stage stayed busy"));
  await page.waitForTimeout(1500);
  return body;
}

async function typeAtEnd(page, body, text) {
  await body.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(text, { delay: 25 });
}

export default async function ({ page, context, log, shot, helpers, args }) {
  const [artifactId, label = "doc", mode = ""] = args;
  if (!artifactId) throw new Error("usage: save-protocol.mjs <artifactId> <label> [offline]");
  const stamp = Date.now().toString(36).slice(-4);
  const first = ` W08-${stamp}-一`;
  const second = ` W08-${stamp}-二`;

  let body = await openDocument(page, helpers, log, artifactId);
  await shot(`${label}-1-opened`);
  log("opened", page.url(), "state", String(await saveStateNow(page)));

  await typeAtEnd(page, body, first);
  const save1 = await waitForSaveCycle(page, log, "save1");
  log("save1", JSON.stringify(save1));
  await shot(`${label}-2-after-save1`);

  await typeAtEnd(page, body, second);
  const save2 = await waitForSaveCycle(page, log, "save2");
  log("save2", JSON.stringify(save2));
  await shot(`${label}-3-after-save2`);
  log("url-after-saves", page.url());

  // Close the editor, then reopen it from the address bar.
  const close = page.locator("[data-global-row-slot='close'] button").first();
  if (await close.isVisible().catch(() => false)) {
    await close.click();
    await page.waitForTimeout(2500);
    await shot(`${label}-4-closed`);
  } else {
    log("warn", "no close button visible");
  }
  const reopenedId = new URL(page.url()).searchParams.get("item") || artifactId;
  body = await openDocument(page, helpers, log, reopenedId);
  const reopened = (await body.innerText()).trim();
  log("reopen", JSON.stringify({
    reopenedId,
    hasFirst: reopened.includes(first.trim()),
    hasSecond: reopened.includes(second.trim()),
  }));
  await shot(`${label}-5-reopened`);

  await page.reload({ waitUntil: "domcontentloaded" });
  body = page.locator(BODY).first();
  await body.waitFor({ state: "visible", timeout: 120000 });
  await page.waitForTimeout(2500);
  const reloaded = (await body.innerText()).trim();
  log("reload", JSON.stringify({
    hasFirst: reloaded.includes(first.trim()),
    hasSecond: reloaded.includes(second.trim()),
  }));
  await shot(`${label}-6-reloaded`);

  if (mode === "offline") {
    await context.setOffline(true);
    await typeAtEnd(page, body, ` W08-${stamp}-离线`);
    const offline = await waitForSaveCycle(page, log, "offline", { timeout: 60000 });
    log("offline", JSON.stringify(offline));
    await shot(`${label}-7-offline`);
    await context.setOffline(false);
    await page.waitForTimeout(1500);
    const launcher = page.locator("[data-workspace-save-launcher]").first();
    if ((await saveStateNow(page)) === "error") {
      await launcher.click();
      const retry = page.locator("[data-workspace-save-action-id='retry']").first();
      await retry.waitFor({ timeout: 5000 }).catch(() => log("warn", "no retry item"));
      if (await retry.isVisible().catch(() => false)) await retry.click();
    }
    const retried = await waitForSaveCycle(page, log, "retry", { timeout: 90000 });
    log("retry", JSON.stringify(retried));
    await shot(`${label}-8-after-retry`);
  }
  log("marker", JSON.stringify({ first, second, stamp }));
}
