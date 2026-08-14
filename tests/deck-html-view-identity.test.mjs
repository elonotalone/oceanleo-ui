// 「查看」不欠耐久身份（tasks11 父级收口）。
//
// 匿名访客在 slide 探索页拿到的是官方模板目录行：那个端点不下发 revision 身份，
// 解析必然 401，`identityBlocked` 对这类行恒为真。「下载」「收藏」被它连坐是对的
// ——那两件事真的要先知道是哪一版；「查看」要的只是一个地址，而那个地址是服务端
// 照着这一行自己钉住的那一版出具、又过了 `safeDeckHtmlRuntimeUrl()` 的隔离域判据。
// 连坐它的后果，就是三件网页版演示对未登录访客永远打不开。
//
// 这份钉两件事：例外成立（查看出得来），以及例外**只**给官方目录行，
// 且不顺手把下载/收藏放行。

import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const ARTIFACT_CLIENT = dataModule(`
  export const ARTIFACT_LIBRARY_CHANGE_EVENT = "oceanleo:artifact-library-change";
  export function artifactDownloadEvidence(){
    return { visible: true, available: true, reason: "", purpose: "source", mode: "attachment" };
  }
  export function artifactDownloadTypeHint(){ return { ext: "", mediaType: "" }; }
  export async function getArtifactDownload(){ return { ok: true, data: {} }; }
  export async function getArtifactItem(){ return { ok: false, status: 404 }; }
  export async function getCurrentArtifactItem(){ return { ok: false, status: 401 }; }
  export async function prepareArtifactForAction(action, item){ return { ok: true, data: item }; }
  export async function setArtifactFavorite(){ return { ok: true, data: {} }; }
  export async function refreshArtifactRendition(){ return { ok: false, status: 404 }; }
  export async function ensureDurableArtifactItem(){ return { ok: false, status: 404 }; }
  export async function getArtifactEditDecision(){ return { ok: false, status: 404 }; }
  export async function resolveArtifactEditOwnership(){ return { ok: false, status: 404 }; }
  export async function getCurrentPrincipalId(){ return { ok: false, status: 404 }; }
  export async function forkArtifact(){ return { ok: false, status: 404 }; }
  export async function createArtifactRevision(){ return { ok: false, status: 404 }; }
  export async function bindArtifactToContext(){ return { ok: false, status: 404 }; }
  export async function retireArtifact(){ return { ok: false, status: 404 }; }
  export function primeCurrentPrincipalId(){}
  export function resetCurrentPrincipalId(){}
`);

const SHELL_OVERRIDES = {
  "../i18n/ui/useUI": dataModule("export function useUI(){ return (zh) => zh; }"),
  "./artifact-client": ARTIFACT_CLIENT,
  "./AdvancedContentWorkbench": dataModule(
    "export function AdvancedContentWorkbench(){ return null; }",
  ),
  "./WorkspaceSession": dataModule(
    "export function useOptionalWorkspaceSession(){ return null; }",
  ),
};

const { ArtifactActionButtons, artifactActionMatrix } = await import(
  await compileModule("src/shell/ArtifactActions.tsx", SHELL_OVERRIDES)
);

const RUNTIME = `https://s-${"a1b2c3d4".repeat(4)}.oceanleo.app/embed`;

/** 官方模板目录行：逐字照 `templateMaterialLibraryItem()` 铸出来的形状。 */
function templateRow({ runtime = RUNTIME, artifactId = "nocturne-artifact" } = {}) {
  const id = "ppt-year-summary-6";
  const key = `template-material:${id}`;
  return {
    key,
    source: "artifact",
    id: key,
    kind: "image",
    title: "夜间海岸观测：2026 年度影像汇报",
    siteId: "ppt",
    url: "https://asset.oceanleo.com/nocturne.webp",
    previewUrl: "https://asset.oceanleo.com/nocturne.webp",
    thumbUrl: "https://asset.oceanleo.com/nocturne.webp",
    favorite: false,
    meta: {
      workspace_library_surface: "materials",
      template_material_id: id,
      template_material_site_key: "ppt",
      template_material_app_id: "year-summary",
      ...(artifactId ? { template_material_artifact_id: artifactId } : {}),
      template_material_artifact_type: "deck",
      template_material_download_path: `/v1/template-materials/${id}/download`,
      width: 1920,
      height: 1080,
      deliveryFamily: "html",
      ...(runtime ? { activeRuntimeUrl: runtime } : {}),
    },
  };
}

function renderActions(item, identity) {
  const matrix = artifactActionMatrix(item, {
    hidePreview: true,
    canOpenEdit: true,
    materialEditRoute: "in-place",
  });
  return renderToStaticMarkup(
    createElement(ArtifactActionButtons, {
      item,
      matrix,
      identity,
      onEdit: () => {},
    }),
  );
}

for (const [label, identity] of [
  ["身份还在解析", { resolving: true }],
  ["身份解析失败（匿名必然如此）", { failed: true, reason: "未登录" }],
]) {
  test(`官方模板目录行：${label}时「查看」照常出得来`, () => {
    const html = renderActions(templateRow(), identity);
    const anchor = html.match(/<a\b[^>]*data-deck-html-view="true"[^>]*>/);
    assert.ok(anchor, `「查看」被身份闸压掉了：${label}`);
    assert.ok(anchor[0].includes(`href="${RUNTIME}"`));
    assert.ok(anchor[0].includes('target="_blank"'));
    assert.ok(anchor[0].includes('rel="noopener noreferrer"'));
    // 隔离域的东西只在新窗口开，站内绝不套框。
    assert.doesNotMatch(html, /<iframe|srcdoc/);
  });
}

test("例外只给「查看」：下载与收藏仍旧按不动", () => {
  const html = renderActions(templateRow(), {
    failed: true,
    reason: "没取到这份素材的当前版本",
  });
  assert.match(html, /data-deck-html-view="true"/);
  const download = html.match(/<button\b[^>]*aria-label="下载「[^"]*"[^>]*>/);
  assert.ok(download, "「下载」不该消失，它应该留在原地并说明原因");
  assert.ok(download[0].includes("disabled"), "身份未决时「下载」必须按不动");
});

test("例外的边界：不是官方目录行时，身份闸逐字照旧", () => {
  // 去掉 `template_material_artifact_id` 就不再是「要在详情里解析成真素材」的目录行，
  // 这一行也就不在例外里——它与今天的行为逐字一致。
  const notCatalog = templateRow({ artifactId: "" });
  const html = renderActions(notCatalog, { failed: true });
  assert.doesNotMatch(html, /data-deck-html-view="true"/);
});

test("fail-closed 未被放宽：runtime 地址不合格时，例外也变不出「查看」", () => {
  const spoofed = templateRow({ runtime: "https://evil.example/embed" });
  const html = renderActions(spoofed, { failed: true });
  assert.doesNotMatch(html, /data-deck-html-view="true"/);
  assert.doesNotMatch(html, /evil\.example/);
});
