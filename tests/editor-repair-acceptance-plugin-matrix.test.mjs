/**
 * V1 acceptance: every plugin type shares load/save/theme/round-trip routing.
 * Calls the live registry, save contract, and capability functions — not source
 * strings. A hole here is a shared failure, not a per-plugin cosmetic miss.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ARTIFACT_TYPES } from "../src/shell/artifact-contract.ts";
import { artifactSaveContractFor } from "../src/shell/doc-editors/artifact-save-contract.ts";
import { compileModule } from "./helpers/module-bench.mjs";
import {
  TRUSTED_EDITOR_REGISTRY,
  artifactTypeHasRoutableEditor,
  editorAdapterForArtifactCapability,
} from "../src/shell/workbench-capability-registry.ts";
import { editorCapabilityFor } from "../src/shell/workbench-routes.ts";

const { PLUGIN_THEME_SPECS, pluginThemeIdForAdapter } = await import(
  await compileModule("src/shell/plugin-theme.tsx")
);

const PLUGINS = [
  {
    adapter: "richdoc",
    themeId: "richdoc",
    artifactType: "document",
    capability: "richdoc-editor",
    item: {
      kind: "document",
      title: "brief.md",
      url: "https://files.test/brief.md",
      meta: { mime: "text/markdown", filename: "brief.md" },
    },
  },
  {
    adapter: "grid",
    themeId: "grid",
    artifactType: "grid",
    capability: "grid-editor",
    item: {
      kind: "sheet",
      title: "sheet.xlsx",
      url: "https://files.test/sheet.xlsx",
      meta: {
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename: "sheet.xlsx",
      },
    },
  },
  {
    adapter: "chart-editor@1",
    themeId: "chart-editor",
    artifactType: "chart",
    capability: "chart-editor",
    item: {
      kind: "image",
      title: "chart",
      url: "https://files.test/chart.json",
      content: JSON.stringify({
        title: { text: "收入" },
        series: [{ type: "bar", data: [1, 2] }],
      }),
      meta: {
        content_type: "chart",
        editor: {
          schema: "oceanleo.editor-manifest.v1",
          id: "chart-editor",
          version: 1,
          capabilities: ["load", "mutate", "save", "reopen"],
          source: { kind: "inline", format: "echarts-option+json" },
        },
      },
    },
  },
  {
    adapter: "deck",
    themeId: "deck",
    artifactType: "deck",
    capability: "deck-editor",
    item: {
      kind: "ppt",
      title: "deck.pptx",
      url: "https://files.test/deck.pptx",
      meta: {
        mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename: "deck.pptx",
      },
    },
  },
  {
    adapter: "image",
    themeId: "image",
    artifactType: "single_file_image",
    capability: "image-editor",
    item: {
      kind: "image",
      title: "photo.png",
      url: "https://files.test/photo.png",
      meta: { mime: "image/png", filename: "photo.png" },
    },
  },
  {
    adapter: "pdf",
    themeId: "pdf",
    artifactType: "pdf",
    capability: "pdf-editor",
    item: {
      kind: "file",
      title: "doc.pdf",
      url: "https://files.test/doc.pdf",
      meta: { mime: "application/pdf", filename: "doc.pdf" },
    },
  },
  {
    adapter: "audio",
    themeId: "audio",
    artifactType: "audio",
    capability: "audio-editor",
    item: {
      kind: "audio",
      title: "track.mp3",
      url: "https://files.test/track.mp3",
      meta: { mime: "audio/mpeg", filename: "track.mp3" },
    },
  },
  {
    adapter: "video-timeline",
    themeId: "video-timeline",
    artifactType: "video",
    capability: "video-editor",
    item: {
      kind: "video",
      title: "clip.mp4",
      url: "https://files.test/clip.mp4",
      meta: { mime: "video/mp4", filename: "clip.mp4" },
    },
  },
  {
    adapter: "threed",
    themeId: "threed",
    artifactType: "model_3d",
    capability: "model3d-editor",
    item: {
      kind: "threed",
      title: "model.glb",
      url: "https://files.test/model.glb",
      meta: { mime: "model/gltf-binary", filename: "model.glb" },
    },
  },
  {
    adapter: "game",
    themeId: "game",
    artifactType: "game",
    capability: "game-editor",
    item: {
      kind: "game",
      title: "play.html",
      url: "https://files.test/play.html",
      meta: {
        mime: "text/html",
        filename: "play.html",
        advanced_editor_route: "game",
      },
    },
  },
  {
    adapter: "design-canvas",
    themeId: "design-canvas",
    artifactType: "composite_image",
    capability: "design-canvas-editor",
    item: {
      kind: "canvas",
      title: "poster",
      url: "https://files.test/poster.json",
      meta: { advanced_editor_route: "embed", editor: "design-canvas" },
    },
  },
  {
    adapter: "website",
    themeId: "website",
    artifactType: "website",
    capability: "website-editor",
    item: {
      kind: "website",
      title: "site",
      meta: { draft: true, blank: true },
    },
  },
  {
    adapter: "video-canvas",
    themeId: "video-canvas",
    artifactType: "video",
    capability: "video-canvas-editor",
    item: {
      kind: "video_canvas",
      title: "timeline",
      url: "https://files.test/timeline.json",
      meta: { advanced_editor_route: "embed", editor: "video-canvas" },
    },
  },
];

function libraryItem(plugin, extra = {}) {
  return {
    key: `accept:${plugin.adapter}`,
    source: "artifact",
    id: plugin.adapter,
    favorite: false,
    siteId: "word",
    ...plugin.item,
    ...extra,
    meta: { ...(plugin.item.meta || {}), ...(extra.meta || {}) },
  };
}

test("13 plugins are registered for theme, round-trip, and save contract", () => {
  assert.equal(PLUGINS.length, 13);
  assert.deepEqual(Object.keys(PLUGIN_THEME_SPECS).sort(), [
    ...new Set(PLUGINS.map((plugin) => plugin.themeId)),
  ].sort());

  for (const plugin of PLUGINS) {
    const entry = TRUSTED_EDITOR_REGISTRY[plugin.adapter];
    assert.ok(entry, `${plugin.adapter} missing from TRUSTED_EDITOR_REGISTRY`);
    assert.equal(entry.routable, true, `${plugin.adapter} must be routable`);
    assert.deepEqual(
      [...entry.roundTrip],
      ["load", "mutate", "save", "reopen"],
      `${plugin.adapter} round-trip`,
    );
    assert.equal(
      pluginThemeIdForAdapter(plugin.adapter),
      plugin.themeId,
      `${plugin.adapter} theme id`,
    );
    const contract = artifactSaveContractFor(plugin.artifactType);
    assert.ok(
      contract,
      `${plugin.adapter} artifactType ${plugin.artifactType} has no save contract`,
    );
    assert.ok(
      contract.required.length + contract.requiredAnyOf.length > 0,
      `${plugin.artifactType} save contract must require a rendition`,
    );
    assert.equal(
      artifactTypeHasRoutableEditor(plugin.artifactType),
      true,
      `${plugin.artifactType} must have a routable editor`,
    );
  }
});

test("every built-in artifact type that has an editor still has a save contract", () => {
  for (const artifactType of ARTIFACT_TYPES) {
    if (!artifactTypeHasRoutableEditor(artifactType)) continue;
    const contract = artifactSaveContractFor(artifactType);
    assert.ok(contract, `${artifactType} is routable but has no save contract`);
  }
});

test("capability routing does not send typed documents to the retired office adapter", () => {
  for (const plugin of PLUGINS) {
    const capability = editorCapabilityFor(libraryItem(plugin));
    assert.equal(
      capability.available,
      true,
      `${plugin.adapter}: ${capability.unavailableReason || "unavailable"}`,
    );
    assert.notEqual(
      capability.adapter,
      "office",
      `${plugin.adapter} leaked to legacy office`,
    );
    assert.notEqual(capability.route?.type, "none");
  }
  assert.equal(editorAdapterForArtifactCapability("office-editor"), null);
});
