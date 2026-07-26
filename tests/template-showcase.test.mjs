// 大卡片（多模板详情浮层）= `TemplateShowcase` 的行为契约（合同 §0.3，W2，2026-07-26）。
// 覆盖：
//   ① 左上主预览 + 左下缩略图条（≥2 份才出，0/1 份不出）+ 右侧标题/说明/标签的分栏版式；
//   ② 右侧三按钮「编辑模板」「生成类似」「下载」的目标与可见性矩阵；
//   ③ **切换模板时右侧信息与三个按钮的目标同步跟随选中项**（本组件最易回归处，jsdom 真点击）；
//   ④ 无模板 app（含 music 那种连代表 prompt 都没有的）大卡片的降级形态；
//   ⑤ 自带遮罩 / Esc / 打开即聚焦必须保留，且不得改用 `../ui` 的 portal <Modal>；
//   ⑥ 本文件的每条中文文案在 17 语词典里都有译文（新词条由 W3 提供，已落地）。
// 组件源码经 typescript.transpileModule 编译成 data: 模块后导入，所以可以直接
// `node --test tests/template-showcase.test.mjs` 跑，不需要仓库的 ts-extension-loader。

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

function resolveRelative(fromPath, specifier) {
  for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidate = resolve(dirname(fromPath), specifier + suffix);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const compiled = new Map();
const inFlight = new Set();

/**
 * 把一个 TS 源文件及其**全部相对依赖**递归编译成 data: 模块。
 *
 * 递归而不是手抄一份依赖清单：「编辑模板」「下载」两条深链由 W4 的
 * `site-catalog-controller` 现算，那个文件还在演进，每加一条 import 就得来改测试。
 * `overrides` 只留给必须换成替身的模块（tt() 词典）。
 */
async function compileModule(relativePath, overrides = {}) {
  const sourcePath = resolve(relativePath);
  const cached = compiled.get(sourcePath);
  if (cached) return cached;
  assert.ok(
    !inFlight.has(sourcePath),
    `循环依赖，data: 模块无法表达：${relativePath}`,
  );
  inFlight.add(sourcePath);

  let output = ts.transpileModule(await readFile(sourcePath, "utf8"), {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;

  // 只有**值** import 会活到这一步，`import type` 已被 transpile 抹掉。
  for (const specifier of new Set(
    [...output.matchAll(/from\s+"([^"]+)"/g)].map(([, spec]) => spec),
  )) {
    let replacement = overrides[specifier];
    if (!replacement && specifier === "react") replacement = reactUrl;
    if (!replacement && specifier === "react/jsx-runtime") replacement = jsxRuntimeUrl;
    if (!replacement && specifier.startsWith(".")) {
      const target = resolveRelative(sourcePath, specifier);
      assert.ok(target, `${relativePath} 里解析不到 ${specifier}`);
      replacement = await compileModule(relative(process.cwd(), target), overrides);
    }
    assert.ok(replacement, `${relativePath} 依赖了无法在 data: 模块里解析的 ${specifier}`);
    output = output.replaceAll(`from "${specifier}"`, `from "${replacement}"`);
  }

  inFlight.delete(sourcePath);
  const url = `${dataModule(output)}#${encodeURIComponent(relativePath)}`;
  compiled.set(sourcePath, url);
  return url;
}

// tt() 未命中词典时回退中文原文，测试里直接用恒等翻译。
const uiStubUrl = dataModule("export function useUI(){ return (zh) => zh; }");

// `../lib/auth/client` 会把 `@supabase/ssr` 拖进来（bare specifier，data: 模块里解析不了），
// 而登录态本来就是本轮要测的**输入**，所以换成一个由 `globalThis.__W2_AUTH` 控制的替身。
// 组件（`isSignedIn`）与 W4 的下载实现（`accessToken`）用的是同一个 specifier，
// 一处覆盖两边同时生效。
const AUTH = { signedIn: true, token: "test-access-token" };
globalThis.__W2_AUTH = AUTH;
const authStubUrl = dataModule(
  "export async function isSignedIn(){ return globalThis.__W2_AUTH.signedIn; }\n" +
    "export async function accessToken(){ return globalThis.__W2_AUTH.token; }\n",
);

// 「编辑模板」与「下载」的深链由 W4 的 `site-catalog-controller` 现算，所以这里接**真**
// 控制器而不是替身：本测试断言的是用户最终点到的那条 URL，替身只会证明「组件调了个函数」。
// 同理，下载的失败分档接 W4 **真**的 `template-download.ts`（见「默认下载执行器」一节）。
const showcaseUrl = await compileModule("src/shell/ImageLightbox.tsx", {
  "../i18n/ui/useUI": uiStubUrl,
  "../lib/auth/client": authStubUrl,
});

const { TemplateShowcase, ImageLightbox } = await import(showcaseUrl);

// W3 的 `TemplateMaterial` 形状（合同 §3）。两份模板的每个字段都刻意取不同值，
// 这样「右侧没跟着切」的实现会被下面的 doesNotMatch 抓住。
const TPL_A = {
  id: "poster-a",
  title: "夏季促销海报",
  summary: "3:4 竖版促销主视觉，主体居中、下方留文案区。",
  tags: ["促销", "竖版"],
  previewUrl: "tpl-material/image-poster-1",
  artifactId: "art-a",
  artifactType: "single_file_image",
};
const TPL_B = {
  id: "poster-b",
  title: "新品发布长图",
  summary: "9:16 长图，顶部产品特写、底部参数表。",
  tags: ["新品", "长图"],
  previewUrl: "tpl-material/image-poster-2",
  artifactId: "art-b",
  artifactType: "single_file_image",
  // 素材自带直链时优先于 templateDownloadHref（B 用来验证这条优先级）。
  downloadUrl: "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/tpl/poster-b.psd",
};

const BASE = {
  appId: "poster",
  title: "海报生成",
  fallbackIcon: "🖼️",
  accent: "#6366f1",
  prompt: "生成一张 [活动] 宣传海报，风格 [风格]。",
  fillHref: "/workspace/poster?fill=preset",
  onClose() {},
};

function markup(props = {}) {
  return renderToStaticMarkup(React.createElement(TemplateShowcase, { ...BASE, ...props }));
}

// ————————————————————————————————————————————————————————————————
// jsdom 夹具。登录态与下载都是**异步 + 有交互**的，静态渲染看不到，所以下面几个
// 用例都要真挂载。夹具本身抽出来，免得每个用例复制 40 行 globals 搭建与还原。
// ————————————————————————————————————————————————————————————————
async function withDom(run) {
  // fabric 自带的 jsdom 是仓内唯一可用的那份；它的 canvas 依赖在本容器里装不上，
  // 用一个空模块顶掉（本组件不碰 canvas）。
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];

  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://image.oceanleo.com/",
  });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent,
    MouseEvent: window.MouseEvent,
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: previous });
      else delete globalThis[name];
    });
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  const render = (props = {}) =>
    act(async () =>
      root.render(React.createElement(TemplateShowcase, { ...BASE, ...props })),
    );
  const click = (selector) => {
    const node = container.querySelector(selector);
    assert.ok(node, `点不到 ${selector}`);
    return act(async () =>
      node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })),
    );
  };
  const downloadNode = () => container.querySelector('[data-showcase-action="download"]');
  const read = () => {
    const node = downloadNode();
    const issueNode = container.querySelector("[data-showcase-download-issue]");
    return {
      title: container.querySelector("[data-template-showcase-title]")?.textContent,
      summary: container.querySelector("[data-template-showcase-summary]")?.textContent,
      tags: [...container.querySelectorAll("[data-template-showcase-tags] span")].map((n) => n.textContent),
      preview: container.querySelector("[data-template-showcase-preview] img")?.getAttribute("src"),
      edit: container.querySelector('[data-showcase-action="edit"]')?.getAttribute("href"),
      similar: container.querySelector('[data-showcase-action="similar"]')?.getAttribute("href"),
      active: container.querySelector('[data-template-thumb][data-active="1"]')?.getAttribute("data-template-id"),
      download: node
        ? {
            tag: node.tagName,
            state: node.getAttribute("data-download-state"),
            text: node.textContent,
            href: node.getAttribute("href"),
            disabled: node.hasAttribute("disabled"),
          }
        : null,
      issue: issueNode?.getAttribute("data-showcase-download-issue") ?? null,
      issueText: issueNode?.textContent ?? null,
    };
  };

  try {
    await run({ window, container, render, click, read });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

test("版式：左上主预览 + 左下切换条 + 右侧标题/说明/标签 + 三个按钮", () => {
  const html = markup({ templates: [TPL_A, TPL_B] });

  // 外壳与 a11y 骨架（旧 data-image-lightbox 保留，W1 的既有选择器不失效）。
  assert.match(html, /data-image-lightbox/);
  assert.match(html, /data-template-showcase/);
  assert.match(html, /role="dialog"[^>]*aria-modal="true"/);
  assert.match(html, /aria-label="关闭"/);
  // 左右分栏必须放宽 max-w-2xl（合同要求；672px 装不下两栏）。
  assert.match(html, /max-w-5xl/);
  assert.doesNotMatch(html, /max-w-2xl/);
  assert.match(html, /md:grid-cols-\[minmax\(0,1\.5fr\)_minmax\(0,1fr\)\]/);

  // 左上：主预览用**选中模板**的素材大图（`.webp` 大图变体，不是那张 thumb）。
  assert.match(html, /data-template-showcase-preview/);
  const previewSrc = html.match(/data-template-showcase-preview[\s\S]*?<img src="([^"]+)"/)?.[1];
  assert.match(previewSrc, /tpl-material\/image-poster-1\.webp$/);
  assert.doesNotMatch(previewSrc, /\.thumb\.webp$/);

  // 左下：两份模板 → 切换条出现，两颗缩略图，选中态可判别。
  assert.match(html, /data-template-showcase-thumbs/);
  assert.match(html, /aria-label="切换模板"/);
  assert.equal(html.match(/data-template-thumb/g).length, 2);
  assert.match(html, /data-template-id="poster-a"[^>]*data-active="1"/);
  assert.match(html, /data-template-id="poster-b"[^>]*data-active="0"/);
  // 缩略图用 thumb 变体，省流量。
  assert.match(html, /image-poster-2\.thumb\.webp/);

  // 右侧：标题/说明/标签取自选中模板，而不是 app 名。
  assert.match(html, /data-template-showcase-title[^>]*>夏季促销海报</);
  assert.match(html, /data-template-showcase-summary/);
  assert.match(html, /3:4 竖版促销主视觉/);
  assert.match(html, /data-template-showcase-tags/);
  assert.match(html, />促销</);
  assert.match(html, />竖版</);
  // app 名仍在 header 与 dialog 无障碍名里。
  assert.match(html, /aria-label="海报生成"/);

  // 右侧三按钮，且「高级编辑」这个名字本轮彻底消失。
  assert.match(html, /data-showcase-action="edit"[^>]*>编辑模板</);
  assert.match(html, /data-showcase-action="similar"[^>]*>生成类似</);
  assert.match(html, /data-showcase-action="download"[^>]*>下载</);
  assert.doesNotMatch(html, /高级编辑/);
  // 大卡片上不再有旧的「prompt」灌词按钮（合同 §0.3 三按钮定死）。
  assert.doesNotMatch(html, />prompt</);
});

