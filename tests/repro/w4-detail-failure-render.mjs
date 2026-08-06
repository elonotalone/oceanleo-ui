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
Object.defineProperty(window.HTMLElement.prototype, "requestFullscreen", {
  configurable: true,
  value: async function requestFullscreen() {
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
globalThis.fetch = async (url) => {
  fetchCalls.push(String(url));
  if (MODE === "ok") {
    return {
      ok: true,
      status: 200,
      json: async () => OK_PROJECTION,
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

const { WorkspaceLibrary } = await import(
  await compileModule("src/shell/WorkspaceLibrary.tsx", {
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
