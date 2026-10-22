// Native-editors wave guard (2026-10-22): the shell offers a Pro page only for
// grid / pdf / website, no editor mounts a third-party/sub-site web app, and
// removed modules are never imported again.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  PRO_PAGE_EDITORS,
  PRO_PAGE_ID,
  buildPluginPages,
} from "../src/shell/plugin-chrome/plugin-pages.ts";
import { editorCapabilityFor } from "../src/shell/workbench-routes.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|mts|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

const ALL_EDITOR_IDS = [
  "richdoc",
  "grid",
  "deck",
  "image",
  "pdf",
  "audio",
  "video-timeline",
  "threed",
  "game",
  "website",
  "video-canvas",
  // ids that no longer exist must not get a Pro page either
  "chart-editor",
  "design-canvas",
  "",
  "unknown-editor",
];

test("PRO_PAGE_EDITORS is exactly grid / pdf / website", () => {
  assert.deepEqual([...PRO_PAGE_EDITORS].sort(), ["grid", "pdf", "website"]);
});

test("buildPluginPages emits a pro page only for the three allowlisted editors", () => {
  for (const id of ALL_EDITOR_IDS) {
    const pages = buildPluginPages({ pluginId: id });
    const hasPro = pages.some((page) => page.id === PRO_PAGE_ID);
    assert.equal(
      hasPro,
      PRO_PAGE_EDITORS.includes(id),
      `editor "${id}" pro page presence`,
    );
    assert.equal(pages[0].id, "artifact");
  }
  // No plugin id at all fails closed: no Pro page.
  assert.equal(
    buildPluginPages().some((page) => page.id === PRO_PAGE_ID),
    false,
  );
});

test("stale persisted pro mode is ignored for non-Pro editors", async () => {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => void store.set(key, String(value)),
      removeItem: (key) => void store.delete(key),
    },
    addEventListener() {},
  };
  try {
    const mode = await import("../src/shell/plugin-chrome/plugin-mode-store.ts");
    for (const id of ["audio", "deck", "richdoc", "image", "threed", "video-timeline"]) {
      store.set(mode.pluginModeStorageKey(id), "pro");
      mode.resetPluginModeCache();
      assert.equal(mode.currentPluginMode(id), "normal", `${id} stale pro`);
      mode.setPluginMode(id, "pro");
      assert.equal(mode.currentPluginMode(id), "normal", `${id} setPluginMode pro`);
    }
    store.set(mode.pluginModeStorageKey("pdf"), "pro");
    mode.resetPluginModeCache();
    assert.equal(mode.currentPluginMode("pdf"), "pro", "pdf keeps Pro");
  } finally {
    delete globalThis.window;
  }
});

const EDITOR_DIRS = [
  "shell/advanced-routes",
  "shell/media-editors",
  "shell/doc-editors",
  "shell/image-editor",
  "shell/video-editor",
  "shell/website-local",
  "shell/workflow-carrier",
];

// Genuine UGC run sandboxes living under an editor directory would be listed
// here with a reason. None exist today; GameRoute only hands off to the
// sandbox host (game-editor/ is outside the editor dirs above).
const IFRAME_ALLOWLIST = new Map();

test("no editor directory mounts an iframe (third-party / sub-site web app)", () => {
  const hits = [];
  for (const dir of EDITOR_DIRS) {
    for (const file of walk(join(SRC, dir))) {
      const rel = relative(ROOT, file);
      if (IFRAME_ALLOWLIST.has(rel)) continue;
      const text = readFileSync(file, "utf8");
      if (/<iframe\b/i.test(text) || /createElement\(\s*["']iframe["']/.test(text)) {
        hits.push(rel);
      }
    }
  }
  assert.deepEqual(hits, [], `iframe in editor dirs: ${hits.join(", ")}`);
});

const REMOVED_IMPORTS = [
  /AudioHostedFrame/,
  /Model3DHostedFrame/,
  /RichDocHostedRoute/,
  /DeckHostedRoute/,
  /\bChartRoute\b/,
  /chart-editor\//,
  /EmbeddedRoute/,
  /react-video-editor/,
  /waveform-playlist/,
  /hosted-editor-origins/,
  /hosted-local-origin/,
  /client-local-editors/,
];

test("removed modules are never imported again", () => {
  const hits = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    // Only look at import / dynamic import / export-from specifiers.
    const specs = [
      ...text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g),
    ].map((match) => match[1]);
    for (const spec of specs) {
      if (REMOVED_IMPORTS.some((pattern) => pattern.test(spec))) {
        hits.push(`${relative(ROOT, file)} -> ${spec}`);
      }
    }
  }
  assert.deepEqual(hits, [], hits.join("\n"));
});

test("editor directories do not use the sub-site embed pane", () => {
  const hits = [];
  for (const dir of EDITOR_DIRS) {
    for (const file of walk(join(SRC, dir))) {
      const text = readFileSync(file, "utf8");
      if (/EmbedEditorPane|from\s+["'][^"']*workbench-embed["']/.test(text)) {
        hits.push(relative(ROOT, file));
      }
    }
  }
  assert.deepEqual(hits, [], `sub-site embed in editor dirs: ${hits.join(", ")}`);
});

function item(partial) {
  return {
    key: "k",
    source: "creation",
    id: "id",
    title: "t",
    kind: "file",
    siteId: "s",
    favorite: false,
    meta: {},
    ...partial,
  };
}

test("routing never produces an embed route; chart is read-only with a reason", () => {
  const cases = [
    [item({ kind: "website", meta: { draft: true, blank: true } }), "website"],
    [item({ kind: "video_canvas", meta: { advanced_editor_route: "embed" } }), "video-canvas"],
    [item({ kind: "canvas" }), "image"],
    [item({ kind: "canvas", meta: { advanced_editor_route: "embed" } }), "image"],
  ];
  for (const [value, expected] of cases) {
    const capability = editorCapabilityFor(value);
    assert.equal(capability.available, true);
    assert.equal(capability.route.type, expected);
    assert.notEqual(capability.route.type, "embed");
  }
  const chart = editorCapabilityFor(
    item({ kind: "image", meta: { content_type: "chart" } }),
  );
  assert.equal(chart.available, false);
  assert.equal(chart.route.type, "none");
  assert.ok(chart.unavailableReason.length > 0);
});
