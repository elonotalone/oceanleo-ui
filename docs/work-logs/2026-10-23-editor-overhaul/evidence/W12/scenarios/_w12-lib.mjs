// W12 shared helpers (audio editor). LeoDev slot + acceptance account only (_COMMON.md §2).
const PROD_HOST = /^(?:www\.|api\.)?oceanleo\.com$|(?:^|\.)oceanleo\.cn$/i;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Red line 1: abort any request that would reach production or the CN front end. */
export async function guardProduction(context, log) {
  await context.route(
    (url) => PROD_HOST.test(url.hostname),
    (route) => {
      log("BLOCKED-PROD", route.request().method(), route.request().url().slice(0, 160));
      return route.abort();
    },
  );
}

/** Every non-GET save-chain call with status, so the log proves uploads vs revisions. */
export function saveLedger(page, log) {
  const calls = [];
  const interesting =
    /\/v1\/(database\/(upload|private-upload)|media\/upload\/(init|finalize)|artifacts\/[^/?]+(\/revisions|:fork|\/staging)|creations)/;
  page.on("response", async (response) => {
    const url = response.url();
    const method = response.request().method();
    if (!interesting.test(url) || method === "GET") return;
    let detail = "";
    try {
      const body = await response.json();
      detail = JSON.stringify({
        revisionId: body?.revisionId || body?.revision_id || body?.file?.revision_id || undefined,
        artifactId: body?.artifactId || body?.artifact_id || body?.file?.artifact_id || undefined,
        code: body?.detail?.code || body?.code || undefined,
      });
    } catch {}
    const entry = { at: Date.now(), method, path: new URL(url).pathname, status: response.status(), detail };
    calls.push(entry);
    log("SAVE-CALL", method, entry.path, entry.status, detail);
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!interesting.test(url) || request.method() === "GET") return;
    const entry = { at: Date.now(), method: request.method(), path: new URL(url).pathname, status: 0, detail: request.failure()?.errorText || "" };
    calls.push(entry);
    log("SAVE-CALL-FAILED", entry.method, entry.path, entry.detail);
  });
  return calls;
}

/** Open a library card whose accessible label contains `needle`; press Edit when asked. */
export async function openFromLibrary(page, helpers, needle, log, { route = "/library" } = {}) {
  await helpers.gotoApp(page, route);
  const card = page.locator(`button[aria-label*="${needle}"]`).first();
  await card.waitFor({ timeout: 120000 });
  await card.click();
  await sleep(2500);
  const edit = page.getByRole("button", { name: /^(编辑|Edit|打开编辑器|Open editor)$/ }).first();
  if (await edit.isVisible().catch(() => false)) {
    await edit.click();
    log("clicked Edit for", needle);
  }
  await waitAudioReady(page, log);
  log("editor open", page.url());
}

/** Waveform mounted and the loading veil gone. */
export async function waitAudioReady(page, log, { timeout = 120000 } = {}) {
  await page.locator("[data-audio-waveform]").first().waitFor({ state: "visible", timeout });
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const state = await page.evaluate(() => {
      const wave = document.querySelector("[data-audio-waveform]");
      return {
        busy: Boolean(wave?.querySelector("[data-audio-loading]")) ||
          /正在处理音频|Processing audio/.test(wave?.textContent || ""),
        ready: wave?.getAttribute("data-audio-ready") ?? null,
      };
    });
    if (!state.busy && state.ready !== "false") break;
    await sleep(400);
  }
  await sleep(800);
}

/** Drag across the waveform from fraction a to fraction b of its width. */
export async function dragSelect(page, a, b) {
  const box = await page.locator("[data-audio-waveform] [data-audio-wave-host], [data-audio-waveform]").first().boundingBox();
  if (!box) throw new Error("no waveform box");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * a, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * ((a + b) / 2), y, { steps: 6 });
  await page.mouse.move(box.x + box.width * b, y, { steps: 6 });
  await page.mouse.up();
  await sleep(600);
}

/** Edit-bar + stage facts for the log. */
export async function audioReport(page) {
  return page.evaluate(() => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none";
    };
    const bar = document.querySelector("[data-selection-kind]");
    const controls = bar
      ? [...bar.querySelectorAll("[data-selection-control-id]")].filter(vis).map((el) => {
          const button = el.querySelector("button, input, [role=button]");
          const svg = el.querySelector("svg");
          return {
            id: el.getAttribute("data-selection-control-id"),
            label: (button?.getAttribute("aria-label") || button?.getAttribute("title") || el.textContent || "").trim().slice(0, 40),
            icon: svg ? svg.innerHTML.replace(/\s+/g, " ").slice(0, 120) : "",
          };
        })
      : [];
    return {
      url: location.href,
      saveState: document.querySelector("[data-workspace-save-launcher]")?.getAttribute("data-save-state") || null,
      selectionKind: bar?.getAttribute("data-selection-kind") || null,
      visible: bar?.getAttribute("data-selection-visible-controls") || "",
      overflow: bar?.getAttribute("data-selection-overflow-controls") || "",
      controls,
      theme: document.querySelector("[data-plugin-theme]")?.getAttribute("data-plugin-theme") || null,
      html: document.documentElement.className,
      stageText: (document.querySelector("[data-audio-waveform]")?.parentElement?.textContent || "").trim().slice(0, 160),
    };
  });
}

/** Click one edit-bar control by its control id (compact bar or the More menu). */
export async function clickControl(page, id) {
  const direct = page.locator(`[data-selection-control-id="${id}"] button`).first();
  if (await direct.isVisible().catch(() => false)) {
    await direct.click();
    return "bar";
  }
  const more = page.locator("[data-selection-kind] button[aria-haspopup=dialog]").first();
  if (await more.isVisible().catch(() => false)) {
    await more.click();
    await sleep(300);
    const inMenu = page.locator(`[data-selection-overflow-control][data-selection-control-id="${id}"] button`).first();
    if (await inMenu.isVisible().catch(() => false)) {
      await inMenu.click();
      return "more";
    }
    await page.keyboard.press("Escape");
  }
  throw new Error(`control ${id} not reachable`);
}

export async function saveLauncher(page) {
  return page.evaluate(() => {
    const el = document.querySelector("[data-workspace-save-launcher]");
    if (!el) return null;
    return {
      state: el.getAttribute("data-save-state"),
      title: el.getAttribute("title") || el.getAttribute("aria-label") || "",
    };
  });
}

/** Poll the save state until saved / error; record every distinct state. */
export async function waitForSettled(page, log, { timeout = 90000, label = "" } = {}) {
  const started = Date.now();
  let last = "";
  const seen = [];
  while (Date.now() - started < timeout) {
    const info = await saveLauncher(page).catch(() => null);
    const state = info?.state || "none";
    if (state !== last) {
      seen.push({ t: Date.now() - started, state });
      log("SAVE-STATE", label, state, info?.title || "");
      last = state;
    }
    if (state === "saved" && Date.now() - started > 1500) return { state, seen };
    if (state === "error") return { state, seen };
    await sleep(400);
  }
  return { state: last, seen, timedOut: true };
}
