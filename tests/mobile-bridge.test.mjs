/**
 * The phone app loads https://oceanleo.com, not a bundled copy of the site, so
 * every native capability has to be lit from the website side. These tests
 * pin the two halves of that: nothing at all happens in an ordinary browser,
 * and all four system surfaces work behind a faked native host.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  MOBILE_DEGRADATION,
  MOBILE_BRIDGE_GLOBAL,
  MOBILE_NOTICE_EVENT,
  SHARE_EVENT_NAME,
  SHARE_LANDING_PATH,
  TRUSTED_ORIGIN,
  detectNativeHost,
  normalizeTrustedDeepLink,
  queuedDeviceTaskMessage,
  receiveSharedContent,
  registerMobileAsExecutionDevice,
  startMobileBridge,
} from "../src/shell/mobile-bridge.ts";

const MODULE_PATH = fileURLToPath(
  new URL("../src/shell/mobile-bridge.ts", import.meta.url),
);
const MODULE_SOURCE = readFileSync(MODULE_PATH, "utf8");

/* ------------------------------------------------------------------ *
 * Fakes
 * ------------------------------------------------------------------ */

function createFakeWindow() {
  const listeners = new Map();
  const calls = { addEventListener: 0, removeEventListener: 0 };
  const assigned = [];

  class FakeCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }

  return {
    calls,
    assigned,
    dispatched: [],
    listenerCount: (type) => (listeners.get(type) ?? []).length,
    CustomEvent: FakeCustomEvent,
    history: { back() {} },
    location: {
      assign(url) {
        assigned.push(url);
      },
    },
    addEventListener(type, handler) {
      calls.addEventListener += 1;
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      calls.removeEventListener += 1;
      const bucket = listeners.get(type) ?? [];
      const index = bucket.indexOf(handler);
      if (index >= 0) bucket.splice(index, 1);
    },
    dispatchEvent(event) {
      this.dispatched.push(event);
      for (const handler of [...(listeners.get(event.type) ?? [])]) handler(event);
      return true;
    },
  };
}

function createFakeCamera({ photos = "granted", camera = "granted" } = {}) {
  const seen = { pickImages: 0, getPhoto: 0, requested: [] };
  return {
    seen,
    async checkPermissions() {
      return { photos, camera };
    },
    async requestPermissions({ permissions }) {
      seen.requested.push(...permissions);
      return { photos, camera };
    },
    async pickImages() {
      seen.pickImages += 1;
      return { photos: [{ webPath: "capacitor://photo-1" }] };
    },
    async getPhoto() {
      seen.getPhoto += 1;
      return { webPath: "capacitor://shot-1" };
    },
  };
}

function createFakeNotifications({ display = "granted", receive = "granted" } = {}) {
  const seen = { registered: 0, scheduled: [], listeners: [] };
  return {
    seen,
    local: {
      async checkPermissions() {
        return { display };
      },
      async requestPermissions() {
        return { display };
      },
      async schedule(payload) {
        seen.scheduled.push(payload);
      },
    },
    push: {
      async checkPermissions() {
        return { receive };
      },
      async requestPermissions() {
        return { receive };
      },
      async addListener(name) {
        seen.listeners.push(name);
      },
      async register() {
        seen.registered += 1;
      },
    },
  };
}

function createFakeApp({ launchUrl = null } = {}) {
  const handlers = new Map();
  return {
    handlers,
    async getLaunchUrl() {
      return launchUrl ? { url: launchUrl } : null;
    },
    async addListener(name, handler) {
      handlers.set(name, handler);
    },
    async exitApp() {},
  };
}

function createFakeDocument({ files = [] } = {}) {
  return {
    createElement() {
      const input = { files, onchange: null, oncancel: null };
      input.click = () => {
        if (files.length > 0) input.onchange?.();
        else input.oncancel?.();
      };
      return input;
    },
  };
}

/** A window carrying the Capacitor bridge the native shell injects. */
function createNativeWindow(plugins, { platform = "android" } = {}) {
  const win = createFakeWindow();
  win.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => platform,
    Plugins: plugins,
  };
  return win;
}

function nativeSetup(overrides = {}) {
  const camera = overrides.camera ?? createFakeCamera();
  const notifications = overrides.notifications ?? createFakeNotifications();
  const app = overrides.app ?? createFakeApp(overrides.appOptions);
  const win = createNativeWindow({
    Camera: camera,
    App: app,
    LocalNotifications: notifications.local,
    PushNotifications: notifications.push,
  });
  win.document = overrides.document ?? createFakeDocument();
  return { win, camera, notifications, app };
}

/* ------------------------------------------------------------------ *
 * 1. Ordinary browsers must not change by one character
 * ------------------------------------------------------------------ */

