// W08: click every unified text-bar control in the document editor, check the
// effect on the page, undo/redo, then reload and check what survived the save.
// Usage:
//   bash harness/mint.sh | OUT_DIR=/tmp/w08-bar THEME=light \
//     node harness/run.mjs evidence/W08/scenarios/bar-check.mjs <artifactId> <label>
const BODY = ".oleo-richdoc";
const BAR = "[data-selection-visible-controls]";
const LAUNCHER = "[data-workspace-save-launcher]";

async function open(page, helpers, log, id) {
  await helpers.gotoApp(page, `/library?item=${encodeURIComponent(id)}`);
  const body = page.locator(BODY).first();
  if (!(await body.waitFor({ state: "visible", timeout: 25000 }).then(() => true, () => false))) {
    await page.locator("button, a").filter({ hasText: /^(编辑|Edit)$/ })
      .or(page.getByRole("button", { name: /^(编辑|Edit)/ })).first().click({ timeout: 30000 });
    await body.waitFor({ state: "visible", timeout: 120000 });
  }
  await page.locator("[role=region][aria-busy=false]").first().waitFor({ timeout: 60000 }).catch(() => log("warn", "busy"));
  await page.waitForTimeout(2500);
  return body;
}

/** Select `word` inside the editor through a DOM range (ProseMirror follows selectionchange). */
async function selectWord(page, word) {
  const ok = await page.evaluate(({ sel, word }) => {
    const root = document.querySelector(sel);
    if (!root) return false;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent.indexOf(word);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + word.length);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      root.focus();
      return true;
    }
    return false;
  }, { sel: BODY, word });
  await page.waitForTimeout(700);
  return ok;
}

/** Inspect how `word` is rendered: wrapping marks, inline styles, block. */
async function describe(page, word) {
  return page.evaluate(({ sel, word }) => {
    const root = document.querySelector(sel);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.includes(word)) continue;
      const tags = [];
      const styles = [];
      let el = node.parentElement;
      let block = null;
      while (el && el !== root) {
        tags.push(el.tagName.toLowerCase());
        const style = el.getAttribute("style");
        if (style) styles.push(style);
        if (!block && /^(P|H1|H2|H3|H4|LI|BLOCKQUOTE|PRE)$/.test(el.tagName)) block = el;
        el = el.parentElement;
      }
      return {
        tags: tags.join(">"),
        styles: styles.join(" | "),
        href: node.parentElement.closest("a")?.getAttribute("href") || "",
        block: block ? `${block.tagName.toLowerCase()} ${block.getAttribute("style") || ""}`.trim() : "",
      };
    }
    return null;
  }, { sel: BODY, word });
}

async function barIds(page) {
  return page.evaluate((sel) => {
    const bar = document.querySelector(sel);
    if (!bar) return null;
    return {
      bar: bar.getAttribute("data-edit-bar-bar"),
      kind: bar.getAttribute("data-selection-kind"),
      visible: bar.getAttribute("data-selection-visible-controls"),
      overflow: bar.getAttribute("data-selection-overflow-controls"),
    };
  }, BAR);
}

const control = (page, id) =>
  page.locator(`${BAR} [data-selection-control-id="${id}"], ${BAR} [data-edit-bar-canon="${id}"]`).first();

async function pickOption(page, log, id, value) {
  await control(page, id).click({ timeout: 5000 });
  const option = page.locator(`[role=option][data-selection-option="${value}"]`).first();
  if (!(await option.isVisible({ timeout: 3000 }).catch(() => false))) {
    const values = await page.locator("[role=option]").evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-selection-option") || el.textContent?.trim()).slice(0, 20));
    log(id, "options", JSON.stringify(values));
    await page.keyboard.press("Escape");
    return false;
  }
  await option.click();
  await page.waitForTimeout(500);
  return true;
}

