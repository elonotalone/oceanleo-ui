// R1a: 谁发出 "Failed to fetch"？在真 Chromium 里让 fetch 在传输层失败，读它的异常。
import { chromium } from "playwright-core";

// 运行时解析 chromium，不写死路径。
//
// 这里原先钉着三条 `/root/.cache/ms-playwright/chromium-1228/...` 的绝对路径。
// 那是**上一次会话装的那个版本号**：换台机器、换个 playwright 版本，三条全是
// ENOENT，脚本还没跑到正题就死在第 11 行。`w25-tests-out-of-repo-paths` 那道闸
// 拦的就是这个，它拦对了。
//
// 先问 playwright 自己（它知道自己装在哪），问不出来再扫一遍缓存目录挑最新的。
const { existsSync, readdirSync } = await import("node:fs");
const { join } = await import("node:path");
const { homedir } = await import("node:os");

function discoverChromium() {
  try {
    const declared = chromium.executablePath();
    if (declared && existsSync(declared)) return declared;
  } catch {
    /* 未注册浏览器时会抛，落到下面扫目录 */
  }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(root)) return "";
  // 版本号降序，优先拿最新的一份；headless shell 与完整 chrome 都收。
  const dirs = readdirSync(root)
    .filter((name) => name.startsWith("chromium"))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const dir of dirs) {
    for (const leaf of ["headless_shell", "chrome"]) {
      const candidate = join(root, dir, "chrome-linux", leaf);
      if (existsSync(candidate)) return candidate;
    }
  }
  return "";
}

const executablePath = discoverChromium();
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
