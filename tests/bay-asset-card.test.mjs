// LeoBay ready-made files use the shared Library card primitives.
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
    summary: extra.summary ?? "由卖家上传的素材",
    seller_id: extra.seller_id ?? "seller-1",
    created_at: extra.created_at ?? "2026-11-01T10:00:00Z",
    price_fen: extra.price_fen ?? 0,
    currency: extra.currency ?? "CNY",
    purchase_state: extra.purchase_state ?? "available",
  };
}

function card(extra = {}) {
  return render(React.createElement(BayAssetCard, { asset: asset(extra), onOpen() {} }));
}

test("Bay asset cards render through the shared Workspace card", () => {
  const html = card({ type: "image" });
  assert.match(html, /data-bay-asset-card="library:1"/);
  assert.match(html, /data-shelf-kind="origin"/);
  assert.match(html, /data-collection-card-main/);
  assert.match(html, /示例素材/);
  assert.doesNotMatch(html, /自产|免费商用|M8 5v14l11-7z/);
});

test("list view uses the shared Workspace row for every ready-made type", () => {
  for (const type of ["video", "audio", "document", "3d", "workflow"]) {
    const html = card({ type });
    assert.match(html, /data-bay-asset-card="library:1"/);
    assert.match(html, /data-collection-card-main/);
  }
});
