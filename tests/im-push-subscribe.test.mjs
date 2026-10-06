// W03：推送订阅流程、Service Worker 消息桥、提醒接口调用，以及门户 public/im-sw.js 的 push / click 两条路径
// （用 node:vm 模拟 self / clients 跑真文件）。不联网、不开浏览器。
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SW_PATH = resolve(HERE, "..", "..", "oceanleo", "public", "im-sw.js");

function define(name, value) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

// ===========================================================================
// 提醒接口（notify-api.ts）
// ===========================================================================
globalThis.__apiCtl = { token: "tok", calls: [], responder: null };
const notifyApi = await import(
  await compileModule("src/lib/im/notify-api.ts", {
    "../auth/client": dataModule(`export async function accessToken(){ return globalThis.__apiCtl.token; }`),
    "../auth/config": dataModule(`export const GATEWAY_BASE = "https://gw.test";`),
  })
);

function mockFetch(responder) {
  const ctl = globalThis.__apiCtl;
  ctl.calls = [];
  define("fetch", async (url, init) => {
    ctl.calls.push({ url, init });
    const { status = 200, body = {} } = responder(url, init);
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  });
}

test("notify-api：读设置补全默认值并写缓存；保存带鉴权头与 JSON 体", async () => {
  notifyApi.resetImSettingsCacheForTests();
  globalThis.__apiCtl.token = "tok";
  mockFetch((url, init) =>
    init?.method === "PUT"
      ? { body: { ...JSON.parse(init.body), sound: false } }
      : { body: { presence_invisible: true, sound: "oops" } },
  );
  assert.equal(notifyApi.cachedImSettings(), null);
  const loaded = await notifyApi.fetchImSettings();
  assert.equal(loaded.ok, true);
  assert.equal(loaded.data.presence_invisible, true);
  assert.equal(loaded.data.sound, true, "非布尔值回落默认值");
  assert.equal(loaded.data.email_reminders, true);
  assert.deepEqual(notifyApi.cachedImSettings(), loaded.data);
  const seen = [];
  const off = notifyApi.onImSettingsChange((s) => seen.push(s));
  const saved = await notifyApi.saveImSettings({ email_reminders: false });
  off();
  assert.equal(saved.ok, true);
  const put = globalThis.__apiCtl.calls.at(-1);
  assert.equal(put.url, "https://gw.test/v1/im/settings");
  assert.equal(put.init.method, "PUT");
  assert.equal(put.init.headers.Authorization, "Bearer tok");
  assert.equal(put.init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(put.init.body), { email_reminders: false });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].email_reminders, false);
});

test("notify-api：没有登录不发请求；失败带回契约错误码；网络错误不抛", async () => {
  notifyApi.resetImSettingsCacheForTests();
  globalThis.__apiCtl.token = null;
  mockFetch(() => ({}));
  const anonymous = await notifyApi.fetchImSettings();
  assert.deepEqual(anonymous, { ok: false, status: 401, code: "unauthenticated" });
  assert.equal(globalThis.__apiCtl.calls.length, 0);

  globalThis.__apiCtl.token = "tok";
  mockFetch(() => ({ status: 422, body: { detail: { code: "invalid", message: "x" } } }));
  assert.deepEqual(await notifyApi.saveImSettings({ sound: false }), { ok: false, status: 422, code: "invalid" });

  define("fetch", async () => {
    throw new Error("offline");
  });
  assert.deepEqual(await notifyApi.fetchPushConfig(), { ok: false, status: 0, code: "network" });
});

test("notify-api：后台刷新在缓存新鲜时不再请求", async () => {
  notifyApi.resetImSettingsCacheForTests();
  mockFetch(() => ({ body: {} }));
  notifyApi.refreshImSettingsInBackground();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(globalThis.__apiCtl.calls.length, 1);
  notifyApi.refreshImSettingsInBackground();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(globalThis.__apiCtl.calls.length, 1, "60 秒内不重复拉");
});

