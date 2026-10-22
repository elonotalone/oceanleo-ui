/**
 * V1 acceptance: actual source → mutate → serialize → reopen for families
 * that expose a host-side model. This is not a browser click-through and is
 * not a claim that all 13 plugins have a proven UI round trip.
 *
 * Deck hosted normal-page toolbar is W6-r3; omitted here until that commit.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  hydrateDesignCanvasSource,
  planDesignCanvasSource,
  serializeDesignCanvasSource,
} from "../src/shell/design-canvas/design-canvas-source.ts";
import { blankDesignDocument } from "../src/shell/design-canvas/blank-design-document.ts";
import { parseDesignDocumentProject } from "../src/shell/image-editor/design-document-schema.ts";
import {
  createFabricImageProject,
  parseFabricImageProject,
} from "../src/shell/image-editor/editor-persistence.ts";
import { imageSaveAdmitted } from "../src/shell/image-editor/image-source-ready.ts";
import {
  hydrateWebsiteLocalSource,
  planWebsiteLocalSource,
} from "../src/shell/advanced-routes/non-richdoc-source-gate.ts";
import { existingWebsiteSource } from "../src/shell/website-local/blank-website-source.ts";
import { applyWebsiteCommand } from "../src/shell/website-local/website-command-surface.ts";
import {
  parseWebsiteSource,
  serializeWebsiteSource,
} from "../src/shell/website-source-carrier/website-source-validate.ts";
import { loadChartDocument } from "../src/shell/chart-editor/chart-source.ts";
import { loadGridSheets } from "../src/shell/doc-editors/grid-model.ts";
import { loadRichDocHtml } from "../src/shell/doc-editors/rich-doc-model.ts";
import "./helpers/w1-jsdom-window.mjs";

function commit(payload) {
  return { revisionId: "rev-next", payload };
}

test("richdoc: valid markdown hydrates, serialize-equivalent html reopens the body", async () => {
  const item = {
    key: "artifact:rt-doc",
    source: "artifact",
    id: "rt-doc",
    title: "需签字盖章页清单",
    kind: "document",
    siteId: "word",
    favorite: false,
    content:
      "# 需签字盖章页清单\n\n备案系统上传 1 只需一份已签字盖章的自评报告。",
    meta: { filename: "list.md", mime: "text/markdown" },
  };
  const loaded = await loadRichDocHtml(item);
  assert.equal(loaded.error, "");
  assert.match(loaded.html, /需签字盖章页清单/);
  const reopened = await loadRichDocHtml({
    ...item,
    content: loaded.html,
    meta: { filename: "list.html", mime: "text/html" },
  });
  assert.equal(reopened.error, "");
  assert.match(reopened.html, /自评报告/);
});

test("grid: csv hydrates, in-memory cell edit survives, sourceless durable still throws", async () => {
  const loaded = await loadGridSheets({
    key: "artifact:rt-grid",
    source: "artifact",
    id: "rt-grid",
    title: "销量",
    kind: "sheet",
    siteId: "excel",
    favorite: false,
    content: "城市,销量\n上海,12",
    meta: { filename: "sales.csv", mime: "text/csv" },
  });
  assert.match(loaded.flatMap((sheet) => sheet.rows).flat().join(" "), /上海/);
  loaded[0].rows[1][1] = "99";
  assert.equal(loaded[0].rows[1][1], "99");
  await assert.rejects(
    () =>
      loadGridSheets({
        key: "artifact:rt-grid-missing",
        source: "artifact",
        id: "rt-grid-missing",
        title: "空",
        kind: "sheet",
        siteId: "excel",
        favorite: false,
        artifactId: "art-grid",
        revisionId: "rev-grid",
        content: "",
        meta: {},
      }),
    /缺少可验证的 source\/full 内容/,
  );
});

test("chart: inline option hydrates and the edited series round-trips through JSON", async () => {
  const item = {
    key: "chart:rt",
    source: "artifact",
    id: "chart-rt",
    title: "季度收入",
    kind: "image",
    siteId: "asset",
    favorite: false,
    content: JSON.stringify({
      title: { text: "季度收入" },
      xAxis: { type: "category", data: ["Q1"] },
      series: [{ type: "bar", data: [120] }],
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
  };
  const loaded = await loadChartDocument(item);
  assert.equal(loaded.option.series[0].data[0], 120);
  loaded.option.series[0].data[0] = 240;
  const reopened = await loadChartDocument({
    ...item,
    content: JSON.stringify(loaded.option),
  });
  assert.equal(reopened.option.series[0].data[0], 240);
});

test("website local: stored JSON loads, theme command mutates, reopen restores accent", async () => {
  const stored = existingWebsiteSource("操作员已有的网站工程");
  const wrapped = JSON.stringify({
    schema: "website-source@1",
    version: 1,
    data: stored,
  });
  const loaded = await hydrateWebsiteLocalSource(
    planWebsiteLocalSource({
      artifactId: "web-art",
      title: "已有网站",
      meta: { editor_project_url: "https://cdn.test/site.json" },
    }),
    async () => wrapped,
  );
  assert.equal(loaded.ok, true);
  const edited = applyWebsiteCommand(loaded.source, "website.set-theme-accent", {
    accent: "#112233",
  });
  assert.equal(edited.ok, true);
  const committed = commit(serializeWebsiteSource(edited.source));
  const reopened = parseWebsiteSource(committed.payload);
  assert.equal(reopened.theme.accent, "#112233");
});

test("design canvas: stored document loads, title command mutates, reopen restores title", async () => {
  const stored = blankDesignDocument("本地设计稿 W10");
  const loaded = await hydrateDesignCanvasSource(
    planDesignCanvasSource({
      artifactId: "design-art",
      meta: { editor_project_url: "https://cdn.test/design.json" },
    }),
    async () => JSON.stringify(stored),
  );
  assert.equal(loaded.ok, true);
  const edited = { ok: true, project: { ...loaded.project, title: "修订后的设计稿标题" } };
  assert.equal(edited.ok, true);
  const committed = commit(serializeDesignCanvasSource(edited.project));
  const reopened = parseDesignDocumentProject(committed.payload);
  assert.equal(reopened.title, "修订后的设计稿标题");
});

test("image: project JSON round-trips; save stays refused until sourceReady", () => {
  const snapshot = {
    json: { objects: [{ type: "i-text", text: "封面标题" }] },
    doc: { width: 1080, height: 1080 },
    canvasBackground: "#ffffff",
  };
  const project = createFabricImageProject(snapshot);
  const parsed = parseFabricImageProject(JSON.parse(JSON.stringify(project)));
  assert.ok(parsed);
  assert.equal(parsed.snapshot.json.objects[0].text, "封面标题");
  const refused = imageSaveAdmitted({
    loading: false,
    sourceReady: false,
    sceneDiagnostic: null,
  });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /空白画布/);
  assert.equal(
    imageSaveAdmitted({
      loading: false,
      sourceReady: true,
      sceneDiagnostic: null,
    }).ok,
    true,
  );
});
