// W04 shared helpers: production guard, open-from-library, save-call ledger.
// Only the LeoDev slot and the acceptance account are used (see _COMMON.md §2).
import fs from "node:fs";
import path from "node:path";

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

/**
 * Record every save-chain request (uploads, revision commits, forks, staging)
 * with its status, so the run log proves how many uploads became revisions.
 */
export function saveLedger(page, log) {
  const calls = [];
  const interesting = /\/v1\/(database\/(upload|private-upload)|media\/upload\/(init|finalize)|artifacts\/[^/?]+(\/revisions|:fork|\/staging)|creations)/;
  page.on("response", async (response) => {
    const url = response.url();
    const match = url.match(interesting);
    const method = response.request().method();
    if (!match || method === "GET") return;
    let detail = "";
    try {
      const body = await response.json();
      detail = JSON.stringify({
        revisionId: body?.revisionId || body?.revision_id || body?.file?.revision_id || undefined,
        artifactId: body?.artifactId || body?.artifact_id || body?.file?.artifact_id || undefined,
        blob: body?.file?.blob_id ? "private-stage" : undefined,
        code: body?.detail?.code || body?.code || undefined,
        current: body?.detail?.details?.currentRevisionId || undefined,
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

export function summarize(calls) {
  const count = (pattern, ok = true) =>
    calls.filter((c) => pattern.test(c.path) && (ok ? c.status >= 200 && c.status < 300 : c.status >= 300 || c.status === 0)).length;
  return {
    uploadsOk: count(/\/database\/upload$/),
    privateStagesOk: count(/\/database\/private-upload$|\/staging$/),
    revisionsOk: count(/\/revisions$/),
    revisionsFailed: count(/\/revisions$/, false),
    forksOk: count(/:fork$/),
  };
}

/**
 * Open a library item and press Edit when the detail asks for it.
 * `needle` is either a card title fragment or `id:<artifactId>` (deep link).
 */
export async function openFromLibrary(page, helpers, needle, log, { route = "/library" } = {}) {
  if (needle.startsWith("id:")) {
    await helpers.gotoApp(page, `/library?item=${encodeURIComponent(needle.slice(3))}`);
  } else {
    await helpers.gotoApp(page, route);
    const card = page.locator(`button[aria-label*="${needle}"]`).first();
    await card.waitFor({ timeout: 120000 });
    await card.click();
  }
  const header = "[data-advanced-workbench-header], [data-plugin-chrome-header], [data-workspace-save-launcher]";
  const edit = page.getByRole("button", { name: /^(编辑|Edit|打开编辑器|Open editor)$/ }).first();
  const started = Date.now();
  while (Date.now() - started < 120000) {
    if (await page.locator(header).first().isVisible().catch(() => false)) break;
    if (await edit.isVisible().catch(() => false)) {
      await edit.click().catch(() => {});
      log("clicked Edit for", needle);
      await sleep(3000);
      continue;
    }
    await sleep(1000);
  }
  await page.locator(header).first().waitFor({ state: "visible", timeout: 120000 });
  await sleep(4000);
  log("editor open", page.url());
}

export async function saveLauncher(page) {
  return page.evaluate(() => {
    const el = document.querySelector("[data-workspace-save-launcher]");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      state: el.getAttribute("data-save-state"),
      title: el.getAttribute("title") || el.getAttribute("aria-label") || "",
      text: (el.textContent || "").trim().slice(0, 80),
      visible: r.width > 1 && r.height > 1,
    };
  });
}

/**
 * Poll the top-bar save state until `saved` (or a terminal error); record every
 * distinct state with a timestamp so an early "saved" is visible in the log.
 */
export async function waitForSettled(page, log, { timeout = 90000, label = "" } = {}) {
  const started = Date.now();
  let last = "";
  const seen = [];
  while (Date.now() - started < timeout) {
    const info = await saveLauncher(page).catch(() => null);
    const state = info?.state || "none";
    if (state !== last) {
      seen.push({ t: Date.now() - started, state, title: info?.title || "" });
      log("SAVE-STATE", label, state, info?.title || "", info?.text || "");
      last = state;
    }
    if (state === "saved" && Date.now() - started > 1500) return { state, seen };
    if (state === "error") return { state, seen };
    await sleep(400);
  }
  return { state: last || "none", seen };
}

/** Visible buttons with their accessible names (for choosing a reliable mutation). */
export async function visibleControls(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("button, [role=button], [role=menuitem], input[type=color]")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
      })
      .map((el) => ({
        name: (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim().slice(0, 40),
        id: el.getAttribute("data-edit-bar-id") || el.getAttribute("data-selection-control") || el.getAttribute("data-command-id") || "",
        x: Math.round(el.getBoundingClientRect().x),
        y: Math.round(el.getBoundingClientRect().y),
      }))
      .filter((entry) => entry.name || entry.id),
  );
}

export function writeJson(outDir, name, value) {
  const file = path.join(outDir, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
  return file;
}
