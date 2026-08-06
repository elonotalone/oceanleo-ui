// R1c + R2: 用户在详情里到底看到什么？
// 端到端：真 WorkspaceLibrary + 真 ArtifactActions + 真 library-detail-app-actions +
// 真 artifact-client，只有 auth 两条与 fetch 是替身，fetch 用 Chromium 实测的失败形状。
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { compileModule, dataModule } from "../helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
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
  url: "https://image.oceanleo.com/workspace",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let fullscreenElement = null;
Object.defineProperty(document, "fullscreenElement", {
  configurable: true,
  get: () => fullscreenElement,
});
Object.defineProperty(document, "exitFullscreen", {
  configurable: true,
  value: async () => {
    fullscreenElement = null;
  },
});
// `FULLSCREEN=deny`：让 `requestFullscreen()` 像被浏览器拒掉时那样抛。抛的是
// Chromium 的原话——嵌在没开 `allowfullscreen` 的 iframe 里、或手势判定没过时，
// 每一次都是这句英文。它同样不许摆到用户面前。
const FULLSCREEN_DENIED = process.env.FULLSCREEN === "deny";
Object.defineProperty(window.HTMLElement.prototype, "requestFullscreen", {
  configurable: true,
  value: async function requestFullscreen() {
    if (FULLSCREEN_DENIED) {
      throw new TypeError("Permissions check failed");
    }
    fullscreenElement = this;
  },
});

// `MODE=ok` 是**对照组**：同一条货架行、同一次点开，只有网络这一项换成成功。
// 两次结果的差就是「这次失败到底吞掉了什么」，不靠推断。
const MODE = process.env.MODE || "fail";
const OK_PROJECTION = {
  schema: "oceanleo.artifact.v1",
  artifact_id: "artifact-game-1",
  revision_id: "r1",
  artifact_type: "single_file_image",
  roles: ["stock"],
  title: "太空跑酷",
  favorite: false,
  owner: {
    principal_id: "owner-public",
    visibility: "public",
    origin_site_key: "game",
  },
  access: {
    can_read: true,
    can_preview: true,
    can_edit: false,
    can_fork: true,
    can_insert: true,
    can_replace: true,
    can_favorite: true,
    can_bind: true,
    can_export_source: true,
  },
  editability: "bounded",
  editor_capability: "image-editor",
  source_format: "png",
  renditions: {
    preview: {
      purpose: "preview",
      revision_id: "r1",
      url: "https://signed.test/r1-preview.png",
      format: "png",
    },
    source: {
      purpose: "source",
      revision_id: "r1",
      url: "https://signed.test/r1-source.png",
      format: "png",
      digest: "sha256:r1",
    },
  },
  provenance: { id: "prov-r1", source_kind: "owned", license_code: "owned" },
  context_bindings: [],
  integrity: { ok: true, code: "ok", reason: "" },
};
const fetchCalls = [];
// `HOLD_DOWNLOAD=1`：让下载那一次授权请求**停在半路**不返回。合同 §4.3 要的是
// 「下载与收藏各自独立可用」，而这一点只有在下载真的在跑的那几秒里才看得出来——
// 改前那排按钮共用一个 pending，下载一动收藏就死。
const HOLD_DOWNLOAD = process.env.HOLD_DOWNLOAD === "1";
let releaseHeldDownload = () => {};
globalThis.fetch = async (url) => {
  const href = String(url);
  fetchCalls.push(href);
  if (HOLD_DOWNLOAD && href.includes("/renditions/")) {
    await new Promise((resolve) => {
      releaseHeldDownload = resolve;
    });
  }
  if (MODE === "ok") {
    return {
      ok: true,
      status: 200,
      json: async () => OK_PROJECTION,
    };
  }
  // `MODE=gateway-404`：网关**真实**的错误体（2026-08-06 curl 实测
  // `GET /v1/library/items/<不存在>`）。它给得出 `message`，而那句 message 是英文
  // 技术原文——传输层失败之外的第二条英文出口就在这里。
  if (MODE === "gateway-404") {
    return {
      ok: false,
      status: 404,
      json: async () => ({
        code: "not-found",
        message: "invalid artifact identity",
        details: {},
        requestId: "9c53c4b9e4c84d41926eaa1499672242",
      }),
    };
  }
  throw new TypeError("Failed to fetch");
};

