// W10 grid acceptance. args: <mode> <artifactId> [tag]
//   probe   – open, screenshot, list edit-bar controls, select a styled cell, click bar buttons.
//   save    – type into two empty cells (save after each), reload, confirm both values are back.
//   offline – go offline, type, expect "error" (never "saved"), go online, retry, expect "saved".
import assert from "node:assert/strict";
const STAGE = "[data-grid-univer-stage]";

export async function openGrid(page, helpers, id) {
  await helpers.gotoApp(page, `/library?item=${id}`);
  const stage = page.locator(`${STAGE} canvas >> visible=true`).first();
  if (!(await stage.isVisible().catch(() => false))) {
    // The detail viewer comes first; the pencil at the top right opens the editor.
    const edit = page.locator("button[aria-label*='编辑'], button[aria-label*='Edit'], button[title*='编辑'], button[title*='Edit']").last();
    await edit.waitFor({ timeout: 60000 });
    await edit.click();
  }
  await stage.waitFor({ timeout: 150000 });
  await page.waitForTimeout(5000);
}

/** Centre of a cell (0-based row/col) in normal mode: no ribbon, 46px row header, 20px col header (from the canvas, below the bar inset). */
export async function cellPoint(page, row, col) {
  // The largest canvas is the sheet; Univer also parks an 88×24 cell-editor canvas off-screen after the first edit.
  const box = await page.evaluate((sel) => {
    let best = null;
    for (const c of document.querySelectorAll(`${sel} canvas`)) {
      const b = c.getBoundingClientRect();
      if (!best || b.width * b.height > best.width * best.height) best = { x: b.x, y: b.y, width: b.width, height: b.height };
    }
    return best;
  }, STAGE);
  return { x: box.x + 46 + 88 * col + 44, y: box.y + 20 + 24 * row + 12 };
}

export async function clickCell(page, row, col) {
  const p = await cellPoint(page, row, col);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(500);
}

async function bar(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-selection-control-id]")].map((el) => {
      const b = el.querySelector("button, input, label");
      const pressed = el.querySelector("[aria-pressed]")?.getAttribute("aria-pressed");
      const value = el.querySelector("input[type=number], input[type=color]")?.value;
      return `${el.getAttribute("data-selection-control-id")}${pressed ? `[${pressed}]` : ""}${value ? `=${value}` : ""}:${(b?.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 16)}`;
    }),
  );
}

/** Tag the visible main canvas once; the same tag later = same Univer instance (no remount). */
async function tagCanvas(page) {
  return page.evaluate(() => {
    const c = [...document.querySelectorAll("[data-grid-univer-stage] canvas")].sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
    if (!c) return null;
    if (!c.dataset.w10Tag) c.dataset.w10Tag = `t${Date.now()}`;
    return c.dataset.w10Tag;
  });
}

async function liveCells(page) {
  return page.evaluate(() => JSON.stringify(globalThis.__oceanleoGridUniverPaint?.liveCells || null).slice(0, 1500));
}

async function surfaces(page) {
  return page.evaluate(() => {
    const bg = (sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).backgroundColor : null;
    };
    return {
      html: document.documentElement.className.slice(0, 120),
      gridTheme: document.querySelector("[data-grid-univer-stage]")?.getAttribute("data-grid-univer-theme"),
      workbench: bg('[data-u-comp="workbench-layout"]'),
      bar: bg("[data-edit-bar-row]") || bg("[data-selection-kind]"),
      saveState: document.querySelector("[data-workspace-save-launcher]")?.getAttribute("data-save-state"),
    };
  });
}

let revisionPosts = 0;
let committedRevisions = 0;

/** After an edit: wait until a new revision POST went out, then until the bar says saved. */
async function waitEditSaved(page, helpers, log, before, timeout = 90000) {
  const started = Date.now();
  while (revisionPosts === before && Date.now() - started < timeout) {
    if ((await helpers.saveState(page)) === "error") {
      const why = await page.locator("[data-workspace-save-launcher]").first().textContent().catch(() => "");
      const probe = await page.evaluate(() => JSON.stringify(globalThis.__oceanleoGridUniverPaint?.state || null) + " " + JSON.stringify((globalThis.__oceanleoGridUniverPaint?.events || []).slice(-8)));
      throw new Error(`save reported error: ${String(why).trim()} ${probe}`);
    }
    await page.waitForTimeout(500);
  }
  if (revisionPosts === before) throw new Error("no revision was posted for this edit");
  await helpers.waitSaved(page, { timeout });
  log("revision posts", revisionPosts);
}