test("notify-api：订阅登记与退订的路径与体", async () => {
  mockFetch(() => ({ body: { ok: true } }));
  await notifyApi.registerPushSubscription({ endpoint: "https://e", keys: { p256dh: "a", auth: "b" } });
  await notifyApi.removePushSubscription("https://e");
  const [add, del] = globalThis.__apiCtl.calls;
  assert.equal(add.url, "https://gw.test/v1/im/push/subscriptions");
  assert.equal(add.init.method, "POST");
  assert.deepEqual(JSON.parse(add.init.body).keys, { p256dh: "a", auth: "b" });
  assert.equal(del.init.method, "DELETE");
  assert.deepEqual(JSON.parse(del.init.body), { endpoint: "https://e" });
});

// ===========================================================================
// 推送订阅流程（push-subscribe.ts）
// ===========================================================================
const ps = (globalThis.__psCtl = {
  config: { ok: true, data: { enabled: true, vapid_public_key: "", portal_origin: "https://oceanleo.com" } },
  registerResult: { ok: true, data: { ok: true } },
  settingsResult: { ok: true, data: {} },
  registered: [],
  removed: [],
  saved: [],
});
const pushSubscribe = await import(
  await compileModule("src/shell/messages/notify/push-subscribe.ts", {
    "../../../lib/im/notify-api": dataModule(`
      const c = () => globalThis.__psCtl;
      export async function fetchPushConfig() { return c().config; }
      export async function registerPushSubscription(input) { c().registered.push(input); return c().registerResult; }
      export async function removePushSubscription(endpoint) { c().removed.push(endpoint); return { ok: true, data: { ok: true } }; }
      export async function saveImSettings(patch) { c().saved.push(patch); return c().settingsResult; }
    `),
  })
);

const b64u = (bytes) => Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const SERVER_KEY_BYTES = Uint8Array.from({ length: 65 }, (_, i) => (i === 0 ? 4 : i));
const SERVER_KEY = b64u(SERVER_KEY_BYTES);

function installBrowser({ origin = "https://oceanleo.com", permission = "default", ask = "granted", existing = null, subscribeError = null } = {}) {
  const win = new EventTarget();
  win.location = { origin };
  win.PushManager = class {};
  const calls = { register: [], subscribe: [], unsubscribed: 0, asked: 0 };
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    options: { applicationServerKey: SERVER_KEY_BYTES.buffer.slice(0) },
    toJSON() {
      return { endpoint: this.endpoint, keys: { p256dh: "P", auth: "A" } };
    },
    async unsubscribe() {
      calls.unsubscribed += 1;
      this.gone = true;
      return true;
    },
  };
  let current = existing === "same" ? subscription : existing; // existing 可以是自定义订阅对象
  const registration = {
    pushManager: {
      async getSubscription() {
        return current && !current.gone ? current : null;
      },
      async subscribe(options) {
        calls.subscribe.push(options);
        if (subscribeError) throw subscribeError;
        current = subscription;
        return subscription;
      },
    },
  };
  const container = new EventTarget();
  container.register = async (path, options) => {
    calls.register.push({ path, options });
    return registration;
  };
  container.ready = Promise.resolve(registration);
  container.getRegistration = async () => registration;
  define("window", win);
  define("navigator", { serviceWorker: container, userAgent: "UA/1.0", language: "zh-CN" });
  class FakeNotification {
    static permission = permission;
    static async requestPermission() {
      calls.asked += 1;
      FakeNotification.permission = ask;
      return ask;
    }
  }
  define("Notification", FakeNotification);
  return { win, container, calls, subscription, registration };
}

function resetPs(overrides = {}) {
  Object.assign(ps, {
    config: { ok: true, data: { enabled: true, vapid_public_key: SERVER_KEY, portal_origin: "https://oceanleo.com" } },
    registerResult: { ok: true, data: { ok: true } },
    settingsResult: { ok: true, data: {} },
    registered: [],
    removed: [],
    saved: [],
    ...overrides,
  });
}

