import "./helpers/w1-jsdom-window.mjs";
import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchMediaBlobRefreshing,
  isGoneMediaError,
  signedMediaRefreshPurpose,
} from "../src/lib/media-proxy.ts";
import {
  createRichDocDeliveryFile,
  loadRichDocHtml,
  loadRichDocSource,
  richDocPersistTarget,
} from "../src/shell/doc-editors/rich-doc-model.ts";
import {
  deriveEditorHandoffFromItem,
  hostedRichDocOpenState,
  isUmoNativeSaveId,
  loadRichDocHostedState,
  persistUmoPayload,
} from "../src/shell/advanced-routes/richdoc-pro-source.ts";
import {
  createSaveResultWaiter,
  createUmoHostedSave,
  isUmoNativeSaveId as isUmoSaveIdFromHosted,
} from "/root/projects/umo-hosted/src/bridge/umo-save.ts";

const ARTIFACT_ID = "21c1e4d9-0818-4bbe-ae33-b4d01a5beafd";
const REVISION_ID = "568afa53-b506-4492-9b07-bb2ac3729883";
const SOURCE_TREE = `/v1/artifacts/${ARTIFACT_ID}/revisions/${REVISION_ID}/source-tree/@source`;
const PREVIEW_ACCESS =
  "https://api.oceanleo.com/v1/artifact-renditions/access/preview-token";
const PREVIEW_FRESH =
  "https://api.oceanleo.com/v1/artifact-renditions/access/preview-token-fresh";
const MARKDOWN_BODY = [
  "# 需签字盖章页清单（只打第3页）",
  "",
  "按 2026 年 9 月已受理做法：备案系统上传 1 只需已签字盖章的自评报告。只打印第 3 页。",
  "",
  "| 文件 | 页码 | 要做什么 |",
  "| --- | --- | --- |",
  "| 打印签章页-第3页.pdf | 3 | 打印这一页。李一隆在算法安全负责人行签名旁手签。 |",
].join("\n");
const WORD_MEDIA =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function screenshotItem(overrides = {}) {
  return {
    id: ARTIFACT_ID,
    key: `artifact:${ARTIFACT_ID}:${REVISION_ID}`,
    source: "artifact",
    artifactId: ARTIFACT_ID,
    revisionId: REVISION_ID,
    artifactType: "document",
    title: "需签字盖章页清单（只打第3页）",
    kind: "document",
    siteId: "home",
    favorite: false,
    url: undefined,
    previewUrl: PREVIEW_ACCESS,
    meta: {
      filename: "需签字盖章页清单.md",
      source_format: "md",
      source_url: SOURCE_TREE,
    },
    artifact: {
      schema: "oceanleo.artifact.v1",
      artifactId: ARTIFACT_ID,
      revisionId: REVISION_ID,
      artifactType: "document",
      sourceFormat: "md",
      renditions: {
        source: {
          url: SOURCE_TREE,
          mediaType: "text/markdown",
          purpose: "source",
          revisionId: REVISION_ID,
        },
        full: {
          url: SOURCE_TREE,
          mediaType: "text/markdown",
          purpose: "full",
          revisionId: REVISION_ID,
        },
        preview: {
          url: PREVIEW_ACCESS,
          mediaType: "text/markdown",
          purpose: "preview",
          revisionId: REVISION_ID,
        },
      },
    },
    ...overrides,
  };
}

function markdownResponse(body = MARKDOWN_BODY) {
  const bytes = new TextEncoder().encode(body);
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => (name === "content-length" ? String(bytes.length) : null) },
    blob: async () => new Blob([body], { type: "text/markdown" }),
  };
}

function goneResponse() {
  return {
    ok: false,
    status: 410,
    headers: { get: () => null },
    blob: async () => new Blob(),
  };
}

function installFetch(handler) {
  const previous = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = previous;
  };
}

const MD_JSON = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "需签字盖章页清单（只打第3页）" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "只打印第 3 页。" }],
    },
  ],
};

