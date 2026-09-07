import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;

const OVERRIDES = {
  "../i18n/ui/useUI": dataModule(
    "export function useUI(){ return (zh) => zh; }",
  ),
  "next/navigation": dataModule(
    "export function useRouter(){ return { push(){}, replace(){}, refresh(){}, back(){} }; }\n" +
      "export function useSearchParams(){ return new URLSearchParams(); }\n" +
      "export function usePathname(){ return '/'; }",
  ),
  "./CloudBrowserPanel": dataModule("export function CloudBrowserPanel(){ return null; }"),
  "./ResultCanvas": dataModule("export function ResultCanvas(){ return null; }"),
  "./ArtifactRenderer": dataModule("export function ArtifactRenderer(){ return null; }"),
  "./ModelGroupPicker": dataModule("export function ModelGroupPicker(){ return null; }"),
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
  `),
};

const lazyStub = dataModule(
  "const noop = () => undefined;\n" +
    "export default new Proxy(noop, { get: () => noop });\n" +
    "export const __stub = true;\n",
);

async function load(rel) {
  return import(
    await compileModule(`src/shell/${rel}`, OVERRIDES, {
      missingPackageStub: lazyStub,
    })
  );
}

test("LeoComposer：在上传按键右侧渲染插件按键（带有指定的插件图标）", async () => {
  const { LeoComposer } = await load("LeoComposer.tsx");
  const html = renderToStaticMarkup(
    createElement(LeoComposer, {
      value: "",
      onChange() {},
      onAttachFiles() {},
      leoSuggest: true,
    }),
  );

  // 1. 包含上传按键
  assert.match(html, /aria-label="添加附件"/);
  // 2. 包含插件按键
  assert.match(html, /aria-label="插件与连接器"/);
  // 3. 插件按键使用 data:image/png;base64 作为图标
  assert.match(html, /<img[^>]*src="data:image\/png;base64,[^"]*"[^>]*alt="插件与连接器"/);
  // 4. 插件按键在上传按键之后、leo 建议按键之前
  const attachIdx = html.indexOf('aria-label="添加附件"');
  const pluginIdx = html.indexOf('aria-label="插件与连接器"');
  const leoIdx = html.indexOf('title="让 leo 帮你处理这段内容');
  assert.ok(attachIdx < pluginIdx, "插件按键必须在上传按键右侧");
  assert.ok(pluginIdx < leoIdx, "插件按键在 leo 建议之前");
});

test("LeoComposer：支持通过 showPlugins={false} 隐藏插件按键", async () => {
  const { LeoComposer } = await load("LeoComposer.tsx");
  const html = renderToStaticMarkup(
    createElement(LeoComposer, {
      value: "",
      onChange() {},
      onAttachFiles() {},
      showPlugins: false,
    }),
  );
  assert.doesNotMatch(html, /aria-label="插件与连接器"/);
});

test("LeoAssistant：停用 / 启用状态管理与事件切换", async () => {
  const { isLeoEnabled, setLeoEnabled, LEO_ENABLED_KEY } = await load("LeoAssistant.tsx");
  
  // 模拟 window / localStorage
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };
  globalThis.window = {
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  setLeoEnabled(true);
  assert.equal(isLeoEnabled(), true);

  setLeoEnabled(false);
  assert.equal(isLeoEnabled(), false);
  assert.equal(storage.get(LEO_ENABLED_KEY), "0");

  setLeoEnabled(true);
  assert.equal(isLeoEnabled(), true);
  assert.equal(storage.get(LEO_ENABLED_KEY), "1");
});

test("LeoAssistant：渲染包含“停用”/“启用”按键与关闭按键", async () => {
  const { LeoAssistant } = await load("LeoAssistant.tsx");
  const html = renderToStaticMarkup(
    createElement(LeoAssistant, {
      siteId: "test-site",
    }),
  );
  // 包含停用/启用按键以及关闭按键
  assert.match(html, /aria-label="停用"/);
  assert.match(html, /aria-label="关闭"/);
});
