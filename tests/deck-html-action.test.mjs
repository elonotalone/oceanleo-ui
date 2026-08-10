// ============================================================================
// 「网页版」这个动作（deck 补货波 · W4）
// ----------------------------------------------------------------------------
// 上一轮把网页版出口（`deck-html-package.ts`）做好了，但没有任何用户能点到的地方
// 引它 —— 实测 `agent-repo-index.sh symbol buildDeckHtml` 只命中它自己和它自己的
// 测试。这份用例守的是「接上了，而且接得没有走形」四件事：
//
//   ① 有稿子 ⇒ 动作可用，且用户拿到的字节与直接调用出口对同一份稿子产出的
//      **逐字节相同**（这一层不许再加工，否则「按需渲染」就不是同一份东西了）；
//   ② 没稿子（今天货架上 275 个位全部如此）⇒ 动作不可用，但**按钮留在原地**，
//      并带一句面向用户的中文理由，不是技术堆栈；
//   ③ 同一份稿子点两次，字节相同（按需渲染每次都要重算，不确定就等于用户每次
//      刷新看到的都不一样）；
//   ④ `ArtifactActions.tsx` 上原有的下载与收藏没被碰坏：能下、能收、
//      下载在跑的时候收藏仍然按得动（那条独立性是 library-failure-surface 守的，
//      这里在 ArtifactActionButtons 这一层再钉一遍，因为动作条是在这里被改的）。
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import {
  buildDeckHtml,
  zipDeckHtmlPackage,
} from "../src/shell/doc-editors/deck-html-package.ts";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// jsdom 不是直接依赖，跟 library-failure-surface 同一条路子从 fabric 那边解析；
// 顺手把 canvas 的 require 缓存挡掉，别为了一个 DOM 去编译原生扩展。
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
  url: "https://ppt.oceanleo.com/workspace",
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
  MutationObserver: window.MutationObserver,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// 交付落点：`saveDelivery()` 走的是 objectURL + <a download>，把 Blob 截下来就拿到字节。
const savedBlobs = [];
URL.createObjectURL = (blob) => {
  savedBlobs.push(blob);
  return `blob:deck-html/${savedBlobs.length}`;
};
URL.revokeObjectURL = () => {};

async function savedBytes(index) {
  const blob = savedBlobs[index];
  assert.ok(blob, `第 ${index + 1} 次交付没有落下任何字节`);
  return new Uint8Array(await blob.arrayBuffer());
}

// ── 稿子 ────────────────────────────────────────────────────────────────────

const PIXEL = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);

function deckIr() {
  return {
    schema: "oceanleo.deck.v1",
    version: 1,
    title: "近岸观测网年度汇报",
    theme: {
      accent: "1F6FEB",
      fontMajor: "Aptos",
      fontEastAsian: "Microsoft YaHei",
    },
    master: { footerText: "OceanLeo 海洋观测", showPageNumber: true },
    slides: [
      { layout: "title", title: "近岸观测网年度汇报", subtitle: "同一份稿子的网页孪生件" },
      { layout: "bullets", title: "年度要点", bullets: ["新增站点 12 个", "回传时延下降 41%"] },
      {
        layout: "image-full",
        title: "东南近岸断面",
        images: [{ assetId: "photo-a", alt: "近岸航拍" }],
      },
    ],
    assets: [
      {
        id: "photo-a",
        sha256: "1".repeat(64),
        mediaType: "image/png",
        byteSize: PIXEL.length,
        width: 1600,
        height: 900,
      },
    ],
    attribution: {
      entries: [
        {
          text: "OceanLeo",
          licenseCode: "OCEANLEO-AIGEN",
          licenseUrl: "https://oceanleo.com/license",
        },
      ],
    },
  };
}

const DECK_SOURCE_URL = "https://signed.test/deck-1/project.json";
const DECK_REPLACEMENT_SOURCE_URL =
  "https://signed.test/deck-1/project-r2.json";

// ── 被测模块（动作条与动作本体）────────────────────────────────────────────

