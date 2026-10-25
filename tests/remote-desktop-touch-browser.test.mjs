// 远程桌面：真 Chromium 的移动触屏上下文（hasTouch + isMobile）与桌面鼠标上下文，
// 真 React 组件（esbuild 在内存里打包，不落盘、不碰任何构建产物），**假远控客户端**：
// 动作只被记录到页面里的数组。触摸 / 键盘全部是浏览器层的真实输入：page.touchscreen.tap、
// CDP Input.dispatchTouchEvent、page.mouse、page.keyboard.insertText / type / press、CDP IME
// 组字——没有调用组件私有 handler。不是真手机，也不是真 iPhone 输入法，更没有操作任何真实
// 电脑；只用私有 fixture，不截图。
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { chromiumSkip } from "./chromium-availability.mjs";

const REPO = resolve(import.meta.dirname, "..");
const PLAYWRIGHT = join(REPO, "node_modules/playwright-core/index.mjs");
const ESBUILD = "/root/projects/oceanleo-app/client-web/node_modules/esbuild/lib/main.js";
const PNG_1X1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const ENTRY = `
import React from "react";
import { createRoot } from "react-dom/client";
import { RemoteDesktopPanel } from "${join(REPO, "src/pages/RemoteDesktopPanel.tsx")}";

const params = new URLSearchParams(location.search);
const width = Number(params.get("w") || 1280);
const height = Number(params.get("h") || 720);
window.__rd = { inputs: [], closes: [], created: 0 };
let sequence = 0;
const client = {
  async createSession() {
    window.__rd.created += 1;
    return { ok: true, data: { session_id: "fixture-session", state: "connecting", expires_at: "2099-01-01T00:00:00Z" } };
  },
  async getFrame() {
    await new Promise((r) => setTimeout(r, 20));
    sequence += 1;
    return { ok: true, data: { state: "active", frame: { image: "${PNG_1X1}", width, height, sequence } } };
  },
  async sendInput(deviceId, sessionId, seq, action) {
    window.__rd.inputs.push(action);
    return { ok: true, data: { accepted: true, seq } };
  },
  async closeSession(deviceId, sessionId) {
    window.__rd.closes.push(sessionId);
    return { ok: true, data: { closed: true } };
  },
};
createRoot(document.getElementById("root")).render(
  React.createElement(RemoteDesktopPanel, {
    deviceId: "fixture-device",
    deviceName: "fixture",
    client,
    onClose: () => { window.__rd.panelClosed = true; },
    frameIntervalMs: 30,
    doubleClickWindowMs: 120,
  }),
);
`;

const HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;font:14px sans-serif}
  [data-oceanleo-remote-desktop]{padding:8px}
  [data-remote-stage]{position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;min-height:192px;background:#111}
  [data-remote-frame]{display:block;width:100%;max-height:70vh;object-fit:contain}
  [data-remote-input]{position:absolute;bottom:8px;left:8px;width:20px;height:20px;opacity:0;pointer-events:none;font-size:16px}
</style></head><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>`;

function serve(bundle) {
  const server = createServer((req, res) => {
    const path = (req.url || "/").split("?")[0];
    res.statusCode = 200;
    if (path === "/bundle.js") {
      res.setHeader("content-type", "text/javascript");
      res.end(bundle);
    } else {
      res.setHeader("content-type", "text/html");
      res.end(HTML);
    }
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 在内存里打包（esbuild 不落盘），不覆盖任何构建产物；两个与网络 / 文案相关的模块换成桩。
async function bundleFixture() {
  const { build } = createRequire(import.meta.url)(ESBUILD);
  const virtual = {
    "../api/remote-desktop": "export const remoteDesktopClient = undefined;",
    "../i18n/ui/useUI": `export function useUI(){ return (v, vars) => v.replace(/\\{(\\w+)\\}/g, (_, k) => String((vars||{})[k] ?? "")); }`,
  };
  const result = await build({
    stdin: { contents: ENTRY, resolveDir: REPO, loader: "tsx", sourcefile: "entry.tsx" },
    bundle: true,
    write: false,
    format: "esm",
    jsx: "automatic",
    outfile: "bundle.js",
    nodePaths: [join(REPO, "node_modules")],
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "silent",
    plugins: [
      {
        name: "fixture-virtual",
        setup(b) {
          b.onResolve({ filter: /^\.\.\/(api\/remote-desktop|i18n\/ui\/useUI)$/ }, (args) => ({
            path: args.path,
            namespace: "virtual",
          }));
          b.onLoad({ filter: /.*/, namespace: "virtual" }, (args) => ({ contents: virtual[args.path], loader: "js", resolveDir: REPO }));
        },
      },
    ],
  });
  return result.outputFiles[0].text;
}

async function open(browser, origin, { mobile, w, h }) {
  const context = await browser.newContext(
    mobile
      ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
      : { viewport: { width: 1280, height: 800 } },
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const blocked = [];
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => {
    blocked.push(route.request().url());
    return route.abort();
  });
  await page.goto(`${origin}/?w=${w}&h=${h}`);
  await page.waitForSelector('[data-remote-phase="active"] [data-remote-frame]');
  await page.waitForFunction(() => document.querySelector("[data-remote-frame]").complete);
  const cdp = await context.newCDPSession(page);
  const inputs = () => page.evaluate(() => window.__rd.inputs.slice());
  const waitFor = (count) => page.waitForFunction((n) => window.__rd.inputs.length >= n, count);
  /** 画面真正占的那块（object-fit: contain 之后），CSS 像素。 */
  const content = () =>
    page.evaluate(() => {
      const img = document.querySelector("[data-remote-frame]");
      const r = img.getBoundingClientRect();
      const q = new URLSearchParams(location.search);
      const aspect = Number(q.get("w")) / Number(q.get("h"));
      const scale = Math.min(r.width / aspect, r.height);
      const cw = scale * aspect;
      const ch = scale;
      return {
        left: r.left + (r.width - cw) / 2,
        top: r.top + (r.height - ch) / 2,
        width: cw,
        height: ch,
        box: { left: r.left, top: r.top, width: r.width, height: r.height },
      };
    });
  const at = async (fx, fy) => {
    const c = await content();
    return { x: c.left + c.width * fx, y: c.top + c.height * fy };
  };
  const touch = (type, points) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id: p.id ?? id })) });
  return { context, page, cdp, errors, blocked, inputs, waitFor, content, at, touch };
}

const near = (a, b, eps = 0.02) => Math.abs(a - b) <= eps;
const skip = chromiumSkip();
const bundleText = skip ? "" : await bundleFixture();

test("移动触屏上下文：点按 / 拖动 / 取消 / 多指 / 留白 / 双击（真实触摸事件）", { timeout: 120_000, skip }, async () => {
  await withFixture(async ({ browser, origin }) => {
    // 竖屏的远程电脑：在 390 宽手机上，画面左右会有 object-fit 留白。
    const s = await open(browser, origin, { mobile: true, w: 720, h: 1280 });
    const c = await s.content();
    assert.ok(c.left > c.box.left + 5, "夹具必须真有留白才能验证留白不误点");
    assert.equal(await s.page.evaluate(() => getComputedStyle(document.querySelector("[data-remote-stage]")).touchAction), "none");

    // 1) 一次真实触摸点按 → 恰好一个 click（比例坐标正确），之后没有第二个
    const p = await s.at(0.5, 0.25);
    await s.page.touchscreen.tap(p.x, p.y);
    await s.waitFor(1);
    await wait(500);
    let got = await s.inputs();
    assert.equal(got.length, 1, JSON.stringify(got));
    assert.equal(got[0].kind, "click");
    assert.ok(near(got[0].x, 0.5) && near(got[0].y, 0.25), JSON.stringify(got[0]));

    // 2) 点在留白上：不产生点击
    await s.page.touchscreen.tap(c.box.left + 3, c.top + c.height * 0.5);
    await wait(500);
    assert.equal((await s.inputs()).length, 1);

    // 3) 触摸拖动 → 一个 drag，起止点正确
    const a = await s.at(0.2, 0.3);
    const b = await s.at(0.7, 0.6);
    await s.touch("touchStart", [a]);
    await s.touch("touchMove", [{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }]);
    await s.touch("touchMove", [b]);
    await s.touch("touchEnd", []);
    await s.waitFor(2);
    await wait(300);
    got = await s.inputs();
    assert.equal(got.length, 2, JSON.stringify(got));
    assert.equal(got[1].kind, "drag");
    assert.ok(near(got[1].x, 0.2) && near(got[1].y, 0.3) && near(got[1].toX, 0.7) && near(got[1].toY, 0.6), JSON.stringify(got[1]));

    // 4) touchCancel（浏览器接管手势）→ 什么都不发
    await s.touch("touchStart", [a]);
    await s.touch("touchMove", [b]);
    await s.cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await wait(500);
    assert.equal((await s.inputs()).length, 2);

    // 5) 双指 → 什么都不发；之后单指仍正常
    await s.touch("touchStart", [a, b]);
    await s.touch("touchMove", [a, b]);
    await s.touch("touchEnd", []);
    await wait(500);
    assert.equal((await s.inputs()).length, 2);
    await s.page.touchscreen.tap(p.x, p.y);
    await s.waitFor(3);
    await wait(300);
    assert.equal((await s.inputs()).length, 3);

    // 6) 快速点两下 → 一个 double_click（不是 click + double_click）
    const d = await s.at(0.5, 0.75);
    await s.page.touchscreen.tap(d.x, d.y);
    await s.page.touchscreen.tap(d.x + 1, d.y + 1);
    await s.waitFor(4);
    await wait(500);
    got = await s.inputs();
    assert.deepEqual(got.slice(3).map((x) => x.kind), ["double_click"], JSON.stringify(got.slice(3)));

    assert.deepEqual(s.blocked, [], "没有任何外部请求");
    assert.deepEqual(s.errors, []);
    await s.context.close();
  }, bundleText);
});

test("移动触屏上下文：「键盘」按钮在真实点按里聚焦输入口；insertText / IME / 换行 / 删除各只发一次；关闭后不外发", { timeout: 120_000, skip }, async (t) => {
  await withFixture(async ({ browser, origin }) => {
    const s = await open(browser, origin, { mobile: true, w: 1280, h: 720 });
    const typedText = async () => (await s.inputs()).filter((x) => x.kind === "type").map((x) => x.text).join("");
    const focused = () => s.page.evaluate(() => document.activeElement?.hasAttribute("data-remote-input"));
    const button = s.page.getByRole("button", { name: "键盘" });
    assert.equal(await button.isVisible(), true, "键盘入口必须可见且可访问");

    // 触摸点按画面不会自己弹键盘
    const p = await s.at(0.5, 0.5);
    await s.page.touchscreen.tap(p.x, p.y);
    await s.waitFor(1);
    assert.equal(await focused(), false);

    await button.tap();
    assert.equal(await focused(), true);
    assert.equal(await button.getAttribute("aria-pressed"), "true");
    await wait(300); // 多个取帧周期，输入口不能掉焦
    assert.equal(await focused(), true);

    // 软键盘式输入：只有 beforeinput/input（insertText），没有 keydown
    await s.page.keyboard.insertText("你好");
    await wait(300);
    assert.equal(await typedText(), "你好");

    // 真实按键：keydown 处理后浏览器不再有 input，所以字符只出现一次
    await s.page.keyboard.type("ab");
    await wait(300);
    assert.equal(await typedText(), "你好ab");

    // 连续敲同一个字：必须都发；并记录真实 Chromium 的 insertText input 触发时输入口里确有这段文字
    // （迟到回声的判据：value 里没有 data 才是回声）。
    await s.page.evaluate(() => {
      const el = document.querySelector("[data-remote-input]");
      window.__textLog = [];
      el.addEventListener("input", (e) => window.__textLog.push({ inputType: e.inputType, data: e.data, value: el.value }), true);
    });
    await s.page.keyboard.insertText("好");
    await s.page.keyboard.insertText("好");
    await wait(300);
    assert.equal(await typedText(), "你好ab好好");
    const textLog = await s.page.evaluate(() => window.__textLog);
    t.diagnostic(`chromium insertText events: ${JSON.stringify(textLog)}`);
    assert.equal(textLog.length, 2);
    for (const entry of textLog) assert.equal(entry.value, entry.data, JSON.stringify(entry));

    // 换行 / 删除（真实 keydown 路径）各一次
    const before = (await s.inputs()).length;
    await s.page.keyboard.press("Enter");
    await s.page.keyboard.press("Backspace");
    await wait(300);
    assert.deepEqual((await s.inputs()).slice(before), [
      { kind: "keypress", key: "Enter" },
      { kind: "keypress", key: "Backspace" },
    ]);

    // 真实 IME 组字（CDP）：组字中不发，提交后只发一次
    const beforeIme = (await s.inputs()).length;
    // 只读观察：记录这个 Chromium 真实发出的事件顺序与当时输入口的值（作为去重判据的实证）。
    await s.page.evaluate(() => {
      const el = document.querySelector("[data-remote-input]");
      window.__imeLog = [];
      for (const type of ["compositionstart", "compositionupdate", "compositionend", "beforeinput", "input"]) {
        el.addEventListener(type, (e) => window.__imeLog.push({ type, inputType: e.inputType, data: e.data, composing: e.isComposing, value: el.value }), true);
      }
    });
    await s.cdp.send("Input.imeSetComposition", { text: "ni", selectionStart: 2, selectionEnd: 2 });
    await wait(200);
    assert.equal((await s.inputs()).length, beforeIme, "组字中不能发半成品");
    await s.cdp.send("Input.insertText", { text: "你" });
    await wait(400);
    const afterIme = (await s.inputs()).slice(beforeIme);
    assert.equal(afterIme.map((x) => x.text ?? "").join(""), "你", JSON.stringify(afterIme));
    t.diagnostic(`chromium IME events: ${JSON.stringify(await s.page.evaluate(() => window.__imeLog))}`);

    // 再点「键盘」收起
    await button.tap();
    assert.equal(await focused(), false);
    assert.equal(await button.getAttribute("aria-pressed"), "false");

    // 断开后，任何输入都不外发
    await button.tap();
    await s.page.getByRole("button", { name: "断开" }).tap();
    await wait(200);
    const closedAt = (await s.inputs()).length;
    await s.page.keyboard.insertText("不应发送");
    await s.page.keyboard.type("zz");
    await s.page.touchscreen.tap(p.x, p.y);
    await wait(500);
    assert.equal((await s.inputs()).length, closedAt);
    assert.equal((await s.page.evaluate(() => window.__rd.closes)).length >= 1, true);
    assert.deepEqual(s.errors, []);
    await s.context.close();
  }, bundleText);
});

test("真实验收点击：画面滚入视区、避开留白，再立即输入，点击先送且不重复", { timeout: 120_000, skip }, async () => {
  const driver = await import(pathToFileURL("/root/projects/oceanleo-app/acceptance-runner/desktop/remote_web.mjs").href);
  await withFixture(async ({ browser, origin }) => {
    for (const offset of [0, 1400]) {
      const s = await open(browser, origin, { mobile: false, w: 1280, h: 720 });
      try {
        await s.page.evaluate((top) => {
          document.querySelector("[data-oceanleo-remote-desktop]").style.marginTop = `${top}px`;
          window.scrollTo(0, 0);
        }, offset);
        if (offset) {
          const box = await s.page.locator("[data-remote-frame]").boundingBox();
          assert.ok(box.y > 800, "先确认画面在可视区之外，不能假设 mouse.click 会自动滚动");
        }
        // 原验收算法直接乘元素外框：此点在留白里，或根本在 viewport 外，组件不会发出 click。
        const oldBox = await s.page.locator("[data-remote-frame]").boundingBox();
        await s.page.mouse.click(oldBox.x + oldBox.width * 0.95, oldBox.y + oldBox.height * 0.85);
        await wait(180);
        assert.equal((await s.inputs()).filter((a) => a.kind === "click").length, 0);
        await s.page.evaluate(() => { window.__rd.inputs.length = 0; });
        await driver.clickRemoteFrame(s.page, 0.95, 0.85);
        await s.page.locator("[data-remote-input]").focus();
        await s.page.keyboard.type("q");
        await s.page.waitForFunction(() => window.__rd.inputs.filter((a) => a.kind !== "move").length >= 2);
        await wait(180);
        const got = (await s.inputs()).filter((a) => a.kind !== "move");
        assert.deepEqual(got.map((a) => a.kind), ["click", "type"]);
        assert.ok(Math.abs(got[0].x - 0.95) < 1e-6);
        assert.ok(Math.abs(got[0].y - 0.85) < 1e-6);
        assert.equal(got[1].text, "q");
        assert.deepEqual(s.errors, []);
      } finally {
        await s.context.close();
      }
    }
  }, bundleText);
});

test("桌面鼠标上下文：点击 / 双击 / 右击 / 拖动 / 滚轮 / 键盘 各只发一次（指针路径，无兼容鼠标事件重复）", { timeout: 120_000, skip }, async () => {
  await withFixture(async ({ browser, origin }) => {
    const s = await open(browser, origin, { mobile: false, w: 1280, h: 720 });
    const kinds = async () => (await s.inputs()).filter((x) => x.kind !== "move").map((x) => x.kind);

    let p = await s.at(0.4, 0.4);
    await s.page.mouse.click(p.x, p.y);
    await wait(500);
    assert.deepEqual(await kinds(), ["click"]);

    p = await s.at(0.6, 0.5);
    await s.page.mouse.dblclick(p.x, p.y);
    await wait(500);
    assert.deepEqual(await kinds(), ["click", "double_click"]);

    p = await s.at(0.3, 0.6);
    await s.page.mouse.click(p.x, p.y, { button: "right" });
    await wait(300);
    assert.deepEqual((await s.inputs()).filter((x) => x.kind === "click").map((x) => x.button), ["left", "right"]);

    const a = await s.at(0.2, 0.2);
    const b = await s.at(0.8, 0.7);
    await s.page.mouse.move(a.x, a.y);
    await s.page.mouse.down();
    await s.page.mouse.move(b.x, b.y, { steps: 6 });
    await s.page.mouse.up();
    await wait(300);
    const drag = (await s.inputs()).filter((x) => x.kind === "drag");
    assert.equal(drag.length, 1);
    assert.ok(near(drag[0].x, 0.2) && near(drag[0].toX, 0.8) && near(drag[0].toY, 0.7), JSON.stringify(drag[0]));

    await s.page.mouse.move(p.x, p.y);
    await s.page.mouse.wheel(0, 240);
    await wait(300);
    assert.ok((await s.inputs()).some((x) => x.kind === "scroll" && x.deltaY > 0));

    // 桌面键盘：点击画面聚焦输入口，keydown → 只一次；无「键盘」依赖
    const before = (await s.inputs()).length;
    await s.page.keyboard.type("q");
    await s.page.keyboard.press("Enter");
    await wait(300);
    assert.deepEqual((await s.inputs()).slice(before), [
      { kind: "type", text: "q" },
      { kind: "keypress", key: "Enter" },
    ]);
    assert.deepEqual(s.errors, []);
    await s.context.close();
  }, bundleText);
});

async function withFixture(run, bundleText) {
  let server;
  let browser;
  try {
    server = await serve(bundleText);
    const { chromium } = await import(PLAYWRIGHT);
    browser = await chromium.launch({ headless: true, timeout: 30_000 });
    await run({ browser, origin: `http://127.0.0.1:${server.address().port}` });
  } finally {
    await browser?.close();
    server?.close();
  }
}
