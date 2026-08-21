/**
 * 手机上的上传口：拍照 / 从相册选择 / 选择文件。
 *
 * 装了 OceanLeo 的手机打开的是 oceanleo.com 本身（Capacitor `server.url`），
 * 所以这三项只能写在网页端组件里，靠「宿主是不是原生」在运行时决定显不显示。
 * 这就带来一条必须机检、不能靠读 diff 相信的约束：
 *
 *   **普通浏览器里，上传口渲染出来的 DOM 与「压根没有这个手机模块」时逐字相同。**
 *
 * 本文件第 1 节就是那条闸：同一个 `LeoComposer` / `InputCard` 编两遍 ——
 * 一遍接真的 `mobile-native-actions`，一遍把它换成什么都不做的桩 —— 在没有
 * Capacitor 的窗口里客户端渲染（effect 都跑过），逐字比较 `innerHTML`。
 * 差一个字节就说明网页端被手机功能改到了。
 *
 * 第 2 节反过来：伪造一个原生宿主，三项必须出现在**既有的**「＋」菜单 /
 * 既有的那颗上传按钮里（不另立一排按钮），点了要真的走桥，拿到的字节要落回
 * 上传口既有的 `onAttachFiles` 通路。
 *
 * 第 3 节是通知的两个时机：挂载时**不**要权限，第一次派活才要；任务完成事件
 * 才推通知，且同一个任务只推一次。
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { compileModule, dataModule, realModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);

/* ------------------------------------------------------------------ *
 * jsdom（经 fabric 传递依赖拿到，本仓没有直接装）
 * ------------------------------------------------------------------ */

const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href
);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://chat.oceanleo.com/",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLFormElement: window.HTMLFormElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  InputEvent: window.InputEvent,
  Blob: window.Blob,
  File: window.File,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const reactUrl = pathToFileURL(require.resolve("react")).href;

/* ------------------------------------------------------------------ *
 * 组件编译台
 * ------------------------------------------------------------------ */

const lazyStub = dataModule(
  "const noop = () => undefined;\n" +
    "export default new Proxy(noop, { get: () => noop });\n" +
    "export const __stub = true;\n",
);

/** 只桩「要 Next 运行时 / 要浏览器重环境 / 与上传无关」的三类，上传那条链编真源码。 */
const OVERRIDES = {
  "../i18n/ui/useUI": dataModule(
    "export function useUI(){ return (zh) => String(zh); }",
  ),
  // 「发送到电脑」要问网关「我的哪几台电脑能收、各自授权了哪些文件夹」，所以登录
  // 令牌要能由测试拨动。**只换 `accessToken` 这一个名字**，同一份模块里别人用的
  // `browserClient` 等照旧走真源码（`export *` 会被下面这行同名声明盖住）。
  // 网关地址不桩：断言只看路径与查询参数，跟真地址无关。
  "../lib/auth/client": dataModule(
    `export * from ${JSON.stringify(realModule("src/lib/auth/client.ts"))};\n` +
      "export async function accessToken(){ return globalThis.__W06_TOKEN__ ?? null; }",
  ),
  "next/navigation": dataModule(
    "export function useRouter(){ return { push(){}, replace(){}, refresh(){}, back(){} }; }\n" +
      "export function useSearchParams(){ return new URLSearchParams(); }\n" +
      "export function usePathname(){ return '/'; }",
  ),
  "./PromptHighlightArea": dataModule(`
    import { createElement, forwardRef } from "${reactUrl}";
    export const PromptHighlightArea = forwardRef(function PromptHighlightArea(props, _ref){
      return createElement("textarea", {
        placeholder: props.placeholder,
        defaultValue: props.value || "",
        readOnly: true,
      });
    });
    export const TemplateFillArea = PromptHighlightArea;
    export function templateSegments(){ return []; }
    export function highlightSegments(){ return []; }
    export function stripPromptPlaceholders(text){ return text; }
  `),
};

/**
 * 「这个手机模块压根不存在」的那一版：所有导出都在，但一个 DOM 都不产、
 * 一个监听都不装。第 1 节拿它当基准。
 */
