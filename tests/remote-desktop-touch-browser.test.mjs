// 远程桌面：真 Chromium 的移动触屏上下文（hasTouch + isMobile）与桌面鼠标上下文，
// 真 React Panel/Video、输入调度器与回执计时（esbuild 在内存里打包），**假远控对端**：
// canvas 流提供真实解码视频，DC 记录输入并回传 input_receipt，WS 只传控制消息。
// 触摸 / 键盘全部是浏览器层的真实输入：page.touchscreen.tap、
// CDP Input.dispatchTouchEvent、page.mouse、page.keyboard.insertText / type / press、CDP IME
// 组字——没有调用组件私有 handler。不是真手机，也不是真 iPhone 输入法，更没有操作任何真实
// 电脑；只用私有 fixture，不截图。
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import test from "node:test";

import { chromiumSkip } from "./chromium-availability.mjs";
import { browserMediaFixture } from "./helpers/remote-desktop-browser-media.mjs";

const REPO = resolve(import.meta.dirname, "..");
const PLAYWRIGHT = join(REPO, "node_modules/playwright-core/index.mjs");
const ESBUILD = "/root/projects/oceanleo-app/client-web/node_modules/esbuild/lib/main.js";
const ENTRY = `
import React from "react";
import { createRoot } from "react-dom/client";
import { RemoteDesktopPanel } from "${join(REPO, "src/pages/RemoteDesktopPanel.tsx")}";
import { remoteDesktopClient } from "${join(REPO, "src/api/remote-desktop.ts")}";

const params = new URLSearchParams(location.search);
const width = Number(params.get("w") || 1280);
const height = Number(params.get("h") || 720);
window.__rd = { inputs: [], writes: [], receipts: [], timings: [], control: [], closes: [], created: 0, autoReceipt: true };
// Session signalling is synthetic; input still uses the real openStream/scheduler/DC protocol.
class ControlSocket {
  static OPEN = 1;
  readyState = 1;
  bufferedAmount = 0;
  constructor() { queueMicrotask(() => this.onopen?.()); }
  message(data) { this.onmessage?.({ data: JSON.stringify(data) }); }
  send(raw) {
    const data = JSON.parse(raw);
    window.__rd.control.push(data.type);
    if (data.type === "auth") queueMicrotask(() => this.message({ type: "state", state: "active" }));
    if (data.type === "ping") queueMicrotask(() => this.message({ type: "pong", id: data.id }));
  }
  close() { this.readyState = 3; }
}
window.WebSocket = ControlSocket;
const client = {
  async createSession() {
    window.__rd.created += 1;
    return { ok: true, data: { session_id: "fixture-session", state: "connecting", expires_at: "2099-01-01T00:00:00Z" } };
  },
  async negotiateMedia() {
    return { ok: true, data: { media: { provider: "artc", transport: "artc-v1", data_channel_input: true }, media_status: { state: "publishing", geometry: { width, height } } } };
  },
  async closeSession(deviceId, sessionId) {
    window.__rd.closes.push(sessionId);
    return { ok: true, data: { closed: true } };
  },
  async openStream(deviceId, sessionId, callbacks) {
    const result = await remoteDesktopClient.openStream(deviceId, sessionId, {
      ...callbacks,
      controlTiming(sample) { window.__rd.timings.push(sample); },
    });
    window.__rd.stream = result.data;
    return result;
  },
};
const root = createRoot(document.getElementById("root"));
window.__rd.unmount = () => root.unmount();
root.render(
  React.createElement(RemoteDesktopPanel, {
    deviceId: "fixture-device",
    deviceName: "fixture",
    client,
    onClose: () => { window.__rd.panelClosed = true; },
  }),
);
`;

const HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;font:14px sans-serif}
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

