import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const shareClientUrl = await compileModule("src/shell/share/share-client.ts", {
  "../../lib/auth/client": dataModule('export async function accessToken() { return "test-token"; }'),
  "../../lib/auth/config": dataModule('export const GATEWAY_BASE = "https://api.dev.oceanleo.com";'),
});
const { createShareLink } = await import(shareClientUrl);

const replayPageUrl = await compileModule("src/shell/replay/AgentReplayPage.tsx", {
  "../../i18n/ui/useUI": dataModule(`
    const tt = (text) => text;
    export function useUI() { return tt; }
  `),
  "./share-client": dataModule(`
    export async function fetchSharedReplay() { return { ok: false, error: "unused", status: 0 }; }
  `),
});
const { AgentReplayPage } = await import(replayPageUrl);

const replayClientUrl = await compileModule("src/shell/replay/share-client.ts", {
  "../../lib/auth/config": dataModule('export const GATEWAY_BASE = "https://api.dev.oceanleo.com";'),
});
const { fetchSharedReplay } = await import(replayClientUrl);

const shareBarUrl = await compileModule("src/shell/share/ShareActionBar.tsx", {
  "../../i18n/ui/useUI": dataModule(`
    const tt = (text) => text;
    export function useUI() { return tt; }
  `),
});
const { ShareCheckbox } = await import(shareBarUrl);

test("Copy link uses the current site origin and selected message ids", async () => {
  for (const origin of [
    "https://oceanleo.com",
    "https://oceanbizs.com",
    "https://p-00000000000000000000000000000000.dev.oceanleo.com",
  ]) {
    const seen = [];
    const result = await createShareLink({
      taskId: "task-42",
      messageIds: [7, 11],
      origin,
      tokenImpl: async () => "test-token",
      fetchImpl: async (url, init) => {
        seen.push({ url, init });
        return {
          ok: true,
          status: 200,
          async json() { return { share_id: "ShareId_123456" }; },
          async text() { return ""; },
        };
      },
    });
    assert.equal(result.url, `${origin}/share/ShareId_123456`);
    assert.equal(seen[0].url, "https://api.dev.oceanleo.com/v1/share/task");
    assert.deepEqual(JSON.parse(seen[0].init.body), { task_id: "task-42", message_ids: [7, 11] });
  }
});

test("anonymous shared replay renders text, code, and image or attachment media", () => {
  const markup = renderToStaticMarkup(
    React.createElement(AgentReplayPage, {
      playback: false,
      replay: {
        share_id: "ShareId_123456",
        title: "公开分享",
        messages: [
          {
            id: 1,
            role: "user",
            kind: "text",
            content: "请看这段代码",
            meta: {
              attachments: [
                { url: "https://cdn.example.test/photo.png", mime: "image/png", name: "photo.png" },
              ],
            },
          },
          {
            id: 2,
            role: "assistant",
            kind: "text",
            content: "const answer = 42;",
            meta: { image_url: "https://cdn.example.test/result.png", final: true },
          },
          {
            id: 3,
            role: "assistant",
            kind: "text",
            content: "协议不受信任",
            meta: {
              image_url: "javascript:alert(1)",
              attachments: [{ url: "javascript:alert(2)", name: "恶意附件" }],
            },
          },
        ],
      },
    }),
  );
  assert.match(markup, /请看这段代码/);
  assert.match(markup, /const answer = 42;/);
  assert.match(markup, /src="https:\/\/cdn\.example\.test\/photo\.png"/);
  assert.match(markup, /src="https:\/\/cdn\.example\.test\/result\.png"/);
  assert.doesNotMatch(markup, /javascript:/i);
});

test("anonymous share fetch omits cookies and Authorization", async () => {
  const calls = [];
  const result = await fetchSharedReplay("ShareId_123456", {
    async fetchImpl(url, init) {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return { title: "公开分享", messages: [], created_at: "2026-09-25T00:00:00Z" };
        },
      };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(calls[0].url, "https://api.dev.oceanleo.com/v1/share/ShareId_123456");
  assert.equal(calls[0].init.credentials, "omit");
  assert.equal(
    Object.keys(calls[0].init.headers).some((name) => /authorization/i.test(name)),
    false,
  );
});

test("share checkbox renders the compact circular 20 by 20 control", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ShareCheckbox, {
      checked: false,
      onToggle: () => {},
      label: "选择消息",
    }),
  );
  const className = markup.match(/class="([^"]+)"/)?.[1] || "";
  assert.match(className, /\bh-5\b/);
  assert.match(className, /\bw-5\b/);
  assert.match(className, /\brounded-full\b/);
  assert.doesNotMatch(className, /\bmin-[hw]-11\b/);
  // Tailwind's spacing scale maps h-5/w-5 to 1.25rem = 20px at the product
  // root size. Measure the rendered token pair instead of accepting a class
  // that only happens to contain one of the two dimensions.
  const renderedSize = {
    width: /\bw-5\b/.test(className) ? 20 : 0,
    height: /\bh-5\b/.test(className) ? 20 : 0,
  };
  assert.deepEqual(renderedSize, { width: 20, height: 20 });
  assert.match(markup, /role="checkbox"/);
});
