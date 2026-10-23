// W04 save protocol (00-dispatch §5 items 1, 3, 4, 5) for one editor, acceptance account only.
// args: <kind: doc|deck|image|pdf> id:<artifactId> [--offline] [--no-reload]
// Two edits, each waited to a server-confirmed "saved"; close and reopen; full reload and reopen;
// optional offline edit -> error with reason -> back online -> retry -> saved.
// The save ledger proves uploads/staging/commits per save; the DB check is done afterwards in SQL.
import {
  guardProduction,
  openFromLibrary,
  saveLauncher,
  saveLedger,
  sleep,
  summarize,
  waitForSettled,
  writeJson,
} from "./_w04-lib.mjs";

const STAGE_X = 430;

async function largestVisible(page, selector) {
  return page.evaluate(
    ({ selector, minX }) => {
      let best = null;
      for (const el of document.querySelectorAll(selector)) {
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.height < 20 || r.x + r.width < minX || r.y < 60) continue;
        if (!best || r.width * r.height > best.w * best.h) best = { x: r.x, y: r.y, w: r.width, h: r.height };
      }
      return best;
    },
    { selector, minX: STAGE_X },
  );
}

async function clickByName(page, names) {
  for (const name of names) {
    const button = page.locator(`button[aria-label="${name}"], button[title="${name}"]`).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      return name;
    }
  }
  const byText = page.getByRole("button", { name: new RegExp(`^(${names.join("|")})$`) }).first();
  if (await byText.isVisible().catch(() => false)) {
    await byText.click();
    return names[0];
  }
  throw new Error(`no visible button among ${names.join(", ")}`);
}

const mutators = {
  async doc(page, marker) {
    const editor = page.locator(".ProseMirror.oleo-richdoc, .ProseMirror:not(.oc-slot-editor)").first();
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type(marker, { delay: 20 });
  },
  async deck(page, marker, step) {
    // Same path as W07's own scenario: select the first text box, press a canonical edit-bar
    // control. Step 1 bold, step 2 strikethrough, step 3 (offline) italic.
    const text = page.locator("[data-deck-canvas] [data-deck-element][data-element-type=text]").first();
    await text.waitFor({ timeout: 90000 });
    await text.click({ force: true });
    await sleep(800);
    const id = step === 1 ? "bold" : step === 2 ? "strike" : "italic";
    await page.locator(`[data-selection-control-id="${id}"] button, button[data-selection-control-id="${id}"]`).first().click();
    await sleep(500);
  },
  async image(page, marker, step) {
    // Step 1 rotates, step 2 flips, step 3 rotates again: each is a visible pixel change.
    const box = await largestVisible(page, "canvas.upper-canvas");
    if (box) await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
    await sleep(500);
    await clickByName(page, step === 2 ? ["Flip horizontally", "水平翻转"] : ["Rotate", "旋转"]);
  },
  async pdf(page, marker, step) {
    await page.getByText(/Loading PDF|正在加载 PDF/).first().waitFor({ state: "hidden", timeout: 90000 }).catch(() => {});
    let pageBox = null;
    // The PDF viewer renders inside a shadow root/iframe on some builds: fall back to the page
    // area seen in the 1440x900 screenshots (pdf-probe.png) once "Loading PDF" is gone.
    for (let waited = 0; waited < 20000 && !(pageBox && pageBox.w > 200 && pageBox.h > 200); waited += 1000) {
      pageBox = await largestVisible(page, "canvas, img, [data-page-index], [data-page-number]");
      if (!(pageBox && pageBox.w > 200 && pageBox.h > 200)) await sleep(1000);
    }
    if (!(pageBox && pageBox.w > 200 && pageBox.h > 200)) pageBox = { x: 640, y: 120, w: 540, h: 460 };
    // A check stamp is one click = one visible mark (free text needs W06's edit/commit flow;
    // see signals/W04-to-W06.md). Each step stamps a different spot on page 1.
    await page.keyboard.press("Escape");
    await page.locator('button[aria-label="Check"], button[title="Check"]').first().waitFor({ timeout: 60000 }).catch(() => {});
    await clickByName(page, ["Check", "勾", "打勾"]);
    await sleep(500);
    // A fresh spot each run: clicking an earlier run's stamp selects it instead of stamping.
    await page.mouse.click(pageBox.x + pageBox.w * (0.15 + 0.2 * step + Math.random() * 0.08), pageBox.y + pageBox.h * (0.78 + Math.random() * 0.15));
    await sleep(700);
    await page.keyboard.press("Escape");
  },
};

function itemFromUrl(page) {
  return new URL(page.url()).searchParams.get("item") || "";
}

async function bodyHas(page, markers, { timeout = 45000 } = {}) {
  // The editor may still be opening; poll until every marker shows or time runs out.
  const started = Date.now();
  let found = {};
  while (true) {
    const text = await page.evaluate(() => document.body.innerText || "").catch(() => "");
    found = Object.fromEntries(markers.map((m) => [m, text.includes(m)]));
    if (Object.values(found).every(Boolean) || Date.now() - started > timeout) return found;
    await sleep(1000);
  }
}

async function waitEditorReady(page) {
  await page.getByText(/^(Opening|正在打开)/).first().waitFor({ state: "hidden", timeout: 60000 }).catch(() => {});
  await page.locator('[role="status"][aria-live="polite"].absolute').first().waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
}

/** The draft tier says "saved" first; the version is published after ~20 s idle. Wait for it. */
async function waitRevisionCommit(calls, from, log, timeout = 40000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const hit = calls.slice(from).find((c) => /\/revisions$/.test(c.path));
    if (hit) return { status: hit.status, afterMs: hit.at - started };
    await sleep(500);
  }
  log("WARN no revision commit within", timeout, "ms");
  return null;
}