test("W1 persist target: md item stays markdown; docx stays Word", () => {
  const md = richDocPersistTarget(screenshotItem());
  assert.equal(md.sourceFormat, "md");
  assert.equal(md.sourceMediaType, "text/markdown");
  assert.equal(md.extension, "md");
  const docx = richDocPersistTarget({
    ...screenshotItem(),
    title: "合同.docx",
    previewUrl: "https://api.oceanleo.com/v1/files/contract.docx",
    meta: { filename: "合同.docx", source_format: "docx" },
    artifact: {
      ...screenshotItem().artifact,
      sourceFormat: "docx",
      renditions: {
        source: {
          url: "https://api.oceanleo.com/v1/files/contract.docx",
          mediaType: WORD_MEDIA,
          purpose: "source",
          revisionId: REVISION_ID,
        },
      },
    },
  });
  assert.equal(docx.sourceFormat, "docx");
  assert.equal(docx.sourceMediaType, WORD_MEDIA);
});

test("W1 signed 410 purpose prefers preview for the screenshot access URL", () => {
  const item = screenshotItem();
  assert.equal(
    signedMediaRefreshPurpose({
      goneUrl: PREVIEW_ACCESS,
      previewUrl: item.previewUrl,
      fullUrl: item.artifact.renditions.full.url,
      sourceUrl: item.artifact.renditions.source.url,
    }),
    "preview",
  );
});

test("W1 fetchMediaBlobRefreshing: 410 then a fresh URL yields the markdown bytes", async () => {
  const urls = [];
  const restore = installFetch(async (input) => {
    const href = String(typeof input === "string" ? input : input.url);
    urls.push(href);
    if (href.includes("preview-token-fresh")) return markdownResponse();
    if (href.includes("preview-token")) return goneResponse();
    throw new Error(`unexpected fetch ${href}`);
  });
  try {
    const blob = await fetchMediaBlobRefreshing(PREVIEW_ACCESS, {
      cache: "no-store",
      refreshGoneUrl: async (gone) => {
        assert.equal(gone, PREVIEW_ACCESS);
        return PREVIEW_FRESH;
      },
    });
    const text = await blob.text();
    assert.match(text, /需签字盖章页清单/);
    assert.match(text, /李一隆/);
    assert.equal(urls.length, 2);
  } finally {
    restore();
  }
});

test("W1 isGoneMediaError recognizes the fetchMediaBlob 410 message", () => {
  assert.equal(isGoneMediaError(new Error("媒体加载失败 HTTP 410")), true);
  assert.equal(isGoneMediaError(new Error("媒体加载失败 HTTP 404")), false);
});

test("W1 markdown artifact load (preview URL, not source-tree) contains the body", async () => {
  const item = screenshotItem();
  const fetched = [];
  const restore = installFetch(async (input) => {
    const href = String(typeof input === "string" ? input : input.url);
    fetched.push(href);
    assert.equal(href.includes("source-tree"), false);
    if (href.includes("preview-token")) return markdownResponse();
    throw new Error(`unexpected fetch ${href}`);
  });
  try {
    const loaded = await loadRichDocHtml(item);
    assert.equal(loaded.error, "");
    assert.equal(loaded.source, "url-markdown");
    assert.match(loaded.html, /需签字盖章页清单/);
    assert.match(loaded.html, /只打印第 3 页|只打第3页/);
    assert.equal(fetched.length, 1);

    const hosted = await loadRichDocHostedState(
      item,
      deriveEditorHandoffFromItem(item),
      {
        loadHtml: async () => loaded,
        htmlToJson: async () => MD_JSON,
      },
    );
    assert.equal(hosted.ok, true);
    const open = hostedRichDocOpenState(hosted);
    assert.equal(open.saveable, true);
    assert.equal(open.frameInteractive, true);
  } finally {
    restore();
  }
});

test("W1 load retries HTTP 410 then returns the markdown body", async () => {
  const item = screenshotItem();
  const fetched = [];
  const restore = installFetch(async (input) => {
    const href = String(typeof input === "string" ? input : input.url);
    fetched.push(href);
    if (href.includes("preview-token-fresh")) return markdownResponse();
    if (href.includes("preview-token")) return goneResponse();
    throw new Error(`unexpected fetch ${href}`);
  });
  try {
    const loaded = await loadRichDocHtml(item, undefined, {
      refreshGoneUrl: async (gone) => {
        assert.equal(gone, PREVIEW_ACCESS);
        return PREVIEW_FRESH;
      },
    });
    assert.equal(loaded.error, "");
    assert.match(loaded.html, /李一隆/);
    assert.equal(fetched.length, 2);

    const failed = await loadRichDocSource(item, undefined, {
      refreshGoneUrl: async () => null,
    });
    assert.equal(failed.source, "empty");
    assert.match(failed.error, /HTTP 410/);
  } finally {
    restore();
  }
});

