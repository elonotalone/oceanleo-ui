// W08 probe: does one formatting change survive save + cold reload, and what JSON does reopen load?
// Usage:
//   bash harness/mint.sh | OUT_DIR=/tmp/w08-persist THEME=light \
//     node harness/run.mjs evidence/W08/scenarios/persist-probe.mjs <artifactId> <label> [wait-ms=30000]
const BODY = ".oleo-richdoc";
const LAUNCHER = "[data-workspace-save-launcher]";

async function open(page, helpers, id) {
  await helpers.gotoApp(page, `/library?item=${encodeURIComponent(id)}`);
  const body = page.locator(BODY).first();
  if (!(await body.waitFor({ state: "visible", timeout: 25000 }).then(() => true, () => false))) {
    await page.locator("button, a").filter({ hasText: /^(编辑|Edit)$/ })
      .or(page.getByRole("button", { name: /^(编辑|Edit)/ })).first().click({ timeout: 30000 });
    await body.waitFor({ state: "visible", timeout: 120000 });
  }
  await page.locator("[role=region][aria-busy=false]").first().waitFor({ timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  return body;
}

export default async function ({ page, log, shot, helpers, args }) {
  const [id, label = "doc", waitMs = "30000"] = args;
  const word = `persist${Date.now().toString(36).slice(-4)}`;
  page.on("response", async (response) => {
    const url = response.url();
    const method = response.request().method();
    if (method !== "GET" && /revisions|staging|database\/upload|collab/.test(url)) {
      log("res", method, String(response.status()), new URL(url).pathname.slice(0, 90));
    }
    if (method === "GET" && /artifact-renditions\/access|storage\/v1/.test(url) && response.ok()) {
      const type = response.headers()["content-type"] || "";
      if (/json/.test(type)) {
        const text = await response.text().catch(() => "");
        if (text.includes(word)) {
          const at = text.indexOf(word);
          log("loaded-json-with-word", text.slice(Math.max(0, at - 220), at + 60).replace(/\s+/g, " "));
        } else log("loaded-json", String(text.length), "no word");
      } else log("loaded", type.slice(0, 60));
    }
  });
  const body = await open(page, helpers, id);
  await body.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type(`${word} tail`, { delay: 15 });
  await page.waitForTimeout(600);
  await page.evaluate(({ sel, word }) => {
    const root = document.querySelector(sel);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent.indexOf(word);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + word.length);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      return;
    }
  }, { sel: BODY, word });
  await page.waitForTimeout(700);
  await page.locator("[data-selection-visible-controls] [data-selection-control-id='bold']").first().click();
  await page.waitForTimeout(300);
  const before = await page.locator(`${BODY} strong`).filter({ hasText: word }).count();
  log("bold-before", String(before));
  const started = Date.now();
  let last = "";
  while (Date.now() - started < Number(waitMs)) {
    const state = await page.locator(LAUNCHER).first().getAttribute("data-save-state").catch(() => null);
    if (state !== last) log("state", String(state), `${((Date.now() - started) / 1000).toFixed(1)}s`);
    last = String(state);
    await page.waitForTimeout(500);
  }
  log("reloading");
  await page.reload({ waitUntil: "domcontentloaded" });
  await open(page, helpers, new URL(page.url()).searchParams.get("item") || id);
  const after = await page.locator(`${BODY} strong`).filter({ hasText: word }).count();
  const present = await page.locator(BODY).first().innerText().then((t) => t.includes(word));
  log("after-reload", JSON.stringify({ word, present, bold: after }));
  await shot(`${label}-persist`);
}