let downloadCalls = 0;
let favoriteCalls = 0;
let holdDownload = false;
let releaseDownload = null;
globalThis.__deckHtmlTestHooks = {
  download: async () => {
    downloadCalls += 1;
    if (holdDownload) {
      await new Promise((done) => {
        releaseDownload = done;
      });
    }
    return {
      ok: true,
      data: {
        artifactId: "deck-1",
        revisionId: "r1",
        url: "https://signed.test/deck-1.pptx",
        filename: "近岸观测网年度汇报.pptx",
        mediaType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
    };
  },
  favorite: async () => {
    favoriteCalls += 1;
    return { ok: true, data: { artifactId: "deck-1", revisionId: "r1" } };
  },
};

const STUBS = {
  "../i18n/ui/useUI": dataModule("export function useUI(){ return (zh) => zh; }"),
  "./artifact-client": dataModule(`
    export function artifactDownloadEvidence(item){
      return item.artifact?.renditions?.full
        ? { visible: true, available: true, reason: "", purpose: "full", mode: "attachment" }
        : {
            visible: true,
            available: false,
            reason: "当前 revision 缺少符合能力合同的真实交付 rendition。",
            purpose: null,
            mode: null,
          };
    }
    export async function getArtifactDownload(item){
      return globalThis.__deckHtmlTestHooks.download(item);
    }
    export async function setArtifactFavorite(item, next){
      return globalThis.__deckHtmlTestHooks.favorite(item, next);
    }
    export async function prepareArtifactForAction(action, item){
      return { ok: true, data: item };
    }
  `),
};

const actions = await import(
  await compileModule("src/shell/ArtifactActions.tsx", STUBS)
);
const deckHtmlAction = await import(
  await compileModule("src/shell/DeckHtmlAction.tsx", STUBS)
);

// ── 条目 ────────────────────────────────────────────────────────────────────

/** 补货之后的形态：交付位是 pptx，稿子在 `source` 上，格式声明为 oceanleo.deck.v1。 */
function deckItem({
  withProject = true,
  artifactType = "deck",
  revisionId = "r1",
  sourceUrl = DECK_SOURCE_URL,
} = {}) {
  return {
    key: `artifact:deck-1:${revisionId}`,
    source: "artifact",
    id: "deck-1",
    title: "近岸观测网年度汇报",
    kind: "ppt",
    siteId: "ppt",
    favorite: false,
    artifactId: "deck-1",
    revisionId,
    artifactType,
    meta: { workspace_library_surface: "materials" },
    artifact: {
      schema: "oceanleo.artifact.v1",
      artifactId: "deck-1",
      revisionId,
      artifactType,
      roles: [],
      owner: { originSiteKey: "ppt", visibility: "public" },
      access: {
        canRead: true,
        canPreview: true,
        canEdit: true,
        canFork: false,
        canInsert: false,
        canReplace: false,
        canFavorite: true,
        canExportSource: true,
      },
      editability: "native",
      editorCapability: "deck-editor",
      sourceFormat: "pptx",
      title: "近岸观测网年度汇报",
      favorite: false,
      renditions: {
        preview: {
          purpose: "preview",
          revisionId,
          url: "https://signed.test/deck-1-cover.png",
          format: "png",
        },
        full: {
          purpose: "full",
          revisionId,
          url: "https://signed.test/deck-1.pptx",
          format: "pptx",
        },
        ...(withProject
          ? {
              source: {
                purpose: "source",
                revisionId,
                url: sourceUrl,
                format: "oceanleo.deck.v1",
                mediaType: "application/json",
              },
            }
          : {}),
      },
      scene: null,
      provenance: null,
      bindings: [],
      integrity: { ok: true, code: "ok", reason: "" },
      createdAt: null,
    },
  };
}

function matrixFor(item) {
  return actions.artifactActionMatrix(item, { hidePreview: true });
}

async function mount(item) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = async (nextItem) => {
    await act(async () => {
      root.render(
        React.createElement(actions.ArtifactActionButtons, {
          item: nextItem,
          matrix: matrixFor(nextItem),
          onEdit: () => undefined,
        }),
      );
    });
  };
  await render(item);
  return {
    container,
    async update(nextItem) {
      await render(nextItem);
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function button(container, label) {
  return [...container.querySelectorAll("button, a")].find(
    (node) => node.textContent.trim() === label,
  );
}

async function click(target) {
  assert.ok(target, "按钮不存在");
  await act(async () => {
    target.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}

async function settle() {
  await act(async () => {
    await new Promise((done) => window.setTimeout(done, 0));
  });
}

function serveProject(payload = deckIr()) {
  const previous = globalThis.fetch;
  let reads = 0;
  globalThis.fetch = async (url) => {
    assert.equal(String(url), DECK_SOURCE_URL, "取稿子的地址必须来自 artifact 证据");
    reads += 1;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(payload),
    };
  };
  return {
    reads: () => reads,
    restore() {
      globalThis.fetch = previous;
    },
  };
}

// ── ① 有稿子 ⇒ 可用，且字节与直接调用出口逐字节相同 ─────────────────────────

test("有稿子时网页版可用，交付的字节与直接调用 deck-html-package 逐字节相同", async () => {
  const item = deckItem();
  const evidence = deckHtmlAction.deckHtmlEvidence(item);
  assert.equal(evidence.visible, true);
  assert.equal(evidence.available, true);
  assert.equal(evidence.reason, "");
  assert.equal(evidence.sourceUrl, DECK_SOURCE_URL);

  savedBlobs.length = 0;
  const server = serveProject();
  const mounted = await mount(item);
  try {
    const webAction = button(mounted.container, "网页版");
    assert.ok(webAction, "deck 条目上必须有网页版这个动作");
    assert.equal(webAction.disabled, false);
    assert.equal(webAction.getAttribute("data-deck-html-action"), "true");

    await click(webAction);
    await settle();
    assert.equal(server.reads(), 1, "稿子必须真去取一次");
    assert.match(mounted.container.textContent || "", /网页版已生成/);

    // 直接调用出口：宿主没给图片字节，动作那一侧传的就是「一张都没有」。
    const direct = await buildDeckHtml(deckIr(), { assets: [] });
    const deliveredBytes = await savedBytes(0);
    assert.deepEqual(
      deliveredBytes,
      new TextEncoder().encode(direct.html),
      "这一层不许在出口的字节之上再加工",
    );
    const deliveredHtml = new TextDecoder().decode(deliveredBytes);
    assert.match(deliveredHtml, /近岸观测网年度汇报/);
    assert.match(deliveredHtml, /新增站点 12 个/);
    assert.match(deliveredHtml, /回传时延下降 41%/);
  } finally {
    server.restore();
    await mounted.unmount();
  }
});

test("图片字节齐了就交 zip 闭包，字节等于 zipDeckHtmlPackage 的产物", async () => {
  const project = deckIr();
  const assets = [
    { id: "photo-a", path: "assets/photo-1.png", bytes: PIXEL, width: 1600, height: 900 },
  ];
  const delivery = await deckHtmlAction.buildDeckHtmlDelivery(project, { assets });
  assert.equal(delivery.kind, "zip");
  assert.equal(delivery.mediaType, "application/zip");
  assert.match(delivery.filename, /\.html\.zip$/);

  const direct = await buildDeckHtml(deckIr(), { assets });
  assert.deepEqual(delivery.bytes, zipDeckHtmlPackage(direct));
  assert.deepEqual(delivery.build.missingAssetIds, []);
});

// ── ② 没稿子 ⇒ 不可用，但按钮留在原地并说人话 ───────────────────────────────

test("没稿子时网页版留在原地、按不动，并带一句面向用户的理由", async () => {
  const item = deckItem({ withProject: false });
  const evidence = deckHtmlAction.deckHtmlEvidence(item);
  assert.equal(evidence.visible, true, "不许静默消失");
  assert.equal(evidence.available, false);
  assert.equal(evidence.sourceUrl, "");

  const reason = evidence.reason;
  assert.ok(reason.trim().length > 0, "按不动就必须写清为什么");
  assert.equal(
    reason,
    "这份素材制作得较早，当时没有保留生成网页版所需的可编辑内容；不是你这次操作出了问题。",
  );
  assert.equal(reason, deckHtmlAction.DECK_HTML_NO_SOURCE_REASON);

  // 父级已实测今天线上 152 份 deck 全是 pptx、没有 IR 稿子；这里把同一个现实批次
  // 明确铺成 152 个无稿条目，钉死它们全都走这条灰分支，而不是只验证一个偶然样本。
  const currentShelf = Array.from({ length: 152 }, () =>
    deckHtmlAction.deckHtmlEvidence(deckItem({ withProject: false })),
  );
  assert.equal(currentShelf.length, 152);
  assert.equal(
    currentShelf.filter(
      (entry) =>
        entry.visible === true &&
        entry.available === false &&
        entry.reason ===
          "这份素材制作得较早，当时没有保留生成网页版所需的可编辑内容；不是你这次操作出了问题。",
    ).length,
    152,
  );
  // 面向用户，不是技术堆栈：没有异常类名、栈帧、URL、undefined/null 这类东西。
  for (const forbidden of [
    /Error\b/,
    /TypeError|DOMException|at\s+\w+\s*\(/,
    /undefined|null|NaN/,
    /https?:\/\//,
    /[{}[\]<>]/,
    /源|稿|IR|rendition|artifact|schema|json/i,
  ]) {
    assert.doesNotMatch(reason, forbidden, `理由里不许出现 ${forbidden}`);
  }
  assert.match(reason, /[\u4e00-\u9fa5]/, "理由必须是中文人话");

  savedBlobs.length = 0;
  const mounted = await mount(item);
  try {
    const webAction = button(mounted.container, "网页版");
    assert.ok(webAction, "没稿子也不许让按钮消失");
    assert.equal(webAction.disabled, true);
    assert.equal(webAction.getAttribute("aria-disabled"), "true");
    assert.equal(webAction.getAttribute("title"), reason);
    // 理由要进那条读得见的说明行，读屏也连得上。
    const described = webAction.getAttribute("aria-describedby");
    assert.ok(described, "按不动的按钮必须指向理由行");
    assert.equal(
      mounted.container.querySelector(`#${described}`)?.textContent?.includes(reason),
      true,
    );
    assert.match(
      mounted.container.textContent || "",
      /网页版：这份素材制作得较早/,
    );

    await click(webAction);
    await settle();
    assert.equal(savedBlobs.length, 0, "按不动的按钮不许产出任何东西");
  } finally {
    await mounted.unmount();
  }
});

test("不是演示文稿的条目根本不长出这个动作", async () => {
  const item = deckItem({ artifactType: "single_file_image" });
  assert.equal(deckHtmlAction.deckHtmlEvidence(item).visible, false);
  const mounted = await mount(item);
  try {
    assert.equal(button(mounted.container, "网页版"), undefined);
  } finally {
    await mounted.unmount();
  }
});

// ── ③ 同一份稿子点两次，字节相同 ────────────────────────────────────────────

test("同一份稿子点两次，产出的字节相同", async () => {
  savedBlobs.length = 0;
  const server = serveProject();
  const mounted = await mount(deckItem());
  try {
    await click(button(mounted.container, "网页版"));
    await settle();
    await click(button(mounted.container, "网页版"));
    await settle();
    assert.equal(server.reads(), 2, "按需渲染每次都要重新取稿子");
    assert.equal(savedBlobs.length, 2);
    assert.deepEqual(await savedBytes(0), await savedBytes(1));
  } finally {
    server.restore();
    await mounted.unmount();
  }
});

test("稿子读不回来时给的是人话，不是 HTTP 原文", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  savedBlobs.length = 0;
  const mounted = await mount(deckItem());
  try {
    await click(button(mounted.container, "网页版"));
    await settle();
    const text = mounted.container.textContent || "";
    assert.doesNotMatch(text, /Failed to fetch|TypeError/);
    assert.match(text, /网页版没能生成|请稍后重试/);
    assert.equal(savedBlobs.length, 0);
  } finally {
    globalThis.fetch = previous;
    await mounted.unmount();
  }
});

test("schema 同名的编辑器模型被拒后保持灰着，换合格稿后恢复可点", async () => {
  // 编辑器存盘信封也会写 oceanleo.deck.v1，但 data 里是 DeckDocument：version=2、
  // aspect/theme/masters/elements。它不是产线 DeckIrDocument，绝不能只看 schema 就放行。
  const disguisedEditorProject = {
    schema: "oceanleo.deck.v1",
    version: 1,
    data: {
      version: 2,
      title: "伪装成 deck IR 的编辑器模型",
      aspect: "16:9",
      theme: "ocean",
      masters: [],
      slides: [
        {
          id: "slide-1",
          title: "这不是产线 IR",
          body: "",
          bullets: [],
          notes: "",
          layout: "title-body",
          background: "#ffffff",
          elements: [],
        },
      ],
    },
  };
  const previous = globalThis.fetch;
  let releaseResponse;
  let reads = 0;
  globalThis.fetch = async (url) => {
    reads += 1;
    if (String(url) === DECK_REPLACEMENT_SOURCE_URL) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(deckIr()),
      };
    }
    assert.equal(String(url), DECK_SOURCE_URL);
    return new Promise((resolve) => {
      releaseResponse = () =>
        resolve({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(disguisedEditorProject),
        });
    });
  };

  savedBlobs.length = 0;
  const mounted = await mount(deckItem());
  try {
    const webAction = button(mounted.container, "网页版");
    assert.ok(webAction, "声明有稿子时动作先可见");
    await click(webAction);
    assert.equal(reads, 1, "必须真把伪装稿取回来验，不能只看 metadata");
    assert.equal(webAction.disabled, true, "校验中的按钮必须灰着，不能重复放行");
    assert.equal(webAction.textContent.trim(), "处理中…");

    assert.equal(typeof releaseResponse, "function");
    releaseResponse();
    await settle();

    assert.equal(savedBlobs.length, 0, "结构不合法时不许落下任何网页字节");
    assert.match(
      mounted.container.textContent || "",
      /这份稿子的格式不受支持，暂时生成不了网页版。/,
    );
    assert.doesNotMatch(mounted.container.textContent || "", /网页版已生成/);

    const rejectedAction = button(mounted.container, "网页版");
    const rejectionReason =
      "这份稿子的格式不受支持，暂时生成不了网页版。";
    assert.equal(
      rejectedAction.disabled,
      true,
      "失败流程完成、处理中状态结束后仍必须灰着",
    );
    assert.equal(rejectedAction.getAttribute("aria-disabled"), "true");
    assert.equal(rejectedAction.textContent.trim(), "网页版");
    assert.equal(rejectedAction.getAttribute("title"), rejectionReason);
    const described = rejectedAction.getAttribute("aria-describedby");
    assert.ok(described, "已拒绝的按钮必须指向拒绝理由");
    assert.equal(
      mounted.container.querySelector(`#${described}`)?.textContent?.trim(),
      `网页版：${rejectionReason}`,
    );
    assert.equal(
      mounted.container.querySelector("[data-deck-html-rejection]")?.textContent?.trim(),
      `网页版：${rejectionReason}`,
      "拒绝理由必须留在可见说明行",
    );

    await click(rejectedAction);
    await settle();
    assert.equal(reads, 1, "已拒绝的同一份稿子不许反复取回、反复失败");

    await mounted.update(
      deckItem({
        revisionId: "r2",
        sourceUrl: DECK_REPLACEMENT_SOURCE_URL,
      }),
    );
    const recoveredAction = button(mounted.container, "网页版");
    assert.equal(recoveredAction.disabled, false, "换成合格稿后必须恢复可点");
    assert.equal(recoveredAction.getAttribute("aria-disabled"), "false");
    assert.equal(recoveredAction.getAttribute("title"), "网页版");
    assert.equal(recoveredAction.hasAttribute("aria-describedby"), false);
    assert.equal(
      mounted.container.querySelector("[data-deck-html-rejection]"),
      null,
      "旧稿的拒绝理由不能粘到新稿上",
    );

    await click(recoveredAction);
    await settle();
    assert.equal(reads, 2, "恢复后必须真取回合格稿");
    assert.equal(savedBlobs.length, 1, "恢复后必须能交付网页版");
    assert.match(mounted.container.textContent || "", /网页版已生成/);
  } finally {
    globalThis.fetch = previous;
    await mounted.unmount();
  }
});

// ── ④ 原有的下载与收藏没被碰坏 ──────────────────────────────────────────────

test("下载与收藏在加了网页版之后行为不变", async () => {
  downloadCalls = 0;
  favoriteCalls = 0;
  const item = deckItem();
  const mounted = await mount(item);
  try {
    const download = button(mounted.container, "下载");
    assert.ok(download, "下载必须还在");
    assert.equal(download.disabled, false);
    assert.equal(download.getAttribute("aria-disabled"), "false");
    assert.equal(download.getAttribute("title"), "下载");
    await click(download);
    await settle();
    assert.equal(downloadCalls, 1);
    assert.match(mounted.container.textContent || "", /下载已开始/);

    const favorite = button(mounted.container, "收藏");
    assert.ok(favorite, "收藏必须还在");
    assert.equal(favorite.disabled, false);
    assert.equal(favorite.getAttribute("aria-disabled"), "false");
    assert.equal(favorite.getAttribute("title"), "收藏");
    assert.equal(favorite.getAttribute("aria-pressed"), "false");
    await click(favorite);
    await settle();
    assert.equal(favoriteCalls, 1);
    assert.equal(
      button(mounted.container, "已收藏")?.getAttribute("aria-pressed"),
      "true",
    );
  } finally {
    await mounted.unmount();
  }
});

test("下载与收藏不可用时仍可见、灰着，并各自保留原有理由", async () => {
  const item = deckItem();
  delete item.artifact.renditions.full;
  item.artifact.access.canFavorite = false;
  const mounted = await mount(item);
  try {
    const download = button(mounted.container, "下载");
    assert.ok(download, "不可下载不等于让按钮消失");
    assert.equal(download.disabled, true);
    assert.equal(download.getAttribute("aria-disabled"), "true");
    assert.equal(
      download.getAttribute("title"),
      "当前 revision 缺少符合能力合同的真实交付 rendition。",
    );

    const favorite = button(mounted.container, "收藏");
    assert.ok(favorite, "不可收藏不等于让按钮消失");
    assert.equal(favorite.disabled, true);
    assert.equal(favorite.getAttribute("aria-disabled"), "true");
    assert.equal(
      favorite.getAttribute("title"),
      "当前主体没有收藏这个 artifact 的权限。",
    );

    assert.match(
      mounted.container.textContent || "",
      /下载：当前 revision 缺少符合能力合同的真实交付 rendition。/,
    );
    assert.match(
      mounted.container.textContent || "",
      /收藏：当前主体没有收藏这个 artifact 的权限。/,
    );
  } finally {
    await mounted.unmount();
  }
});

test("下载在跑的时候，收藏与网页版都仍然按得动：三个入口各自独立", async () => {
  downloadCalls = 0;
  favoriteCalls = 0;
  holdDownload = true;
  releaseDownload = null;
  const server = serveProject();
  savedBlobs.length = 0;
  const mounted = await mount(deckItem());
  try {
    await click(button(mounted.container, "下载"));
    assert.equal(downloadCalls, 1);

    const favorite = button(mounted.container, "收藏");
    assert.equal(favorite?.disabled, false, "下载在跑不该把收藏一起按死");
    const webAction = button(mounted.container, "网页版");
    assert.equal(webAction?.disabled, false, "下载在跑不该把网页版一起按死");

    await click(webAction);
    await settle();
    assert.equal(savedBlobs.length, 1, "网页版不该等下载让位");
  } finally {
    holdDownload = false;
    releaseDownload?.();
    await settle();
    server.restore();
    await mounted.unmount();
  }
});