async function closeEditor(page, log) {
  const closed = await clickByName(page, ["Close right pane", "关闭右侧面板", "Close", "关闭"]).catch(() => null);
  log("close editor via", closed || "(none, navigating away)");
  await sleep(2500);
}

export default async function ({ page, context, log, shot, helpers, args, outDir }) {
  await guardProduction(context, log);
  const [kind, needle] = args;
  const offline = args.includes("--offline");
  const mutate = mutators[kind];
  if (!mutate || !needle?.startsWith("id:")) throw new Error("usage: <doc|deck|image|pdf> id:<artifactId> [--offline]");
  const calls = saveLedger(page, log);
  const tag = Math.random().toString(36).slice(2, 7);
  const markers = [`W04-${kind}-a-${tag}`, `W04-${kind}-b-${tag}`];
  const report = { kind, opened: needle.slice(3), markers, saves: [], startedAt: new Date().toISOString() };

  await openFromLibrary(page, helpers, needle, log);
  report.openState = await saveLauncher(page);
  report.openedUrlItem = itemFromUrl(page);
  await shot(`${kind}-0-open`);

  for (const [index, marker] of markers.entries()) {
    const before = calls.length;
    await waitEditorReady(page);
    await mutate(page, marker, index + 1);
    log("mutated", index + 1, marker);
    const settled = await waitForSettled(page, log, { label: `save${index + 1}`, timeout: 120000 });
    const commit = await waitRevisionCommit(calls, before, log);
    const own = calls.slice(before);
    report.saves.push({ step: index + 1, marker, settled, commit, calls: own, item: itemFromUrl(page) });
    await shot(`${kind}-${index + 1}-saved`);
    if (settled.state !== "saved") log("WARN save", index + 1, "settled as", settled.state);
    await sleep(2500);
  }

  const current = itemFromUrl(page) || needle.slice(3);
  report.currentItem = current;
  await closeEditor(page, log);
  await openFromLibrary(page, helpers, `id:${current}`, log);
  await sleep(kind === "pdf" ? 8000 : 3000);
  report.afterReopen = { item: itemFromUrl(page), markers: await bodyHas(page, markers), save: await saveLauncher(page) };
  await shot(`${kind}-3-reopened`);
  log("reopen", JSON.stringify(report.afterReopen));

  if (!args.includes("--no-reload")) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await openFromLibrary(page, helpers, `id:${current}`, log);
    await sleep(kind === "pdf" ? 8000 : 3000);
    report.afterReload = { item: itemFromUrl(page), markers: await bodyHas(page, markers), save: await saveLauncher(page) };
    await shot(`${kind}-4-reloaded`);
    log("reload", JSON.stringify(report.afterReload));
  }

  if (offline) {
    const before = calls.length;
    const marker = `W04-${kind}-offline-${tag}`;
    report.offlineMarker = marker;
    await waitEditorReady(page);
    await context.setOffline(true);
    log("OFFLINE on");
    await mutate(page, marker, 3);
    const seen = [];
    let errorInfo = null;
    const started = Date.now();
    while (Date.now() - started < 90000) {
      const info = await saveLauncher(page);
      if (info && seen.at(-1)?.state !== info.state) {
        seen.push({ t: Date.now() - started, state: info.state, title: info.title });
        log("SAVE-STATE offline", info.state, info.title);
      }
      if (info?.state === "error") {
        errorInfo = info;
        break;
      }
      await sleep(400);
    }
    report.offline = { seen, errorInfo, sawSavedWhileOffline: seen.some((s) => s.state === "saved" && s.t > 1500) };
    await shot(`${kind}-5-offline-error`);
    await context.setOffline(false);
    log("OFFLINE off");
    await sleep(1500);
    let retried = false;
    if ((await saveLauncher(page))?.state === "error") {
      await page.locator("[data-workspace-save-launcher]").first().click();
      await sleep(500);
      await shot(`${kind}-6-retry-menu`);
      const retry = page.locator('[data-workspace-save-action-id="retry"]').first();
      if (await retry.isVisible().catch(() => false)) {
        await retry.click();
        retried = true;
        log("clicked retry");
      }
    }
    // The error stays until the retried save is confirmed; wait for "saved" (or give up after 120 s).
    const settled = { state: "none", seen: [] };
    const retryStarted = Date.now();
    while (Date.now() - retryStarted < 120000) {
      const info = await saveLauncher(page).catch(() => null);
      if (info && settled.seen.at(-1)?.state !== info.state) {
        settled.seen.push({ t: Date.now() - retryStarted, state: info.state, title: info.title });
        log("SAVE-STATE after-retry", info.state, info.title);
      }
      settled.state = info?.state || "none";
      if (settled.state === "saved") break;
      await sleep(400);
    }
    await waitRevisionCommit(calls, before, log, 40000);
    report.offline.retried = retried;
    report.offline.after = settled;
    report.offline.calls = calls.slice(before);
    await shot(`${kind}-7-after-retry`);
    await closeEditor(page, log);
    await openFromLibrary(page, helpers, `id:${itemFromUrl(page) || current}`, log);
    await sleep(kind === "pdf" ? 8000 : 3000);
    report.offline.afterReopen = { markers: await bodyHas(page, [...markers, marker]) };
    await shot(`${kind}-8-offline-reopened`);
  }

  report.summary = summarize(calls);
  report.finishedAt = new Date().toISOString();
  writeJson(outDir, `save-protocol-${kind}`, report);
  log("SUMMARY", JSON.stringify(report.summary), "item", current);
}
