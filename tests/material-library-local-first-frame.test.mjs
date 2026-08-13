import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const OVERRIDES = {
  "../i18n/ui/useUI": dataModule(
    "export function useUI(){ return (message, values = {}) => message.replace(/\\{(\\w+)\\}/g, (_, key) => values[key] ?? ''); }",
  ),
  "./AdvancedContentWorkbench": dataModule(
    "export function AdvancedContentWorkbench(){ return null; }",
  ),
  "./WorkspaceSession": dataModule(
    "export function useOptionalWorkspaceSession(){ return null; }",
  ),
  "./workbench-material-registry": dataModule(`
    export function materialScopeKey(siteId, appId){ return siteId + ":" + appId; }
    export function registerWorkbenchMaterialSource(){ return () => {}; }
  `),
  "./artifact-client": dataModule(`
    export const ARTIFACT_LIBRARY_CHANGE_EVENT = "oceanleo:artifact-library-change";
    export function artifactDownloadEvidence(){
      return { visible: true, available: true, reason: "", purpose: "source", mode: "attachment" };
    }
    export async function getArtifactDownload(){ return { ok: true, data: {} }; }
    export async function getArtifactItem(){ return { ok: false, status: 404 }; }
    export async function getCurrentArtifactItem(){ return { ok: false, status: 404 }; }
    export async function listPrimaryArtifacts(){ return { ok: true, data: { items: [], nextCursor: null } }; }
    export async function listEditableShelfArtifacts(){ return { ok: true, data: { items: [], nextCursor: null } }; }
    export async function searchArtifactLibrary(){ return { ok: true, data: { items: [], nextCursor: null } }; }
  `),
  "./WorkspaceLibrary": dataModule(`
    import { createElement } from ${JSON.stringify(reactUrl)};
    export function WorkspaceLibrary(props) {
      return createElement(
        "section",
        {
          "data-workspace-library": "true",
          "data-open-item-handoff": String(typeof props.onOpenItem === "function"),
        },
        props.toolbarActions,
        ...props.entries.map((entry) =>
          createElement(
            "button",
            { key: entry.id, type: "button", "aria-label": "预览「" + entry.title + "」" },
            entry.title,
          ),
        ),
      );
    }
  `),
};
const { MaterialLibrary } = await import(
  await compileModule("src/shell/material-library-view.tsx", OVERRIDES),
);

const CONTEXT_ID = "olctx:v1:asset:app:asset";

function durableItem({
  artifactId = "asset-root",
  revisionId = "asset-rev-2",
  title = "Durable migrated asset",
  contextId = CONTEXT_ID,
} = {}) {
  const artifact = {
    schema: "oceanleo.artifact.v1",
    artifactId,
    revisionId,
    artifactType: "single_file_image",
    roles: ["approved_inventory_example"],
    owner: {
      principalId: "workspace:asset",
      visibility: "workspace",
      originSiteKey: "asset",
      originAppId: "asset",
      originFunctionId: null,
    },
    access: {
      canRead: true,
      canPreview: true,
      canEdit: true,
      canFork: false,
      canInsert: true,
      canReplace: true,
      canFavorite: true,
      canBind: true,
      canExportSource: true,
    },
    editability: "bounded",
    editorCapability: "image-editor",
    sourceFormat: "png",
    title,
    favorite: false,
    renditions: {
      preview: {
        purpose: "preview",
        revisionId,
        url: `https://signed.example/${artifactId}-preview`,
        mediaType: "image/png",
        format: "png",
        expiresAt: null,
        rendererVersion: null,
        width: 1200,
        height: 800,
        durationMs: null,
        digest: `sha256:${artifactId}-preview`,
      },
      source: {
        purpose: "source",
        revisionId,
        url: `https://signed.example/${artifactId}-source`,
        mediaType: "image/png",
        format: "png",
        expiresAt: null,
        rendererVersion: null,
        width: 1200,
        height: 800,
        durationMs: null,
        digest: `sha256:${artifactId}-source`,
      },
    },
    scene: null,
    provenance: {
      id: `provenance-${artifactId}`,
      sourceKind: "owned",
      licenseCode: "internal",
      licenseUrl: "",
      attribution: "",
    },
    bindings: [
      {
        contextId,
        role: "approved_inventory_example",
        rank: 1,
        pinnedRevisionId: revisionId,
      },
    ],
    integrity: {
      ok: true,
      code: "ok",
      reason: "",
    },
    createdAt: "2026-07-19T00:00:00Z",
  };
  return {
    key: `artifact:${artifactId}:${revisionId}`,
    source: "artifact",
    id: artifactId,
    title,
    kind: "image",
    siteId: "asset",
    url: artifact.renditions.preview.url,
    previewUrl: artifact.renditions.preview.url,
    thumbUrl: artifact.renditions.preview.url,
    favorite: false,
    meta: {
      advanced_editor_route: "image",
    },
    descriptor: {
      contentType: "image",
      representation: "artifact",
      subtype: "png",
      editor: null,
      capabilities: ["load", "save"],
      unavailableReason: "",
    },
    artifactId,
    revisionId,
    artifactType: artifact.artifactType,
    artifact,
  };
}

function material(item) {
  return {
    id: item.id,
    title: item.title,
    thumb: item.thumbUrl,
    libraryItem: item,
  };
}

function renderShelf(props) {
  return renderToStaticMarkup(
    createElement(MaterialLibrary, {
      materials: [],
      siteId: "asset",
      appId: "asset",
      contextId: CONTEXT_ID,
      onOpenItem: () => {},
      ...props,
    }),
  );
}

test("explicit local durable cards render on the first frame without weakening scope", () => {
  const local = durableItem();
  const otherContext = durableItem({
    artifactId: "other-context",
    revisionId: "other-rev",
    title: "Other context asset",
    contextId: "olctx:v1:image:app:asset",
  });
  const html = renderShelf({
    fetchPrimary: false,
    materials: [
      material(local),
      material(otherContext),
      {
        id: "legacy-row",
        title: "Legacy row must stay filtered",
        thumb: "https://signed.example/legacy-preview",
        kind: "image",
      },
    ],
    onSeeAll: () => {},
  });

  assert.match(html, /Durable migrated asset/);
  assert.match(html, /aria-label="预览「Durable migrated asset」"/);
  assert.match(html, /aria-label="打开完整素材库"/);
  assert.match(html, /data-open-item-handoff="true"/);
  assert.doesNotMatch(html, /data-material-shelf-skeleton="true"/);
  assert.doesNotMatch(html, /Other context asset/);
  assert.doesNotMatch(html, /Legacy row must stay filtered/);
});

test("a genuinely empty unsettled shelf still renders only the loading skeleton", () => {
  const html = renderShelf({ materials: [] });

  assert.match(html, /data-material-shelf-state="loading"/);
  assert.match(html, /data-material-shelf-skeleton="true"/);
  assert.doesNotMatch(html, /这里还没有内容|暂无|没有匹配/);
});
