// Shared helpers for W06 PDF scenarios.
export async function openPdf(page, helpers, log, id) {
  await helpers.gotoApp(page, `/library?item=${id}`);
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const loading = await page.getByText(/Loading My Library|正在加载我的库|加载中/).first().isVisible().catch(() => false);
    if (!loading) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(6000);
  for (;;) {
    if (await page.locator("[data-pdf-stage]").count()) break;
    const edit = page.locator("[data-artifact-action=edit]").first();
    if (await edit.count().catch(() => 0)) {
      await edit.click().catch(() => {});
    }
    if (Date.now() - t0 > 120000) throw new Error("PDF editor never mounted");
    await page.waitForTimeout(1500);
  }
  await page.waitForFunction(() => {
    const p = [...document.querySelectorAll("[data-pdf-stage] [role=status]")];
    return p.length === 0;
  }, null, { timeout: 90000 });
  // The viewer is ready when the bar's tools are enabled. On a busy dev slot PDFium can take
  // longer than the 15 s hint; the stage then offers "Reload" — press it once after 45 s.
  const readySince = Date.now();
  let reloaded = false;
  for (;;) {
    const enabled = await page.locator('[data-workspace-action-id="pdf-tool-highlight"]:not([disabled])').count().catch(() => 0);
    if (enabled) break;
    if (!reloaded && Date.now() - readySince > 45000 && (await page.locator("[data-pdf-init-slow] button").count())) {
      log("viewer slow: pressing Reload");
      await page.locator("[data-pdf-init-slow] button").click();
      reloaded = true;
    }
    if (Date.now() - readySince > 150000) throw new Error("PDF viewer never became ready");
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(1500);
  if (!(await page.locator("[data-pdf-stage]").count())) throw new Error("PDF stage unmounted after ready");
  log("pdf editor ready after", Math.round((Date.now() - t0) / 1000), "s", page.url());
}

/** What the viewer's own chrome shows right now (inside the open shadow root). */
export async function viewerChrome(page) {
  return page.evaluate(() => {
    const host = document.querySelector("[data-pdf-stage] embedpdf-container") ||
      [...document.querySelectorAll("[data-pdf-stage] *")].find((el) => el.shadowRoot);
    const root = host?.shadowRoot;
    if (!root) return { host: false };
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden";
    };
    const items = [...root.querySelectorAll("[data-epdf-i]")].filter(visible).map((el) => el.getAttribute("data-epdf-i"));
    return { host: true, items: [...new Set(items)].slice(0, 60), sidebars: [...root.querySelectorAll("[data-sidebar-id]")].map((el) => el.getAttribute("data-sidebar-id")) };
  });
}

export async function editBar(page) {
  return page.evaluate(() => {
    const bar = document.querySelector("[data-workspace-edit-bar]");
    if (!bar) return null;
    return [...bar.querySelectorAll("button, label")].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !el.closest("[data-edit-bar-document-measure]");
    }).map((el) => (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30));
  });
}

/** Screen box of a PDF page inside the viewer shadow root (largest white page div). */
export async function pageBox(page, pageIndex = 0) {
  return page.evaluate((index) => {
    const host = [...document.querySelectorAll("[data-pdf-stage] *")].find((el) => el.shadowRoot);
    const root = host?.shadowRoot;
    if (!root) return null;
    const pages = [...root.querySelectorAll("div")].filter((el) => {
      const bg = el.style?.backgroundColor;
      return bg === "rgb(255, 255, 255)" || bg === "#fff";
    }).map((el) => el.getBoundingClientRect()).filter((r) => r.width > 100)
      .sort((a, b) => a.top - b.top);
    const r = pages[index];
    return r ? { x: r.left, y: r.top, w: r.width, h: r.height, scale: r.width / 595.2756 } : null;
  }, pageIndex);
}

export async function tool(page, id) {
  for (let i = 0; i < 3; i += 1) {
    if (await page.locator(`[data-workspace-edit-bar] [data-edit-bar-document-slot] [data-workspace-action-id="${id}"]`).count()) break;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
  await page.locator(`[data-workspace-edit-bar] [data-workspace-action-id="${id}"]`).first().click();
  await page.waitForTimeout(400);
}

export async function saveTrace(page, helpers, log, label, timeout = 90000) {
  const seen = [];
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const state = await helpers.saveState(page);
    if (seen[seen.length - 1] !== state) seen.push(state);
    if (state === "saved" && seen.length > 1) break;
    if (state === "error") break;
    await page.waitForTimeout(400);
  }
  log("save", label, seen.join(" → "), Math.round((Date.now() - t0) / 1000) + "s");
  return seen[seen.length - 1];
}

/** Scroll the viewer back to page 1 through the page rail (the viewer may open mid-document). */
export async function firstPage(page) {
  const thumb = page.locator('[data-pdf-page-thumb="1"] button').first();
  if (await thumb.count()) {
    await thumb.click();
    await page.waitForTimeout(1500);
  }
}
