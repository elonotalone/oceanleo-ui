// R1a: 谁发出 "Failed to fetch"？在真 Chromium 里让 fetch 在传输层失败，读它的异常。
import { chromium } from "playwright-core";

const exePaths = [
  "/root/.cache/ms-playwright/chromium_headless_shell-1228/chrome-linux/headless_shell",
  "/root/.cache/ms-playwright/chromium-1228/chrome-linux/chrome",
  "/root/.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell",
];
const { existsSync } = await import("node:fs");
const executablePath = exePaths.find((p) => existsSync(p));
if (!executablePath) throw new Error("no chromium found");
const browser = await chromium.launch({
  executablePath,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.goto("about:blank");
const out = await page.evaluate(async () => {
  const results = [];
  // ① 端口不通（连接被拒）
  try {
    await fetch("http://127.0.0.1:1/v1/artifacts/current");
  } catch (error) {
    results.push({
      case: "connection-refused",
      ctor: error?.constructor?.name,
      message: error?.message,
      isTypeError: error instanceof TypeError,
    });
  }
  // ② DNS 解析不了（域名不存在）
  try {
    await fetch("https://api-does-not-exist.oceanleo.invalid/v1/artifacts/current");
  } catch (error) {
    results.push({
      case: "dns-failure",
      ctor: error?.constructor?.name,
      message: error?.message,
      isTypeError: error instanceof TypeError,
    });
  }
  // ③ CORS 被拦（跨域没有 ACAO 头）
  try {
    await fetch("https://example.com/v1/artifacts/current", {
      headers: { Authorization: "Bearer x" },
    });
  } catch (error) {
    results.push({
      case: "cors-blocked",
      ctor: error?.constructor?.name,
      message: error?.message,
      isTypeError: error instanceof TypeError,
    });
  }
  return results;
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
