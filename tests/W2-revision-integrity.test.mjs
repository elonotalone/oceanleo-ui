import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  EMPTY_BLOB_SHA256,
  artifactSaveFailureRetryable,
  revisionPublishLocalRefusal,
} from "../src/shell/doc-editors/artifact-save-contract.ts";
import { uploadAdvancedDraft } from "../src/shell/advanced-draft.ts";

const DIGEST = "a".repeat(64);

function documentProjection({
  id = "artifact-1",
  revisionId = "r2",
  integrityOk = true,
} = {}) {
  return {
    schema: "oceanleo.artifact.v1",
    artifact_id: id,
    revision_id: revisionId,
    artifact_type: "document",
    roles: ["generated_output"],
    title: "需签字盖章页清单.md",
    favorite: false,
    owner: {
      principal_id: "user-1",
      visibility: "private",
      origin_site_key: "word",
    },
    access: {
      can_read: true,
      can_preview: true,
      can_edit: true,
      can_fork: true,
      can_insert: true,
      can_replace: true,
      can_favorite: true,
      can_bind: true,
      can_export_source: true,
    },
    editability: "native",
    editor_capability: "richdoc-editor",
    source_format: "md",
    renditions: {
      source: {
        purpose: "source",
        revision_id: revisionId,
        url: `https://signed.test/${id}-source.md`,
        format: "md",
        digest: `sha256:${DIGEST}`,
        media_type: "text/markdown",
      },
      full: {
        purpose: "full",
        revision_id: revisionId,
        url: `https://signed.test/${id}.md`,
        format: "md",
        digest: `sha256:${DIGEST}`,
        media_type: "text/markdown",
      },
    },
    provenance: {
      id: `prov-${id}`,
      source_kind: "owned",
      license_code: "owned",
    },
    integrity: {
      ok: integrityOk,
      code: integrityOk ? "ok" : "integrity-failed",
      reason: integrityOk ? "" : "hash mismatch",
    },
    context_bindings: [
      {
        context_id: "ctx:word:doc",
        role: "primary",
        rank: 1,
        pinned_revision_id: revisionId,
      },
    ],
  };
}

async function loadClient() {
  return import(
    await compileModule("src/shell/artifact-client.ts", {
      "../lib/auth/client": dataModule(
        `export async function accessToken(){ return "token"; }`,
      ),
      "../lib/auth/config": dataModule(
        `export const GATEWAY_BASE = "https://api.dev.oceanleo.com";`,
      ),
    })
  );
}

test("W2: empty digest is refused locally and never sent", async () => {
  const local = revisionPublishLocalRefusal({
    sourceUrl: "https://cdn.oceanleo.com/doc.md",
    sourceDigest: EMPTY_BLOB_SHA256,
    artifactType: "document",
    itemArtifactType: "document",
    editability: "native",
  });
  assert.equal(local.ok, false);
  assert.equal(local.code, "integrity-failed");
  assert.match(local.error, /空白/);

  const previousFetch = globalThis.fetch;
  let fetchCalls = 0;
  try {
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return { ok: true, status: 200, json: async () => ({}) };
    };
    const client = await loadClient();
    const rejected = await client.createArtifactRevision("artifact-1", {
      expectedRevisionId: "r1",
      artifactType: "document",
      source: {
        format: "md",
        url: "https://cdn.oceanleo.com/doc.md",
        digest: EMPTY_BLOB_SHA256,
      },
      renditions: [
        {
          purpose: "full",
          url: "https://cdn.oceanleo.com/doc.md",
          digest: EMPTY_BLOB_SHA256,
        },
      ],
    });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, "integrity-failed");
    assert.equal(rejected.retryable, false);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("W2: 422 integrity-failed stays a hard failure and is not retryable", async () => {
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: false,
      status: 422,
      json: async () => ({
        detail: {
          code: "integrity-failed",
          message:
            "保存被拒绝：文件是空的、过大，或存储大小对不上实际字节。请重新保存，不要把空白内容覆盖到已有素材上。",
        },
      }),
    });
    const client = await loadClient();
    const rejected = await client.createArtifactRevision("artifact-1", {
      expectedRevisionId: "r1",
      artifactType: "document",
      source: {
        format: "md",
        url: "https://cdn.oceanleo.com/doc.md",
        digest: DIGEST,
      },
      renditions: [
        {
          purpose: "full",
          url: "https://cdn.oceanleo.com/doc.md",
          digest: DIGEST,
        },
      ],
    });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, "integrity-failed");
    assert.equal(rejected.retryable, false);
    assert.equal(artifactSaveFailureRetryable(rejected), false);
    assert.match(rejected.error || "", /空白|完整性|拒绝/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("W2: successful revision publish pins a new revisionId", async () => {
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => documentProjection({ revisionId: "r2" }),
    });
    const client = await loadClient();
    const result = await client.createArtifactRevision("artifact-1", {
      expectedRevisionId: "r1",
      artifactType: "document",
      source: {
        format: "md",
        url: "https://cdn.oceanleo.com/doc.md",
        digest: DIGEST,
      },
      renditions: [
        {
          purpose: "full",
          url: "https://cdn.oceanleo.com/doc.md",
          digest: DIGEST,
        },
      ],
    });
    assert.equal(result.ok, true);
    assert.equal(result.data?.revisionId, "r2");
    assert.equal(result.data?.artifactId, "artifact-1");
    assert.equal(result.data?.meta.previous_revision_id, "r1");
    assert.equal(result.data?.artifact.integrity.ok, true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("W2: HTTP 200 that repeats the old revisionId is integrity-failed", async () => {
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => documentProjection({ revisionId: "r1" }),
    });
    const client = await loadClient();
    const result = await client.createArtifactRevision("artifact-1", {
      expectedRevisionId: "r1",
      artifactType: "document",
      source: {
        format: "md",
        url: "https://cdn.oceanleo.com/doc.md",
        digest: DIGEST,
      },
      renditions: [
        {
          purpose: "full",
          url: "https://cdn.oceanleo.com/doc.md",
          digest: DIGEST,
        },
      ],
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "integrity-failed");
    assert.equal(result.retryable, false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("W2: draft upload does not accept a mismatched receipt digest", async () => {
  await assert.rejects(
    () =>
      uploadAdvancedDraft(
        {
          identity: { rootId: "root-1", baseRevisionId: "r1" },
          schema: "oceanleo.document.draft.v1",
          revision: 1,
          payload: { text: "未提交的草稿" },
          siteId: "word",
          title: "清单",
        },
        {
          upload: async () => ({
            ok: true,
            data: {
              file: {
                url: "https://files.example/draft.json",
                meta: { content_digest: "0".repeat(64) },
              },
            },
          }),
        },
      ),
    /校验和/,
  );
});