test("isPortalOrigin 只认网关指定的 https 门户域", () => {
  const { isPortalOrigin } = pushSubscribe;
  assert.equal(isPortalOrigin("https://oceanleo.com", "https://oceanleo.com"), true);
  assert.equal(isPortalOrigin("https://oceanleo.com/path", "https://oceanleo.com"), true);
  assert.equal(isPortalOrigin("https://oceanleo.com", "https://image.oceanleo.com"), false);
  assert.equal(isPortalOrigin("https://oceanleo.com", "https://oceanleo.com.evil.test"), false);
  assert.equal(isPortalOrigin("http://localhost:3000", "http://localhost:3000"), false, "非 https 不开推送");
  assert.equal(isPortalOrigin("not a url", "https://oceanleo.com"), false);
});

test("urlBase64ToBytes 还原 VAPID 公钥字节", () => {
  assert.deepEqual([...pushSubscribe.urlBase64ToBytes(SERVER_KEY)], [...SERVER_KEY_BYTES]);
});

test("enablePush：权限 → 注册 /im-sw.js → 订阅 → 交给网关 → 推送开关置开", async () => {
  resetPs();
  const env = installBrowser();
  const result = await pushSubscribe.enablePush();
  assert.deepEqual(result, { ok: true });
  assert.equal(env.calls.asked, 1);
  assert.deepEqual(env.calls.register, [{ path: "/im-sw.js", options: { scope: "/" } }]);
  assert.equal(env.calls.subscribe.length, 1);
  assert.equal(env.calls.subscribe[0].userVisibleOnly, true);
  assert.deepEqual([...env.calls.subscribe[0].applicationServerKey], [...SERVER_KEY_BYTES]);
  assert.deepEqual(ps.registered, [
    { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "P", auth: "A" }, user_agent: "UA/1.0" },
  ]);
  assert.deepEqual(ps.saved, [{ push_enabled: true }]);
});

test("enablePush：已有同钥订阅直接复用，换过钥的旧订阅先退掉再订", async () => {
  resetPs();
  let env = installBrowser({ existing: "same", permission: "granted" });
  assert.deepEqual(await pushSubscribe.enablePush(), { ok: true });
  assert.equal(env.calls.subscribe.length, 0, "复用旧订阅");
  assert.equal(env.calls.unsubscribed, 0);

  resetPs();
  const stale = {
    endpoint: "https://fcm.googleapis.com/fcm/send/old",
    options: { applicationServerKey: new Uint8Array(65).buffer },
    async unsubscribe() {
      this.gone = true;
    },
  };
  env = installBrowser({ existing: stale, permission: "granted" });
  assert.deepEqual(await pushSubscribe.enablePush(), { ok: true });
  assert.equal(stale.gone, true);
  assert.equal(env.calls.subscribe.length, 1);
});

test("enablePush：各种失败给出明确原因，且不留半截状态", async () => {
  resetPs();
  installBrowser({ ask: "denied" });
  assert.deepEqual(await pushSubscribe.enablePush(), { ok: false, reason: "denied" });
  assert.deepEqual(ps.saved, []);

  resetPs();
  installBrowser({ origin: "https://image.oceanleo.com" });
  assert.deepEqual(await pushSubscribe.enablePush(), { ok: false, reason: "wrong_origin" });

  resetPs({ config: { ok: true, data: { enabled: false, vapid_public_key: null, portal_origin: "https://oceanleo.com" } } });
  installBrowser();
  assert.deepEqual(await pushSubscribe.enablePush(), { ok: false, reason: "server_off" });

  resetPs({ config: { ok: false, status: 0, code: "network" } });
  installBrowser();
  assert.deepEqual(await pushSubscribe.enablePush(), { ok: false, reason: "network" });

  resetPs();
  installBrowser({ subscribeError: new Error("push service unreachable") });
  assert.deepEqual(await pushSubscribe.enablePush(), { ok: false, reason: "failed" });

  resetPs({ registerResult: { ok: false, status: 422, code: "invalid" } });
  installBrowser();
  assert.deepEqual(await pushSubscribe.enablePush(), { ok: false, reason: "rejected" });
  assert.deepEqual(ps.saved, [], "网关没收下订阅就不把开关置开");

  resetPs();
  define("window", new EventTarget());
  define("navigator", {});
  assert.deepEqual(await pushSubscribe.enablePush(), { ok: false, reason: "unsupported" });
});