// 只替换认证、远端媒体/信令和文案依赖；不替换 Panel、Video、输入或回执逻辑。
async function bundleFixture() {
  const { build } = createRequire(import.meta.url)(ESBUILD);
  const virtual = {
    "../lib/auth/client": 'export async function accessToken(){ return "fixture-token"; }',
    "../lib/auth/config": 'export const GATEWAY_BASE = "";',
    "./device-settings": 'export function controllerHeaders(){ return {"X-OceanLeo-Controller":"fixture-controller"}; } export async function registerController(){}',
    "./remote-desktop-media": browserMediaFixture,
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
          b.onResolve({ filter: /^(\.\.\/(lib\/auth\/(client|config)|i18n\/ui\/useUI)|\.\/(device-settings|remote-desktop-media))$/ }, (args) => ({
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
  const messages = [];
  page.on("console", (message) => { messages.push(`${message.type()}: ${message.text()}`); });
  page.on("pageerror", (e) => { errors.push(String(e)); console.log(`[browser pageerror] ${e}`); });
  const blocked = [];
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => {
    blocked.push(route.request().url());
    return route.abort();
  });
  context.on("close", () => {
    console.log(`[browser console] ${JSON.stringify(messages)}`);
    console.log(`[browser pageerror] ${JSON.stringify(errors)}`);
  });
  await page.goto(`${origin}/?w=${w}&h=${h}`);
  try {
    await page.waitForSelector('[data-remote-phase="active"][data-remote-video-ready="true"] [data-remote-video]');
    await page.waitForFunction(() => document.querySelector("[data-remote-video]").videoWidth > 0 && !document.querySelector("[data-remote-input]").disabled);
  } catch (error) {
    console.log("[browser mount]", await page.evaluate(() => ({ phase: document.querySelector("[data-remote-phase]")?.getAttribute("data-remote-phase"), text: document.body.innerText, fixture: { created: window.__rd?.created, closes: window.__rd?.closes } })));
    await context.close();
    throw error;
  }
  const cdp = await context.newCDPSession(page);
  const inputs = () => page.evaluate(() => window.__rd.inputs.slice());
  const waitFor = (count) => page.waitForFunction((n) => window.__rd.inputs.length >= n, count);
  /** 画面真正占的那块（object-fit: contain 之后），CSS 像素。 */
  const content = () =>
    page.evaluate(() => {
      const img = document.querySelector("[data-remote-video]");
      const r = img.getBoundingClientRect();
      const aspect = img.videoWidth / img.videoHeight;
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
    const s = await open(browser, origin, { mobile: true, w: 720, h: 1800 });
    const c = await s.content();
    assert.ok(c.left > c.box.left + 5, "夹具必须真有留白才能验证留白不误点");
    assert.equal(await s.page.evaluate(() => getComputedStyle(document.querySelector("[data-remote-stage]")).touchAction), "none");

    const actions = async () => (await s.inputs()).filter((x) => x.kind !== "move");
    const reset = () => s.page.evaluate(() => { window.__rd.inputs.length = 0; });
    // 一次点按只产生一对按下/抬起；坐标按实际视频留白换算。
    const p = await s.at(0.5, 0.25);
    await s.page.touchscreen.tap(p.x, p.y);
    await s.waitFor(2);
    await wait(180);
    let got = await actions();
    assert.deepEqual(got.map((x) => x.kind), ["pointer_down", "pointer_up"]);
    for (const action of got) assert.ok(near(action.x, 0.5) && near(action.y, 0.25), JSON.stringify(action));

    await reset();
    await s.page.touchscreen.tap(c.box.left + 3, c.top + c.height * 0.5);
    await wait(180);
    assert.deepEqual(await s.inputs(), [], "留白不发送任何输入");

    const a = await s.at(0.2, 0.3), b = await s.at(0.7, 0.6);
    await s.touch("touchStart", [a]);
    await s.touch("touchMove", [{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }]);
    await s.touch("touchMove", [b]);
    await s.touch("touchEnd", []);
    await wait(180);
    got = await actions();
    assert.deepEqual(got.map((x) => x.kind), ["pointer_down", "pointer_up"]);
    assert.ok(near(got[0].x, 0.2) && near(got[0].y, 0.3));
    assert.ok(near(got[1].x, 0.7) && near(got[1].y, 0.6));
    assert.ok((await s.inputs()).some((x) => x.kind === "move"), "拖动经过真实移动事件");

    // DC 已立即送出按下；取消必须释放它，不能再发抬起或合成点击。
    await reset();
    await s.touch("touchStart", [a]);
    await s.touch("touchMove", [b]);
    await s.cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await wait(180);
    assert.deepEqual((await actions()).map((x) => x.kind), ["pointer_down", "release_all"]);

    // 第二根手指释放当前按压；触点抬起时不再追加指针事件。
    await reset();
    await s.touch("touchStart", [a, b]);
    await s.touch("touchMove", [a, b]);
    await s.touch("touchEnd", []);
    await wait(180);
    assert.deepEqual((await actions()).map((x) => x.kind), ["pointer_down", "release_all"]);
    await reset();
    await s.page.touchscreen.tap(p.x, p.y);
    await s.waitFor(2);
    assert.deepEqual((await actions()).map((x) => x.kind), ["pointer_down", "pointer_up"]);

    // 快速点两下仍是两对 DC 事件，双击由目标 OS 识别。
    await reset();
    const d = await s.at(0.5, 0.75);
    await s.page.touchscreen.tap(d.x, d.y);
    await s.page.touchscreen.tap(d.x + 1, d.y + 1);
    await s.waitFor(4);
    await wait(300);
    assert.deepEqual((await actions()).map((x) => x.kind), ["pointer_down", "pointer_up", "pointer_down", "pointer_up"]);

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
    await s.page.locator("[data-remote-toolbar-handle]").tap();
    const button = s.page.getByRole("button", { name: "键盘" });
    assert.equal(await button.isVisible(), true, "键盘入口必须可见且可访问");
    assert.equal(await focused(), false, "连接成功本身不能聚焦手机软键盘输入口");
    assert.equal(await s.page.locator("[data-remote-input]").getAttribute("inputmode"), "none");

    // 触摸点按画面不会自己弹键盘。手机宽度下展开的面板挡住画面中部（它贴着右边缘的把手），所以点面板外的
    // 左侧画面：这一下关掉面板，同时照常发给远端；再点把手打开面板去按「键盘」。
    const p = await s.at(0.15, 0.5);
    await s.page.touchscreen.tap(p.x, p.y);
    await s.waitFor(1);
    assert.equal(await focused(), false);

    await s.page.locator("[data-remote-toolbar-handle]").tap();
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
    assert.equal(await typedText(), "你好");
    assert.deepEqual((await s.inputs()).filter((x) => x.kind === "key_down" || x.kind === "key_up"), [
      { kind: "key_down", key: "a" }, { kind: "key_up", key: "a" },
      { kind: "key_down", key: "b" }, { kind: "key_up", key: "b" },
    ]);

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
    assert.equal(await typedText(), "你好好好");
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
      { kind: "key_down", key: "Enter" }, { kind: "key_up", key: "Enter" },
      { kind: "key_down", key: "Backspace" }, { kind: "key_up", key: "Backspace" },
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
    assert.deepEqual((await s.inputs()).slice(beforeIme), [{ kind: "release_all" }], "开始组字释放按键，不能发半成品文字");
    await s.cdp.send("Input.insertText", { text: "你" });
    await wait(400);
    const afterIme = (await s.inputs()).slice(beforeIme);
    assert.deepEqual(afterIme, [{ kind: "release_all" }, { kind: "type", text: "你" }]);
    assert.equal(afterIme.map((x) => x.text ?? "").join(""), "你", JSON.stringify(afterIme));
    t.diagnostic(`chromium IME events: ${JSON.stringify(await s.page.evaluate(() => window.__imeLog))}`);

    // 再点「键盘」收起
    await button.tap();
    assert.equal(await focused(), false);
    assert.equal(await button.getAttribute("aria-pressed"), "false");

    // 断开后，任何输入都不外发
    await button.tap();
    await s.page.getByRole("button", { name: "退出桌面" }).tap();
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

test("点部分可见画面时，聚焦隐藏键盘口不滚动画面或改变远端点击位置", { timeout: 120_000, skip }, async () => {
  await withFixture(async ({ browser, origin }) => {
    const s = await open(browser, origin, { mobile: false, w: 1280, h: 720 });
    try {
      await s.page.evaluate(() => {
        document.querySelector("[data-oceanleo-remote-desktop]").style.marginTop = "500px";
        const spacer = document.createElement("div");
        spacer.style.height = "1200px";
        document.body.append(spacer);
        window.scrollTo(0, 0);
      });
      const p = await s.at(0.5, 0.05);
      assert.ok(p.y > 0 && p.y < 800, "要点的是已可见的画面，不是可视区外的坐标");
      const before = await s.page.locator("[data-remote-video]").boundingBox();
      assert.ok(before.y + before.height > 800, "键盘口仍在可视区下方");
      await s.page.mouse.click(p.x, p.y);
      await wait(180);
      const after = await s.page.locator("[data-remote-video]").boundingBox();
      const got = (await s.inputs()).filter((a) => a.kind !== "move");
      assert.deepEqual(got.map((x) => x.kind), ["pointer_down", "pointer_up"]);
      assert.ok(Math.abs(got[0].x - 0.5) < 1e-6);
      assert.ok(Math.abs(got[0].y - 0.05) < 1e-6);
      assert.ok(Math.abs(after.y - before.y) < 1, "聚焦隐藏输入口不该在按下和抬起之间移动画面");
    } finally {
      await s.context.close();
    }
  }, bundleText);
});

test("固定全屏画面：不同视区中避开留白，再立即输入，坐标准确且点击先送、不重复", { timeout: 120_000, skip }, async () => {
  await withFixture(async ({ browser, origin }) => {
    for (const viewport of [{ width: 1280, height: 800 }, { width: 900, height: 1000 }]) {
      const s = await open(browser, origin, { mobile: false, w: 1280, h: 720 });
      try {
        await s.page.setViewportSize(viewport);
        assert.equal(await s.page.locator("[data-oceanleo-remote-desktop]").evaluate((el) => getComputedStyle(el).position), "fixed");
        const before = await s.page.locator("[data-remote-video]").boundingBox();
        await s.page.evaluate(() => {
          const spacer = document.createElement("div"); spacer.style.height = "2400px"; document.body.append(spacer);
          window.scrollTo(0, 1400);
        });
        const after = await s.page.locator("[data-remote-video]").boundingBox();
        assert.ok(Math.abs(before.y - after.y) < 1, "底层页面滚动不能移动固定远程画面");
        const content = await s.content();
        const blank = content.width < content.box.width - 5
          ? { x: content.box.left + 2, y: content.top + content.height / 2 }
          : { x: content.left + content.width / 2, y: content.box.top + 2 };
        assert.ok(content.width < content.box.width - 5 || content.height < content.box.height - 5, "夹具必须有实际留白");
        await s.page.mouse.click(blank.x, blank.y);
        await wait(180);
        assert.deepEqual(await s.inputs(), [], "留白不发送指针事件");
        await s.page.evaluate(() => {
          window.__rd.inputs.length = 0;
          window.scrollTo(0, 0);
        });
        const point = await s.at(0.95, 0.85);
        await s.page.mouse.click(point.x, point.y);
        await s.page.locator("[data-remote-input]").focus();
        await s.page.keyboard.type("q");
        await s.page.waitForFunction(() => window.__rd.inputs.filter((a) => a.kind !== "move").length >= 4);
        await wait(180);
        const got = (await s.inputs()).filter((a) => a.kind !== "move");
        assert.deepEqual(got.map((a) => a.kind), ["pointer_down", "pointer_up", "key_down", "key_up"]);
        assert.ok(Math.abs(got[0].x - 0.95) < 1e-6);
        assert.ok(Math.abs(got[0].y - 0.85) < 1e-6);
        assert.equal(got[2].key, "q");
        assert.equal(got[3].key, "q");
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
    assert.deepEqual(await kinds(), ["pointer_down", "pointer_up"]);

    p = await s.at(0.6, 0.5);
    await s.page.mouse.dblclick(p.x, p.y);
    await wait(500);
    assert.deepEqual(await kinds(), ["pointer_down", "pointer_up", "pointer_down", "pointer_up", "pointer_down", "pointer_up"]);

    p = await s.at(0.3, 0.6);
    await s.page.mouse.click(p.x, p.y, { button: "right" });
    await wait(300);
    assert.deepEqual((await s.inputs()).filter((x) => x.kind === "pointer_down").map((x) => x.button), ["left", "left", "left", "right"]);

    const beforeDrag = (await s.inputs()).length;
    const a = await s.at(0.2, 0.2);
    const b = await s.at(0.8, 0.7);
    await s.page.mouse.move(a.x, a.y);
    await s.page.mouse.down();
    await s.page.mouse.move(b.x, b.y, { steps: 6 });
    await s.page.mouse.up();
    await wait(300);
    const drag = (await s.inputs()).slice(beforeDrag).filter((x) => x.kind !== "move");
    assert.deepEqual(drag.map((x) => x.kind), ["pointer_down", "pointer_up"]);
    assert.ok(near(drag[0].x, 0.2) && near(drag[1].x, 0.8) && near(drag[1].y, 0.7), JSON.stringify(drag));

    await s.page.mouse.move(p.x, p.y);
    await s.page.mouse.wheel(0, 240);
    await wait(300);
    assert.equal((await s.inputs()).filter((x) => x.kind === "scroll" && x.deltaY === 240).length, 1);

    // 桌面键盘：点击画面聚焦输入口，keydown → 只一次；无「键盘」依赖
    const before = (await s.inputs()).length;
    await s.page.keyboard.type("q");
    await s.page.keyboard.press("Enter");
    await wait(300);
    assert.deepEqual((await s.inputs()).slice(before), [
      { kind: "key_down", key: "q" }, { kind: "key_up", key: "q" },
      { kind: "key_down", key: "Enter" }, { kind: "key_up", key: "Enter" },
    ]);
    assert.deepEqual(s.errors, []);
    await s.context.close();
  }, bundleText);
});

test("DC 终态 input_receipt 才释放输入额度并完成计时，重复或错误会话回执无效", { timeout: 120_000, skip }, async () => {
  await withFixture(async ({ browser, origin }) => {
    const s = await open(browser, origin, { mobile: false, w: 1280, h: 720 });
    try {
      await s.page.evaluate(() => { window.__rd.autoReceipt = false; });
      // 10 个真实按键事件：前 8 个占满窗口，最后一对排队。
      await s.page.locator("[data-remote-input]").focus();
      await s.page.keyboard.type("abcde");
      await wait(120);
      const snapshot = () => s.page.evaluate(() => ({ count: window.__rd.writes.length, timings: window.__rd.timings, diagnostics: window.__rd.stream.diagnostics() }));
      let state = await snapshot();
      assert.equal(state.count, 8);
      assert.equal(state.diagnostics.outstanding_count, 8);
      assert.equal(state.diagnostics.queued_count, 2);
      assert.deepEqual(state.timings, [], "仅写入不能结束回执计时");
      const first = await s.page.evaluate(() => window.__rd.writes[0].seq);
      await s.page.evaluate((seq) => {
        window.__rd.receipt(seq, { sid: "another-session" });
        window.__rd.receipt(seq, { v: 2 });
        window.__rd.receipt(seq, { executed_at_ms: 0 });
      }, first);
      assert.equal((await snapshot()).count, 8);
      assert.deepEqual((await snapshot()).timings, []);
      await s.page.evaluate((seq) => window.__rd.receipt(seq), first);
      state = await snapshot();
      assert.equal(state.count, 9);
      assert.equal(state.timings.length, 1);
      assert.equal(state.timings[0].stage, "input_receipt");
      assert.equal(state.timings[0].seq, first);
      assert.ok(state.timings[0].elapsedMs >= 120);
      await s.page.evaluate((seq) => window.__rd.receipt(seq), first);
      assert.equal((await snapshot()).count, 9, "重复回执不释放第二个额度");
      assert.equal((await snapshot()).timings.length, 1, "同一输入只计时一次");
      await s.page.evaluate(() => window.__rd.receipt(window.__rd.writes[1].seq));
      assert.equal((await snapshot()).count, 10);
      await s.page.evaluate(() => { for (const write of window.__rd.writes.slice(2)) window.__rd.receipt(write.seq); });
      state = await snapshot();
      assert.equal(state.diagnostics.outstanding_count, 0);
      assert.equal(state.diagnostics.queued_count, 0);
      assert.equal(state.timings.length, 10);
      assert.equal(await s.page.evaluate(() => window.__rd.control.includes("input")), false, "WS 不能携带输入");
      assert.deepEqual(s.errors, []);
    } finally { await s.context.close(); }
  }, bundleText);
});

test("DC 指针按下/抬起立即发送，不附加 click，双击不合并且无迟到事件", { timeout: 120_000, skip }, async () => {
  await withFixture(async ({ browser, origin }) => {
    const s = await open(browser, origin, { mobile: false, w: 1280, h: 720 });
    try {
      const point = await s.at(0.5, 0.5);
      await s.page.mouse.move(point.x, point.y);
      await s.page.mouse.down();
      const actions = async () => (await s.inputs()).filter((x) => x.kind !== "move");
      assert.deepEqual((await actions()).map((x) => x.kind), ["pointer_down"], "抬起前按下已经写入 DC");
      await s.page.mouse.up();
      assert.deepEqual((await actions()).map((x) => x.kind), ["pointer_down", "pointer_up"]);
      await s.page.mouse.dblclick(point.x, point.y);
      assert.deepEqual((await actions()).map((x) => x.kind), ["pointer_down", "pointer_up", "pointer_down", "pointer_up", "pointer_down", "pointer_up"]);
      await wait(1100);
      assert.equal((await actions()).length, 6, "没有延迟的 click/double_click 或重放");
      const writes = await s.page.evaluate(() => window.__rd.writes);
      assert.equal(new Set(writes.map((x) => x.seq)).size, writes.length);
      assert.ok(writes.every((x) => x.sid === "fixture-session" && x.v === 1));
      assert.equal(await s.page.evaluate(() => window.__rd.control.includes("input")), false);
      assert.deepEqual(s.errors, []);
    } finally { await s.context.close(); }
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