const NATIVE_MODULE_ABSENT = dataModule(`
  export const TASK_FINISHED_EVENT = "oceanleo:task-finished";
  export function useNativeAttachActions(){ return EMPTY; }
  const EMPTY = [];
  export function NativeAttachSheet(){ return null; }
  export function useNativeTaskNotifications(){}
  export function requestTaskNotificationsOnce(){}
  export function useNativeHandoffEntry(){ return ABSENT_HANDOFF; }
  const ABSENT_HANDOFF = { action: null, panel: null };
`);

async function load(file, extraOverrides = {}) {
  return import(
    await compileModule(
      `src/shell/${file}`,
      { ...OVERRIDES, ...extraOverrides },
      { missingPackageStub: lazyStub },
    )
  );
}

const composerReal = await load("LeoComposer.tsx");
const composerWithoutNative = await load("LeoComposer.tsx", {
  "./mobile-native-actions": NATIVE_MODULE_ABSENT,
});
const inputCardReal = await load("InputCard.tsx");
const inputCardWithoutNative = await load("InputCard.tsx", {
  "./mobile-native-actions": NATIVE_MODULE_ABSENT,
});

/* ------------------------------------------------------------------ *
 * 渲染工具
 * ------------------------------------------------------------------ */

async function mount(Component, props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(Component, props));
  });
  return {
    container,
    async click(node) {
      await act(async () => {
        node.dispatchEvent(
          new window.MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function buttonLabelled(container, text) {
  return [...container.querySelectorAll("button")].find(
    (node) => node.textContent?.trim() === text,
  );
}

function attachMenuButton(container) {
  return container.querySelector('button[aria-label="添加附件"]');
}

const NATIVE_LABELS = ["拍照", "从相册选择", "选择文件"];

/** 那台电脑心跳时报上来的授权目录 —— 落点列表只许从这里长出来。 */
const DESKTOP_ROW = {
  device_id: "dev-desktop",
  device_name: "书房台式机",
  platform: "windows",
  online: true,
  granted_roots: ["D:\\工作\\发票", "D:\\照片"],
  granted_roots_source: "heartbeat",
};

/** 手机自己也在配对列表里 —— 它不该出现在「发到哪台电脑」的选项里。 */
const PHONE_ROW = {
  device_id: "dev-phone",
  device_name: "我的手机",
  platform: "android",
  online: true,
  granted_roots: ["/sdcard/DCIM"],
  granted_roots_source: "heartbeat",
};

/** 伪造的 Capacitor 宿主 + 网站侧桥句柄（桥自己的行为由 mobile-bridge 那份测试守）。 */
function installNativeHost({ devices = [DESKTOP_ROW, PHONE_ROW] } = {}) {
  const seen = {
    scanWithCamera: 0,
    pickPhotos: 0,
    pickFiles: 0,
    ensureTaskNotifications: 0,
    notified: [],
    deviceRequests: [],
  };
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => "android",
    Plugins: {},
  };
  window.oceanleoMobile = {
    host: { kind: "capacitor", platform: "android", plugins: {} },
    async scanWithCamera() {
      seen.scanWithCamera += 1;
      return { ok: true, capability: "camera", photo: { webPath: "capacitor://shot-1.jpg" } };
    },
    async pickPhotos() {
      seen.pickPhotos += 1;
      return {
        ok: true,
        capability: "photos",
        photos: [{ webPath: "capacitor://album-1.jpg" }],
      };
    },
    async pickFiles() {
      seen.pickFiles += 1;
      return {
        ok: true,
        capability: "files",
        files: [new window.File(["doc"], "note.txt", { type: "text/plain" })],
      };
    },
    async ensureTaskNotifications() {
      seen.ensureTaskNotifications += 1;
      return { ok: true, capability: "notifications" };
    },
    async notifyTask(task) {
      seen.notified.push(task);
      return { ok: true, capability: "notifications" };
    },
    dispose() {},
  };
  // 原生选择器交回来的是 webview URL，页面得自己去取字节。
  const previousFetch = globalThis.fetch;
  globalThis.__W06_TOKEN__ = "w06-test-token";
  globalThis.fetch = async (url, init) => {
    const href = String(url ?? "");
    if (href.includes("/v1/devices")) {
      seen.deviceRequests.push({ href, headers: init?.headers ?? {} });
      return {
        ok: true,
        status: 200,
        async json() {
          return { devices };
        },
      };
    }
    return {
      async blob() {
        const blob = new window.Blob(["bytes"], { type: "image/jpeg" });
        blob.arrayBuffer ??= async () => new ArrayBuffer(5);
        return blob;
      },
    };
  };
  return {
    seen,
    remove() {
      delete window.Capacitor;
      delete window.oceanleoMobile;
      delete globalThis.__W06_TOKEN__;
      globalThis.fetch = previousFetch;
    },
  };
}

/* ================================================================== *
 * 1. 浏览器态：上传口的 DOM 逐字不变
 * ================================================================== */

const COMPOSER_PROPS = {
  value: "",
  onChange() {},
  onSubmit() {},
  onAttachFiles() {},
};

test("浏览器：LeoComposer 的 DOM 与「没有手机模块」的那一版逐字相同", async () => {
  assert.equal(window.Capacitor, undefined, "这一节必须在没有原生宿主的窗口里跑");

  const real = await mount(composerReal.LeoComposer, COMPOSER_PROPS);
  const baseline = await mount(composerWithoutNative.LeoComposer, COMPOSER_PROPS);

  assert.equal(
    real.container.innerHTML,
    baseline.container.innerHTML,
    "浏览器里的输入框 DOM 被手机功能改到了",
  );

  await real.unmount();
  await baseline.unmount();
});

test("浏览器：「＋」菜单展开后也逐字相同，三项一个都不许露出来", async () => {
  const real = await mount(composerReal.LeoComposer, COMPOSER_PROPS);
  const baseline = await mount(composerWithoutNative.LeoComposer, COMPOSER_PROPS);

  await real.click(attachMenuButton(real.container));
  await baseline.click(attachMenuButton(baseline.container));

  assert.match(real.container.textContent, /从本地添加文件/, "菜单确实展开了");
  assert.equal(
    real.container.innerHTML,
    baseline.container.innerHTML,
    "展开的附件菜单被手机功能改到了",
  );
  for (const label of NATIVE_LABELS) {
    assert.equal(
      buttonLabelled(real.container, label),
      undefined,
      `浏览器里不该出现「${label}」`,
    );
  }

  await real.unmount();
  await baseline.unmount();
});

test("浏览器：InputCard 的 DOM 与「没有手机模块」的那一版逐字相同", async () => {
  const props = { value: "", onChange() {}, onSubmit() {}, onFiles() {} };
  const real = await mount(inputCardReal.InputCard, props);
  const baseline = await mount(inputCardWithoutNative.InputCard, props);

  assert.match(real.container.textContent, /上传文件/, "那颗虚线上传按钮还在");
  assert.equal(
    real.container.innerHTML,
    baseline.container.innerHTML,
    "浏览器里的 InputCard DOM 被手机功能改到了",
  );

  await real.unmount();
  await baseline.unmount();
});

test("浏览器：那颗上传按钮点下去照旧是系统文件选择器，不弹三选一", async () => {
  const props = { value: "", onChange() {}, onSubmit() {}, onFiles() {} };
  const view = await mount(inputCardReal.InputCard, props);
  const before = view.container.innerHTML;

  const upload = buttonLabelled(view.container, "上传文件（可多选）");
  assert.ok(upload, "上传按钮不见了");
  await view.click(upload);

  assert.equal(view.container.innerHTML, before, "浏览器里点上传竟然多渲染了东西");
  await view.unmount();
});

test("浏览器：不装任何 window 监听（手机的通知监听不许渗到网页端）", async () => {
  const added = [];
  const originalAdd = window.addEventListener.bind(window);
  window.addEventListener = (type, ...rest) => {
    added.push(type);
    return originalAdd(type, ...rest);
  };
  try {
    const view = await mount(composerReal.LeoComposer, COMPOSER_PROPS);
    assert.equal(
      added.includes("oceanleo:task-finished"),
      false,
      "浏览器里不该为手机通知装监听",
    );
    await view.unmount();
  } finally {
    window.addEventListener = originalAdd;
  }
});

/* ================================================================== *
 * 2. 原生态：三项在既有入口里，点了走桥，字节回到既有附件通路
 * ================================================================== */

test("原生：「＋」菜单里换成拍照/相册/文件三项，不另立一排按钮", async () => {
  const native = installNativeHost();
  try {
    const view = await mount(composerReal.LeoComposer, COMPOSER_PROPS);
    const buttonsBefore = view.container.querySelectorAll("button").length;

    await view.click(attachMenuButton(view.container));

    for (const label of NATIVE_LABELS) {
      assert.ok(buttonLabelled(view.container, label), `原生态缺了「${label}」`);
    }
    assert.equal(
      buttonLabelled(view.container, "从本地添加文件"),
      undefined,
      "手机上「本地」到不了相机、去相册还要多绕两步，它应当被这三项取代",
    );
    assert.equal(
      view.container.querySelectorAll('button[aria-label="添加附件"]').length,
      1,
      "入口仍然只有那一颗「＋」",
    );
    assert.equal(
      buttonsBefore,
      (await mount(composerWithoutNative.LeoComposer, COMPOSER_PROPS)).container.querySelectorAll(
        "button",
      ).length,
      "菜单没展开时，原生态的工具条按钮数与浏览器态一致（没多出一排）",
    );

    await view.unmount();
  } finally {
    native.remove();
  }
});

test("原生：点「拍照」走桥，拿到的字节落回既有的 onAttachFiles", async () => {
  const native = installNativeHost();
  const attached = [];
  try {
    const view = await mount(composerReal.LeoComposer, {
      ...COMPOSER_PROPS,
      onAttachFiles: (files) => attached.push(...files),
    });
    await view.click(attachMenuButton(view.container));
    await view.click(buttonLabelled(view.container, "拍照"));
    await act(async () => {});

    assert.equal(native.seen.scanWithCamera, 1, "「拍照」没有调到系统相机");
    assert.equal(attached.length, 1, "拍到的照片没有进附件通路");
    assert.equal(attached[0].name, "shot-1.jpg");
    await view.unmount();
  } finally {
    native.remove();
  }
});

test("原生：点「从相册选择」与「选择文件」各自走对应的桥函数", async () => {
  const native = installNativeHost();
  const attached = [];
  try {
    const view = await mount(composerReal.LeoComposer, {
      ...COMPOSER_PROPS,
      onAttachFiles: (files) => attached.push(...files),
    });

    await view.click(attachMenuButton(view.container));
    await view.click(buttonLabelled(view.container, "从相册选择"));
    await act(async () => {});
    assert.equal(native.seen.pickPhotos, 1);

    await view.click(attachMenuButton(view.container));
    await view.click(buttonLabelled(view.container, "选择文件"));
    await act(async () => {});
    assert.equal(native.seen.pickFiles, 1);

    assert.deepEqual(
      attached.map((file) => file.name),
      ["album-1.jpg", "note.txt"],
      "相册与文件两路都要落回同一条附件通路",
    );
    await view.unmount();
  } finally {
    native.remove();
  }
});

test("原生：InputCard 那颗上传按钮弹出三选一，按钮本身还是同一颗", async () => {
  const native = installNativeHost();
  const files = [];
  try {
    const view = await mount(inputCardReal.InputCard, {
      value: "",
      onChange() {},
      onSubmit() {},
      onFiles: (picked) => files.push(...picked),
    });

    const upload = buttonLabelled(view.container, "上传文件（可多选）");
    assert.ok(upload, "原生态不该换掉那颗按钮");
    await view.click(upload);

    for (const label of NATIVE_LABELS) {
      assert.ok(buttonLabelled(view.container, label), `三选一里缺了「${label}」`);
    }

    await view.click(buttonLabelled(view.container, "选择文件"));
    await act(async () => {});
    assert.equal(native.seen.pickFiles, 1);
    assert.deepEqual(files.map((file) => file.name), ["note.txt"]);

    await view.unmount();
  } finally {
    native.remove();
  }
});

/* ================================================================== *
 * 2.1 「发送到电脑」：手机拍的照片落进那台电脑的授权目录（A14 接线）
 *
 * 这一段守的是**可达性**：送达逻辑再对，没有一个入口能点到它，用户就还是
 * 看不见这个功能。所以断言从「菜单里有那一行」一直走到「面板里出现的落点
 * 逐字等于那台电脑上报的目录」。
 * ================================================================== */

const HANDOFF_LABEL = "发送到电脑";

function handoffPanel(container) {
  return container.querySelector("[data-native-handoff-panel]");
}

async function openHandoffFromMenu(view) {
  await view.click(attachMenuButton(view.container));
  const row = buttonLabelled(view.container, HANDOFF_LABEL);
  assert.ok(row, `「＋」菜单里没有「${HANDOFF_LABEL}」这一行 —— 功能等于不存在`);
  await view.click(row);
  await act(async () => {});
  await act(async () => {});
  return row;
}

test("原生：「＋」菜单里三项旁边多一行「发送到电脑」，点开就是那台电脑的授权目录", async () => {
  const native = installNativeHost();
  try {
    const view = await mount(composerReal.LeoComposer, COMPOSER_PROPS);
    await openHandoffFromMenu(view);

    const panel = handoffPanel(view.container);
    assert.ok(panel, "点了「发送到电脑」却没有落点选择器 —— 这就是零调用方的样子");
    assert.equal(
      panel.getAttribute("data-native-handoff-panel"),
      "ready",
      "落点清单没取到（面板停在 loading/error）",
    );

    const folderSelect = panel.querySelector("[data-file-handoff-folder]");
    assert.ok(folderSelect, "落点下拉框不见了");
    assert.deepEqual(
      [...folderSelect.querySelectorAll("option")].map((option) => option.value),
      DESKTOP_ROW.granted_roots,
      "落点选项必须逐字等于那台电脑心跳报上来的目录",
    );

    assert.ok(
      buttonLabelled(panel, `发送到${DESKTOP_ROW.device_name}`),
      "缺了那颗真正会发的按钮",
    );
    assert.equal(
      panel.querySelectorAll("input, textarea, [contenteditable]").length,
      0,
      "面板里出现了能打字的框 —— 手敲的路径那台电脑一定会拒，等于先请用户瞄准再拒绝他",
    );

    assert.equal(native.seen.deviceRequests.length, 1, "没有去问那台电脑授权了哪些文件夹");
    const request = native.seen.deviceRequests[0];
    assert.match(request.href, /\/v1\/devices\?folders=true$/, "取落点清单的地址不对");
    assert.match(
      String(request.headers.Authorization ?? ""),
      /^Bearer /,
      "取落点清单没带登录令牌",
    );

    await view.unmount();
  } finally {
    native.remove();
  }
});

test("原生：手机自己不出现在「发到哪台电脑」里 —— 把照片发给自己没有意义", async () => {
  const native = installNativeHost();
  try {
    const view = await mount(composerReal.LeoComposer, COMPOSER_PROPS);
    await openHandoffFromMenu(view);

    const panel = handoffPanel(view.container);
    assert.doesNotMatch(panel.textContent, /我的手机/, "手机被列成了落点");
    assert.equal(
      panel.querySelector("[data-native-handoff-device]"),
      null,
      "只有一台电脑能收时不该多一个选电脑的下拉框",
    );
    assert.doesNotMatch(
      panel.textContent,
      /sdcard/,
      "手机上的目录混进了那台电脑的落点列表",
    );

    await view.unmount();
  } finally {
    native.remove();
  }
});

test("原生：那台电脑一个文件夹都没授权时，发送键点不动，也不给手敲的框", async () => {
  const native = installNativeHost({
    devices: [
      {
        ...DESKTOP_ROW,
        granted_roots: [],
        granted_roots_source: "heartbeat",
      },
    ],
  });
  try {
    const view = await mount(composerReal.LeoComposer, COMPOSER_PROPS);
    await openHandoffFromMenu(view);

    const panel = handoffPanel(view.container);
    assert.equal(panel.querySelector("[data-file-handoff-folder]"), null, "空列表还给了下拉框");
    const send = buttonLabelled(panel, `发送到${DESKTOP_ROW.device_name}`);
    assert.ok(send, "按钮不该消失 —— 用户要看到它为什么不能点");
    assert.equal(send.disabled, true, "没有落点却让人点得动，点了必然被拒");
    assert.match(
      panel.querySelector("[data-file-handoff-note]").textContent,
      /授权/,
      "没说清下一步是「去那台电脑上授权一个文件夹」",
    );
    assert.equal(
      panel.querySelectorAll("input, textarea, [contenteditable]").length,
      0,
      "没有落点时更不许出现一个空框让人猜路径",
    );

    await view.unmount();
  } finally {
    native.remove();
  }
});

test("原生：两台电脑都能收时才出现「发到哪台电脑」，且换台电脑就换它自己的目录", async () => {
  const secondDesktop = {
    device_id: "dev-laptop",
    device_name: "出差笔记本",
    platform: "macos",
    online: true,
    granted_roots: ["/Users/me/Desktop"],
    granted_roots_source: "heartbeat",
  };
  const native = installNativeHost({ devices: [DESKTOP_ROW, secondDesktop, PHONE_ROW] });
  try {
    const view = await mount(composerReal.LeoComposer, COMPOSER_PROPS);
    await openHandoffFromMenu(view);

    const panel = handoffPanel(view.container);
    const deviceSelect = panel.querySelector("[data-native-handoff-device]");
    assert.ok(deviceSelect, "两台电脑都能收，却没有地方选发给哪一台");
    assert.deepEqual(
      [...deviceSelect.querySelectorAll("option")].map((option) => option.value),
      [DESKTOP_ROW.device_id, secondDesktop.device_id],
      "选项必须是我自己那几台电脑，一台不多一台不少",
    );

    deviceSelect.value = secondDesktop.device_id;
    await act(async () => {
      deviceSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
    });

    assert.deepEqual(
      [
        ...handoffPanel(view.container)
          .querySelector("[data-file-handoff-folder]")
          .querySelectorAll("option"),
      ].map((option) => option.value),
      secondDesktop.granted_roots,
      "换了电脑，落点却还是上一台的目录",
    );

    await view.unmount();
  } finally {
    native.remove();
  }
});

test("原生：InputCard 的三选一里也有「发送到电脑」，还是同一颗上传按钮", async () => {
  const native = installNativeHost();
  try {
    const view = await mount(inputCardReal.InputCard, {
      value: "",
      onChange() {},
      onSubmit() {},
      onFiles() {},
    });

    const upload = buttonLabelled(view.container, "上传文件（可多选）");
    await view.click(upload);
    const row = buttonLabelled(view.container, HANDOFF_LABEL);
    assert.ok(row, "InputCard 的三选一里缺了「发送到电脑」");
    await view.click(row);
    await act(async () => {});
    await act(async () => {});

    assert.ok(handoffPanel(view.container), "InputCard 上点了没有落点选择器");
    assert.equal(
      view.container.querySelectorAll('button[aria-label="收起"]').length,
      1,
      "面板被渲染了两份",
    );

    await view.unmount();
  } finally {
    native.remove();
  }
});

test("浏览器：「发送到电脑」这一行不存在，也不去问网关我的电脑有哪些", async () => {
  assert.equal(window.Capacitor, undefined, "这一节必须在没有原生宿主的窗口里跑");
  const calls = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url ?? ""));
    return { ok: true, status: 200, async json() { return { devices: [] }; } };
  };
  try {
    const view = await mount(composerReal.LeoComposer, COMPOSER_PROPS);
    await view.click(attachMenuButton(view.container));
    await act(async () => {});

    assert.equal(
      buttonLabelled(view.container, HANDOFF_LABEL),
      undefined,
      "浏览器里出现了「发送到电脑」—— 它承诺的正是浏览器做不到的那件事",
    );
    assert.equal(handoffPanel(view.container), null, "浏览器里渲出了落点面板");
    assert.equal(
      calls.filter((href) => href.includes("/v1/devices")).length,
      0,
      "浏览器里为手机功能白问了一趟网关",
    );

    await view.unmount();
  } finally {
    globalThis.fetch = previousFetch;
  }
});

/* ================================================================== *
 * 3. 通知：挂载时不要权限，第一次派活才要；完成了才推，只推一次
 * ================================================================== */

test("原生：挂载时不要通知权限 —— 一装上来就弹权限框会被直接拒", async () => {
  const native = installNativeHost();
  try {
    const view = await mount(composerReal.LeoComposer, COMPOSER_PROPS);
    await act(async () => {});

    assert.equal(
      native.seen.ensureTaskNotifications,
      0,
      "输入框一挂载就要通知权限了",
    );
    await view.unmount();
  } finally {
    native.remove();
  }
});

test("原生：用户第一次真的派活，这才要通知权限", async () => {
  const native = installNativeHost();
  const submitted = [];
  try {
    const view = await mount(composerReal.LeoComposer, {
      ...COMPOSER_PROPS,
      value: "帮我把这张照片整理成表格",
      onSubmit: (text) => submitted.push(text),
    });

    const send = view.container.querySelector('button[aria-label="发送"]');
    assert.ok(send, "发送键不见了");
    await view.click(send);
    await act(async () => {});

    assert.deepEqual(submitted, ["帮我把这张照片整理成表格"], "派活本身不能受影响");
    assert.equal(native.seen.ensureTaskNotifications, 1, "派活了却没要通知权限");
    await view.unmount();
  } finally {
    native.remove();
  }
});

test("原生：任务完成事件推一条系统通知，同一个任务不重复推", async () => {
  const native = installNativeHost();
  try {
    const view = await mount(composerReal.LeoComposer, COMPOSER_PROPS);

    await act(async () => {
      window.dispatchEvent(
        new window.CustomEvent(composerReal.TASK_FINISHED_EVENT ?? "oceanleo:task-finished", {
          detail: { taskId: "task-a", title: "报表已生成", body: "共 12 页" },
        }),
      );
    });
    await act(async () => {});

    assert.equal(native.seen.notified.length, 1, "任务完成了却没推通知");
    assert.equal(native.seen.notified[0].title, "报表已生成");
    assert.equal(native.seen.notified[0].body, "共 12 页");
    assert.equal(native.seen.notified[0].taskId, "task-a");

    await act(async () => {
      window.dispatchEvent(
        new window.CustomEvent("oceanleo:task-finished", {
          detail: { taskId: "task-a" },
        }),
      );
    });
    await act(async () => {});
    assert.equal(native.seen.notified.length, 1, "同一个任务推了两次");

    await view.unmount();
  } finally {
    native.remove();
  }
});

/* ================================================================== *
 * 4. 文案：17 语都要有译文
 * ================================================================== */

test("三项与完成通知的文案在 17 个词典里都有译文，非中文用户不会看见中文按钮", async () => {
  // `useUI()` 的回退规则是「未命中就原样返回中文」，所以缺译文在中文站完全看不出来 ——
  // 只有日语用户点开「＋」时才会发现三个按钮印着中文。
  const { LOCALES } = await import("../src/i18n/config.ts");
  const { UI_MESSAGES } = await import("../src/i18n/ui/messages/index.ts");

  const phrases = ["拍照", "从相册选择", "选择文件", "任务已完成", "回到 OceanLeo 查看结果"];
  for (const locale of LOCALES) {
    const dictionary = UI_MESSAGES[locale];
    assert.ok(dictionary, `缺少 ${locale} 词典`);
    for (const phrase of phrases) {
      const translated = dictionary[phrase];
      assert.ok(translated, `${locale} 少了「${phrase}」的译文`);
      // zh-TW 只查有没有：「拍照」在繁体里本来就写作「拍照」，逐字相同是对的，
      // 不是漏译。其余 15 个语种与原文逐字相同就一定是漏译。
      if (locale !== "zh" && locale !== "zh-TW") {
        assert.notEqual(
          translated,
          phrase,
          `${locale} 的「${phrase}」还是中文原文`,
        );
      }
    }
  }
});

test("浏览器：任务完成事件什么也不做（没有桥，就不该有通知）", async () => {
  const view = await mount(composerReal.LeoComposer, COMPOSER_PROPS);
  let threw = null;
  try {
    await act(async () => {
      window.dispatchEvent(
        new window.CustomEvent("oceanleo:task-finished", {
          detail: { taskId: "task-browser" },
        }),
      );
    });
  } catch (error) {
    threw = error;
  }
  assert.equal(threw, null, "浏览器里派发这个事件不许抛");
  await view.unmount();
});