test("plain browser: no host, no plugin import, no listener, no global", async () => {
  const win = createFakeWindow();
  let pluginLoads = 0;
  const loadPlugin = (name) => {
    pluginLoads += 1;
    throw new Error(`must not load ${name} in a browser`);
  };

  const handle = await startMobileBridge({ windowRef: win, loadPlugin });

  assert.equal(handle, null);
  assert.equal(pluginLoads, 0, "a browser must not import a single plugin");
  assert.equal(win.calls.addEventListener, 0, "a browser must not gain a listener");
  assert.equal(win[MOBILE_BRIDGE_GLOBAL], undefined);
  assert.equal(detectNativeHost(win), null);
});

test("browser that merely has a Capacitor object is still not a native host", async () => {
  const win = createFakeWindow();
  win.Capacitor = { isNativePlatform: () => false, Plugins: {} };

  assert.equal(detectNativeHost(win), null);
  assert.equal(await startMobileBridge({ windowRef: win }), null);
  assert.equal(win.calls.addEventListener, 0);
});

test("a throwing isNativePlatform is treated as a browser, not as a host", async () => {
  const win = createFakeWindow();
  win.Capacitor = {
    isNativePlatform: () => {
      throw new Error("bridge not ready");
    },
  };

  assert.equal(detectNativeHost(win), null);
  assert.equal(await startMobileBridge({ windowRef: win }), null);
});

test("SSR: the module imports in a process with no window and no document", () => {
  const source = `
    globalThis.window = undefined;
    const mod = await import(${JSON.stringify(MODULE_PATH)});
    if (typeof globalThis.document !== "undefined") throw new Error("document leaked");
    if (mod.detectNativeHost() !== null) throw new Error("host detected without a window");
    if ((await mod.startMobileBridge()) !== null) throw new Error("bridge started without a window");
    process.stdout.write("ssr-ok");
  `;
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", source], {
    encoding: "utf8",
  });
  assert.equal(out.trim(), "ssr-ok");
});

test("importing the module registers nothing on the real global", () => {
  assert.equal(typeof globalThis.window, "undefined");
  assert.equal(globalThis[MOBILE_BRIDGE_GLOBAL], undefined);
});

/* ------------------------------------------------------------------ *
 * 2. Native host: all four surfaces light up
 * ------------------------------------------------------------------ */

test("native host: HarmonyOS shell is detected through its own injected shape", () => {
  const win = createFakeWindow();
  win.__oceanleoNative = { platform: "harmony", plugins: {} };

  const host = detectNativeHost(win);
  assert.equal(host?.kind, "oceanleo");
  assert.equal(host?.platform, "harmony");
});

test("native host: system photo picker runs", async () => {
  const { win, camera } = nativeSetup();
  const handle = await startMobileBridge({ windowRef: win });

  assert.ok(handle, "the bridge must start on a native host");
  assert.equal(handle.host.platform, "android");
  const result = await handle.pickPhotos();

  assert.equal(result.ok, true);
  assert.equal(camera.seen.pickImages, 1);
  assert.equal(result.photos.length, 1);
  handle.dispose();
});

test("native host: system camera runs", async () => {
  const { win, camera } = nativeSetup();
  const handle = await startMobileBridge({ windowRef: win });

  const result = await handle.scanWithCamera();

  assert.equal(result.ok, true);
  assert.equal(camera.seen.getPhoto, 1);
  assert.equal(result.photo.webPath, "capacitor://shot-1");
  handle.dispose();
});

test("native host: a share from another app lands in the site", async () => {
  const { win } = nativeSetup();
  const shared = [];
  const handle = await startMobileBridge({
    windowRef: win,
    onShared: (result) => shared.push(result),
  });

  assert.equal(win.listenerCount(SHARE_EVENT_NAME), 1);
  win.dispatchEvent({
    type: SHARE_EVENT_NAME,
    detail: JSON.stringify({ items: ["content://inbox/a.pdf"], text: "看看这个" }),
  });

  assert.equal(shared.length, 1);
  assert.equal(shared[0].ok, true);
  assert.deepEqual(shared[0].items, ["content://inbox/a.pdf"]);
  assert.equal(shared[0].text, "看看这个");
  handle.dispose();
});

test("native host: notifications are registered and a finished task can notify", async () => {
  const { win, notifications } = nativeSetup();
  const handle = await startMobileBridge({ windowRef: win });

  assert.equal(notifications.seen.registered, 1);
  assert.deepEqual(notifications.seen.listeners, ["registration", "registrationError"]);

  const result = await handle.notifyTask({
    notificationId: 7,
    title: "任务完成",
    body: "报表已生成",
    taskId: "task-7",
  });

  assert.equal(result.ok, true);
  assert.equal(notifications.seen.scheduled.length, 1);
  assert.equal(notifications.seen.scheduled[0].notifications[0].id, 7);
  assert.equal(notifications.seen.scheduled[0].notifications[0].extra.taskId, "task-7");
  handle.dispose();
});

