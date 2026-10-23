// W13 scenario helpers (3D editor). Data only: no tokens, no signed query strings in logs.

/** Log save-relevant API traffic (method, path without query, status). */
export function watchSaveTraffic(page, log) {
  const interesting = /\/v1\/(artifacts|creations|database\/upload|storage|uploads?)/;
  const calls = [];
  page.on("response", (response) => {
    const request = response.request();
    const url = new URL(request.url());
    if (!interesting.test(url.pathname)) return;
    if (request.method() === "GET" && !/revisions|creations/.test(url.pathname)) return;
    const entry = `${request.method()} ${url.pathname} → ${response.status()}`;
    calls.push(entry);
    log("api", entry);
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (!interesting.test(url.pathname)) return;
    const entry = `${request.method()} ${url.pathname} → FAILED ${request.failure()?.errorText || ""}`;
    calls.push(entry);
    log("api", entry);
  });
  return calls;
}

/** Open a library item in the editor and wait until the 3D model is on stage. */
export async function openModel(page, helpers, artifactId, log, { timeout = 240000 } = {}) {
  await helpers.gotoApp(page, `/library?item=${artifactId}`);
  await enterEditor(page, log, timeout);
  await waitModelReady(page, log, timeout);
}

/** `/library?item=` lands on the viewer; the header pencil enters the editor. */
export async function enterEditor(page, log, timeout = 240000) {
  const canvas = page.locator("[data-testid=model3d-canvas]").first();
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await canvas.isVisible().catch(() => false)) return;
    const edit = page
      .locator("button[aria-label='编辑'], button[aria-label='Edit'], button[title='编辑'], button[title='Edit']")
      .first();
    if (await edit.isVisible().catch(() => false)) {
      await edit.click();
      log("clicked edit");
      await canvas.waitFor({ timeout: 120000 }).catch(() => {});
      continue;
    }
    await page.waitForTimeout(1500);
  }
  throw new Error("editor canvas never appeared");
}

export async function waitModelReady(page, log, timeout = 240000) {
  await page.locator("[data-testid=model3d-canvas]").first().waitFor({ timeout });
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const state = await page.evaluate(() => {
      const status = document.querySelector("#model3d-stage-status")?.textContent || "";
      const loading = Boolean(document.querySelector("[data-testid=model3d-stage-backdrop] [role=status]"));
      const error = document.querySelector("[data-testid=model3d-load-error]")?.textContent || "";
      return { status, loading, error };
    });
    if (state.error) throw new Error(`3D load error: ${state.error}`);
    if (!state.loading && state.status && !/加载|Loading/i.test(state.status)) {
      log("model ready", JSON.stringify(state));
      return state;
    }
    await page.waitForTimeout(1000);
  }
  throw new Error("3D model never finished loading");
}

/** What the unified edit bar shows right now. */
export async function editBarInfo(page) {
  return page.evaluate(() => {
    const bar = document.querySelector("[data-selection-kind]");
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const controls = bar
      ? [...bar.querySelectorAll("[data-selection-control-id]")].filter(visible).map((el) => {
          const button = el.querySelector("button, input, select, [role=button]");
          return {
            id: el.getAttribute("data-selection-control-id"),
            label: (button?.getAttribute("aria-label") || button?.textContent || "").trim().slice(0, 40),
            icon: el.querySelector("svg[data-icon], [data-icon]")?.getAttribute("data-icon") || "",
          };
        })
      : [];
    return {
      url: location.pathname + location.search,
      kind: bar?.getAttribute("data-selection-kind") || null,
      selectionId: bar?.getAttribute("data-selection-id") || null,
      visible: bar?.getAttribute("data-selection-visible-controls") || "",
      overflow: bar?.getAttribute("data-selection-overflow-controls") || "",
      controls,
      saveState: document.querySelector("[data-workspace-save-launcher]")?.getAttribute("data-save-state") || null,
      pluginTheme: document.querySelector("[data-plugin-theme]")?.getAttribute("data-plugin-theme") || null,
    };
  });
}

/** Click the middle of the 3D canvas (the fixture cube sits there after framing). */
export async function clickStageCenter(page) {
  const canvas = page.locator("[data-testid=model3d-canvas]").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("no canvas box");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(800);
}

/** Computed colours of the main editor surfaces, for the light/dark check. */
export async function surfaceColors(page) {
  return page.evaluate(() => {
    const pick = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const style = getComputedStyle(el);
      return { bg: style.backgroundColor, fg: style.color };
    };
    return {
      pluginRoot: pick("[data-plugin-theme]"),
      stageBackdrop: pick("[data-testid=model3d-stage-backdrop]"),
      stageFooter: pick("#model3d-stage-status")
        ? (() => {
            const footer = document.querySelector("#model3d-stage-status")?.parentElement;
            const style = footer ? getComputedStyle(footer) : null;
            return style ? { bg: style.backgroundColor, fg: style.color } : null;
          })()
        : null,
      editBar: pick("[data-selection-kind]"),
    };
  });
}
