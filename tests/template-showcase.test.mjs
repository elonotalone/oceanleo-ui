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
// 「编辑模板」与「下载」的深链由 W4 的 `site-catalog-controller` 现算，所以这里接**真**
// 控制器而不是替身：本测试断言的是用户最终点到的那条 URL，替身只会证明「组件调了个函数」。
const showcaseUrl = await compileModule("src/shell/ImageLightbox.tsx", {
  "../i18n/ui/useUI": uiStubUrl,
});

const { TemplateShowcase, ImageLightbox } = await import(showcaseUrl);
// 同一份缓存 → 与组件里跑的是同一个模块实例。
const { TEMPLATE_DOWNLOAD_PATH } = await import(
  await compileModule("src/shell/site-catalog-controller.ts")
);
const { GATEWAY_BASE } = await import(await compileModule("src/lib/auth/config.ts"));

/** W7 端点按 **artifact id** 定位素材（`TemplateMaterial.id` 只保证 app 内唯一）。 */
const downloadHrefOf = (artifactId) =>
  `${GATEWAY_BASE.replace(/\/+$/, "")}${TEMPLATE_DOWNLOAD_PATH}/${artifactId}/download`;

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
  // 下载按 **artifact id** 走 W7 端点（TemplateMaterial.id 只保证 app 内唯一，会全站重名）。
  assert.match(html, /href="https:\/\/[^"]*\/v1\/library\/templates\/art-a\/download"/);
  assert.match(html, /href="\/workspace\/poster\?fill=preset"/);
  // 下载走 <a download>，不是 button + JS。
  assert.match(html, /data-showcase-action="download"[^>]*download=""/);

  // initialTemplateId 指定第二份时，三按钮整体改指 B；B 自带 https 直链 → 优先于端点。
  const second = markup({ templates: [TPL_A, TPL_B], initialTemplateId: "poster-b" });
  assert.match(second, /href="\/workspace\/poster\?open=template&amp;template=poster-b"/);
  assert.match(second, /href="https:\/\/oceanleo-assets[^"]*\/tpl\/poster-b\.psd"/);
  assert.doesNotMatch(second, /art-b\/download/);
  assert.doesNotMatch(second, /template=poster-a/);
});