test("W1 failed hosted load is not a saveable blank Umo", async () => {
  const item = screenshotItem();
  const loaded = await loadRichDocHostedState(
    item,
    deriveEditorHandoffFromItem(item),
    {
      loadHtml: async () => ({
        html: "",
        error: "媒体加载失败 HTTP 410",
        source: "empty",
      }),
    },
  );
  assert.equal(loaded.ok, false);
  const open = hostedRichDocOpenState(loaded);
  assert.equal(open.source, null);
  assert.equal(open.saveable, false);
  assert.equal(open.frameInteractive, false);
  assert.match(open.status, /410/);
});

test("W1 persistUmoPayload of md writes text/markdown, never Word", async () => {
  const item = screenshotItem();
  const files = [];
  const saved = await persistUmoPayload({
    item,
    siteId: "home",
    payload: MD_JSON,
    save: async (args) => {
      assert.equal(args.sourceFormat, "md");
      assert.equal(args.sourceMediaType, "text/markdown");
      const file = await args.createFile();
      files.push(file);
      const text = await file.text();
      assert.equal(file.type, "text/markdown");
      assert.match(file.name, /\.md$/);
      assert.match(text, /需签字盖章页清单/);
      assert.doesNotMatch(file.type, /wordprocessingml/);
      return {
        ok: true,
        url: "https://cdn.example/docs/v2.md",
        versionId: "ver-2",
        projectUrl: "https://cdn.example/docs/v2.json",
        projectSchema: "tiptap-json@1",
        sourceFormat: args.sourceFormat,
        sourceMediaType: args.sourceMediaType,
        title: args.title,
        fileName: file.name,
        savedAt: "2026-10-21T00:00:00.000Z",
        artifactId: ARTIFACT_ID,
        revisionId: "rev-2",
        previousRevisionId: REVISION_ID,
        error: "",
      };
    },
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.item.meta.source_format, "md");
  assert.equal(saved.item.meta.source_media_type, "text/markdown");
  assert.equal(saved.item.meta.delivery_format, "md");
  assert.equal(files.length, 1);
});

test("W1 persist of a docx item still writes Word", async () => {
  const item = {
    id: "docx-1",
    key: "artifact:docx-1:rev-1",
    source: "artifact",
    artifactId: "docx-1",
    revisionId: "rev-1",
    title: "合同",
    kind: "document",
    siteId: "word",
    favorite: false,
    url: "https://api.oceanleo.com/v1/files/contract.docx",
    previewUrl: "https://api.oceanleo.com/v1/files/contract.docx",
    meta: { filename: "合同.docx", source_format: "docx" },
    artifact: {
      schema: "oceanleo.artifact.v1",
      artifactId: "docx-1",
      revisionId: "rev-1",
      artifactType: "document",
      sourceFormat: "docx",
      renditions: {
        source: {
          url: "https://api.oceanleo.com/v1/files/contract.docx",
          mediaType: WORD_MEDIA,
          purpose: "source",
          revisionId: "rev-1",
        },
      },
    },
  };
  const file = await createRichDocDeliveryFile({
    item,
    title: "合同",
    html: "<p>合同正文</p>",
    json: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "合同正文" }],
        },
      ],
    },
  });
  assert.equal(file.type, WORD_MEDIA);
  assert.match(file.name, /\.docx$/);
  assert.ok(file.size > 0);
});

test("W1 Umo native onSave sends recovery-snapshot and waits for host save-result", async () => {
  const snapshots = [];
  const waiter = createSaveResultWaiter(1_000);
  const onSave = createUmoHostedSave({
    sendRecoverySnapshot: (saveId, payload, revision) => {
      snapshots.push({ saveId, payload, revision });
      waiter.settle(saveId, { ok: true, message: "已保存" });
    },
    waitForSaveResult: (saveId) => waiter.wait(saveId),
    revision: () => 4,
  });
  const result = await onSave({ json: MD_JSON });
  assert.equal(result.status, "success");
  assert.equal(result.message, "已保存");
  assert.equal(snapshots.length, 1);
  assert.equal(isUmoNativeSaveId(snapshots[0].saveId), true);
  assert.equal(isUmoSaveIdFromHosted(snapshots[0].saveId), true);
  assert.equal(snapshots[0].revision, 4);
});
