// Authorized isolated CN LeoDev acceptance. No credentials or pairing codes are logged.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const evidence = "/tmp/local-browser-ui-evidence";
await mkdir(evidence, { recursive: true, mode: 0o700 });
const status = await fetch("http://127.0.0.1:8094/status").then(r => r.json());
const slot = (status.slots || [status]).find(s => s.phase === "ready" && s.site?.edition === "cn");
assert.ok(slot?.previewUrl, "Ready CN preview required");
const origin = new URL(slot.previewUrl).origin;
assert.match(origin, /^https:\/\/p-[a-f0-9]{32}\.dev\.oceanleo\.com$/);
const auth = JSON.parse(execFileSync("python3", ["-c", `
import importlib.util,json,urllib.request
from pathlib import Path
s=importlib.util.spec_from_file_location('env_tools','/opt/cursor-workspaces/oceandino/deploy/dev-cn/env_tools.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
o=m.load_env(Path('/etc/oceandino/dev-cn-operator.env')); i=m.load_env(Path('/etc/oceandino/dev-cn-identity.env'))
r=urllib.request.Request('http://127.0.0.1:59999/token?grant_type=password',data=json.dumps({'email':o['OCEANLEO_DEV_CN_OPERATOR_EMAIL'],'password':o['OCEANLEO_DEV_CN_OPERATOR_PASSWORD']}).encode(),headers={'apikey':i['OCEANLEO_ANON_KEY'],'Content-Type':'application/json'})
with urllib.request.urlopen(r,timeout=20) as f: print(f.read().decode())
`], { encoding: "utf8", maxBuffer: 1024 * 1024 }));
const apiBase = "http://127.0.0.1:8018/v1/local-browser";
async function api(path, method = "GET", body) {
  const r = await fetch(apiBase + path, { method, headers: { Authorization: `Bearer ${auth.access_token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  assert.ok(r.ok, `Development API ${path.split("/")[1]} status ${r.status}`);
  return r.json();
}
// Optional recovery after an interrupted prior run; the original values are supplied by the owner.
if (process.env.VU_RESTORE_PREFERENCES) await api("/preferences", "PATCH", JSON.parse(process.env.VU_RESTORE_PREFERENCES));
const before = await api("/devices");
const unique = `VU isolated ${Date.now()}`;
let temporaryDevice;
let browser;
const checks = [];
function pass(value) { checks.push(value); console.log(`PASS ${value}`); }
try {
  browser = await chromium.launch({ executablePath: "/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, locale: "zh-CN", acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
  const cookieValue = "base64-" + Buffer.from(JSON.stringify(auth)).toString("base64url");
  const chunks = cookieValue.match(/.{1,3180}/g);
  const cookies = chunks.map((value, index) => ({ name: chunks.length === 1 ? "sb-id-cn-auth-token" : `sb-id-cn-auth-token.${index}`, value }));
  await context.addInitScript(({ cookies }) => {
    if (!localStorage.getItem("oceanleo-leodev-auth-overlay")) localStorage.setItem("oceanleo-leodev-auth-overlay", JSON.stringify(cookies));
  }, { cookies });
  await context.addCookies(cookies.map(c => ({ ...c, url: origin, secure: true, sameSite: "Lax" })));
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on("pageerror", error => runtimeErrors.push(error.message.slice(0, 160)));
  const panel = page.locator("[data-my-browser-panel]");
  if (!process.argv.includes("--chat-only")) {
  await page.goto(`${origin}/settings/connectors`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await panel.waitFor({ timeout: 120000 });
  await panel.getByRole("combobox").waitFor({ timeout: 45000 });
  assert.ok(/Chrome|Edge/.test(await panel.innerText()), "Browser installation guidance visible");
  assert.ok(/网页内容会发送给服务器和模型/.test(await panel.innerText()), "Page content disclosure visible");
  assert.equal(await panel.locator("input[readonly]").first().inputValue(), "https://api-cn.dev.oceanleo.com");
  pass("CN settings mounts authenticated My Browser and correct development gateway");
  await panel.screenshot({ path: `${evidence}/settings-sanitized.png`, mask: [panel.locator("input"), panel.locator("li")] });
  const downloadReady = page.waitForEvent("download");
  await panel.getByRole("button", { name: "下载浏览器扩展 ZIP", exact: true }).click();
  const download = await downloadReady;
  const bytes = await readFile(await download.path());
  assert.equal(bytes.subarray(0, 4).toString("hex"), "504b0304");
  assert.match(download.suggestedFilename(), /\.zip$/);
  pass("Rendered installation button downloads actual ZIP bytes");

  await panel.getByRole("button", { name: "创建配对码", exact: true }).click();
  const codeInput = panel.getByLabel("配对码", { exact: true });
  await codeInput.waitFor();
  const code = await codeInput.inputValue();
  assert.ok(code.length >= 20, "Pairing entropy representation");
  assert.ok(/到期时间：/.test(await panel.innerText()), "Pairing expiry visible");
  await panel.getByRole("button", { name: "复制配对码", exact: true }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), code);
  pass("Real pairing code, expiry display and clipboard copy work");
  await page.clock.install({ time: Date.now() });
  await page.clock.fastForward(11 * 60 * 1000);
  await page.waitForFunction(() => [...document.querySelectorAll("input")].some(input => input.parentElement?.textContent?.includes("配对码") && input.value === ""));
  assert.equal(await panel.getByRole("button", { name: "复制配对码", exact: true }).isDisabled(), true);
  pass("Controlled browser clock expires displayed pairing code and disables copy (server TTL independently tested)");
  const redeemed = await fetch(apiBase + "/pairings/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, name: unique, browser: "chrome" }) });
  assert.ok(redeemed.ok);
  temporaryDevice = (await redeemed.json()).device_id;
  const session = (await api("/sessions", "POST", { goal: unique + " UI acceptance", device_id: temporaryDevice })).session;
  await panel.getByRole("button", { name: "刷新状态", exact: true }).click();
  const row = panel.locator("li").filter({ hasText: unique }).filter({ has: page.getByRole("button", { name: "撤销连接", exact: true }) });
  await row.waitFor();
  assert.ok(/在线/.test(await row.innerText()), "Fixture online state visible");
  await panel.getByRole("combobox").selectOption(temporaryDevice);
  await page.waitForFunction(async ({ apiUrl, token, device }) => { const r = await fetch(apiUrl, { headers: { Authorization: `Bearer ${token}` } }); return (await r.json()).preferences.preferred_device_id === device; }, { apiUrl: "https://api-cn.dev.oceanleo.com/v1/local-browser/devices", token: auth.access_token, device: temporaryDevice });
  const fallback = panel.getByRole("checkbox");
  const patchReady = page.waitForResponse(response => response.url().endsWith("/v1/local-browser/preferences") && response.request().method() === "PATCH");
  await fallback.click();
  assert.ok((await patchReady).ok());
  await page.waitForFunction(async ({ apiUrl, token, allowed }) => { const r = await fetch(apiUrl, { headers: { Authorization: `Bearer ${token}` } }); return (await r.json()).preferences.allow_cross_browser_tasks === allowed; }, { apiUrl: "https://api-cn.dev.oceanleo.com/v1/local-browser/devices", token: auth.access_token, allowed: !before.preferences.allow_cross_browser_tasks });
  await page.waitForFunction(expected => document.querySelector('[data-my-browser-panel] input[type="checkbox"]')?.checked === expected, !before.preferences.allow_cross_browser_tasks);
  pass("Temporary device status, preferred browser and fallback controls persist through real API");
  const task = panel.locator("li").filter({ hasText: unique + " UI acceptance" }).first();
  assert.ok(/等待扩展本地授权/.test(await task.innerText()), "Local approval pending state visible");
  await task.getByRole("button", { name: "查看记录", exact: true }).click();
  await task.getByRole("list", { name: "任务记录", exact: true }).waitFor();
  await task.getByRole("button", { name: "请求接管", exact: true }).click();
  await page.waitForFunction(async ({ url, token }) => { const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }); return (await r.json()).session.state === "paused"; }, { url: `https://api-cn.dev.oceanleo.com/v1/local-browser/sessions/${session.id}`, token: auth.access_token });
  await page.waitForFunction(() => document.querySelector('[data-my-browser-panel]')?.textContent.includes("等待扩展同步"));
  await task.getByRole("button", { name: "请求停止", exact: true }).click();
  await page.waitForFunction(async ({ url, token }) => { const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }); return (await r.json()).session.state === "stopped"; }, { url: `https://api-cn.dev.oceanleo.com/v1/local-browser/sessions/${session.id}`, token: auth.access_token });
  pass("Actual task records, local approval state, takeover and stop show truthful synchronization status");
  const fixtureSeen = (await api("/devices")).items.find(d => d.id === temporaryDevice).last_seen_at;
  const offlineWait = Math.max(0, Date.parse(fixtureSeen) + 62000 - Date.now());
  console.log("WAIT temporary fixture heartbeat expiry (at most62s; no extension is connected)");
  await new Promise(resolve => setTimeout(resolve, offlineWait));
  await panel.getByRole("button", { name: "刷新状态", exact: true }).click();
  await page.waitForFunction(name => [...document.querySelectorAll('[data-my-browser-panel] li')].some(row => row.textContent.includes(name) && row.textContent.includes("离线：打开浏览器和扩展后重试")), unique);
  pass("Actual heartbeat expiry shows offline device and explicit no-cloud-fallback guidance");
  await row.getByRole("button", { name: "撤销连接", exact: true }).click();
  await page.waitForFunction(async ({ url, token, id }) => { const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }); return (await r.json()).items.some(d => d.id === id && d.revoked_at); }, { url: "https://api-cn.dev.oceanleo.com/v1/local-browser/devices", token: auth.access_token, id: temporaryDevice });
  pass("Rendered revoke action revokes only temporary device");

  // Failure injection changes network availability only; successful fixtures above use real endpoints.
  await page.route("**/v1/local-browser/devices", route => route.abort("failed"));
  await panel.getByRole("button", { name: "刷新状态", exact: true }).click();
  await panel.getByRole("alert").waitFor();
  assert.equal(await panel.getByRole("combobox").count(), 0, "No stale online controls after failed refresh");
  await page.unroute("**/v1/local-browser/devices");
  await panel.getByRole("button", { name: "刷新状态", exact: true }).click();
  await panel.getByRole("combobox").waitFor();
  pass("Unavailable gateway produces recoverable error and clears stale online indicators");
  }
  await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 120000 });
  const composer = page.locator("[data-composer-plugins-button]").first();
  await composer.waitFor({ timeout: 60000 });
  // Await React hydration through an actual event handler, without assuming SSR visibility is interactive.
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-composer-plugins-button]');
    return element && Object.keys(element).some(key => key.startsWith("__reactProps$"));
  });
  await composer.click();
  const entry = page.locator("[data-local-browser-entry]");
  try { await entry.waitFor(); }
  catch (error) {
    console.log("CHAT DIAGNOSTIC", JSON.stringify({ route: new URL(page.url()).pathname, composerCount: await page.locator("[data-composer-plugins-button]").count(), expanded: await composer.getAttribute("aria-expanded"), popoverCount: await page.locator("[data-plugins-popover]").count(), entryCount: await entry.count(), runtimeErrorCount: runtimeErrors.length }));
    throw error;
  }
  await page.locator("[data-plugins-popover]").screenshot({ path: `${evidence}/chat-entry-sanitized.png`, mask: [page.locator("[data-plugins-popover] ul")] });
  await entry.click();
  await panel.waitFor({ timeout: 60000 });
  pass("Actual composer entry opens the same My Browser settings panel");
  assert.equal(runtimeErrors.length, 0, `Unexpected page error count ${runtimeErrors.length}`);
  pass("No uncaught rendered-page JavaScript errors");
} finally {
  await browser?.close();
  pass("Isolated browser closed before preference restoration");
  try {
    await api("/preferences", "PATCH", before.preferences);
    if (temporaryDevice) await api(`/devices/${temporaryDevice}`, "DELETE");
    const after = await api("/devices");
    assert.deepEqual(after.preferences, before.preferences, "Original preferences restored");
    for (const existing of before.items) assert.equal(after.items.find(d => d.id === existing.id)?.revoked_at, existing.revoked_at, "Existing devices preserved");
    pass("Original preferences and existing devices preserved");
  } catch (cleanupError) { console.error("CLEANUP FAILED", cleanupError.message); process.exitCode = 1; }
}
console.log(`COMPLETE ${checks.length} rendered checks; sanitized screenshots in ${evidence}`);