test("三按钮目标：编辑模板/下载指向选中模板，生成类似仍是 app 级 ?fill=preset", () => {
  const html = markup({ templates: [TPL_A, TPL_B] });
  // 编辑模板走 `?open=template&template=<id>`，**刻意不带** `?fill=preset`：
  // 点「编辑模板」时不该顺手把 prompt 灌满输入框，那是「生成类似」的活。
  assert.match(html, /href="\/workspace\/poster\?open=template&amp;template=poster-a"/);
  assert.doesNotMatch(html, /open=template[^"]*fill=preset|fill=preset[^"]*open=template/);
  assert.match(html, /href="\/workspace\/poster\?fill=preset"/);
  // 下载是 button（要带 Bearer，纯导航做不到），不是 <a download>。
  // 它指向哪一份由「切换模板」那个用例用执行器实参钉死，这里只管形态。
  assert.match(html, /<button[^>]*data-showcase-action="download"[^>]*>下载</);

  // initialTemplateId 指定第二份时，编辑模板改指 B。
  const second = markup({ templates: [TPL_A, TPL_B], initialTemplateId: "poster-b" });
  assert.match(second, /href="\/workspace\/poster\?open=template&amp;template=poster-b"/);
  assert.doesNotMatch(second, /template=poster-a/);
});