test("native host: a plugin the shell does not provide degrades, it does not throw", async () => {
  const win = createNativeWindow({});
  const handle = await startMobileBridge({ windowRef: win });

  const photos = await handle.pickPhotos();
  const camera = await handle.scanWithCamera();

  assert.equal(photos.ok, false);
  assert.equal(photos.reason, "plugin_unavailable");
  assert.equal(camera.message, MOBILE_DEGRADATION.camera);
  handle.dispose();
});

/* ------------------------------------------------------------------ *
 * 3. Refused permissions say why, and never fail silently
 * ------------------------------------------------------------------ */

test("denied photo permission returns the reason, not silence", async () => {
  const { win } = nativeSetup({ camera: createFakeCamera({ photos: "denied" }) });
  const handle = await startMobileBridge({ windowRef: win });

  const result = await handle.pickPhotos();

  assert.equal(result.ok, false);
  assert.equal(result.capability, "photos");
  assert.equal(result.message, MOBILE_DEGRADATION.photos);
  handle.dispose();
});

test("denied camera permission returns the reason, not silence", async () => {
  const { win } = nativeSetup({ camera: createFakeCamera({ camera: "denied" }) });
  const handle = await startMobileBridge({ windowRef: win });

  const result = await handle.scanWithCamera();

  assert.equal(result.ok, false);
  assert.equal(result.capability, "camera");
  assert.equal(result.message, MOBILE_DEGRADATION.camera);
  handle.dispose();
});

test("denied notification permission is announced on the notice channel", async () => {
  const { win } = nativeSetup({
    notifications: createFakeNotifications({ display: "denied" }),
  });

  const handle = await startMobileBridge({ windowRef: win });

  const notices = win.dispatched.filter((event) => event.type === MOBILE_NOTICE_EVENT);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].detail.ok, false);
  assert.equal(notices[0].detail.message, MOBILE_DEGRADATION.notifications);
  handle.dispose();
});

test("a plugin that throws mid-call degrades instead of crashing the page", async () => {
  const exploding = createFakeCamera();
  exploding.pickImages = async () => {
    throw new Error("native crash");
  };
  const { win } = nativeSetup({ camera: exploding });
  const handle = await startMobileBridge({ windowRef: win });

  const result = await handle.pickPhotos();

  assert.equal(result.ok, false);
  assert.equal(result.reason, "picker_failed");
  handle.dispose();
});

test("a share carrying nothing readable still reports why", async () => {
  const { win } = nativeSetup();
  const shared = [];
  const handle = await startMobileBridge({
    windowRef: win,
    onShared: (result) => shared.push(result),
  });

  win.dispatchEvent({ type: SHARE_EVENT_NAME, detail: JSON.stringify({ items: [] }) });

  assert.equal(shared.length, 0);
  const notices = win.dispatched.filter((event) => event.type === MOBILE_NOTICE_EVENT);
  assert.equal(notices.at(-1).detail.message, MOBILE_DEGRADATION.share);
  assert.equal(receiveSharedContent({}).reason, "empty_share");
  handle.dispose();
});

test("a cancelled file picker reports cancellation rather than an empty success", async () => {
  const { win } = nativeSetup({ document: createFakeDocument({ files: [] }) });
  const handle = await startMobileBridge({ windowRef: win });

  const result = await handle.pickFiles();

  assert.equal(result.ok, false);
  assert.equal(result.reason, "cancelled");
  assert.equal(result.message, MOBILE_DEGRADATION.files);
  handle.dispose();
});

/* ------------------------------------------------------------------ *
 * 4. The three iron rules
 * ------------------------------------------------------------------ */

test("iron rule: a phone never registers as an execution device", () => {
  assert.equal(MODULE_SOURCE.includes("devices/register"), false);
  assert.match(MODULE_SOURCE, /registerMobileAsExecutionDevice/);
  assert.deepEqual(registerMobileAsExecutionDevice(), {
    registered: false,
    role: "remote_controller",
  });
});

test("iron rule: the untrusted user-content domain never appears in this module", () => {
  const hits = MODULE_SOURCE.match(/oceanleo\.app/g) ?? [];
  assert.deepEqual(hits, [], "the user-content domain must not be reachable from here");
  assert.equal(TRUSTED_ORIGIN, "https://oceanleo.com");
});

