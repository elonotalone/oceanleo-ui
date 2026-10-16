/**
 * UC-3 / UC-6：Hosted 四件（slides / docs / audio / 3d）必须嵌当前家族的
 * `*.{hostedEditorDomain}` 全串，不许回落到 `.com` 的 `*.oceanleo.app`。
 *
 * 违反后果：oceanbizs.com 点 PPTist 拼出 `slides.oceanleo.app`，iframe src 变空
 * 或被 CSP frame-ancestors 拦住，专业编辑一直停在「正在切换到专业编辑…」。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const LOADER_URL = new URL("./ts-extension-loader.mjs", import.meta.url).href;
const HOSTED_URL = new URL(
  "../src/shell/hosted-editor-origins.ts",
  import.meta.url,
).href;
const DOCS_URL = new URL(
  "../src/shell/doc-editors/rich-doc-hosted-embed.ts",
  import.meta.url,
).href;
const AUDIO_URL = new URL(
  "../src/shell/media-editors/audio-hosted-embed.ts",
  import.meta.url,
).href;
const MODEL3D_URL = new URL(
  "../src/shell/media-editors/model3d-hosted-embed.ts",
  import.meta.url,
).href;
const SANDBOX_URL = new URL(
  "../src/shell/editor-sandbox-origin.ts",
  import.meta.url,
).href;
const PROTOCOL_URL = new URL(
  "../src/shell/editor-protocol.ts",
  import.meta.url,
).href;

function runProbe(env, prelude = "") {
  const probe = `
    ${prelude}
    const hosted = await import(${JSON.stringify(HOSTED_URL)});
    const docs = await import(${JSON.stringify(DOCS_URL)});
    const audio = await import(${JSON.stringify(AUDIO_URL)});
    const model3d = await import(${JSON.stringify(MODEL3D_URL)});
    const sandbox = await import(${JSON.stringify(SANDBOX_URL)});
    const protocol = await import(${JSON.stringify(PROTOCOL_URL)});
    const slides = hosted.hostedEditorOrigin("slides");
    const hostOrigin = slides.includes(".ws.")
      ? "https://oceanbizs.com"
      : "https://oceanleo.com";
    const slidesSrc = protocol.buildEditorEmbedUrl(slides, {
      instanceId: "dk-ws",
      hostOrigin,
      assetTitle: "年报",
      assetKind: "deck",
    });
    process.stdout.write(JSON.stringify({
      slides,
      docsBase: docs.richDocHostedEmbedBase(),
      audioBase: audio.audioHostedEmbedBase(),
      model3dBase: model3d.model3dHostedEmbedBase(),
      slidesSrcOrigin: new URL(slidesSrc).origin,
      slidesTrusted: sandbox.isTrustedEmbedEditorBase(slides),
      slidesHosted: sandbox.isHostedEditorEmbedBase(slides),
      slidesSandbox: sandbox.embedEditorFrameSandbox(slides),
      slidesPost: protocol.isValidEditorTargetOrigin(slides),
      comSlidesTrusted: sandbox.isTrustedEmbedEditorBase("https://slides.oceanleo.app"),
      comSlidesPost: protocol.isValidEditorTargetOrigin("https://slides.oceanleo.app"),
      docsIgnoresCom: docs.richDocHostedEmbedBase("https://docs.oceanleo.app"),
      audioIgnoresCom: audio.audioHostedEmbedBase("https://audio.oceanleo.app"),
    }));
  `;
  const child = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--no-warnings",
      "--experimental-loader",
      LOADER_URL,
      "--input-type=module",
      "-e",
      probe,
    ],
    { encoding: "utf8", env: { ...process.env, ...env } },
  );
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}

// UC-3 / UC-6：iframe src 与 postMessage 目标必须是当前家族 Hosted origin 全串。
test("DeckHostedRoute 用 hostedEditorOrigin('slides')，不再对写死的 .app 全串做 find", () => {
  const hosted = readFileSync(
    new URL("../src/shell/advanced-routes/DeckHostedRoute.tsx", import.meta.url),
    "utf8",
  );
  assert.match(hosted, /hostedEditorOrigin\("slides"\)/);
  assert.doesNotMatch(
    hosted,
    /HOSTED_EDITOR_ORIGINS\.find\(\s*\(origin\)\s*=>\s*origin\s*===\s*DECK_HOSTED_EMBED_ORIGIN/,
  );
  assert.match(
    hosted,
    /const editorOrigin = embedBase/,
    "postMessage 目标必须和 iframe origin 同一条，不能再写死 slides.oceanleo.app",
  );
});

// UC-3 / UC-6：ws 进程嵌 slides.ws.oceanleo.app，生产 .app 全串不可信。
test("ws 家族：四件 Hosted 嵌 *.ws.oceanleo.app，生产 .app 全串不可信、拼不出", () => {
  const ws = runProbe({
    NEXT_PUBLIC_OCEANLEO_DOMAIN_FAMILY: "ws",
    NEXT_PUBLIC_OCEANLEO_GATEWAY_URL: "",
    NEXT_PUBLIC_GATEWAY_URL: "",
  });
  assert.equal(ws.slides, "https://slides.ws.oceanleo.app");
  assert.equal(ws.docsBase, "https://docs.ws.oceanleo.app");
  assert.equal(ws.audioBase, "https://audio.ws.oceanleo.app");
  assert.equal(ws.model3dBase, "https://3d.ws.oceanleo.app");
  assert.equal(ws.slidesSrcOrigin, "https://slides.ws.oceanleo.app");
  assert.equal(ws.slidesTrusted, true);
  assert.equal(ws.slidesHosted, true);
  assert.equal(ws.slidesPost, true);
  assert.equal(ws.comSlidesTrusted, false);
  assert.equal(ws.comSlidesPost, false);
  assert.equal(ws.docsIgnoresCom, "https://docs.ws.oceanleo.app");
  assert.equal(ws.audioIgnoresCom, "https://audio.ws.oceanleo.app");
  assert.match(ws.slidesSandbox, /allow-scripts/);
  assert.match(ws.slidesSandbox, /allow-same-origin/);
});

// UC-3 / UC-6：oceanbizs.com 无 FAMILY env 时仍按 host 选 ws Hosted origin。
test("无 FAMILY env、host 是 oceanbizs.com：四件仍嵌 *.ws.oceanleo.app，不回落生产 .app", () => {
  const ws = runProbe(
    {
      NEXT_PUBLIC_OCEANLEO_DOMAIN_FAMILY: "",
      NEXT_PUBLIC_OCEANLEO_GATEWAY_URL: "",
      NEXT_PUBLIC_GATEWAY_URL: "",
    },
    `globalThis.window = {
      location: {
        host: "oceanbizs.com",
        hostname: "oceanbizs.com",
        origin: "https://oceanbizs.com",
        href: "https://oceanbizs.com/",
        protocol: "https:",
      },
    };`,
  );
  assert.equal(ws.slides, "https://slides.ws.oceanleo.app");
  assert.equal(ws.docsBase, "https://docs.ws.oceanleo.app");
  assert.equal(ws.audioBase, "https://audio.ws.oceanleo.app");
  assert.equal(ws.model3dBase, "https://3d.ws.oceanleo.app");
  assert.equal(ws.slidesSrcOrigin, "https://slides.ws.oceanleo.app");
  assert.equal(ws.slidesTrusted, true);
  assert.equal(ws.slidesPost, true);
  assert.equal(ws.comSlidesTrusted, false);
  assert.equal(ws.comSlidesPost, false);
  assert.equal(ws.docsIgnoresCom, "https://docs.ws.oceanleo.app");
});

// UC-3 / UC-6：缺省 com 家族仍嵌生产 *.oceanleo.app，与改动前逐字相同。
test("缺省 com 家族：四件仍嵌 *.oceanleo.app，与改动前逐字相同", () => {
  const com = runProbe({ NEXT_PUBLIC_OCEANLEO_DOMAIN_FAMILY: "" });
  assert.equal(com.slides, "https://slides.oceanleo.app");
  assert.equal(com.docsBase, "https://docs.oceanleo.app");
  assert.equal(com.audioBase, "https://audio.oceanleo.app");
  assert.equal(com.model3dBase, "https://3d.oceanleo.app");
  assert.equal(com.slidesSrcOrigin, "https://slides.oceanleo.app");
  assert.equal(com.slidesTrusted, true);
  assert.equal(com.slidesPost, true);
  assert.equal(com.comSlidesTrusted, true);
});