// W1 的调用点目前仍显式传这两个 `@deprecated` 解析器（拆掉即回到默认路径）。
// 它们是活着的生产分支，所以照样钉死：传了就必须用，且拿到的是**选中项**的 id。
test("显式传入的 href 解析器覆盖默认值，且收到的是选中项", () => {
  const seen = [];
  const html = markup({
    templates: [TPL_A, TPL_B],
    initialTemplateId: "poster-b",
    templateEditHref: (appId, templateId) => `/custom/${appId}/${templateId}`,
    templateDownloadHref: (templateId) => {
      seen.push(templateId);
      return `/custom-download/${templateId}`;
    },
  });
  assert.match(html, /href="\/custom\/poster\/poster-b"/);
  assert.deepEqual(seen, ["poster-b"]);
  assert.doesNotMatch(html, /open=template/);
});

test("下载定位不到素材时整颗按钮消失，不留一个点了必然失败的入口", () => {
  // `templateDownloadHref` 返回空串 = W4 说「这份素材没有可下载的东西」。
  // 它现在只当**可见性探针**（真正的下载走执行器），但这条隐藏规则不能丢。
  const html = markup({ templates: [TPL_A], templateDownloadHref: () => "" });
  assert.doesNotMatch(html, /data-showcase-action="download"/);
  assert.doesNotMatch(html, />下载</);
  // 同一份素材，探针有值时按钮就该在——否则上面那条断言是空转的。
  assert.match(
    markup({ templates: [TPL_A], templateDownloadHref: () => "/x" }),
    /data-showcase-action="download"/,
  );
});