// W1 的调用点目前仍显式传这两个 `@deprecated` 解析器（拆掉即回到上面的默认路径）。
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
  assert.match(html, /href="\/custom-download\/poster-b"/);
  assert.deepEqual(seen, ["poster-b"]);
  // 覆盖时不得再落到 W4 的默认链上。
  assert.doesNotMatch(html, /v1\/library\/templates/);
  assert.doesNotMatch(html, /open=template/);
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
  assert.match(html, /v1\/library\/templates\/art-a\/download/);
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
  let closed = 0;

  const read = () => ({
    title: container.querySelector("[data-template-showcase-title]")?.textContent,
    summary: container.querySelector("[data-template-showcase-summary]")?.textContent,
    tags: [...container.querySelectorAll("[data-template-showcase-tags] span")].map((n) => n.textContent),
    preview: container.querySelector("[data-template-showcase-preview] img")?.getAttribute("src"),
    edit: container.querySelector('[data-showcase-action="edit"]')?.getAttribute("href"),
    similar: container.querySelector('[data-showcase-action="similar"]')?.getAttribute("href"),
    download: container.querySelector('[data-showcase-action="download"]')?.getAttribute("href"),
    active: container.querySelector('[data-template-thumb][data-active="1"]')?.getAttribute("data-template-id"),
  });

  try {
    await act(async () =>
      root.render(
        React.createElement(TemplateShowcase, {
          ...BASE,
          templates: [TPL_A, TPL_B],
          onClose() {
            closed += 1;
          },
        }),
      ),
    );

    // 打开即聚焦关闭键（a11y 不得回归）。
    assert.equal(window.document.activeElement?.getAttribute("aria-label"), "关闭");

    const first = read();
    assert.equal(first.active, "poster-a");
    assert.equal(first.title, "夏季促销海报");
    assert.match(first.summary, /3:4 竖版促销主视觉/);
    assert.deepEqual(first.tags, ["促销", "竖版"]);
    assert.match(first.preview, /image-poster-1\.webp$/);
    assert.equal(first.edit, "/workspace/poster?open=template&template=poster-a");
    assert.equal(first.download, downloadHrefOf("art-a"));
    assert.equal(first.similar, "/workspace/poster?fill=preset");

    // ——— 点第二颗缩略图 ———
    const thumbB = container.querySelector('[data-template-thumb][data-template-id="poster-b"]');
    assert.ok(thumbB, "缩略图条上应有第二份模板");
    await act(async () => thumbB.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));

    const second = read();
    assert.equal(second.active, "poster-b");
    // 右侧四项全部跟随（标题/说明/标签/主预览）。
    assert.equal(second.title, "新品发布长图");
    assert.match(second.summary, /9:16 长图/);
    assert.doesNotMatch(second.summary, /3:4 竖版促销主视觉/);
    assert.deepEqual(second.tags, ["新品", "长图"]);
    assert.match(second.preview, /image-poster-2\.webp$/);
    // 三个按钮的目标全部跟随：编辑模板与下载改指 B，生成类似仍是 app 级不变。
    assert.equal(second.edit, "/workspace/poster?open=template&template=poster-b");
    assert.equal(second.download, "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/tpl/poster-b.psd");
    assert.equal(second.similar, "/workspace/poster?fill=preset");

    // ——— 切回第一份，确认是真·双向同步而不是「一次性走到 B」———
    const thumbA = container.querySelector('[data-template-thumb][data-template-id="poster-a"]');
    await act(async () => thumbA.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    const back = read();
    assert.equal(back.active, "poster-a");
    assert.equal(back.title, "夏季促销海报");
    assert.deepEqual(back.tags, ["促销", "竖版"]);
    assert.equal(back.edit, "/workspace/poster?open=template&template=poster-a");
    assert.equal(back.download, downloadHrefOf("art-a"));

    // Esc 关闭（自带键盘处理，不依赖 Modal）。
    await act(async () =>
      window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    assert.equal(closed, 1);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});

test("本文件的每条中文文案在 17 语词典里都有译文", async () => {
  // 合同 §3：`编辑模板` / `下载` / `切换模板` 三条由 W3 补进 17 语，现已全部落地，
  // 所以这里不再留豁免——本文件新加任何未翻译的中文串都会立刻变红。
  const source = await readFile(resolve("src/shell/ImageLightbox.tsx"), "utf8");
  const literals = [...source.matchAll(/tt\("((?:[^"\\]|\\.)*)"\)/g)]
    .map(([, literal]) => literal)
    .filter((literal) => /[\u4e00-\u9fff]/.test(literal));
  // 组件真的在用那三条新词条，否则下面的循环会空转成一条永远为真的断言。
  for (const expected of ["编辑模板", "下载", "切换模板"]) {
    assert.ok(literals.includes(expected), `组件应通过 tt("${expected}") 取文案`);
  }
  for (const locale of ["en", "zh-TW", "ar", "ja"]) {
    const dictionary = await readFile(
      resolve(`src/i18n/ui/messages/${locale}.ts`),
      "utf8",
    );
    const missing = literals.filter(
      (literal) => !dictionary.includes(`${JSON.stringify(literal)}:`),
    );
    assert.deepEqual(missing, [], `${locale} 词典缺少: ${missing.join(", ")}`);
  }
});

test("文件规模守卫：≤800 行", async () => {
  const source = await readFile(resolve("src/shell/ImageLightbox.tsx"), "utf8");
  assert.ok(source.split("\n").length <= 800, "ImageLightbox.tsx 超过 800 行硬顶");
});