const uiStubUrl = dataModule(`
  export function useUI() { return (value) => value; }
`);
const authClientStub = dataModule(`
  export async function accessToken(){ return "token-for-repro"; }
  export function cachedAccessToken(){ return "token-for-repro"; }
  export function browserClient(){ return null; }
  export function oceanleoConfigured(){ return true; }
  export async function isSignedIn(){ return true; }
  export async function getUserEmail(){ return "repro@oceanleo.test"; }
  export async function getUserId(){ return "user-repro"; }
  export async function signIn(){ return {}; }
  export function normalizeCnPhone(raw){ return raw; }
  export async function sendPhoneOtp(){ return {}; }
  export async function verifyPhoneOtp(){ return {}; }
  export async function wechatLoginUrl(){ return {}; }
  export async function signOutEverywhere(){}
`);
const authConfigStub = dataModule(`
  export const GATEWAY_BASE = "https://api.oceanleo.com";
  export const SUPABASE_URL = "https://supabase.oceanleo.test";
  export const SUPABASE_ANON_KEY = "anon-key-for-repro";
  export function cookieDomainFor(){ return undefined; }
  export function cookieOptions(){ return {}; }
  export function configured(){ return true; }
`);

// `W4_SRC_ROOT` 指向 `w4-before-tree.mjs` 搭的影子树时，同一幕跑的是**改前**的代码；
// 不给就是工作区里的当前版本。改前改后的差就是这一轮到底改动了用户看到的什么。
const SRC_ROOT = process.env.W4_SRC_ROOT || "src";
const { WorkspaceLibrary } = await import(
  await compileModule(`${SRC_ROOT}/shell/WorkspaceLibrary.tsx`, {
    "../i18n/ui/useUI": uiStubUrl,
    "../lib/auth/client": authClientStub,
    "../lib/auth/config": authConfigStub,
  })
);

// 货架上那种官方模板目录行：F6 实测形状（裸 previewUrl、无 revision 身份）。
const catalogRow = {
  key: "template-material:tpl-material-game-1",
  source: "artifact",
  id: "template-material:tpl-material-game-1",
  title: "太空跑酷",
  kind: "image",
  siteId: "game",
  url: "https://asset.oceanleo.com/tpl-material/tpl-material-game-1",
  previewUrl: "https://asset.oceanleo.com/tpl-material/tpl-material-game-1",
  favorite: false,
  meta: {
    workspace_library_surface: "materials",
    template_material_id: "tpl-material-game-1",
    template_material_site_key: "game",
    template_material_app_id: "game-studio",
    template_material_artifact_id: "artifact-game-1",
  },
};
const entry = {
  id: catalogRow.key,
  title: catalogRow.title,
  kind: catalogRow.kind,
  libraryItem: catalogRow,
  externalUrl: catalogRow.url,
  thumbUrl: catalogRow.previewUrl,
};

const { createRoot } = await import("react-dom/client");
const container = document.createElement("div");
document.body.append(container);
const root = createRoot(container);
await act(async () => {
  root.render(
    React.createElement(WorkspaceLibrary, {
      entries: [entry],
      siteId: "game",
      appId: "game-studio",
      onOpenItem: () => {},
    }),
  );
});

function findCard() {
  return [...container.querySelectorAll("button, [role='button'], a")].find(
    (node) => (node.textContent || "").includes(catalogRow.title),
  );
}
await act(async () => {
  findCard()?.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, cancelable: true }),
  );
  await Promise.resolve();
});
await act(async () => {
  await new Promise((r) => window.setTimeout(r, 30));
});

const buttons = [...container.querySelectorAll("button, a")].map((node) => ({
  label: (node.textContent || "").trim(),
  tag: node.tagName,
  disabled: node.disabled === true,
  ariaDisabled: node.getAttribute("aria-disabled"),
  title: node.getAttribute("title"),
}));
const statusBanner = [...container.querySelectorAll("[role='status']")]
  .map((node) => (node.textContent || "").trim())
  .filter(Boolean);

console.log(
  JSON.stringify(
    {
      srcRoot: SRC_ROOT,
      mode: MODE,
      fetchCalls,
      visibleButtonLabels: buttons
        .map((b) => b.label)
        .filter((label) => label && label.length < 12),
      buttons: buttons.filter((b) =>
        ["编辑", "下载", "收藏", "全屏", "链接", "预览"].includes(b.label),
      ),
      statusBanner,
      bannerShowsRawEnglish: statusBanner.some((text) =>
        text.includes("Failed to fetch"),
      ),
      // 只盯 `Failed to fetch` 一句是不够的：网关 404 摆出来的是
      // `invalid artifact identity`，同样是英文原文，却躲得过上面那条。
      // 界面上的话都是中文源串，所以「一句里一个汉字都没有」就是技术原文露面了。
      bannerLinesWithoutChinese: statusBanner.filter(
        (text) => !/[\u3400-\u9fff\uf900-\ufaff]/.test(text),
      ),
      downloadPresent: buttons.some((b) => b.label === "下载"),
      favoritePresent: buttons.some((b) => b.label === "收藏"),
      fullscreenPresent: buttons.some((b) => b.label === "全屏"),
      fullscreenEnabled: buttons.some(
        (b) => b.label === "全屏" && !b.disabled,
      ),
    },
    null,
    2,
  ),
);