test("disablePush：退浏览器订阅、通知网关、把开关置关", async () => {
  resetPs();
  const env = installBrowser({ existing: "same", permission: "granted" });
  assert.equal(await pushSubscribe.disablePush(), true);
  assert.deepEqual(ps.removed, ["https://fcm.googleapis.com/fcm/send/abc"]);
  assert.equal(env.calls.unsubscribed, 1);
  assert.deepEqual(ps.saved, [{ push_enabled: false }]);
  assert.equal(await pushSubscribe.hasLocalSubscription(), false);
});

test("im.open 消息桥：只认本源 Service Worker 发来的 {type:'im.open', conversation_id}", async () => {
  resetPs();
  const env = installBrowser();
  const opened = [];
  env.win.addEventListener("oceanleo:im-open", (event) => opened.push(event.detail));
  const off = pushSubscribe.installImOpenBridge();
  assert.equal(pushSubscribe.installImOpenBridge(), off, "幂等");

  const send = (message) => env.container.dispatchEvent(Object.assign(new Event("message"), message));
  const goodSource = { scriptURL: "https://oceanleo.com/im-sw.js" };
  const good = { type: "im.open", conversation_id: "11111111-1111-1111-1111-111111111111" };

  send({ source: goodSource, origin: "https://oceanleo.com", data: good });
  assert.deepEqual(opened, [{ conversationId: good.conversation_id }]);
  send({ source: goodSource, origin: "https://oceanleo.com", data: { ...good, conversation_id: "talent:abc_1" } });
  assert.equal(opened.length, 2);

  const before = opened.length;
  send({ source: null, origin: "https://oceanleo.com", data: good }); // 没有来源
  send({ source: { scriptURL: "https://oceanleo.com/other-sw.js" }, origin: "https://oceanleo.com", data: good }); // 别的脚本
  send({ source: { scriptURL: "https://evil.test/im-sw.js" }, origin: "https://oceanleo.com", data: good }); // 别的源的脚本
  send({ source: goodSource, origin: "https://evil.test", data: good }); // 消息源不对
  send({ source: goodSource, origin: "https://oceanleo.com", data: { ...good, type: "im.other" } });
  send({ source: goodSource, origin: "https://oceanleo.com", data: { type: "im.open", conversation_id: "../../x" } });
  send({ source: goodSource, origin: "https://oceanleo.com", data: { type: "im.open", conversation_id: "" } });
  send({ source: goodSource, origin: "https://oceanleo.com", data: { type: "im.open", conversation_id: 42 } });
  send({ source: goodSource, origin: "https://oceanleo.com", data: "im.open" });
  send({ source: goodSource, origin: "https://oceanleo.com", data: null });
  assert.equal(opened.length, before, "以上全部忽略");

  off();
  send({ source: goodSource, origin: "https://oceanleo.com", data: good });
  assert.equal(opened.length, before, "卸载后不再响应");
});

// ===========================================================================
// 门户 public/im-sw.js：用 vm 模拟 self / clients 跑真文件
// ===========================================================================
const swTest = existsSync(SW_PATH) ? test : test.skip;
const ORIGIN = "https://oceanleo.com";
const CID = "11111111-1111-1111-1111-111111111111";

