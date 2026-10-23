// V03 shared helpers: open an editor, read the edit bar, click controls, diff the stage.
// Read-only towards product code; everything here only observes or clicks like a user.

/** Wait until the acceptance session is signed in and My library is not loading. */
export async function settle(page, log, { rounds = 48 } = {}) {
  for (let i = 0; i < rounds; i += 1) {
    await page.waitForTimeout(2500);
    const state = await page.evaluate(() => ({
      account: document.querySelector("[data-account-trigger]")?.textContent?.trim() || "",
      loading: /Loading My Library|正在加载我的库/.test(document.body.innerText),
      failed: Boolean(document.querySelector("[data-library-retry]")),
      editAction: Boolean(document.querySelector("[data-artifact-action=edit]")),
    }));
    if (state.failed) {
      log("library load failed banner; clicking retry");
      await page.locator("[data-library-retry]").first().click().catch(() => {});
      continue;
    }
    if (state.editAction) return true;
    if (!/Log in|登录/.test(state.account) && !state.loading) return true;
  }
  return false;
}

/** /library?item=<id> → detail → edit pencil → wait for the edit bar. */
export async function openEditor(page, helpers, log, id, { timeout = 150000 } = {}) {
  await helpers.gotoApp(page, `/library?item=${id}`);
  await settle(page, log);
  const edit = page.locator("[data-artifact-action=edit]").first();
  const started = Date.now();
  while (!(await edit.isVisible().catch(() => false))) {
    if (Date.now() - started > 90000) throw new Error("edit action never appeared");
    const preview = page.locator("button[aria-label^='预览「'], button[aria-label^='Preview']").first();
    if (await preview.isVisible().catch(() => false)) await preview.click().catch(() => {});
    await page.waitForTimeout(2000);
  }
  await edit.click();
  const barStart = Date.now();
  while (Date.now() - barStart < timeout) {
    const ready = await page.evaluate(() =>
      Boolean(
        document.querySelector("[data-workspace-edit-bar]") ||
          document.querySelector("[data-edit-bar-collapsed-pill]"),
      ),
    );
    if (ready) break;
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(4000);
  return page.evaluate(() => ({
    url: location.href,
    adapter: document.querySelector("[data-editor-adapter]")?.getAttribute("data-editor-adapter") || "",
    bar: Boolean(document.querySelector("[data-workspace-edit-bar]")),
    collapsed: Boolean(document.querySelector("[data-edit-bar-collapsed-pill]")),
  }));
}

/** Expand a collapsed edit bar (the round pill) so its controls can be read. */
export async function expandBar(page) {
  const pill = page.locator("[data-edit-bar-collapsed-pill]").first();
  if (await pill.isVisible().catch(() => false)) {
    await pill.click().catch(() => {});
    await page.waitForTimeout(800);
  }
}

/**
 * Structured read of the visible edit bar. Icons are fingerprinted by their svg markup;
 * measurement clones (aria-hidden / inert) are skipped.
 */
export async function barReport(page) {
  return page.evaluate(() => {
    const hash = (text) => {
      let h = 2166136261;
      for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return (h >>> 0).toString(16);
    };
    const visible = (el) => {
      if (!el) return false;
      if (el.closest("[aria-hidden='true'], [inert], [data-selection-toolbar-measurements], [data-edit-bar-document-measure]")) return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
    };
    const row = document.querySelector("[data-workspace-edit-bar]");
    const toolbar = document.querySelector("[data-workspace-edit-bar-toolbar]");
    const trigger = [...document.querySelectorAll("[data-editor-tools-trigger]")].find(visible) || null;
    const selectionRoot = row?.querySelector("[data-selection-kind]") || null;
    const controls = [];
    if (row) {
      const nodes = [...row.querySelectorAll("button, input, label, select, [role=button]")].filter(visible);
      const seen = new Set();
      for (const el of nodes) {
        // one entry per interactive leaf: skip inputs wrapped by a label we already listed
        const owner = el.closest("label") && el.tagName === "INPUT" ? el.closest("label") : el;
        if (seen.has(owner)) continue;
        seen.add(owner);
        if (owner.tagName === "INPUT" && owner.type === "number") continue; // number field body
        const controlHost = owner.closest("[data-selection-control-id]");
        const section = owner.closest("[data-selection-toolbar-prefix]")
          ? "prefix"
          : owner.closest("[data-edit-bar-selection-slot]")
            ? "selection"
            : owner.closest("[data-edit-bar-document-slot], [data-edit-bar-document-more]")
              ? "document"
              : owner.closest("[data-edit-bar-trailing-slot]")
                ? "trailing"
                : "other";
        const svg = owner.querySelector("svg");
        const svgMarkup = svg ? svg.innerHTML.replace(/\s+/g, " ").trim() : "";
        const r = owner.getBoundingClientRect();
        const disabled =
          owner.disabled === true ||
          owner.getAttribute("aria-disabled") === "true" ||
          Boolean(owner.querySelector("input:disabled")) ||
          Number(getComputedStyle(owner).opacity) < 0.6;
        controls.push({
          section,
          controlId: controlHost?.getAttribute("data-selection-control-id") || "",
          actionId: owner.getAttribute("data-workspace-action-id") || "",
          tag: owner.tagName.toLowerCase(),
          label: (owner.getAttribute("aria-label") || owner.getAttribute("title") || "").slice(0, 60),
          text: (owner.textContent || "").trim().slice(0, 40),
          haspopup: owner.getAttribute("aria-haspopup") || "",
          pressed: owner.getAttribute("aria-pressed"),
          disabled,
          icon: svg ? hash(svgMarkup) : "",
          iconFallback: svg?.getAttribute("data-icon-fallback") === "true",
          dataIcon: owner.getAttribute("data-icon") || svg?.getAttribute("data-icon") || "",
          toolsTrigger: owner.hasAttribute("data-editor-tools-trigger"),
          agent: owner.hasAttribute("data-edit-bar-agent"),
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        });
      }
    }
    const byIcon = new Map();
    for (const c of controls) {
      if (!c.icon) continue;
      const list = byIcon.get(c.icon) || [];
      list.push(c.controlId || c.actionId || c.label);
      byIcon.set(c.icon, list);
    }
    const duplicates = [...byIcon.values()].filter((list) => list.length > 1);
    const rowRect = row?.getBoundingClientRect();
    return {
      present: Boolean(row),
      collapsed: Boolean(document.querySelector("[data-edit-bar-collapsed-pill]")),
      empty: row?.hasAttribute("data-empty") || false,
      emptyHint: row?.querySelector("[data-edit-bar-empty-hint]")?.textContent?.trim() || "",
      mode: toolbar?.getAttribute("data-edit-bar-mode") || "",
      toolsTrigger: trigger
        ? { label: trigger.getAttribute("aria-label") || "", disabled: trigger.getAttribute("aria-disabled") === "true" }
        : null,
      selection: selectionRoot
        ? {
            kind: selectionRoot.getAttribute("data-selection-kind") || "",
            bar: selectionRoot.getAttribute("data-selection-bar") || "",
            visibleIds: (selectionRoot.getAttribute("data-selection-visible-controls") || "").split(" ").filter(Boolean),
            overflowIds: (selectionRoot.getAttribute("data-selection-overflow-controls") || "").split(" ").filter(Boolean),
          }
        : null,
      controls,
      duplicates,
      rect: rowRect
        ? { x: Math.round(rowRect.x), y: Math.round(rowRect.y), w: Math.round(rowRect.width), h: Math.round(rowRect.height) }
        : null,
    };
  });
}

/** Is any part of the edit bar covered by something else, or overlapping an editor side rail? */
export async function coverage(page) {
  return page.evaluate(() => {
    const row = document.querySelector("[data-workspace-edit-bar]");
    if (!row) return { present: false };
    const rr = row.getBoundingClientRect();
    const covered = [];
    const probes = [...row.querySelectorAll("button, label")].filter((el) => {
      if (el.closest("[aria-hidden='true'], [inert]")) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    for (const el of probes) {
      const r = el.getBoundingClientRect();
      for (const [px, py] of [
        [r.left + 3, r.top + r.height / 2],
        [r.left + r.width / 2, r.top + r.height / 2],
        [r.right - 3, r.top + r.height / 2],
      ]) {
        const inViewport = px >= 0 && py >= 0 && px < innerWidth && py < innerHeight;
        const top = inViewport ? document.elementFromPoint(px, py) : null;
        if (!inViewport || !top || !(row.contains(top) || top.closest("[data-workspace-edit-bar-toolbar]"))) {
          covered.push({
            control: el.closest("[data-selection-control-id]")?.getAttribute("data-selection-control-id") ||
              el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 20) || "?",
            at: [Math.round(px), Math.round(py)],
            topmost: top
              ? `${top.tagName.toLowerCase()}${[...top.attributes].filter((a) => a.name.startsWith("data-")).map((a) => `[${a.name}]`).join("").slice(0, 120)}`
              : inViewport ? "none" : "offscreen",
          });
          break;
        }
      }
    }
    const rails = [
      ...document.querySelectorAll(
        "[data-deck-thumbnail-rail], [data-edit-bar-avoid], [data-pdf-thumbnail-rail], [data-image-layers-panel], [data-workspace-pane='left']",
      ),
    ]
      .map((el) => {
        const r = el.getBoundingClientRect();
        const name = [...el.attributes].filter((a) => a.name.startsWith("data-")).map((a) => a.name).join(",").slice(0, 80);
        const overlap = Math.max(0, Math.min(rr.right, r.right) - Math.max(rr.left, r.left)) *
          Math.max(0, Math.min(rr.bottom, r.bottom) - Math.max(rr.top, r.top));
        return { name, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], overlap: Math.round(overlap) };
      })
      .filter((x) => x.rect[2] > 0 && x.rect[3] > 0);
    return {
      present: true,
      barRect: [Math.round(rr.x), Math.round(rr.y), Math.round(rr.width), Math.round(rr.height)],
      viewport: [innerWidth, innerHeight],
      covered,
      rails,
    };
  });
}

/** Rect of the editor stage (viewport row), used to clip stage screenshots. */
export async function stageRect(page) {
  return page.evaluate(() => {
    const el = document.querySelector("[data-advanced-viewport-row]") || document.querySelector("[data-inline-editor]");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(innerWidth, r.width), height: Math.min(innerHeight, r.height) };
  });
}