// R2: 点全屏，看它把什么送进全屏。
const fullscreenButton = [...container.querySelectorAll("button")].find(
  (node) => (node.textContent || "").trim() === "全屏",
);
if (fullscreenButton) {
  await act(async () => {
    fullscreenButton.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
  await act(async () => {
    await new Promise((r) => window.setTimeout(r, 10));
  });
  console.log(
    JSON.stringify(
      {
        fullscreenTargetTag: fullscreenElement?.tagName || null,
        fullscreenTargetIsWholeDetailPanel: Boolean(
          fullscreenElement &&
            fullscreenElement.querySelector("header") &&
            fullscreenElement === container.firstElementChild,
        ),
        fullscreenSubtreeHasImgOnly: fullscreenElement
          ? {
              imgCount: fullscreenElement.querySelectorAll("img").length,
              iframeCount: fullscreenElement.querySelectorAll("iframe").length,
              canvasCount: fullscreenElement.querySelectorAll("canvas").length,
              videoCount: fullscreenElement.querySelectorAll("video").length,
            }
          : null,
        statusAfterFullscreen: [...container.querySelectorAll("[role='status']")]
          .map((n) => (n.textContent || "").trim())
          .filter(Boolean),
      },
      null,
      2,
    ),
  );
}

// ---------------------------------------------------------------------------
// R3: 失败之后，读者手上还有没有出路。
//
// 「消失」最坏的地方不是少两颗按钮，而是**没有下一步**——改前唯一的出路是刷新整页。
// 所以这里量两件事：那颗「重试」按不按得动，按下去是不是真的又发了一次请求。
// ---------------------------------------------------------------------------
const findButton = (label) =>
  [...container.querySelectorAll("button")].find(
    (node) => (node.textContent || "").trim() === label,
  );

const retryButton = findButton("重试");
const callsBeforeRetry = fetchCalls.length;
if (retryButton) {
  await act(async () => {
    retryButton.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
  await act(async () => {
    await new Promise((r) => window.setTimeout(r, 30));
  });
}
console.log(
  JSON.stringify(
    {
      retryPresent: Boolean(retryButton),
      retryDisabled: retryButton?.disabled ?? null,
      fetchCallsBeforeRetry: callsBeforeRetry,
      fetchCallsAfterRetry: fetchCalls.length,
      retryReallyRefetched: fetchCalls.length > callsBeforeRetry,
      // 重试之后两颗按钮还在不在（失败依旧时不该又消失一次）
      downloadStillPresent: Boolean(findButton("下载")),
      favoriteStillPresent: Boolean(findButton("收藏")),
    },
    null,
    2,
  ),
);

// ---------------------------------------------------------------------------
// R4: 「下载」在跑的时候，「收藏」还按得动吗（`HOLD_DOWNLOAD=1` 才有意义）。
//
// 合同 §4.3「这两个入口应各自独立可用」。改前整排按钮共用一个 `pending`，
// 下载一按，收藏、全屏、编辑全部 `disabled`。
// ---------------------------------------------------------------------------
if (HOLD_DOWNLOAD) {
  const downloadButton = findButton("下载");
  if (downloadButton && !downloadButton.disabled) {
    await act(async () => {
      downloadButton.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((r) => window.setTimeout(r, 20));
    });
    // 按钮的可见文字在忙时会变成「处理中…」，所以按 `aria-label` 认人。
    const snapshot = () =>
      [...container.querySelectorAll("button")].map((node) => ({
        text: (node.textContent || "").trim(),
        aria: node.getAttribute("aria-label"),
        disabled: node.disabled,
      }));
    console.log(
      JSON.stringify(
        {
          whileDownloadInFlight: snapshot(),
          heldDownloadRequest: fetchCalls.filter((url) =>
            url.includes("/renditions/"),
          ),
        },
        null,
        2,
      ),
    );
    releaseHeldDownload({ ok: true, status: 200, json: async () => OK_PROJECTION });
    await act(async () => {
      await new Promise((r) => window.setTimeout(r, 20));
    });
  } else {
    console.log(
      JSON.stringify({ whileDownloadInFlight: "下载按不动，这一项无从量" }, null, 2),
    );
  }
}