function loadServiceWorker({ windows = [], language = "zh-CN", focusFails = false } = {}) {
  const handlers = {};
  const shown = [];
  const opened = [];
  const posted = [];
  const makeClient = (url) => ({
    url,
    async focus() {
      if (focusFails) throw new Error("focus denied");
      this.focused = true;
    },
    postMessage(message) {
      posted.push({ url, message });
    },
  });
  const clientsList = windows.map(makeClient);
  const self = {
    location: { origin: ORIGIN },
    navigator: { language },
    registration: {
      async showNotification(title, options) {
        shown.push({ title, options });
      },
    },
    clients: {
      async matchAll(options) {
        self.matchAllOptions = options;
        return clientsList;
      },
      async openWindow(url) {
        opened.push(url);
      },
    },
    addEventListener(type, handler) {
      handlers[type] = handler;
    },
  };
  const sandbox = { self, URL, encodeURIComponent, Promise, JSON, String };
  vm.runInNewContext(readFileSync(SW_PATH, "utf8"), sandbox, { filename: "im-sw.js" });
  const dispatch = async (type, event) => {
    const waits = [];
    handlers[type]({ ...event, waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
  };
  return { handlers, shown, opened, posted, clientsList, dispatch, self };
}

const pushEvent = (payload) => ({ data: { json: () => (typeof payload === "function" ? payload() : payload) } });
const clickEvent = (data) => ({ notification: { data, close() { this.closed = true; } } });

swTest("im-sw.js：只注册 push 与 notificationclick 两个事件，没有任何执行载荷代码的能力", () => {
  const sw = loadServiceWorker();
  assert.deepEqual(Object.keys(sw.handlers).sort(), ["notificationclick", "push"]);
  const source = readFileSync(SW_PATH, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const forbidden of [/\beval\s*\(/, /new Function/, /importScripts/, /innerHTML/, /document\./, /caches\./, /"fetch"/]) {
    assert.doesNotMatch(source, forbidden, String(forbidden));
  }
});

swTest("im-sw.js push：弹出一条同 tag 覆盖的系统通知，点击地址由会话 id 重新拼成本站链接", async () => {
  const sw = loadServiceWorker();
  await sw.dispatch(
    "push",
    pushEvent({
      title: "小明 · 周会群",
      body: "明天十点开会",
      conversation_id: CID,
      url: "https://evil.test/steal",
      tag: "attacker-chosen",
    }),
  );
  assert.equal(sw.shown.length, 1);
  const { title, options } = sw.shown[0];
  assert.equal(title, "小明 · 周会群");
  assert.equal(options.body, "明天十点开会");
  assert.equal(options.tag, `im:${CID}`, "tag 由会话 id 决定，不采信载荷里的 tag");
  assert.equal(options.renotify, true);
  assert.equal(options.icon, "/icons/icon-192.png");
  assert.deepEqual({ ...options.data }, { url: `${ORIGIN}/?im=${CID}`, conversation_id: CID });
});

swTest("im-sw.js push：载荷里的文字只当纯文本（去控制字符、截断），HTML 与脚本原样当字符", async () => {
  const sw = loadServiceWorker();
  await sw.dispatch(
    "push",
    pushEvent({
      title: "<img src=x onerror=alert(1)>\u202e" + "t".repeat(300),
      body: "a\n\t\u0000b <script>alert(1)</script>" + "x".repeat(500),
      conversation_id: CID,
    }),
  );
  const { title, options } = sw.shown[0];
  assert.ok(title.startsWith("<img src=x onerror=alert(1)>"), "不转义也不执行，作为字符展示");
  assert.ok(title.length <= 120);
  assert.doesNotMatch(title, /[\u202e\u0000]/);
  assert.ok(options.body.length <= 200);
  assert.match(options.body, /^a b <script>/);
  assert.doesNotMatch(options.body, /[\n\t\u0000]/);
});

swTest("im-sw.js push：会话 id 不合格 → 退到收件箱；载荷坏了也弹一条通用提示", async () => {
  const sw = loadServiceWorker();
  for (const bad of ["../../x", "javascript:alert(1)", "a b", "x".repeat(81), 42, null, undefined]) {
    await sw.dispatch("push", pushEvent({ title: "t", body: "b", conversation_id: bad }));
  }
  assert.equal(sw.shown.length, 7);
  for (const { options } of sw.shown) {
    assert.equal(options.tag, "im:inbox");
    assert.equal(options.data.url, `${ORIGIN}/?im=inbox`);
    assert.equal(options.data.conversation_id, "");
  }

  const broken = loadServiceWorker();
  await broken.dispatch("push", pushEvent(() => { throw new SyntaxError("bad json"); }));
  await broken.dispatch("push", { data: null });
  await broken.dispatch("push", pushEvent([1, 2]));
  assert.equal(broken.shown.length, 3, "浏览器要求每条推送都有可见通知");
  assert.equal(broken.shown[0].title, "OceanLeo");
  assert.equal(broken.shown[0].options.body, "你有新消息");
  const english = loadServiceWorker({ language: "en-US" });
  await english.dispatch("push", { data: null });
  assert.equal(english.shown[0].options.body, "You have a new message");
});

swTest("im-sw.js click：已有门户标签页 → 聚焦并只发 {type:'im.open', conversation_id}，不新开窗口", async () => {
  const sw = loadServiceWorker({ windows: [`${ORIGIN}/library`] });
  const event = clickEvent({ url: "https://evil.test/", conversation_id: CID });
  await sw.dispatch("notificationclick", event);
  assert.equal(event.notification.closed, true);
  assert.deepEqual({ ...sw.self.matchAllOptions }, { type: "window", includeUncontrolled: true });
  assert.equal(sw.clientsList[0].focused, true);
  assert.deepEqual(sw.posted.map((p) => ({ ...p.message })), [{ type: "im.open", conversation_id: CID }]);
  assert.deepEqual(Object.keys(sw.posted[0].message).sort(), ["conversation_id", "type"]);
  assert.equal(sw.posted[0].url, `${ORIGIN}/library`, "只发给本源页面");
  assert.deepEqual(sw.opened, []);
});

swTest("im-sw.js click：没有门户标签页 → 新开本站 /?im=<id>，载荷里的外站地址不被采用", async () => {
  const sw = loadServiceWorker({ windows: [] });
  await sw.dispatch("notificationclick", clickEvent({ url: "https://evil.test/", conversation_id: CID }));
  assert.deepEqual(sw.opened, [`${ORIGIN}/?im=${CID}`]);
  assert.deepEqual(sw.posted, []);

  const foreign = loadServiceWorker({ windows: ["https://evil.test/page"] });
  await foreign.dispatch("notificationclick", clickEvent({ conversation_id: CID }));
  assert.deepEqual(foreign.opened, [`${ORIGIN}/?im=${CID}`]);
  assert.deepEqual(foreign.posted, [], "非本源窗口收不到任何消息");
  assert.equal(foreign.clientsList[0].focused, undefined);
});

swTest("im-sw.js click：聚焦被拒绝 → 退回新开窗口；会话 id 不合格 → 打开收件箱；data 缺失不崩", async () => {
  const sw = loadServiceWorker({ windows: [`${ORIGIN}/`], focusFails: true });
  await sw.dispatch("notificationclick", clickEvent({ conversation_id: CID }));
  assert.deepEqual(sw.opened, [`${ORIGIN}/?im=${CID}`]);
  assert.deepEqual(sw.posted, []);

  const bad = loadServiceWorker({ windows: [] });
  await bad.dispatch("notificationclick", clickEvent({ conversation_id: "../x" }));
  assert.deepEqual(bad.opened, [`${ORIGIN}/?im=inbox`]);

  const none = loadServiceWorker({ windows: [] });
  await none.dispatch("notificationclick", clickEvent(undefined));
  assert.deepEqual(none.opened, [`${ORIGIN}/?im=inbox`]);
});