test("只有 1 份模板时不渲染切换条，右侧信息仍取那一份", () => {
  const html = markup({ templates: [TPL_A] });
  assert.doesNotMatch(html, /data-template-showcase-thumbs/);
  assert.doesNotMatch(html, /data-template-thumb/);
  assert.doesNotMatch(html, /aria-label="切换模板"/);
  // 但主预览、右侧信息与「编辑模板」「下载」照常。
  assert.match(html, /tpl-material\/image-poster-1\.webp"/);
  assert.match(html, />夏季促销海报</);
  assert.match(html, /href="\/workspace\/poster\?open=template&amp;template=poster-a"/);
  assert.match(html, /data-showcase-action="download"/);
});

// ————————————————————————————————————————————————————————————————
// 无模板 app 的形态定义（Done when 5）。三档，逐档钉死：
//   A. 有代表 prompt + 给了 editHref 兜底 → 「编辑模板」(app 级空编辑器) + 「生成类似」，无「下载」
//   B. 有代表 prompt、无 editHref            → 只有「生成类似」
//   C. 无代表 prompt、无 editHref（music 站那 22 个）→ 零按钮，降级成纯预览浮层
// 「编辑模板」「下载」依赖模板存在；「生成类似」依赖代表 prompt 非空。
// ————————————————————————————————————————————————————————————————
test("无模板 app：按钮集合按 prompt / editHref 兜底三档降级", () => {
  const cover = "cover-app/image-poster";

  const withFallback = markup({ templates: [], imageKey: cover, editHref: "/workspace/poster?fill=preset&open=advanced" });
  assert.match(withFallback, /data-showcase-action="edit"[^>]*>编辑模板</);
  assert.match(withFallback, /href="\/workspace\/poster\?fill=preset&amp;open=advanced"/);
  assert.match(withFallback, /data-showcase-action="similar"/);
  assert.doesNotMatch(withFallback, /data-showcase-action="download"/);
  // 无模板 → 主预览回退 app 封面，右侧标题回退 app 名，说明回退代表 prompt 全文。
  assert.match(withFallback, /cover-app\/image-poster\.webp"/);
  assert.match(withFallback, /data-template-showcase-title[^>]*>海报生成</);
  assert.match(withFallback, />代表 prompt</);
  assert.match(withFallback, /生成一张 \[活动\] 宣传海报/);

  const promptOnly = markup({ templates: [], imageKey: cover });
  assert.doesNotMatch(promptOnly, /data-showcase-action="edit"/);
  assert.doesNotMatch(promptOnly, /data-showcase-action="download"/);
  assert.match(promptOnly, /data-showcase-action="similar"[^>]*>生成类似</);

  // C：music 站形态——没有模板、没有代表 prompt。零按钮，但不留白（emoji tint 占满图位）。
  const bare = markup({ templates: [], prompt: "", fillHref: "/workspace/ambient?fill=preset", title: "氛围音乐", fallbackIcon: "🎵" });
  assert.doesNotMatch(bare, /data-showcase-action=/);
  assert.doesNotMatch(bare, /编辑模板|生成类似|>下载</);
  assert.doesNotMatch(bare, /<img/);
  assert.match(bare, /🎵/);
  assert.match(bare, /data-template-showcase-title[^>]*>氛围音乐</);
  // 关闭途径仍在（否则就是死浮层）。
  assert.match(bare, /aria-label="关闭"/);
});

test("有模板但无代表 prompt：只掉「生成类似」，编辑模板与下载照常", () => {
  const html = markup({ templates: [TPL_A, TPL_B], prompt: "" });
  assert.match(html, /data-showcase-action="edit"/);
  assert.match(html, /data-showcase-action="download"/);
  assert.doesNotMatch(html, /data-showcase-action="similar"/);
  assert.doesNotMatch(html, /生成类似/);
  // 模板自带 summary，所以说明段还在，只是不挂「代表 prompt」小标题。
  assert.match(html, /3:4 竖版促销主视觉/);
  assert.doesNotMatch(html, />代表 prompt</);
});

test("兼容壳 ImageLightbox：旧 props 仍可渲染，advancedHref 映射成无模板兜底", () => {
  const html = renderToStaticMarkup(
    React.createElement(ImageLightbox, {
      title: "海报生成",
      imageKey: "cover-app/image-poster",
      fallbackIcon: "🖼️",
      accent: "#6366f1",
      prompt: "生成一张 [活动] 宣传海报。",
      onUsePrompt() {},
      fillHref: "/workspace/poster?fill=preset",
      advancedHref: "/workspace/poster?fill=preset&open=advanced",
      onClose() {},
    }),
  );
  assert.match(html, /data-image-lightbox/);
  assert.match(html, /href="\/workspace\/poster\?fill=preset&amp;open=advanced"/);
  assert.match(html, /data-showcase-action="edit"[^>]*>编辑模板</);
  assert.match(html, /data-showcase-action="similar"/);
});

test("保留自带遮罩 / Esc / 焦点管理，不得改用 ../ui 的 portal <Modal>", async () => {
  const source = await readFile(resolve("src/shell/ImageLightbox.tsx"), "utf8");
  // 注释里会解释「为什么不用 Modal」，所以先剥掉注释再查真实代码。
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // ImageLightbox.tsx 文件头的禁令：Modal 走 createPortal(document.body)，SSR 首帧空。
  assert.doesNotMatch(code, /from "\.\.\/ui"/);
  assert.doesNotMatch(code, /createPortal/);
  assert.doesNotMatch(code, /\bModal\b/);
  assert.match(source, /document\.addEventListener\("keydown"/);
  assert.match(source, /closeRef\.current\?\.focus\(\)/);
  // 遮罩点击关闭 + 对话框内点击不冒泡。
  assert.match(source, /className="fixed inset-0 z-50[^"]*"\s*\n?\s*onClick=\{onClose\}/);
  assert.match(source, /onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
  // 首帧就能被静态渲染出内容（portal 化的话这里会是空串）。
  assert.notEqual(markup({ templates: [TPL_A] }).trim(), "");
});

test("切换模板：右侧标题/说明/标签与三个按钮的目标全部跟随选中项", async () => {
  AUTH.signedIn = true;
  await withDom(async ({ window, render, click, read }) => {
    let closed = 0;
    const downloaded = [];
    await render({
      templates: [TPL_A, TPL_B],
      // 「下载」已不是 <a href>，所以「跟随选中项」改用**执行器实际收到的那份素材**来证明，
      // 这比读一条 href 更贴近用户真正下载到的东西。
      async downloadTemplate(template) {
        downloaded.push(template.id);
      },
      onClose() {
        closed += 1;
      },
    });

    // 打开即聚焦关闭键（a11y 不得回归）。
    assert.equal(window.document.activeElement?.getAttribute("aria-label"), "关闭");

    const first = read();
    assert.equal(first.active, "poster-a");
    assert.equal(first.title, "夏季促销海报");
    assert.match(first.summary, /3:4 竖版促销主视觉/);
    assert.deepEqual(first.tags, ["促销", "竖版"]);
    assert.match(first.preview, /image-poster-1\.webp$/);
    assert.equal(first.edit, "/workspace/poster?open=template&template=poster-a");
    assert.equal(first.similar, "/workspace/poster?fill=preset");
    await click('[data-showcase-action="download"]');
    assert.deepEqual(downloaded, ["poster-a"]);

    // ——— 点第二颗缩略图 ———
    await click('[data-template-thumb][data-template-id="poster-b"]');

    const second = read();
    assert.equal(second.active, "poster-b");
    // 右侧四项全部跟随（标题/说明/标签/主预览）。
    assert.equal(second.title, "新品发布长图");
    assert.match(second.summary, /9:16 长图/);
    assert.doesNotMatch(second.summary, /3:4 竖版促销主视觉/);
    assert.deepEqual(second.tags, ["新品", "长图"]);
    assert.match(second.preview, /image-poster-2\.webp$/);
    // 三个按钮全部跟随：编辑模板改指 B，下载交出去的也是 B，生成类似仍是 app 级不变。
    assert.equal(second.edit, "/workspace/poster?open=template&template=poster-b");
    assert.equal(second.similar, "/workspace/poster?fill=preset");
    await click('[data-showcase-action="download"]');
    assert.deepEqual(downloaded, ["poster-a", "poster-b"]);

    // ——— 切回第一份，确认是真·双向同步而不是「一次性走到 B」———
    await click('[data-template-thumb][data-template-id="poster-a"]');
    const back = read();
    assert.equal(back.active, "poster-a");
    assert.equal(back.title, "夏季促销海报");
    assert.deepEqual(back.tags, ["促销", "竖版"]);
    assert.equal(back.edit, "/workspace/poster?open=template&template=poster-a");
    await click('[data-showcase-action="download"]');
    assert.deepEqual(downloaded, ["poster-a", "poster-b", "poster-a"]);

    // Esc 关闭（自带键盘处理，不依赖 Modal）。
    await act(async () =>
      window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    assert.equal(closed, 1);
  });
});

// ————————————————————————————————————————————————————————————————
// 「下载」的鉴权与失败分档（V1 终判的唯一 FAIL，父任务裁决 §9.9）。
// W7 的下载端点走 `Depends(current_user_id)`，匿名必 401，而 `<a download>` 是纯浏览器
// 导航、带不了 `Authorization` 头 —— 所以这颗按钮改成 button + W4 的执行器。
// ————————————————————————————————————————————————————————————————

test("下载按钮不再是 <a download> 纯导航（带不了 Authorization 头）", async () => {
  const source = await readFile(resolve("src/shell/ImageLightbox.tsx"), "utf8");
  // 静态渲染下（首帧、登录态未知）就已经是 button，不是带 download 属性的链接。
  const html = markup({ templates: [TPL_A] });
  assert.match(html, /<button[^>]*data-showcase-action="download"/);
  assert.doesNotMatch(html, /data-showcase-action="download"[^>]*\sdownload=""/);
  // 组件自己不发下载请求：取 blob/落盘/拼路径全在 W4 的 `template-download.ts` 里。
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /\bfetch\(/);
  assert.doesNotMatch(code, /createObjectURL|Bearer/);
  assert.match(code, /from "\.\/template-download"/);
});

test("未登录：下载呈现为「登录后下载」并指向账户页，不让用户点下去才吃 401", async () => {
  AUTH.signedIn = false;
  await withDom(async ({ render, read }) => {
    let calls = 0;
    await render({
      templates: [TPL_A],
      async downloadTemplate() {
        calls += 1;
      },
    });
    const view = read();
    assert.equal(view.download.tag, "A");
    assert.equal(view.download.state, "signed-out");
    assert.equal(view.download.text, "登录后下载");
    assert.equal(view.download.href, "/account");
    // 未登录态**不是**报错态：报错行不该先冒出来吓人。
    assert.equal(view.issue, null);
    assert.equal(calls, 0, "未登录时不得偷偷发一次必然 401 的下载");

    // 站点可以传自己 locale-aware 的账户页。
    await render({ templates: [TPL_A], accountHref: "/ja/account" });
    assert.equal(read().download.href, "/ja/account");
  });
});

test("未登录但素材自带 https 直链：不需要登录，仍是普通下载按钮", async () => {
  AUTH.signedIn = false;
  await withDom(async ({ render, read }) => {
    // TPL_B 自带 https 直链 → 不过端点、没有配额、也就不该被登录拦住。
    await render({ templates: [TPL_B], async downloadTemplate() {} });
    const view = read();
    assert.equal(view.download.tag, "BUTTON");
    assert.equal(view.download.text, "下载");
    assert.notEqual(view.download.state, "signed-out");
  });
});

test("下载中：按钮禁用且文案变「下载中…」，重复点不会重复发起", async () => {
  AUTH.signedIn = true;
  await withDom(async ({ render, click, read }) => {
    let calls = 0;
    let release;
    await render({
      templates: [TPL_A],
      downloadTemplate() {
        calls += 1;
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    });

    await click('[data-showcase-action="download"]');
    const pending = read();
    assert.equal(pending.download.state, "pending");
    assert.equal(pending.download.text, "下载中…");
    assert.equal(pending.download.disabled, true);
    assert.equal(calls, 1);

    // 再点两次：disabled 的 button 不会派发 click，即使派发也被 pending 挡住。
    await click('[data-showcase-action="download"]');
    await click('[data-showcase-action="download"]');
    assert.equal(calls, 1, "下载中不得重复发起");

    await act(async () => {
      release();
    });
    const done = read();
    assert.equal(done.download.state, "idle");
    assert.equal(done.download.text, "下载");
    assert.equal(done.download.disabled, false);
    assert.equal(done.issue, null, "成功不该留下报错行");
  });
});

test("失败分档：401 / 429 / 已下线 / 其它 四种文案互不相同", async () => {
  AUTH.signedIn = true;
  // W4 的 `TemplateDownloadError` 带 `code` 与 `status`；这里两种携带方式都验一遍，
  // 免得 W4 日后只改其中一处时本组件把 429 静默降级成「下载失败」。
  const cases = [
    { throw: { code: "unauthorized", status: 401 }, issue: "auth", text: "请先登录后再下载。" },
    { throw: { code: "quota-exceeded", status: 429 }, issue: "quota", text: "今日下载次数已达上限，请明天再试。" },
    { throw: { code: "not-found", status: 404 }, issue: "notFound", text: "这份模板素材不存在或已下线。" },
    { throw: { code: "network-error", status: 0 }, issue: "failed", text: "下载失败，请重试。" },
    // 只有裸状态码（没有 code）时也必须分对。
    { throw: { status: 429 }, issue: "quota", text: "今日下载次数已达上限，请明天再试。" },
    { throw: { status: 401 }, issue: "auth", text: "请先登录后再下载。" },
  ];

  const seen = new Map();
  for (const scenario of cases) {
    AUTH.signedIn = true;
    await withDom(async ({ render, click, read }) => {
      await render({
        templates: [TPL_A],
        async downloadTemplate() {
          throw Object.assign(new Error("boom"), scenario.throw);
        },
      });
      await click('[data-showcase-action="download"]');
      const view = read();
      assert.equal(view.issue, scenario.issue, `${JSON.stringify(scenario.throw)} 应归 ${scenario.issue}`);
      assert.equal(view.issueText, scenario.text);
      // 失败后必须能再点一次（pending 要解开），否则用户被卡死。
      assert.equal(view.download.disabled, false);
      seen.set(scenario.issue, scenario.text);
    });
  }

  // 四档文案两两不同——「统一报下载失败」正是本轮要修的东西。
  assert.equal(new Set(seen.values()).size, 4);
  assert.deepEqual([...seen.keys()].sort(), ["auth", "failed", "notFound", "quota"]);
});

test("401 之后按钮改回「登录后下载」，不让用户空点第二次", async () => {
  AUTH.signedIn = true; // 开卡时还有会话，点下去才发现已过期
  await withDom(async ({ render, click, read }) => {
    await render({
      templates: [TPL_A],
      async downloadTemplate() {
        throw Object.assign(new Error("expired"), { code: "unauthorized", status: 401 });
      },
    });
    assert.equal(read().download.tag, "BUTTON");
    await click('[data-showcase-action="download"]');
    const view = read();
    assert.equal(view.issue, "auth");
    assert.equal(view.download.tag, "A");
    assert.equal(view.download.text, "登录后下载");
    assert.equal(view.download.href, "/account");
  });
});

test("切换模板会清掉上一份的报错，不粘在新选中的那份上", async () => {
  AUTH.signedIn = true;
  await withDom(async ({ render, click, read }) => {
    await render({
      templates: [TPL_A, TPL_B],
      async downloadTemplate(template) {
        if (template.id === "poster-a") {
          throw Object.assign(new Error("quota"), { code: "quota-exceeded", status: 429 });
        }
      },
    });
    await click('[data-showcase-action="download"]');
    assert.equal(read().issue, "quota");

    await click('[data-template-thumb][data-template-id="poster-b"]');
    assert.equal(read().issue, null, "换了模板还挂着上一份的配额报错就是串档");
  });
});

test("默认下载执行器就是 W4 的 downloadTemplateMaterial（真链路，不是替身）", async () => {
  // 不传 `downloadTemplate`，让组件走默认导入，用假 fetch 让 W7 的端点回 429，
  // 验证「组件 → W4 实现 → 状态码 → 配额文案」这一整条真的接上了。
  AUTH.signedIn = true;
  AUTH.token = "test-access-token";
  await withDom(async ({ render, click, read }) => {
    const requests = [];
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), auth: init?.headers?.Authorization });
      return new Response("", { status: 429 });
    };
    try {
      await render({ templates: [TPL_A] });
      await click('[data-showcase-action="download"]');
      const view = read();
      assert.equal(view.issue, "quota");
      assert.equal(view.issueText, "今日下载次数已达上限，请明天再试。");
      assert.equal(requests.length, 1);
      // W7 的端点按 **templateId** 定位（明确拒收 artifactId），且必须带 Bearer。
      assert.match(requests[0].url, /\/v1\/template-materials\/poster-a\/download$/);
      assert.equal(requests[0].auth, "Bearer test-access-token");
    } finally {
      if (previousFetch) globalThis.fetch = previousFetch;
      else delete globalThis.fetch;
    }
  });
});

// 17 语判据（与 W3 在 `home-card-data-contract.test.mjs` 里那套同口径）。
// 那份清单是 W3 的边界，本轮新增的下载态词条由本文件自己钉，免得两边抢同一个文件。
const LOCALES = [
  "zh", "zh-TW", "en", "de", "es", "es-419", "fr", "it", "pt-BR",
  "pt-PT", "ja", "ko", "ar", "th", "tr", "vi", "hi",
];
const CHINESE_LOCALES = new Set(["zh", "zh-TW"]);

/** 本轮 W2 新加的五条（下载鉴权与失败分档）。`下载` / `编辑模板` 等是 W3 的既有词条。 */
const W2_DOWNLOAD_COPY = [
  "登录后下载",
  "下载中…",
  "请先登录后再下载。",
  "今日下载次数已达上限，请明天再试。",
  "这份模板素材不存在或已下线。",
];

/** zh-TW 必须真本地化而不是逐字转繁的那几条（机器转换给不出右边的写法）。 */
const ZH_TW_MUST_DIFFER = {
  登录后下载: "登入後下載", // 台湾用「登入」不是「登录」
  "下载中…": "下載中…",
  "请先登录后再下载。": "請先登入後再下載。",
  "今日下载次数已达上限，请明天再试。": "今日下載次數已達上限，請明天再試。",
  "这份模板素材不存在或已下线。": "這份範本素材不存在或已下架。", // 模板→範本、下线→下架
};

const uiDictionaries = new Map();
for (const locale of LOCALES) {
  const mod = await import(`../src/i18n/ui/messages/${locale}.ts`);
  uiDictionaries.set(locale, mod.default);
}

test("本文件 tt() 的每条中文文案在 17 语词典里都有译文", async () => {
  const source = await readFile(resolve("src/shell/ImageLightbox.tsx"), "utf8");
  const literals = [...source.matchAll(/tt\("((?:[^"\\]|\\.)*)"\)/g)]
    .map(([, literal]) => literal)
    .filter((literal) => /[\u4e00-\u9fff]/.test(literal));
  // 组件真的在用这些词条，否则下面的循环会空转成一条永远为真的断言。
  for (const expected of ["编辑模板", "下载", "切换模板", ...W2_DOWNLOAD_COPY]) {
    assert.ok(literals.includes(expected), `组件应通过 tt("${expected}") 取文案`);
  }
  for (const [locale, dict] of uiDictionaries) {
    const missing = literals.filter((literal) => typeof dict[literal] !== "string" || !dict[literal].trim());
    assert.deepEqual(missing, [], `${locale} 词典缺少: ${missing.join(", ")}`);
  }
});

test("W2 新增的五条词条：zh 是 key===值，15 个非中文 locale 真的翻了", () => {
  const zh = uiDictionaries.get("zh");
  for (const key of W2_DOWNLOAD_COPY) {
    assert.equal(zh[key], key, `zh 的 "${key}" 必须 key===值`);
  }
  const placeholder = /\bTODO\b|\bTBD\b|\bFIXME\b|\bXXX\b|\?\?\?|机翻|待翻译|[Uu]ntranslated/;
  for (const key of W2_DOWNLOAD_COPY) {
    for (const [locale, dict] of uiDictionaries) {
      if (CHINESE_LOCALES.has(locale)) continue;
      const value = dict[key];
      assert.notEqual(value, key, `${locale} 的 "${key}" 还是中文源串（未翻译）`);
      assert.doesNotMatch(value, placeholder, `${locale} 的 "${key}" 像占位`);
      // 汉字残留启发式对 ja/ko 不成立（它们的正确译文本就含 CJK 码位）。
      if (locale !== "ja" && locale !== "ko") {
        assert.doesNotMatch(value, /[\u4e00-\u9fff]/, `${locale} 的 "${key}" 残留汉字`);
      }
    }
  }
});

test("W2 新增的五条词条：zh-TW 是真繁体本地化，不是逐字转繁", () => {
  const zhTW = uiDictionaries.get("zh-TW");
  for (const [key, expected] of Object.entries(ZH_TW_MUST_DIFFER)) {
    assert.equal(zhTW[key], expected, `zh-TW 的 "${key}" 应为「${expected}」`);
    assert.notEqual(zhTW[key], key, `zh-TW 的 "${key}" 不能照抄简体`);
  }
  // 五条全部在名单里：新加第六条却忘了想繁体写法时，这里会红。
  assert.deepEqual(
    new Set(Object.keys(ZH_TW_MUST_DIFFER)),
    new Set(W2_DOWNLOAD_COPY),
  );
});

test("文件规模守卫：≤800 行", async () => {
  const source = await readFile(resolve("src/shell/ImageLightbox.tsx"), "utf8");
  assert.ok(source.split("\n").length <= 800, "ImageLightbox.tsx 超过 800 行硬顶");
});
