// W09 save protocol, R2 (00-dispatch §5) — real close via the top-bar ×, idle wait for
// the version tier, every save-state title logged, offline + retry through the save menu.
// Usage: mint.sh | OUT_DIR=/tmp/w09-p THEME=light node harness/run.mjs \
//          evidence/W09/scenarios/w09-protocol.mjs <artifactRootId> [label] [idleSeconds] [needle]
// Edit 1 = flip-x, edit 2 = flip-y on the base image. Canvas samples:
//   none: A red, B cyan, C cyan · flip-x: A cyan, B red, C red · both: A cyan, B red, C dark
const POINTS = { A: [0.08, 0.5], B: [0.92, 0.5], C: [0.984, 0.96] };
const PROD_HOST = /^(?:www\.|api\.)?oceanleo\.com$|(?:^|\.)oceanleo\.cn$/i;

function classify([r, g, b]) {
  if (r > 190 && g < 70 && b < 70) return "red";
  if (r < 70 && g > 190 && b > 190) return "cyan";
  if (r + g + b < 170) return "dark";
  return `other(${r},${g},${b})`;
}

export default async function ({ page, context, log, shot, helpers, args }) {
  const [rootId, label = "p", idle = "25", needle = "[W09] sample"] = args;
  if (!rootId) throw new Error("pass the artifact root id");
  await context.route(
    (url) => PROD_HOST.test(url.hostname),
    (route) => {
      log("BLOCKED-PROD", route.request().method(), route.request().url().slice(0, 160));
      return route.abort();
    },
  );
  const t0 = Date.now();
  const stamp = () => ((Date.now() - t0) / 1000).toFixed(1);
  const short = (url) => url.replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "").slice(0, 140);
  page.on("response", (response) => {
    const request = response.request();
    const url = response.url();
    if (/agent_tasks|notifications|presence|heartbeat|_next\//.test(url)) return;
    if (response.status() >= 400) log("http-error", stamp(), request.method(), short(url), response.status());
    else if (request.method() !== "GET" && /\/v1\/|\/rest\/v1\//.test(url)) log("net", stamp(), request.method(), short(url), response.status());
  });

  const launcher = () => page.locator("[data-workspace-save-launcher]").first();
  const stateLine = async (tag) => {
    const state = await helpers.saveState(page);
    const title = await launcher().getAttribute("title", { timeout: 2000 }).catch(() => null);
    log("state", tag, stamp(), String(state), JSON.stringify(title));
    return state;
  };
  let lastState = null;
  let watching = true;
  const watch = (async () => {
    while (watching) {
      const state = await helpers.saveState(page).catch(() => null);
      if (state !== lastState) {
        const title = state === "error" ? await launcher().getAttribute("title").catch(() => null) : "";
        log("save-state", stamp(), String(lastState), "->", String(state), title ? JSON.stringify(title) : "");
        lastState = state;
      }
      await page.waitForTimeout(200).catch(() => {});
    }
  })();

  const settle = async () => {
    for (let i = 0; i < 48; i += 1) {
      await page.waitForTimeout(2500);
      const state = await page.evaluate(() => ({
        account: document.querySelector("[data-account-trigger]")?.textContent?.trim() || "",
        loading: /Loading My Library|正在加载/.test(document.body.innerText),
        failed: Boolean(document.querySelector("[data-library-retry]")),
        editor: Boolean(document.querySelector("[data-editor-loading]")),
      }));
      if (state.editor) return true;
      if (state.failed) {
        await page.locator("[data-library-retry]").first().click().catch(() => {});
        continue;
      }
      if (!/Log in|登录/.test(state.account) && !state.loading) return true;
    }
    return false;
  };
  const pressEdit = async () => {
    const edit = page
      .locator('button[aria-label^="编辑"], button[aria-label^="Edit"], button[title="编辑"], button[title="Edit"], [data-artifact-action="edit"]')
      .or(page.locator("button, a").filter({ hasText: /^(编辑|Edit)$/ }))
      .first();
    if (await edit.count()) {
      await edit.click().catch(() => {});
      log("clicked Edit");
    }
  };
  const waitEditor = async () => {
    await page.waitForFunction(
      () => document.querySelector("[data-editor-loading]")?.getAttribute("data-editor-loading") === "false",
      null,
      { timeout: 150000 },
    );
    await page.waitForTimeout(3000);
  };
  const openEditor = async (tag) => {
    await helpers.gotoApp(page, `/library?item=${rootId}`);
    log("settled", tag, await settle());
    if (!(await page.locator("[data-editor-loading]").count())) {
      const preview = page.locator(`button[aria-label^="预览「${needle}"], button[aria-label^="Preview"][aria-label*="${needle}"]`).first();
      if (await preview.count()) {
        await preview.click().catch(() => {});
        await page.waitForTimeout(5000);
      }
      await pressEdit();
    }
    await waitEditor();
    log("url", tag, short(page.url()), new URL(page.url()).search.slice(0, 120));
    await shot(`${label}-${tag}-open`);
  };
  const selectBase = async () => {
    const canvas = page.locator("[data-editor-loading] canvas.upper-canvas, [data-editor-loading] canvas").first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("no canvas box");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(800);
  };
  const sample = async (tag) => {
    await selectBase();
    const result = await page.evaluate((points) => {
      const root = document.querySelector("[data-editor-loading]");
      const parse = (name) => {
        const raw = root?.getAttribute(name);
        return raw ? JSON.parse(raw) : null;
      };
      const [ml, mr, mt, mb] = ["ml", "mr", "mt", "mb"].map((k) => parse(`data-editor-control-${k}`));
      const canvas = root?.querySelector("canvas.lower-canvas") || root?.querySelector("canvas");
      if (!ml || !mr || !mt || !mb || !canvas) return { error: "no geometry or canvas" };
      const rect = canvas.getBoundingClientRect();
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const out = {};
      for (const [name, [fx, fy]] of Object.entries(points)) {
        const x = Math.round((ml.x + (mr.x - ml.x) * fx - rect.left) * (canvas.width / rect.width));
        const y = Math.round((mt.y + (mb.y - mt.y) * fy - rect.top) * (canvas.height / rect.height));
        const d = ctx.getImageData(x, y, 1, 1).data;
        out[name] = [d[0], d[1], d[2]];
      }
      return { out };
    }, POINTS);
    const verdict = result.error ? result.error : JSON.stringify(Object.fromEntries(Object.entries(result.out).map(([k, v]) => [k, classify(v)])));
    log("sample", tag, verdict);
    await page.keyboard.press("Escape").catch(() => {});
    return verdict;
  };
  const clickControl = async (id) => {
    const target = page.locator(`[data-selection-control-id="${id}"] button`).first();
    if (await target.count()) {
      await target.click();
      return true;
    }
    log("control-missing", id);
    return false;
  };
  // Like helpers.waitSaved, but a transient error is logged (it is a finding) and waited out.
  const waitSettled = async (tag, timeout = 120000) => {
    const started = Date.now();
    let sawError = false;
    while (Date.now() - started < timeout) {
      const state = await helpers.saveState(page);
      if (state === "saved") {
        log("settled", tag, stamp(), sawError ? "after-error" : "clean");
        return;
      }
      if (state === "error" && !sawError) {
        sawError = true;
        log("transient-error", tag, stamp(), JSON.stringify(await launcher().getAttribute("title").catch(() => null)));
      }
      await page.waitForTimeout(500);
    }
    throw new Error(`${tag}: not saved within ${timeout} ms`);
  };
  const retryFromMenu = async () => {
    await launcher().click().catch(() => {});
    await page.waitForTimeout(500);
    const item = page.locator('[data-workspace-save-action-id="retry"]').first();
    if (await item.count()) {
      await item.click();
      log("retry-clicked", stamp());
      return true;
    }
    log("retry-missing");
    return false;
  };

  // 1. own item: two edits, each to "saved"
  await openEditor("first");
  await stateLine("opened");
  await sample("before");
  for (const [n, id] of [[1, "flip-x"], [2, "flip-y"]]) {
    await selectBase();
    if (!(await clickControl(id))) throw new Error(`${id} control not found`);
    log(`edit${n}`, stamp(), id);
    await page.waitForTimeout(500);
    await waitSettled(`save${n}`);
  }
  await shot(`${label}-after-two-saves`);
  // 2. version tier: let the idle timer run, then close through the top bar ×
  log("idle-wait", idle);
  await page.waitForTimeout(Number(idle) * 1000);
  await stateLine("after-idle");
  const close = page.locator('[data-global-row-slot="close"]').first();
  if (await close.count()) {
    await close.click();
    log("closed via ×", stamp());
  } else log("close-missing");
  await page.waitForTimeout(6000);
  log("url", "after-close", short(page.url()));
  await shot(`${label}-after-close`);
  // 3. reopen, then full reload
  await openEditor("reopen");
  await stateLine("reopen");
  await sample("reopen");
  await page.reload({ waitUntil: "domcontentloaded" });
  log("settled", "reload", await settle());
  if (!(await page.locator("[data-editor-loading]").count())) await pressEdit();
  await waitEditor();
  const afterReload = await stateLine("reload");
  await sample("reload");
  await shot(`${label}-reload`);
  // 4. offline → error (never saved) → online → retry → saved
  if (afterReload !== "error") {
    await selectBase();
    await context.setOffline(true);
    log("offline", stamp());
    await clickControl("flip-x");
    log("edit3", stamp(), "flip-x (offline)");
    const started = Date.now();
    let state = null;
    while (Date.now() - started < 120000) {
      state = await helpers.saveState(page);
      if (state === "error" || state === "saved") break;
      await page.waitForTimeout(500);
    }
    await stateLine("offline");
    await shot(`${label}-offline`);
    await context.setOffline(false);
    log("online", stamp());
    await page.waitForTimeout(1500);
    if ((await helpers.saveState(page)) === "error") await retryFromMenu();
    await helpers.waitSaved(page, { timeout: 90000 }).then(
      () => log("saved3", stamp()),
      (error) => log("saved3-failed", String(error)),
    );
    await stateLine("after-retry");
    await shot(`${label}-after-retry`);
  } else log("offline-skipped: editor already in error after reload");
  watching = false;
  await watch;
}
