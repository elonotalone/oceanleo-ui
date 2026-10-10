// 各类型素材卡的 SSR 卡面：授权徽标、自有/开源、音频/字体/文档/3D/视频时长。
import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const { BayAssetCard } = await import(
  await compileModule("src/shell/bay/asset/BayAssetCard.tsx", {
    "../../../i18n/ui/useUI": uiStub,
  })
);

function render(node) {
  return renderToStaticMarkup(node);
}

function license(extra = {}) {
  return {
    code: extra.code ?? "OceanLeo-owned",
    name: extra.name ?? "OceanLeo-owned",
    url: extra.url ?? "",
    commercial_ok: extra.commercial_ok !== false,
    modify_ok: extra.modify_ok !== false,
    attribution_required: extra.attribution_required === true,
    attribution_text: extra.attribution_text ?? "",
  };
}

function asset(extra = {}) {
  return {
    id: extra.id ?? "library:1",
    source: extra.source ?? "oceanleo",
    type: extra.type ?? "image",
    title: extra.title ?? "示例素材",
    thumb_url: extra.thumb_url === undefined ? "https://cdn.example/t.webp" : extra.thumb_url,
    preview_url: extra.preview_url ?? "https://cdn.example/p.webp",
    full_url: extra.full_url ?? "https://cdn.example/f.webp",
    width: extra.width ?? 800,
    height: extra.height ?? 600,
    duration: extra.duration ?? null,
    author: extra.author ?? "作者",
    source_url: extra.source_url ?? "https://example.com/a",
    license: extra.license ?? license(),
    prompt: extra.prompt,
    origin: extra.origin,
    format: extra.format,
    category: extra.category,
  };
}

function card(extra = {}) {
  return render(React.createElement(BayAssetCard, { asset: asset(extra), onOpen() {} }));
}

test("图片卡：封面裁切、自产角标、免费商用徽标", () => {
  const html = card({ type: "image", source: "oceanleo" });
  assert.match(html, /data-bay-asset-card="library:1"/);
  assert.match(html, /object-cover/);
  assert.match(html, /自产/);
  assert.match(html, /免费商用/);
  assert.match(html, /示例素材/);
});

test("视频卡：播放钮与时长", () => {
  const html = card({ type: "video", duration: 65, source: "polyhaven", license: license({ code: "CC0", name: "CC0" }) });
  assert.match(html, /M8 5v14l11-7z/);
  assert.match(html, />1:05</);
  assert.match(html, /外部/);
  assert.match(html, /CC0/);
});

test("音频卡同样有播放钮", () => {
  const html = card({ type: "audio", duration: 12, source: "freesound", license: license({ code: "CC-BY", name: "CC-BY" }) });
  assert.match(html, /M8 5v14l11-7z/);
  assert.match(html, />0:12</);
});

test("贴纸 / 矢量 / 字体：棋盘底 + contain，不裁切", () => {
  for (const type of ["sticker", "vector", "font"]) {
    const html = card({ type, source: "svgrepo", license: license({ code: "MIT", name: "MIT" }) });
    assert.match(html, /object-contain/);
    assert.match(html, /conic-gradient/);
    assert.doesNotMatch(html, /object-cover/);
  }
});

test("PPT / 图表 / 文档：contain 到素色底", () => {
  assert.match(card({ type: "ppt" }), /object-contain/);
  assert.match(card({ type: "chart" }), /object-contain/);
  assert.match(card({ type: "document" }), /object-contain/);
});

test("3D 无预览画立方体；文档无预览画文件", () => {
  const model = card({ type: "3d", thumb_url: "", source: "polyhaven", license: license({ code: "CC0", name: "CC0" }) });
  assert.match(model, /M12 2l9 5v10l-9 5-9-5V7l9-5z/);
  const doc = card({ type: "document", thumb_url: "" });
  assert.match(doc, /M7 3h8l5 5v13H7z/);
});

test("Prompt 卡展示提示词而不是作者行", () => {
  const html = card({
    type: "prompt",
    prompt: "a red fox in snow",
    title: "狐狸",
  });
  assert.match(html, /a red fox in snow/);
  assert.doesNotMatch(html, /作者 · oceanleo/);
});

test("开源字体即使 code 是 Free-Commercial 也不标成自产", () => {
  const html = card({
    type: "font",
    source: "opensource-font",
    license: license({ code: "Free-Commercial", name: "Free-Commercial" }),
  });
  assert.match(html, /外部/);
  assert.doesNotMatch(html, />自产</);
  assert.match(html, /Free-Commercial/);
});
