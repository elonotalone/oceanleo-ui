// W08 probe: why an offline md save does (not) recover after reconnect + retry.
// Usage:
//   bash harness/mint.sh | OUT_DIR=/tmp/w08-probe THEME=light \
//     node harness/run.mjs evidence/W08/scenarios/offline-retry-probe.mjs <artifactId> <label>
const BODY = ".oleo-richdoc";
const LAUNCHER = "[data-workspace-save-launcher]";

async function launcherState(page) {
  const el = page.locator(LAUNCHER).first();
  const state = await el.getAttribute("data-save-state", { timeout: 1500 }).catch(() => null);
  const title = await el.getAttribute("title", { timeout: 1500 }).catch(() => null);
  return `${state} | ${title}`;
}

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

async function watch(page, log, label, seconds) {
  let last = "";
  for (let i = 0; i < seconds; i += 1) {
    const now = await launcherState(page);
    if (now !== last) log(label, `${i}s`, now);
    last = now;
    await page.waitForTimeout(1000);
  }
  return last;
}

export default async function ({ page, context, log, shot, helpers, args }) {
  const [id, label = "doc"] = args;
  let online = true;
  page.on("console", (message) => {
    const text = message.text();
    if (!online || /save|保存|draft|草稿|autosave|chunk/i.test(text)) log("console", message.type(), text.slice(0, 300));
  });
  page.on("request", (request) => {
    if (online && request.method() !== "GET") log("req", request.method(), new URL(request.url()).pathname.slice(0, 120));
  });
  page.on("response", (response) => {
    if (response.request().method() !== "GET") log("res", String(response.status()), new URL(response.url()).pathname.slice(0, 120));
  });
  page.on("requestfailed", (request) => log("reqfail", request.method(), new URL(request.url()).pathname.slice(0, 120), request.failure()?.errorText || ""));
  const body = await open(page, helpers, log, id);
  log("opened", await launcherState(page));
  online = false;
  await context.setOffline(true);
  await body.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(` W08-probe-${Date.now().toString(36).slice(-4)}`, { delay: 25 });
  await watch(page, log, "offline", 12);
  await shot(`${label}-probe-offline`);
  await context.setOffline(false);
  online = true;
  log("online");
  await watch(page, log, "online-no-click", 8);
  await page.locator(LAUNCHER).first().click();
  const retry = page.locator("[data-workspace-save-action-id='retry']").first();
  const hasRetry = await retry.waitFor({ timeout: 5000 }).then(() => true, () => false);
  log("retry-visible", String(hasRetry));
  if (hasRetry) await retry.click();
  const after = await watch(page, log, "after-retry", 40);
  await shot(`${label}-probe-after-retry`);
  const issues = await page.locator("nextjs-portal").count().catch(() => 0);
  log("next-portals", String(issues), "final", after);
}
