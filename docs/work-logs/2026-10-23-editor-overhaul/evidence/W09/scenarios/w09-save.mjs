// W09 save protocol (00-dispatch §5) for the image editor.
// Usage: mint.sh | OUT_DIR=/tmp/w09-save THEME=light node harness/run.mjs \
//          evidence/W09/scenarios/w09-save.mjs <artifactRootId> [label] [skipOffline]
// Edit 1 = flip-x on the selected base image, edit 2 = flip-y. Both are checked by
// sampling the Fabric lower canvas after close/reopen and after a full reload:
//   none: A red, B cyan, C cyan · flip-x: A cyan, B red, C red · both: A cyan, B red, C dark
const POINTS = { A: [0.08, 0.5], B: [0.92, 0.5], C: [0.984, 0.96] };

function classify([r, g, b]) {
  if (r > 190 && g < 70 && b < 70) return "red";
  if (r < 70 && g > 190 && b > 190) return "cyan";
  if (r + g + b < 170) return "dark";
  return `other(${r},${g},${b})`;
}

const PROD_HOST = /^(?:www\.|api\.)?oceanleo\.com$|(?:^|\.)oceanleo\.cn$/i;

export default async function ({ page, context, log, shot, helpers, args }) {
  const [rootId, label = "run", skipOffline, needle = "[W09] sample"] = args;
  if (!rootId) throw new Error("pass the artifact root id");
  // Red line 1: nothing may reach production or the CN front end.
  await context.route(
    (url) => PROD_HOST.test(url.hostname),
    (route) => {
      log("BLOCKED-PROD", route.request().method(), route.request().url().slice(0, 160));
      return route.abort();
    },
  );
  const t0 = Date.now();
  const stamp = () => ((Date.now() - t0) / 1000).toFixed(1);
  page.on("response", (response) => {
    const request = response.request();
    const url = response.url();
    if (request.method() === "GET") return;
    if (!/\/v1\/(artifacts|database\/upload|creations|editor-drafts|drafts)/.test(url)) return;
    log("net", stamp(), request.method(), url.replace(/^https?:\/\/[^/]+/, "").slice(0, 140), response.status());
  });
  page.on("requestfailed", (request) => {
    if (request.method() === "GET") return;
    log("net-failed", stamp(), request.method(), request.url().replace(/^https?:\/\/[^/]+/, "").slice(0, 140));
  });

  let lastState = null;
  let watching = true;
  const watch = (async () => {
    while (watching) {
      const state = await helpers.saveState(page).catch(() => null);
      if (state !== lastState) {
        log("save-state", stamp(), String(lastState), "->", String(state));
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
        log("library load failed banner; retry");
        await page.locator("[data-library-retry]").first().click().catch(() => {});
        continue;
      }
      if (!/Log in|登录/.test(state.account) && !state.loading) return true;
    }
    return false;
  };

  const openEditor = async (tag) => {
    await helpers.gotoApp(page, `/library?item=${rootId}`);
    log("settled", tag, await settle());
    const hasEditor = () => page.locator("[data-editor-loading]").count();
    if (!(await hasEditor())) {
      // The item link lands on the library detail: open the card preview, then press Edit.
      const preview = page.locator(`button[aria-label^="预览「${needle}"], button[aria-label^="Preview"][aria-label*="${needle}"]`).first();
      if (await preview.count()) {
        await preview.click().catch(() => {});
        await page.waitForTimeout(5000);
      }
      const edit = page.locator("button, a").filter({ hasText: /^(编辑|Edit)$/ }).first();
      if (await edit.count()) {
        await edit.click().catch(() => {});
        log("clicked Edit");
      }
    }
    await page.waitForFunction(
      () => document.querySelector("[data-editor-loading]")?.getAttribute("data-editor-loading") === "false",
      null,
      { timeout: 150000 },
    );
    await page.waitForTimeout(2000);
    await shot(`${label}-${tag}-open`);
  };

  const selectBase = async () => {
    const canvas = page.locator("[data-editor-loading] canvas.upper-canvas, [data-editor-loading] canvas").first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("no canvas box");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(800);
    const kind = await page.locator("[data-editor-loading]").first().getAttribute("data-editor-selected-kind");
    log("selected-kind", kind);
    return kind;
  };

  const sample = async (tag) => {
    await selectBase();
    const result = await page.evaluate((points) => {
      const root = document.querySelector("[data-editor-loading]");
      const parse = (name) => {
        const raw = root?.getAttribute(name);
        return raw ? JSON.parse(raw) : null;
      };
      const ml = parse("data-editor-control-ml");
      const mr = parse("data-editor-control-mr");
      const mt = parse("data-editor-control-mt");
      const mb = parse("data-editor-control-mb");
      const canvas = root?.querySelector("canvas.lower-canvas") || root?.querySelector("canvas");
      if (!ml || !mr || !mt || !mb || !canvas) return { error: "no geometry or canvas" };
      const rect = canvas.getBoundingClientRect();
      const ratioX = canvas.width / rect.width;
      const ratioY = canvas.height / rect.height;
      const context2d = canvas.getContext("2d", { willReadFrequently: true });
      const out = {};
      for (const [name, [fx, fy]] of Object.entries(points)) {
        const clientX = ml.x + (mr.x - ml.x) * fx;
        const clientY = mt.y + (mb.y - mt.y) * fy;
        const x = Math.round((clientX - rect.left) * ratioX);
        const y = Math.round((clientY - rect.top) * ratioY);
        const data = context2d.getImageData(x, y, 1, 1).data;
        out[name] = [data[0], data[1], data[2]];
      }
      return { out, box: { left: ml.x, right: mr.x, top: mt.y, bottom: mb.y } };
    }, POINTS);
    if (result.error) {
      log("sample", tag, result.error);
      return null;
    }
    const verdict = Object.fromEntries(
      Object.entries(result.out).map(([name, rgb]) => [name, classify(rgb)]),
    );
    log("sample", tag, JSON.stringify(verdict), JSON.stringify(result.out));
    await page.keyboard.press("Escape").catch(() => {});
    return verdict;
  };

  const clickControl = async (id) => {
    const target = page.locator(`[data-selection-control-id="${id}"] button`).first();
    if (await target.count()) {
      await target.click();
      return true;
    }
    // Control may live in the overflow ("更多") popover.
    const more = page.locator("[data-selection-toolbar-adaptive-region] button[aria-haspopup='dialog']").first();
    if (await more.count()) {
      await more.click();
      await page.waitForTimeout(400);
      const inMenu = page.locator(`[data-selection-overflow-control][data-selection-control-id="${id}"] button`).first();
      if (await inMenu.count()) {
        await inMenu.click();
        return true;
      }
    }
    log("control-missing", id);
    return false;
  };

  const barInfo = async (tag) => {
    const info = await page.evaluate(() => {
      const bar = document.querySelector("[data-selection-visible-controls]");
      return {
        kind: bar?.getAttribute("data-selection-kind") || null,
        visible: bar?.getAttribute("data-selection-visible-controls") || "",
        overflow: bar?.getAttribute("data-selection-overflow-controls") || "",
      };
    });
    log("bar", tag, JSON.stringify(info));
    return info;
  };

  // 1. open own item, edit 1, saved, edit 2, saved
  await openEditor("first");
  await sample("before");
  await selectBase();
  await barInfo("base-selected");
  await shot(`${label}-bar-base`);
  if (!(await clickControl("flip-x"))) throw new Error("flip-x control not found");
  log("edit1", stamp(), "flip-x");
  await page.waitForTimeout(500);
  await helpers.waitSaved(page, { timeout: 90000 });
  log("saved1", stamp());
  await selectBase();
  if (!(await clickControl("flip-y"))) throw new Error("flip-y control not found");
  log("edit2", stamp(), "flip-y");
  await page.waitForTimeout(500);
  await helpers.waitSaved(page, { timeout: 90000 });
  log("saved2", stamp());
  await shot(`${label}-after-two-saves`);

  // 2. close (leave the editor) and reopen
  await helpers.gotoApp(page, "/library");
  await page.waitForTimeout(3000);
  await shot(`${label}-library-after`);
  await openEditor("reopen");
  await sample("reopen");

  // 3. full reload
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelector("[data-editor-loading]")?.getAttribute("data-editor-loading") === "false",
    null,
    { timeout: 150000 },
  );
  await page.waitForTimeout(2000);
  await sample("reload");
  await shot(`${label}-reload`);

  // 4. offline: change, must show error (never "saved"), retry after reconnect
  if (!skipOffline) {
    await selectBase();
    await context.setOffline(true);
    log("offline", stamp());
    await clickControl("flip-x");
    log("edit3", stamp(), "flip-x (offline)");
    const started = Date.now();
    let state = null;
    while (Date.now() - started < 90000) {
      state = await helpers.saveState(page);
      if (state === "error" || state === "saved") break;
      await page.waitForTimeout(500);
    }
    log("offline-state", stamp(), String(state));
    await shot(`${label}-offline`);
    await context.setOffline(false);
    log("online", stamp());
    const retry = page.getByRole("button", { name: /重试|Retry|再试/ }).first();
    if (await retry.count()) {
      await retry.click().catch(() => {});
      log("retry-clicked", stamp());
    } else {
      const launcher = page.locator("[data-workspace-save-launcher]").first();
      if (await launcher.count()) {
        await launcher.click().catch(() => {});
        await page.waitForTimeout(500);
        const inMenu = page.getByRole("menuitem", { name: /重试|Retry|保存/ }).first();
        if (await inMenu.count()) {
          await inMenu.click().catch(() => {});
          log("retry-menu-clicked", stamp());
        } else {
          log("retry-missing");
        }
      }
    }
    await helpers.waitSaved(page, { timeout: 90000 }).then(
      () => log("saved3", stamp()),
      (error) => log("saved3-failed", String(error)),
    );
    await shot(`${label}-after-retry`);
  }
  watching = false;
  await watch;
}