test("iron rule: deep links accept oceanleo.com and refuse everything else", () => {
  const trusted = normalizeTrustedDeepLink("https://oceanleo.com/tasks/7?tab=log#top");
  assert.equal(trusted.ok, true);
  assert.equal(trusted.path, "/tasks/7?tab=log#top");

  for (const hostile of [
    "https://oceanleo.app/games/evil",
    "https://user-site.oceanleo.app/",
    "http://oceanleo.com/tasks",
    "https://oceanleo.com.attacker.test/tasks",
    "https://evil.test/",
  ]) {
    const result = normalizeTrustedDeepLink(hostile);
    assert.equal(result.ok, false, `${hostile} must be refused`);
    assert.equal(result.reason, "untrusted_origin");
    assert.equal(result.message, MOBILE_DEGRADATION.deepLink);
  }
});

test("iron rule: an untrusted deep link cannot steer navigation", async () => {
  const { win } = nativeSetup({
    appOptions: { launchUrl: "https://oceanleo.app/games/evil" },
  });
  const navigated = [];
  const handle = await startMobileBridge({
    windowRef: win,
    navigate: (path) => navigated.push(path),
  });

  assert.deepEqual(navigated, [], "a hostile launch URL must not navigate the app");
  assert.deepEqual(win.assigned, []);
  const notices = win.dispatched.filter((event) => event.type === MOBILE_NOTICE_EVENT);
  assert.equal(notices.at(-1).detail.message, MOBILE_DEGRADATION.deepLink);
  handle.dispose();
});

test("a trusted deep link navigates inside the site", async () => {
  const { win, app } = nativeSetup();
  const navigated = [];
  const handle = await startMobileBridge({
    windowRef: win,
    navigate: (path) => navigated.push(path),
  });

  await app.handlers.get("appUrlOpen")({ url: `${TRUSTED_ORIGIN}/library?scope=local` });

  assert.deepEqual(navigated, ["/library?scope=local"]);
  handle.dispose();
});

test("iOS hands a shared document in as a file URL, and it is treated as a share", async () => {
  const { win, app } = nativeSetup();
  const shared = [];
  const handle = await startMobileBridge({
    windowRef: win,
    navigate: () => {},
    onShared: (result) => shared.push(result),
  });

  await app.handlers.get("appUrlOpen")({ url: "file:///inbox/report.xlsx" });

  assert.equal(shared.length, 1);
  assert.deepEqual(shared[0].items, ["file:///inbox/report.xlsx"]);
  handle.dispose();
});

test("iron rule: a task for an offline computer stays queued for that computer", () => {
  const queued = queuedDeviceTaskMessage("书房台式机");

  assert.equal(queued.status, "queued");
  assert.equal(queued.executionTarget, "device");
  assert.equal(queued.retryOnCloud, false);
  assert.match(queued.message, /书房台式机/);
  assert.match(queued.message, /离线/);
});

/* ------------------------------------------------------------------ *
 * 5. Lifecycle
 * ------------------------------------------------------------------ */

test("dispose removes every listener and the published global", async () => {
  const { win } = nativeSetup();
  const shared = [];
  const handle = await startMobileBridge({
    windowRef: win,
    onShared: (result) => shared.push(result),
  });

  assert.equal(win[MOBILE_BRIDGE_GLOBAL], handle);
  handle.dispose();

  assert.equal(win.listenerCount(SHARE_EVENT_NAME), 0);
  assert.equal(win[MOBILE_BRIDGE_GLOBAL], undefined);
  win.dispatchEvent({
    type: SHARE_EVENT_NAME,
    detail: JSON.stringify({ text: "after dispose" }),
  });
  assert.equal(shared.length, 0, "a disposed bridge must not keep receiving shares");
});

test("two starts do not stack share receivers on one window", async () => {
  const { win } = nativeSetup();
  const first = await startMobileBridge({ windowRef: win });
  const second = await startMobileBridge({ windowRef: win });

  first.dispose();
  second.dispose();

  assert.equal(win.listenerCount(SHARE_EVENT_NAME), 0);
});

test("a share with no explicit handler lands on the first-party share route", async () => {
  const { win } = nativeSetup();
  const navigated = [];
  const handle = await startMobileBridge({
    windowRef: win,
    navigate: (path) => navigated.push(path),
  });

  win.dispatchEvent({
    type: SHARE_EVENT_NAME,
    detail: JSON.stringify({ text: "帮我总结这段" }),
  });

  assert.deepEqual(navigated, [SHARE_LANDING_PATH]);
  handle.dispose();
});

/* ------------------------------------------------------------------ *
 * 6. No static plugin imports
 * ------------------------------------------------------------------ */

test("plugins are never statically imported", () => {
  const staticImports = MODULE_SOURCE.match(/^\s*import\s[^(]*from\s+["'][^"']+["']/gm) ?? [];
  assert.deepEqual(
    staticImports,
    [],
    "a static plugin import would ship these packages to every browser",
  );
  assert.match(MODULE_SOURCE, /await import\(/);
});
