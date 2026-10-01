// 连接器图标必须是官方文件（data URI），不是手画 path / emoji。
//
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/connector-brand-marks.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule } from "./helpers/module-bench.mjs";
import {
  BRAND_MARKS,
  CONNECTOR_BRAND_IDS,
} from "../src/pages/plugins/brand-marks/generated.ts";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const REGISTRY_IDS = [
  "tencent-docs",
  "tencent-meeting",
  "wecom",
  "weixin-drive",
  "tencent-survey",
  "tencent-qidian",
  "ima-kb",
  "lexiang-kb",
  "fubangshou",
  "cnb",
  "edgeone-pages",
  "cloudbase",
  "qingflow",
  "qq-mail",
  "netease-mail",
  "feishu",
  "dingtalk",
  "tapd",
  "wps-docs",
  "baidu-pan",
  "tdx",
  "tianyancha",
  "qichacha",
  "hundsun",
  "zte-icloud-report",
  "pkulaw",
  "huayu-law",
  "neocrm",
  "weishi-scrm",
  "xiaoetong",
  "ctrip",
  "github",
  "notion",
  "openai",
  "anthropic",
  "google-gemini",
  "grok",
  "openrouter",
  "perplexity",
  "cohere",
  "huggingface",
  "elevenlabs",
  "heygen",
  "kling",
  "flux",
  "tripo",
  "slack",
  "asana",
  "linear",
  "atlassian",
  "monday",
  "clickup",
  "todoist",
  "airtable",
  "fireflies",
  "granola",
  "tldv",
  "gmail",
  "google-calendar",
  "google-drive",
  "outlook-mail",
  "outlook-calendar",
  "dropbox",
  "sentry",
  "vercel",
  "cloudflare",
  "supabase",
  "neon",
  "prisma-postgres",
  "webflow",
  "wix",
  "playwright",
  "zapier",
  "make",
  "n8n",
  "apify",
  "firecrawl",
  "browser",
  "hubspot",
  "intercom",
  "close-crm",
  "apollo",
  "mailchimp",
  "stripe",
  "paypal",
  "xero",
  "revenuecat",
  "polygon",
  "ahrefs",
  "similarweb",
  "zoominfo",
  "metabase",
  "posthog",
  "canva",
  "figma",
  "miro",
  "cloudinary",
  "gitlab",
  "jam",
  "netlify",
  "datadog",
  "pagerduty",
  "amplitude",
  "mixpanel",
  "explorium",
  "attio",
  "plaid",
  "ramp",
  "box",
  "docusign",
  "square",
  "semrush",
  "indeed",
  "shopify",
  "salesforce",
  "dify",
  "serena",
  "jsonbin",
  "custom",
];

const SCREENSHOT_IDS = [
  "prisma-postgres",
  "webflow",
  "wix",
  "playwright",
  "gitlab",
  "jam",
  "netlify",
  "datadog",
  "pagerduty",
  "sentry",
];

test("registry 119 ids each have an official data-URI mark", () => {
  assert.equal(REGISTRY_IDS.length, 119);
  assert.deepEqual([...CONNECTOR_BRAND_IDS].sort(), [...REGISTRY_IDS].sort());
  for (const id of REGISTRY_IDS) {
    const mark = BRAND_MARKS[id];
    assert.ok(mark, `missing mark ${id}`);
    assert.match(mark.src, /^data:image\/[a-z0-9.+-]+;base64,/);
    assert.ok(mark.source, `no provenance ${id}`);
    assert.ok(mark.src.length > 80, `empty mark ${id}`);
  }
});

test("handmade path map is gone; screenshot ids are official files", () => {
  const src = readFileSync(join(here, "../src/pages/plugins/connector-icons.tsx"), "utf8");
  assert.equal(src.includes("const BRANDS"), false, "old handmade BRANDS map must be gone");
  assert.ok(src.includes("BRAND_MARKS"), "renderer must read generated official marks");
  for (const id of SCREENSHOT_IDS) {
    assert.equal(BRAND_MARKS[id].src.startsWith("data:image/"), true, id);
  }
});

async function withDom(run) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM, VirtualConsole } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];

  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", () => {});
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://oceanbizs.com/settings/plugins",
    virtualConsole,
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

  const { ConnectorIcon } = await import(
    await compileModule("src/pages/plugins/connector-icons.tsx", {}, { missingPackageStub: null })
  );
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  try {
    return await run({
      render: async (props) => {
        await act(async () => root.render(React.createElement(ConnectorIcon, props)));
      },
      find: (selector) => container.querySelector(selector),
    });
  } finally {
    await act(async () => root.unmount());
    window.close();
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

test("Prisma / Webflow / Netlify / Datadog render official <img>, unknown catalog code stays letter", async () => {
  await withDom(async ({ render, find }) => {
    for (const id of SCREENSHOT_IDS) {
      await render({ id, icon: id, label: id });
      const node = find(`[data-connector-icon="${id}"]`);
      assert.ok(node, id);
      assert.equal(node.getAttribute("data-connector-icon-kind"), "brand", id);
      const img = node.querySelector("img");
      assert.ok(img, `${id} img`);
      assert.match(img.getAttribute("src") || "", /^data:image\//);
    }
    await render({ id: "plain-mcp", icon: "plain-mcp", label: "无图服务" });
    const letter = find('[data-connector-icon-kind="letter"]');
    assert.ok(letter, "unknown marketplace code still letter");
    assert.equal(letter.textContent, "无");
  });
});