/** Stage screenshot with the edit bar, popovers and the corner zoom masked out. */
export async function stageShot(page, { path, clip } = {}) {
  const rect = clip || (await stageRect(page));
  return page.screenshot({
    path,
    clip: rect || undefined,
    animations: "disabled",
    caret: "hide",
    mask: [
      page.locator("[data-workspace-edit-bar-toolbar]"),
      page.locator("[role=listbox]"),
      page.locator("[data-edit-bar-session][role=dialog]"),
    ],
    maskColor: "#ff00ff",
  });
}

/** Pixel diff of two PNG buffers inside a scratch page (no CSP: about:blank). */
export async function pixelDiff(scratch, a, b, { threshold = 32 } = {}) {
  return scratch.evaluate(
    async ({ a64, b64, threshold }) => {
      const decode = async (b64s) => {
        const bin = atob(b64s);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const canvas = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(bmp, 0, 0);
        return { w: bmp.width, h: bmp.height, data: ctx.getImageData(0, 0, bmp.width, bmp.height).data };
      };
      const A = await decode(a64);
      const B = await decode(b64);
      if (A.w !== B.w || A.h !== B.h) return { changed: -1, total: A.w * A.h, ratio: 1, sizeMismatch: true };
      let changed = 0;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -1;
      let maxY = -1;
      for (let i = 0; i < A.data.length; i += 4) {
        const d = Math.max(
          Math.abs(A.data[i] - B.data[i]),
          Math.abs(A.data[i + 1] - B.data[i + 1]),
          Math.abs(A.data[i + 2] - B.data[i + 2]),
        );
        if (d > threshold) {
          changed += 1;
          const p = i / 4;
          const x = p % A.w;
          const y = Math.floor(p / A.w);
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
      return {
        changed,
        total: A.w * A.h,
        ratio: Number((changed / (A.w * A.h)).toFixed(5)),
        box: changed ? [minX, minY, maxX - minX + 1, maxY - minY + 1] : null,
      };
    },
    { a64: a.toString("base64"), b64: b.toString("base64"), threshold },
  );
}

/** Top-bar undo (D1 places it in the global row). Returns whether it was clickable. */
export async function clickUndo(page) {
  const undo = page.locator("[data-global-history-undo]").first();
  if (!(await undo.isVisible().catch(() => false))) return "absent";
  if (await undo.isDisabled().catch(() => true)) return "disabled";
  await undo.click();
  await page.waitForTimeout(1200);
  return "clicked";
}

export async function closePopovers(page) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
}

/** Snapshot of transient UI that a control can open (listbox, dialogs, left panel width). */
export async function uiState(page) {
  return page.evaluate(() => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    const left = [...document.querySelectorAll("[data-workspace-pane='left'], [data-left-panel]")].filter(vis);
    return {
      listbox: [...document.querySelectorAll("[role=listbox]")].filter(vis).length,
      dialogs: [...document.querySelectorAll("[role=dialog]")].filter(vis).map((d) => (d.getAttribute("aria-label") || d.id || "").slice(0, 40)),
      leftPanels: left.map((el) => `${el.getAttribute("data-left-panel") || el.getAttribute("data-workspace-pane")}:${Math.round(el.getBoundingClientRect().width)}`),
      activeDrawer: document.querySelector("[data-active-drawer-id]")?.getAttribute("data-active-drawer-id") || "",
    };
  });
}