export default async function ({ page, log, shot, helpers, args }) {
  const [id, label = "doc"] = args;
  page.on("response", (response) => {
    if (response.request().method() !== "GET" && (response.status() >= 400 || /revisions|database\/upload/.test(response.url()))) {
      log("res", response.request().method(), String(response.status()), new URL(response.url()).pathname.slice(0, 100));
    }
  });
  let lastState = "";
  const stateTimer = setInterval(async () => {
    const st = await page.locator(LAUNCHER).first().getAttribute("data-save-state", { timeout: 500 }).catch(() => null);
    const title = await page.locator(LAUNCHER).first().getAttribute("title", { timeout: 500 }).catch(() => null);
    const now = `${st} | ${title}`;
    if (now !== lastState) log("save-state", now);
    lastState = now;
  }, 700);
  page.on("close", () => clearInterval(stateTimer));
  const body = await open(page, helpers, log, id);
  page.setDefaultTimeout(8000);
  log("bar-on-open", JSON.stringify(await barIds(page)));
  await shot(`${label}-bar-open`);

  const tag = Date.now().toString(36).slice(-3);
  const w = (name) => `${name}${tag}`;
  await body.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  const words = ["bold", "ital", "under", "strike", "color", "mark", "link", "font", "size", "clear"].map(w);
  await page.keyboard.type(words.join(" "), { delay: 10 });
  await page.keyboard.press("Enter");
  await page.keyboard.type(`${w("align")} centred paragraph`, { delay: 10 });
  await page.keyboard.press("Enter");
  await page.keyboard.type(`${w("list")} bullet item`, { delay: 10 });
  await page.keyboard.press("Enter");
  await page.keyboard.type(`${w("height")} line height`, { delay: 10 });
  await page.keyboard.press("Enter");
  await page.keyboard.type(`${w("head")} heading two`, { delay: 10 });
  await page.waitForTimeout(800);

  await selectWord(page, w("bold"));
  const ids = await barIds(page);
  log("bar-text", JSON.stringify(ids));
  await shot(`${label}-bar-text`);

  const results = {};
  const record = async (name, word, fn, check) => {
    try {
      await selectWord(page, word);
      await fn();
      await page.waitForTimeout(500);
      const seen = await describe(page, word);
      results[name] = { ok: check(seen), seen };
    } catch (error) {
      results[name] = { ok: false, error: String(error).slice(0, 200) };
    }
    log("click", name, JSON.stringify(results[name]));
  };

  await record("bold", w("bold"), () => control(page, "bold").click(), (s) => /strong|(^|>)b(>|$)/.test(s?.tags || ""));
  // Undo / redo on the bold click.
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(400);
  const undone = await describe(page, w("bold"));
  await page.keyboard.press("Control+Shift+z");
  await page.waitForTimeout(400);
  const redone = await describe(page, w("bold"));
  log("undo-redo", JSON.stringify({ undone: undone?.tags, redone: redone?.tags }));
  results["undo"] = { ok: !/strong/.test(undone?.tags || "") && /strong/.test(redone?.tags || "") };

  await record("italic", w("ital"), () => control(page, "italic").click(), (s) => /(^|>)em(>|$)|(^|>)i(>|$)/.test(s?.tags || ""));
  await record("underline", w("under"), () => control(page, "underline").click(), (s) => /(^|>)u(>|$)/.test(s?.tags || ""));
  await record("strike", w("strike"), () => control(page, "strike").click(), (s) => /(^|>)s(>|$)|del|strike/.test(s?.tags || ""));
  await record("text-color", w("color"), () => control(page, "text-color").locator("input[type=color]").fill("#dc2626"),
    (s) => /color:\s*(#dc2626|rgb\(220, 38, 38\))/i.test(s?.styles || ""));
  await record("highlight", w("mark"), () => control(page, "highlight").locator("input[type=color]").fill("#a7f3d0"),
    (s) => /mark/.test(s?.tags || ""));
  await record("font-family", w("font"), async () => {
    await control(page, "font-family").click();
    const options = page.locator("[role=option]");
    const values = await options.evaluateAll((els) => els.map((el) => el.getAttribute("data-selection-option") || "").slice(0, 12));
    log("font-family", "options", JSON.stringify(values));
    await options.nth(Math.min(2, values.length - 1)).click();
  }, (s) => /font-family/.test(s?.styles || ""));
  await record("font-size", w("size"), async () => {
    await control(page, "font-size").click();
    const options = page.locator("[role=option]");
    const values = await options.evaluateAll((els) => els.map((el) => el.getAttribute("data-selection-option") || el.textContent?.trim() || "").slice(0, 16));
    log("font-size", "options", JSON.stringify(values));
    const big = values.findIndex((v) => /^(24|28|32)/.test(v));
    await options.nth(big >= 0 ? big : values.length - 1).click();
  }, (s) => /font-size/.test(s?.styles || ""));
  await record("link", w("link"), async () => {
    await control(page, "link").click();
    await page.waitForTimeout(1000);
    await shot(`${label}-bar-link-open`);
    const inputs = page.locator("[data-selection-inspector] textarea, [data-selection-inspector] input").filter({ visible: true });
    const described = await inputs.evaluateAll((els) => els.map((el) => `${el.getAttribute("aria-label") || ""}|${el.getAttribute("placeholder") || ""}`));
    log("link", "inputs", JSON.stringify(described));
    // The link panel opens in the left inspector dock: one textarea, Enter commits.
    const input = page.locator("[data-selection-inspector] textarea, [data-selection-inspector] input").filter({ visible: true }).first();
    await input.fill("https://example.com/w08", { timeout: 5000 });
    // The inspector textarea commits on Ctrl/Cmd+Enter or blur; plain Enter is a newline.
    await input.press("Control+Enter");
  }, (s) => /example\.com\/w08/.test(s?.href || ""));
  await page.keyboard.press("Escape");
  await record("align", w("align"), () => pickOption(page, log, "align", "center"), (s) => /text-align:\s*center/.test(s?.block || ""));
  await record("list", w("list"), () => pickOption(page, log, "list", "bullet"), (s) => /(^|>)li(>|$)/.test(s?.tags || "") && /ul/.test(s?.tags || ""));
  await record("line-height", w("height"), async () => {
    await control(page, "line-height").click();
    const options = page.locator("[role=option]");
    const values = await options.evaluateAll((els) => els.map((el) => el.getAttribute("data-selection-option") || "").slice(0, 12));
    log("line-height", "options", JSON.stringify(values));
    const two = values.findIndex((v) => v === "2" || v === "2.0");
    await options.nth(two >= 0 ? two : values.length - 1).click();
  }, (s) => /line-height/.test(`${s?.block || ""} ${s?.styles || ""}`));
  await record("format", w("head"), async () => {
    await page.locator(`${BAR} button[aria-haspopup=dialog][aria-expanded]`).filter({ has: page.locator("svg") })
      .and(page.locator("button[title*='更多'], button[title*='More'], button[title*='more']")).first().click();
    await page.waitForTimeout(500);
    await shot(`${label}-bar-more`);
    const select = page.locator("[role=dialog] [data-selection-control-id='format'], [role=dialog] [data-selection-overflow-control='format']").first();
    await select.click({ timeout: 5000 });
    const options = page.locator("[role=option]");
    const values = await options.evaluateAll((els) => els.map((el) => el.getAttribute("data-selection-option") || el.textContent?.trim() || ""));
    log("format", "options", JSON.stringify(values));
    const h2 = values.findIndex((v) => /h2|heading-2|2/.test(v));
    await options.nth(h2 >= 0 ? h2 : 0).click();
  }, (s) => /^h2/.test(s?.block || "") || /(^|>)h2(>|$)/.test(s?.tags || ""));
  // clear-format: make it bold first, then clear (lives in "more").
  await record("clear-format", w("clear"), async () => {
    await control(page, "bold").click();
    await page.waitForTimeout(300);
    const direct = control(page, "clear-format");
    if (await direct.isVisible().catch(() => false)) await direct.click();
    else {
      await page.locator(`${BAR} [data-selection-overflow-trigger], ${BAR} button[aria-label*='更多'], ${BAR} button[aria-label*='More']`).last().click();
      await page.locator("[data-selection-overflow-control='clear-format'], [data-selection-control-id='clear-format']").filter({ visible: true }).first().click();
    }
  }, (s) => !/strong/.test(s?.tags || ""));
  await page.keyboard.press("Escape");
  await shot(`${label}-bar-after-clicks`);

  // Let the draft tier and the 20s version idle both land, then reload cold.
  const started = Date.now();
  while (Date.now() - started < 90000) {
    await page.waitForTimeout(1000);
    const state = await page.locator(LAUNCHER).first().getAttribute("data-save-state").catch(() => null);
    if (state === "saved" && Date.now() - started > 30000) break;
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await open(page, helpers, log, new URL(page.url()).searchParams.get("item") || id);
  const kept = {};
  for (const [name, word] of [["bold", "bold"], ["italic", "ital"], ["underline", "under"], ["strike", "strike"],
    ["text-color", "color"], ["highlight", "mark"], ["link", "link"], ["font-family", "font"], ["font-size", "size"],
    ["clear-format", "clear"], ["align", "align"], ["list", "list"], ["line-height", "height"], ["format", "head"]]) {
    kept[name] = await describe(page, w(word));
  }
  log("after-reload", JSON.stringify(kept));
  await shot(`${label}-bar-reloaded`);
  log("summary", JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.ok]))));
  log("tag", tag);
  clearInterval(stateTimer);
}
