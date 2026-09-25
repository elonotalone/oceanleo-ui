// 视频工作流画布在 LeoDev 槽上显示「编辑器地址不受信任」的回归锁（regression-audit-0924）。
//
// EmbedEditorPane 的第一道闸只认 workbench-routes.ts 写死的白名单 base，
// LeoDev 覆盖由 pane 内部的 resolveEmbedLoadBase 再做。调用方若先覆盖，
// pane 收到的是槽地址，第一道闸拒收，iframe src 变空串。

import assert from "node:assert/strict";
import test from "node:test";

const HOST = "p-7537c389c639ccec040fa352a0e1dac4.dev.oceanleo.com";
const VIDEO_SLOT = "https://p-58f061af0a83a0b141e6f50f08377f06.dev.oceanleo.com";

globalThis.window = {
  location: { host: HOST, hostname: HOST, origin: `https://${HOST}`, search: "" },
};
globalThis.document = { cookie: "" };
process.env.NEXT_PUBLIC_FAMILY_EMBED_ORIGIN = `video=${VIDEO_SLOT}`;

const { embedEditorBase, resolveEmbedLoadBase } = await import(
  "../src/shell/workbench-embed-base.ts"
);
const { isTrustedEmbedEditorBase } = await import(
  "../src/shell/editor-sandbox-origin.ts"
);
const { buildEditorEmbedUrl } = await import("../src/shell/editor-protocol.ts");

const draft = {
  key: "draft:advanced:video_canvas",
  kind: "video_canvas",
  title: "新建视频画布",
  meta: {},
};

test("video canvas passes the whitelisted base; only the pane applies the LeoDev override", () => {
  const base = embedEditorBase(draft);
  assert.equal(base, "https://video.oceanleo.com/canvas-board");
  assert.equal(isTrustedEmbedEditorBase(base), true);

  const { loadBase } = resolveEmbedLoadBase(base);
  assert.equal(loadBase, `${VIDEO_SLOT}/canvas-board`);

  const src = buildEditorEmbedUrl(loadBase, {
    instanceId: "video-canvas-1",
    hostOrigin: `https://${HOST}`,
    assetTitle: draft.title,
    assetKind: draft.kind,
  });
  assert.ok(src.startsWith(`${VIDEO_SLOT}/canvas-board?embed=1&editor=1`), src);
});