/**
 * Activate one edit-bar control the way a user would, by kind:
 * select → open listbox and pick a non-current option; color → set a vivid colour;
 * number → press "+" twice; everything else → click. Returns what was done.
 */
export async function activateControl(page, control, { option = 1 } = {}) {
  const host = control.controlId
    ? page.locator(`[data-workspace-edit-bar] [data-selection-control-id="${control.controlId}"]:not([data-selection-measure-control-id])`).first()
    : page.locator(`[data-workspace-edit-bar] [data-workspace-action-id="${control.actionId}"]`).first();
  if (!(await host.count())) return { done: "missing" };
  const color = host.locator("input[type=color]").first();
  if (await color.count()) {
    await color.fill("#e11d48").catch(async () => {
      await color.evaluate((el) => {
        el.value = "#e11d48";
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
    return { done: "color #e11d48" };
  }
  const plus = host.locator("button[aria-label$=' +']").first();
  if (await plus.count()) {
    await plus.click();
    await page.waitForTimeout(250);
    await plus.click();
    return { done: "number +2 steps" };
  }
  const button = (await host.evaluate((el) => el.matches("button"))) ? host : host.locator("button").first();
  const haspopup = await button.getAttribute("aria-haspopup").catch(() => null);
  await button.click();
  await page.waitForTimeout(700);
  if (haspopup === "listbox") {
    const options = page.locator("[role=listbox] [role=option]");
    const count = await options.count();
    if (!count) return { done: "listbox empty" };
    let pick = -1;
    for (let i = 0; i < count; i += 1) {
      const selected = await options.nth(i).getAttribute("aria-selected");
      if (selected !== "true") {
        pick = i;
        if (pick >= option) break;
      }
    }
    if (pick < 0) return { done: "listbox no alternative" };
    const text = (await options.nth(pick).textContent())?.trim();
    await options.nth(pick).click();
    return { done: `listbox → ${text}` };
  }
  return { done: haspopup ? `opened ${haspopup}` : "clicked" };
}
