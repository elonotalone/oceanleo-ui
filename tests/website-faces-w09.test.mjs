import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { Puck } from "@puckeditor/core";

import {
  WEBSITE_PUCK_OVERRIDES,
  websiteFaceForMode,
} from "../src/shell/website-local/website-puck-faces.ts";

const route = readFileSync("src/shell/advanced-routes/WebsiteLocalRoute.tsx", "utf8");
const stage = readFileSync("src/shell/website-local/WebsitePuckStage.tsx", "utf8");

const config = {
  components: {
    Block: { fields: { text: { type: "text" } }, render: (p) => h("p", null, p.text) },
  },
};
const data = {
  content: [{ type: "Block", props: { id: "b1", text: "hello" } }],
  root: { props: {} },
};

function renderNormal() {
  return renderToString(
    h(
      Puck,
      { config, data, iframe: { enabled: false }, overrides: WEBSITE_PUCK_OVERRIDES },
      h("div", null, h(Puck.Preview), h(Puck.Fields)),
    ),
  );
}
function renderPro() {
  return renderToString(
    h(Puck, { config, data, iframe: { enabled: false }, overrides: WEBSITE_PUCK_OVERRIDES }),
  );
}

test("only pro mode selects the pro face", () => {
  assert.equal(websiteFaceForMode("pro"), "pro");
  assert.equal(websiteFaceForMode("normal"), "normal");
  assert.equal(websiteFaceForMode(undefined), "normal");
});

test("Puck default UI (control) ships a header with Publish", () => {
  const html = renderToString(h(Puck, { config, data, iframe: { enabled: false } }));
  assert.match(html, /Publish/);
  assert.match(html, /PuckHeader/);
});

test("normal face renders no Puck default chrome (no header, sidebars, publish)", () => {
  const html = renderNormal();
  assert.doesNotMatch(html, /Publish/);
  assert.doesNotMatch(html, /PuckHeader|PuckLayout|PuckNav|Sidebar/);
  assert.match(html, /puck-preview/);
});

test("pro face renders Puck's default full UI on the same data, without Puck's publish/header", () => {
  const html = renderPro();
  assert.match(html, /PuckLayout/);
  assert.doesNotMatch(html, /Publish/);
  assert.doesNotMatch(html, /PuckHeader/);
});

test("stage keeps one Puck instance for both faces and never exposes publish", () => {
  assert.equal((stage.match(/<Puck(?![.\w])/g) || []).length, 1);
  assert.match(stage, /face === "normal" \? <WebsiteNormalLayout \/> : undefined/);
  assert.match(stage, /overrides=\{WEBSITE_PUCK_OVERRIDES\}/);
  assert.doesNotMatch(stage, /onPublish/);
  assert.doesNotMatch(route, /onPublish/);
  assert.doesNotMatch(route, /key=\{`[^`]*mode/);
  assert.match(stage, /no-external\.css/);
});

test("route wires Pro page and top-bar history; no iframe / hosted shell", () => {
  assert.match(route, /mode: \{\s*current: mode,/);
  assert.match(route, /setPluginMode\("website", next\)/);
  assert.match(route, /history: \{ canUndo, canRedo, undo, redo \}/);
  assert.doesNotMatch(route + stage, /<iframe|HostedEditor\b|EmbedEditorPane|Hosted\w*Route/);
});