export default async function ({ page, context, log, shot, helpers, args }) {
  const [mode, id, tag = mode] = args;
  if (!id) throw new Error("artifact id required");
  // Gateway answers that matter for saving (status + short body; never headers/tokens).
  page.on("response", async (res) => {
    const url = res.url();
    if (res.status() < 400 || /_next\/|\.(js|css|png|woff2?)(\?|$)/.test(url)) return;
    const body = await res.text().catch(() => "");
    log("HTTP", res.status(), res.request().method(), url.replace(/^https?:\/\/[^/]+/, "").slice(0, 120), body.slice(0, 300));
  });
  page.on("response", async (res) => {
    if (res.request().method() !== "POST" || !/\/revisions(\?|$)/.test(res.url())) return;
    if (res.ok()) committedRevisions += 1;
    const body = await res.text().catch(() => "");
    const id = /"(?:revision_id|revisionId|id)"\s*:\s*"([0-9a-f-]{36})"/.exec(body)?.[1] || "";
    log("REVISION-RES", res.status(), id, body.length);
  });
  page.on("requestfailed", (req) => {
    const url = req.url();
    if (/_next\/|hot-update/.test(url)) return;
    log("REQFAILED", req.method(), url.replace(/\?.*$/, "").slice(0, 140), req.failure()?.errorText || "");
  });
  page.on("request", (req) => {
    const url = req.url();
    if (req.method() === "POST" && /\/revisions(\?|$)/.test(url)) revisionPosts += 1;
    if (req.method() !== "GET" && /artifact|revision|upload|commit|fork/.test(url)) {
      log("REQ", req.method(), url.replace(/^https?:\/\/[^/]+/, "").slice(0, 120));
    }
  });
  await openGrid(page, helpers, id);
  log("surfaces", JSON.stringify(await surfaces(page)));
  log("liveCells@open", await liveCells(page));
  await shot(`${tag}-open`);

  if (mode === "probe") {
    await clickCell(page, 0, 0);
    log("bar A1", JSON.stringify(await bar(page)));
    await shot(`${tag}-a1`);
    await clickCell(page, 1, 0);
    log("bar A2", JSON.stringify(await bar(page)));
    await clickCell(page, 3, 1);
    log("bar B4", JSON.stringify(await bar(page)));
    // range select B3:C4 → merge toggle should appear
    const a = await cellPoint(page, 2, 1);
    const b = await cellPoint(page, 3, 2);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    log("bar B3:C4", JSON.stringify(await bar(page)));
    await shot(`${tag}-range`);
    return;
  }

  if (mode === "trace2") {
    // Second edit after a save: watch the save state second by second.
    const stamp = String(Date.now()).slice(-5);
    const watch = async (label, secs) => {
      let prev = "";
      for (let i = 0; i < secs; i += 1) {
        const s = await helpers.saveState(page);
        const busy = await page.locator("[data-grid-univer-loading]").count();
        const st = await page.evaluate(() => JSON.stringify(globalThis.__oceanleoGridUniverPaint?.state || null));
        const now = `${s}${busy ? "+loading" : ""} ${st}`;
        if (now !== prev) log(label, `t+${i}s`, now);
        prev = now;
        await page.waitForTimeout(1000);
      }
    };
    log("open state", await helpers.saveState(page), "tag", await tagCanvas(page));
    log("events@open", await page.evaluate(() => JSON.stringify(globalThis.__oceanleoGridUniverPaint?.events || [])));
    await clickCell(page, 14, 4);
    await page.keyboard.type(`T1${stamp}`);
    await page.keyboard.press("Enter");
    await watch("edit1", 25);
    log("tag after save1", await tagCanvas(page));
    await clickCell(page, 14, 5);
    await page.keyboard.type(`T2${stamp}`);
    await page.keyboard.press("Enter");
    await watch("edit2", 25);
    await shot(`${tag}-after-edit2`);
    log("events", await page.evaluate(() => JSON.stringify(globalThis.__oceanleoGridUniverPaint?.events || [])));
    log("tag after edit2", await tagCanvas(page));
    return;
  }

  if (mode === "diag") {
    const launcher = page.locator("[data-workspace-save-launcher]").first();
    log("launcher", await launcher.getAttribute("data-save-state").catch(() => null), (await launcher.textContent().catch(() => "")).trim(), await launcher.getAttribute("title").catch(() => null), await launcher.getAttribute("aria-label").catch(() => null));
    await launcher.click().catch(() => {});
    await page.waitForTimeout(800);
    await shot(`${tag}-launcher`);
    log("popover", (await page.locator("[role=dialog], [role=menu], [data-workspace-save-panel]").first().textContent().catch(() => "")).trim().slice(0, 400));
    return;
  }

  if (mode === "buttons") {
    // Every text-bar control on an empty cell: effect read back from Univer through the bar,
    // top-bar undo reverts it, then a final styled state must survive save + reload.
    const ctl = (id) =>
      page.evaluate((cid) => {
        const el = document.querySelector(`[data-selection-control-id="${cid}"]`);
        if (!el) return null;
        return {
          pressed: el.querySelector("[aria-pressed]")?.getAttribute("aria-pressed") ?? null,
          value: el.querySelector("input[type=number], input[type=color]")?.value ?? null,
          text: (el.textContent || "").trim().slice(0, 30),
          sel: [...el.querySelectorAll("[data-icon]")].map((n) => n.getAttribute("data-icon")).join(","),
        };
      }, id);
    const undoBtn = page.getByRole("button", { name: /^(Undo|撤销)/ }).first();
    const undo = async () => {
      await undoBtn.click();
      await page.waitForTimeout(600);
    };
    const pick = async (id, value) => {
      await page.locator(`[data-selection-control-id="${id}"] button`).first().click();
      await page.waitForTimeout(300);
      await page.locator(`[data-selection-option="${value}"]`).first().click();
      await page.waitForTimeout(600);
    };
    const results = [];
    const record = (id, before, after, undone, ok) => {
      results.push({ id, ok, before, after, undone });
      log("BTN", id, ok ? "OK" : "FAIL", JSON.stringify({ before, after, undone }));
    };
    const [r, c] = [2, 7]; // H3
    await clickCell(page, r, c);
    await page.keyboard.type(`W10btn`);
    await page.keyboard.press("Enter");
    await clickCell(page, r, c);
    for (const id of ["bold", "italic", "underline", "strike", "grid-wrap"]) {
      const before = await ctl(id);
      if (!before) { record(id, null, null, null, false); continue; }
      await page.locator(`[data-selection-control-id="${id}"] button`).first().click();
      await page.waitForTimeout(600);
      const after = await ctl(id);
      await undo();
      const undone = await ctl(id);
      record(id, before.pressed, after?.pressed, undone?.pressed, before.pressed !== after?.pressed && undone?.pressed === before.pressed);
    }
    {
      const before = await ctl("font-size");
      const input = page.locator('[data-selection-control-id="font-size"] input[type=number]').first();
      await input.fill("16");
      await input.press("Enter");
      await page.waitForTimeout(600);
      const after = await ctl("font-size");
      await undo();
      const undone = await ctl("font-size");
      record("font-size", before?.value, after?.value, undone?.value, after?.value === "16" && undone?.value === before?.value);
    }
    for (const [id, value] of [["font-family", "Times New Roman"], ["align", "center"], ["grid-valign", "top"], ["grid-border", "all"], ["type", "percent"]]) {
      const before = await ctl(id);
      if (!before) { record(id, null, null, null, false); continue; }
      await pick(id, value).catch((e) => log("pick failed", id, String(e).slice(0, 120)));
      const after = await ctl(id);
      await undo();
      const undone = await ctl(id);
      const changed = JSON.stringify(after) !== JSON.stringify(before);
      record(id, before, after, undone, changed && JSON.stringify(undone) === JSON.stringify(before));
    }
    for (const [id, color] of [["text-color", "#c00000"], ["highlight", "#ffff00"]]) {
      const before = await ctl(id);
      await page.locator(`[data-selection-control-id="${id}"] input[type=color]`).first().fill(color);
      await page.waitForTimeout(600);
      const after = await ctl(id);
      await undo();
      const undone = await ctl(id);
      record(id, before?.value, after?.value, undone?.value, after?.value === color && undone?.value === before?.value);
    }
    // merge only shows on a range: H5:I6.
    {
      const a = await cellPoint(page, 4, 7);
      const b = await cellPoint(page, 5, 8);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(600);
      const before = await ctl("merge-cells");
      if (before) {
        await page.locator('[data-selection-control-id="merge-cells"] button').first().click();
        await page.waitForTimeout(800);
        const after = await ctl("merge-cells");
        await shot(`${tag}-merged`);
        await undo();
        const undone = await ctl("merge-cells");
        record("merge-cells", before, after, undone, JSON.stringify(after) !== JSON.stringify(before) && JSON.stringify(undone) === JSON.stringify(before));
      } else record("merge-cells", null, null, null, false);
    }
    // Final state that must persist: H3 bold + red + yellow fill.
    await clickCell(page, r, c);
    await page.locator('[data-selection-control-id="bold"] button').first().click();
    await page.locator('[data-selection-control-id="text-color"] input[type=color]').first().fill("#c00000");
    await page.locator('[data-selection-control-id="highlight"] input[type=color]').first().fill("#ffff00");
    await page.waitForTimeout(800);
    await shot(`${tag}-final`);
    await helpers.waitSaved(page, { timeout: 90000 }).catch((e) => log("waitSaved", String(e)));
    log("saveState", await helpers.saveState(page));
    await openGrid(page, helpers, id);
    log("saveState@reopen", await helpers.saveState(page));
    await clickCell(page, r, c);
    const reopened = { bold: await ctl("bold"), color: await ctl("text-color"), fill: await ctl("highlight") };
    log("reopened H3", JSON.stringify(reopened));
    log("RESULT persisted", reopened.bold?.pressed === "true" && reopened.color?.value === "#c00000" && reopened.fill?.value === "#ffff00" ? "yes" : "NO");
    log("RESULT buttons", results.filter((x) => !x.ok).map((x) => x.id).join(",") || "all-ok");
    await shot(`${tag}-reopened`);
    return;
  }

  if (mode === "layout") {
    // Does the docked bar cover the column header? Is the pro switch the same instance?
    const geo = () =>
      page.evaluate(() => {
        const r = (el) => {
          if (!el) return null;
          const b = el.getBoundingClientRect();
          return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), h: Math.round(b.height) };
        };
        const stage = document.querySelector("[data-grid-univer-stage]");
        const canvases = [...(stage?.querySelectorAll("canvas") || [])].filter((c) => c.getBoundingClientRect().height > 0);
        canvases.forEach((c, i) => { if (!c.dataset.w10Tag) c.dataset.w10Tag = `c${Date.now()}-${i}`; });
        return {
          mode: stage?.getAttribute("data-grid-univer-mode"),
          stage: r(stage),
          mainCanvas: r(canvases[0]),
          canvasTags: canvases.map((c) => c.dataset.w10Tag),
          bar: r(document.querySelector("[data-workspace-edit-bar]")),
          ribbon: r(document.querySelector('[data-u-comp="ribbon"], .univer-ribbon, [class*="ribbon"]')),
        };
      });
    const before = await geo();
    log("normal", JSON.stringify(before));
    await shot(`${tag}-normal`);
    const pro = page.locator("[data-plugin-page='pro']").first();
    await pro.click();
    await page.waitForTimeout(1500);
    const during = await geo();
    log("pro", JSON.stringify(during));
    log("pro loading overlay", await page.locator("[data-grid-univer-loading]").count());
    await shot(`${tag}-pro`);
    await page.locator("[data-plugin-page='artifact']").first().click();
    await page.waitForTimeout(1500);
    const after = await geo();
    log("back", JSON.stringify(after));
    log(
      "RESULT seamless",
      before.canvasTags[0] && during.canvasTags.includes(before.canvasTags[0]) && after.canvasTags.includes(before.canvasTags[0])
        ? "same-canvas"
        : "CANVAS-REPLACED",
    );
    return;
  }

  if (mode === "bar") {
    // Exercise each text-bar button on cell F2 (empty): type, then style it via the bar.
    await clickCell(page, 1, 5);
    await page.keyboard.type("W10-bar");
    await page.keyboard.press("Enter");
    await clickCell(page, 1, 5);
    for (const control of ["bold", "italic", "underline", "strike"]) {
      const btn = page.locator(`[data-selection-control-id="${control}"] button`).first();
      if (!(await btn.count())) {
        log("missing", control);
        continue;
      }
      await btn.click();
      await page.waitForTimeout(400);
      log("after", control, JSON.stringify((await bar(page)).filter((s) => s.startsWith(control))));
    }
    await shot(`${tag}-styled`);
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(500);
    log("after undo", JSON.stringify((await bar(page)).filter((s) => s.startsWith("strike"))));
    await helpers.waitSaved(page, { timeout: 90000 }).catch((e) => log("waitSaved", String(e)));
    log("surfaces", JSON.stringify(await surfaces(page)));
    return;
  }

  if (mode === "save") {
    const stamp = String(Date.now()).slice(-5);
    log("canvas tag at open", await tagCanvas(page));
    await page.waitForTimeout(3000);
    const posts0 = revisionPosts;
    assert.equal(posts0, 0, "a clean open must not create a revision");
    log("revision posts before edits (opening must not save)", posts0, await page.evaluate(() => JSON.stringify(globalThis.__oceanleoGridUniverPaint?.state || null)));
    await clickCell(page, 12, 4);
    await page.keyboard.type(`W10a${stamp}`);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
    log("state after edit 1", await helpers.saveState(page));
    await waitEditSaved(page, helpers, log, posts0);
    log("saved 1", page.url());
    log("canvas tag after save 1", await tagCanvas(page));
    const posts1 = revisionPosts;
    {
      const pt = await cellPoint(page, 12, 5);
      log("hit@F13", await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        const chain = [];
        for (let n = el; n && chain.length < 6; n = n.parentElement) chain.push(`${n.tagName.toLowerCase()}${n.id ? "#" + n.id : ""}${n.getAttribute?.("data-u-comp") ? "[" + n.getAttribute("data-u-comp") + "]" : ""}.${String(n.className || "").slice(0, 40)}`);
        return chain.join(" < ");
      }, pt));
      log("canvases", await page.evaluate(() => JSON.stringify([...document.querySelectorAll("[data-grid-univer-stage] canvas")].map((c) => { const b = c.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height), getComputedStyle(c).visibility]; }))), JSON.stringify(pt));
      log("activeElement", await page.evaluate(() => `${document.activeElement?.tagName} ${String(document.activeElement?.className || "").slice(0, 60)}`));
    }
    await shot(`${tag}-saved1`);
    await clickCell(page, 12, 5);
    await page.keyboard.type(`W10b${stamp}`);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
    log("state after edit 2", await helpers.saveState(page));
    log("canvas tag after edit 2", await tagCanvas(page));
    log("events after edit 2", await page.evaluate(() => JSON.stringify(globalThis.__oceanleoGridUniverPaint?.events || []) + " " + JSON.stringify(globalThis.__oceanleoGridUniverPaint?.state || null)));
    await shot(`${tag}-edit2`);
    await waitEditSaved(page, helpers, log, posts1);
    assert.equal(committedRevisions, 2, "two edits must produce exactly two committed revisions (CAS retries do not count)");
    log("saved 2", page.url());
    // Close → reopen (fresh navigation), then a full page reload; both must show the two edits.
    await openGrid(page, helpers, id);
    log("saveState@reopen", await helpers.saveState(page));
    const found = await page.evaluate((marks) => {
      const all = JSON.stringify(globalThis.__oceanleoGridUniverPaint?.liveCells || []);
      return marks.map((m) => all.includes(m));
    }, [`W10a${stamp}`, `W10b${stamp}`]);
    log("RESULT", found.every(Boolean) ? "both-present" : `MISSING ${JSON.stringify(found)}`, stamp);
    assert.ok(found.every(Boolean), "both edits must survive close/reopen");
    await shot(`${tag}-reopened`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(`${STAGE} canvas`).first().waitFor({ timeout: 150000 });
    await page.waitForTimeout(5000);
    const reloaded = await page.evaluate(marks => {
      const all = JSON.stringify(globalThis.__oceanleoGridUniverPaint?.liveCells || []);
      return marks.map(mark => all.includes(mark));
    }, [`W10a${stamp}`, `W10b${stamp}`]);
    assert.ok(reloaded.every(Boolean), "both edits must survive full reload");
    assert.equal(committedRevisions, 2, "reopen/reload must not create extra revisions");
    log("RESULT full-reload", JSON.stringify(reloaded));
    await shot(`${tag}-full-reload`);
    return;
  }

  if (mode === "offline") {
    await context.setOffline(true);
    await clickCell(page, 13, 4);
    await page.keyboard.type("W10-offline");
    await page.keyboard.press("Enter");
    let sawSaved = false;
    let last = null;
    for (let i = 0; i < 60; i += 1) {
      last = await helpers.saveState(page);
      if (last === "saved") sawSaved = true;
      if (last === "error") break;
      await page.waitForTimeout(1000);
    }
    log("offline state", last, "sawSavedWhileOffline", sawSaved);
    await shot(`${tag}-offline`);
    await context.setOffline(false);
    const retry = page.getByRole("button", { name: /重试|Retry/ }).first();
    if (await retry.count()) await retry.click().catch(() => {});
    await helpers.waitSaved(page, { timeout: 90000 }).catch((e) => log("after-retry", String(e)));
    log("after retry", await helpers.saveState(page));
    await shot(`${tag}-online`);
  }
}
