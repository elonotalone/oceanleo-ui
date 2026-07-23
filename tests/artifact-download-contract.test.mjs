import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import ts from "typescript";

import {
  artifactDownloadPlanFor,
  normalizeArtifactProjection,
} from "../src/shell/artifact-contract.ts";
import { artifactProjectionToLibraryItem } from "../src/shell/library-data.ts";

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function compileModule(relativePath, replacements) {
  const sourcePath = resolve(relativePath);
  let source = await readFile(sourcePath, "utf8");
  for (const [specifier, replacement] of Object.entries(replacements)) {
    source = source.replaceAll(
      JSON.stringify(specifier),
      JSON.stringify(replacement),
    );
  }
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  return `${dataModule(compiled)}#${encodeURIComponent(relativePath)}`;
}

const authStubUrl = dataModule(`
  export async function accessToken() {
    return "artifact-download-test-token";
  }
`);
const configStubUrl = dataModule(`
  export const GATEWAY_BASE = "https://api.test";
`);
const artifactClientUrl = await compileModule(
  "src/shell/artifact-client.ts",
  {
    "../lib/auth/client": authStubUrl,
    "../lib/auth/config": configStubUrl,
    "./artifact-contract": pathToFileURL(
      resolve("src/shell/artifact-contract.ts"),
    ).href,
    "./library-data": pathToFileURL(
      resolve("src/shell/library-data.ts"),
    ).href,
  },
);
const {
  artifactDownloadEvidence,
  getArtifactDownload,
} = await import(artifactClientUrl);

function projection({
  id = "artifact-download",
  revisionId = "r1",
  title = "Artifact download",
  canExportSource = true,
  source = true,
  sourceRevisionId = revisionId,
  editorManifest = false,
  full = true,
  artifactType = "single_file_image",
  editorCapability = "image-editor",
  sourceFormat = "png",
  sourceMediaType = "image/png",
  sourceDigest = true,
  fullFormat = "png",
  fullMediaType = "image/png",
} = {}) {
  return {
    schema: "oceanleo.artifact.v1",
    artifact_id: id,
    revision_id: revisionId,
    artifact_type: artifactType,
    roles: ["template"],
    title,
    favorite: false,
    owner: {
      principal_id: "user-download",
      visibility: "private",
    },
    access: {
      can_read: true,
      can_preview: true,
      can_edit: canExportSource && source,
      can_fork: false,
      can_insert: false,
      can_replace: false,
      can_favorite: false,
      can_bind: false,
      can_export_source: canExportSource,
    },
    editability: canExportSource && source ? "bounded" : "view_only",
    editor_capability:
      canExportSource && source ? editorCapability : null,
    source_format: sourceFormat,
    renditions: {
      preview: {
        purpose: "preview",
        revision_id: revisionId,
        url: `https://signed.test/${id}-preview.png`,
        format: "png",
        media_type: "image/png",
      },
      ...(full
        ? {
            full: {
              purpose: "full",
              revision_id: revisionId,
              url: `https://signed.test/${id}-full`,
              format: fullFormat,
              media_type: fullMediaType,
            },
          }
        : {}),
      ...(source
        ? {
            source: {
              purpose: "source",
              revision_id: sourceRevisionId,
              url: `https://signed.test/${id}-source`,
              format: sourceFormat,
              media_type: sourceMediaType,
              ...(sourceDigest
                ? { digest: `sha256:${id}-source` }
                : {}),
            },
          }
        : {}),
      ...(editorManifest
        ? {
            editor_manifest: {
              purpose: "editor_manifest",
              revision_id: revisionId,
              url: `https://signed.test/${id}-manifest`,
              format: "manifest",
              media_type: "application/json",
              digest: `sha256:${id}-manifest`,
            },
          }
        : {}),
    },
    provenance: {
      id: `provenance-${id}`,
      source_kind: "owned",
      license_code: "owned",
    },
    integrity: {
      ok: true,
      code: "ok",
      reason: "",
    },
    context_bindings: [],
  };
}

function itemFrom(raw) {
  const artifact = normalizeArtifactProjection(raw);
  assert.ok(artifact);
  return artifactProjectionToLibraryItem(artifact);
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function grantFor(url, overrides = {}) {
  const parts = url.pathname.split("/").filter(Boolean);
  return {
    artifact_id: parts[2],
    revision_id: parts[4],
    purpose: parts[6],
    mode: url.searchParams.get("mode"),
    access_url: `/v1/artifact-renditions/access/${parts[6]}-token`,
    expires_at: new Date(Date.now() + 300_000).toISOString(),
    format: "png",
    media_type: "image/png",
    ...overrides,
  };
}

function installFetch(raw, issueGrant) {
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.pathname.startsWith("/v1/library/items/")) {
      return jsonResponse(raw);
    }
    if (url.pathname.includes("/renditions/")) {
      return issueGrant(url);
    }
    throw new Error(`unexpected artifact request: ${url}`);
  };
  return calls;
}

test("structured projects export a rendered deliverable and never editor state", async () => {
  const raw = projection({
    id: "layered-poster",
    title: "Layered poster",
    artifactType: "chart",
    editorCapability: "chart-editor",
    sourceFormat: "oceanleo.chart.v1",
    sourceMediaType: "application/json",
    editorManifest: true,
  });
  const calls = installFetch(raw, (url) =>
    jsonResponse(
      grantFor(url, {
        filename: "../layered-poster.png",
        format: "png",
        media_type: "image/png",
      }),
    ),
  );
  const item = itemFrom(raw);
  assert.deepEqual(
    artifactDownloadPlanFor(item.artifact).map(({ purpose, mode }) => ({
      purpose,
      mode,
    })),
    [
      { purpose: "full", mode: "export" },
      { purpose: "preview", mode: "export" },
    ],
  );
  assert.deepEqual(artifactDownloadEvidence(item), {
    visible: true,
    available: true,
    reason: "",
    purpose: "full",
    mode: "export",
  });

  const result = await getArtifactDownload(item);

  assert.equal(result.ok, true);
  assert.equal(result.data?.purpose, "full");
  assert.equal(result.data?.mode, "export");
  assert.equal(result.data?.filename, "layered-poster.png");
  assert.equal(result.data?.mediaType, "image/png");
  assert.match(result.data?.expiresAt || "", /Z$/);
  assert.deepEqual(
    calls
      .filter((url) => url.pathname.includes("/renditions/"))
      .map((url) => `${url.pathname}?${url.searchParams}`),
    [
      "/v1/artifacts/layered-poster/revisions/r1/renditions/full?mode=export",
    ],
  );

  const manifestRaw = projection({
    id: "manifest-only",
    title: "Manifest only",
    source: false,
    editorManifest: true,
  });
  installFetch(manifestRaw, (url) => jsonResponse(grantFor(url)));
  const manifestItem = itemFrom(manifestRaw);
  assert.deepEqual(artifactDownloadPlanFor(manifestItem.artifact), []);
  const manifestResult = await getArtifactDownload(manifestItem);
  assert.equal(manifestResult.ok, false);
  assert.equal(manifestResult.code, "missing-source");
  assert.match(manifestResult.error || "", /editor manifest 不是用户下载物/);
});

test("rendered-only artifacts export full or preview and never touch source", async () => {
  const raw = projection({
    id: "rendered-report",
    title: "Rendered report",
    canExportSource: false,
    source: true,
    fullFormat: "pdf",
    fullMediaType: "application/pdf",
  });
  const calls = installFetch(raw, (url) =>
    jsonResponse(
      grantFor(url, {
        format: "pdf",
        media_type: "application/pdf",
      }),
    ),
  );
  const item = itemFrom(raw);
  assert.deepEqual(
    artifactDownloadPlanFor(item.artifact).map(({ purpose, mode }) => ({
      purpose,
      mode,
    })),
    [
      { purpose: "full", mode: "export" },
      { purpose: "preview", mode: "export" },
    ],
  );
  assert.equal(artifactDownloadEvidence(item).mode, "export");
  assert.equal(artifactDownloadEvidence(item).purpose, "full");

  const result = await getArtifactDownload(item);

  assert.equal(result.ok, true);
  assert.equal(result.data?.purpose, "full");
  assert.equal(result.data?.mode, "export");
  assert.equal(result.data?.filename, "Rendered report.pdf");
  assert.equal(result.data?.mediaType, "application/pdf");
  assert.deepEqual(
    calls
      .filter((url) => url.pathname.includes("/renditions/"))
      .map((url) => `${url.pathname}?${url.searchParams}`),
    [
      "/v1/artifacts/rendered-report/revisions/r1/renditions/full?mode=export",
    ],
  );
});

test("deck grid and richdoc download their real OOXML source", async (t) => {
  const cases = [
    {
      name: "deck",
      artifactType: "deck",
      editorCapability: "deck-editor",
      format: "pptx",
      mediaType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    },
    {
      name: "grid",
      artifactType: "grid",
      editorCapability: "grid-editor",
      format: "xlsx",
      mediaType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    {
      name: "richdoc",
      artifactType: "document",
      editorCapability: "richdoc-editor",
      format: "docx",
      mediaType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
  ];
  for (const entry of cases) {
    await t.test(entry.name, async () => {
      const raw = projection({
        id: `binary-${entry.name}`,
        title: `Binary ${entry.name}`,
        artifactType: entry.artifactType,
        editorCapability: entry.editorCapability,
        sourceFormat: entry.format,
        sourceMediaType: entry.mediaType,
      });
      const calls = installFetch(raw, (url) =>
        jsonResponse(
          grantFor(url, {
            filename: `artifact.json`,
            format: entry.format,
            media_type: entry.mediaType,
          }),
        ),
      );
      const item = itemFrom(raw);
      assert.deepEqual(
        artifactDownloadPlanFor(item.artifact).map(({ purpose, mode }) => ({
          purpose,
          mode,
        })),
        [{ purpose: "source", mode: "source" }],
      );

      const result = await getArtifactDownload(item);

      assert.equal(result.ok, true);
      assert.equal(result.data?.purpose, "source");
      assert.equal(result.data?.mode, "source");
      assert.equal(
        result.data?.filename,
        `Binary ${entry.name}.${entry.format}`,
      );
      assert.equal(result.data?.mediaType, entry.mediaType);
      assert.equal(
        calls.some(
          (url) =>
            url.pathname.endsWith("/renditions/source") &&
            url.searchParams.get("mode") === "source",
        ),
        true,
      );
    });
  }
});

test("gltf+json stays a gltf deliverable instead of becoming json", async () => {
  const raw = projection({
    id: "model-deliverable",
    title: "Scene",
    artifactType: "model_3d",
    editorCapability: "model-3d-editor",
    sourceFormat: "gltf",
    sourceMediaType: "model/gltf+json",
  });
  installFetch(raw, (url) =>
    jsonResponse(
      grantFor(url, {
        format: "gltf",
        media_type: "model/gltf+json",
      }),
    ),
  );

  const result = await getArtifactDownload(itemFrom(raw));

  assert.equal(result.ok, true);
  assert.equal(result.data?.filename, "Scene.gltf");
  assert.equal(result.data?.mediaType, "model/gltf+json");
});

test("proprietary rendition MIME never becomes a fabricated extension", async () => {
  const raw = projection({
    id: "proprietary-full",
    title: "Unsafe project",
    canExportSource: false,
    fullFormat: "oceanleo.design-document.v1",
    fullMediaType: "application/vnd.oceanleo.design-document+json",
  });
  installFetch(raw, (url) =>
    jsonResponse(
      grantFor(url, {
        format: "oceanleo.design-document.v1",
        media_type: "application/vnd.oceanleo.design-document+json",
      }),
    ),
  );

  const result = await getArtifactDownload(itemFrom(raw));

  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid-response");
  assert.match(result.error || "", /不在安全下载白名单/);
  assert.doesNotMatch(result.error || "", /OCEANLEODESIGNDO/i);
});

test("structured project JSON full falls back to a rendered preview", () => {
  const raw = projection({
    id: "chart-project",
    artifactType: "chart",
    editorCapability: "chart-editor",
    sourceFormat: "oceanleo.chart.v1",
    sourceMediaType: "application/json",
    fullFormat: "oceanleo.chart.v1",
    fullMediaType: "application/vnd.oceanleo.chart+json",
  });
  const item = itemFrom(raw);

  assert.deepEqual(
    artifactDownloadPlanFor(item.artifact).map(({ purpose, mode }) => ({
      purpose,
      mode,
    })),
    [{ purpose: "preview", mode: "export" }],
  );
});

test("source-capable artifacts fail closed when source is missing or denied", async () => {
  const missing = projection({
    id: "missing-source",
    source: false,
  });
  const missingCalls = installFetch(missing, (url) =>
    jsonResponse(grantFor(url)),
  );
  const missingItem = itemFrom(missing);
  assert.deepEqual(artifactDownloadPlanFor(missingItem.artifact), []);
  const evidence = artifactDownloadEvidence(missingItem);
  assert.equal(evidence.available, false);
  assert.match(evidence.reason, /缺少符合能力合同的真实交付 rendition/);

  const missingResult = await getArtifactDownload(missingItem);
  assert.equal(missingResult.ok, false);
  assert.equal(missingResult.code, "missing-source");
  assert.equal(
    missingCalls.some((url) => url.pathname.includes("/renditions/")),
    false,
  );

  const denied = projection({
    id: "denied-source",
    source: true,
    full: true,
  });
  const deniedCalls = installFetch(denied, () =>
    jsonResponse(
      {
        detail: {
          code: "license-restricted",
          message: "源码下载被授权策略拒绝。",
        },
      },
      403,
    ),
  );
  const deniedResult = await getArtifactDownload(itemFrom(denied));
  assert.equal(deniedResult.ok, false);
  assert.equal(deniedResult.status, 403);
  assert.equal(deniedResult.code, "license-restricted");
  assert.equal(deniedResult.error, "源码下载被授权策略拒绝。");
  assert.deepEqual(
    deniedCalls
      .filter((url) => url.pathname.includes("/renditions/"))
      .map((url) => [
        url.pathname.split("/").at(-1),
        url.searchParams.get("mode"),
      ]),
    [["source", "source"]],
  );
});

test("unified plan and client reject a digestless source without rendered fallback", async () => {
  const raw = projection({
    id: "digestless-source",
    sourceDigest: false,
  });
  raw.editability = "view_only";
  raw.editor_capability = null;
  raw.access.can_edit = false;
  const calls = installFetch(raw, (url) =>
    jsonResponse(grantFor(url)),
  );
  const item = itemFrom(raw);
  assert.equal(item.artifact.integrity.ok, true);
  assert.deepEqual(artifactDownloadPlanFor(item.artifact), []);
  assert.equal(artifactDownloadEvidence(item).available, false);

  const result = await getArtifactDownload(item);
  assert.equal(result.ok, false);
  assert.equal(result.code, "integrity-failed");
  assert.match(result.error || "", /摘要/);
  assert.equal(
    calls.some((url) => url.pathname.includes("/renditions/")),
    false,
  );
});

test("proprietary deck working state never substitutes for pptx source", async () => {
  const raw = projection({
    id: "deck-working-state",
    artifactType: "deck",
    editorCapability: "deck-editor",
    sourceFormat: "oceanleo.deck.v1",
    sourceMediaType: "application/vnd.oceanleo.deck+json",
  });
  const calls = installFetch(raw, (url) =>
    jsonResponse(grantFor(url)),
  );
  const item = itemFrom(raw);

  assert.deepEqual(artifactDownloadPlanFor(item.artifact), []);
  const result = await getArtifactDownload(item);
  assert.equal(result.ok, false);
  assert.equal(result.code, "missing-source");
  assert.match(result.error || "", /editor manifest 不是用户下载物/);
  assert.equal(
    calls.some((url) => url.pathname.includes("/renditions/")),
    false,
  );
});

test("typed Office source media mismatch fails before issuing a download grant", async () => {
  const raw = projection({
    id: "docx-image-source",
    artifactType: "document",
    editorCapability: "office-editor",
    sourceFormat: "docx",
    sourceMediaType: "image/png",
  });
  const calls = installFetch(raw, (url) =>
    jsonResponse(grantFor(url)),
  );
  const item = itemFrom(raw);
  assert.equal(item.artifact.integrity.ok, false);
  assert.equal(item.artifact.integrity.code, "source-format-mismatch");
  assert.match(item.artifact.integrity.reason, /Content-Type image\/png/);
  assert.deepEqual(artifactDownloadPlanFor(item.artifact), []);

  const result = await getArtifactDownload(item);
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid-response");
  assert.match(result.error || "", /Content-Type image\/png/);
  assert.equal(
    calls.some((url) => url.pathname.includes("/renditions/")),
    false,
  );
});

test("expired and identity-purpose-mode mismatched grants are rejected", async (t) => {
  const cases = [
    [
      "expired signed URL",
      { expires_at: new Date(Date.now() - 1_000).toISOString() },
    ],
    ["artifact mismatch", { artifact_id: "other-artifact" }],
    ["revision mismatch", { revision_id: "r2" }],
    ["purpose mismatch", { purpose: "full" }],
    ["mode mismatch", { mode: "export" }],
    ["media type mismatch", { media_type: "image/webp" }],
    ["format mismatch", { format: "webp" }],
    ["missing media type", { media_type: "" }],
    ["missing format", { format: "" }],
  ];
  for (const [name, override] of cases) {
    await t.test(name, async () => {
      const raw = projection({ id: `strict-${name.replaceAll(" ", "-")}` });
      installFetch(raw, (url) =>
        jsonResponse(grantFor(url, override)),
      );
      const result = await getArtifactDownload(itemFrom(raw));
      assert.equal(result.ok, false);
      assert.equal(result.code, "invalid-response");
      assert.match(result.error || "", /grant/);
    });
  }
});

test("rendition revision mismatch fails before a grant is requested", async () => {
  const raw = projection({
    id: "stale-source",
    sourceRevisionId: "r0",
  });
  const calls = installFetch(raw, (url) =>
    jsonResponse(grantFor(url)),
  );
  const result = await getArtifactDownload(itemFrom(raw));
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid-response");
  assert.match(result.error || "", /同一 revision/);
  assert.equal(
    calls.some((url) => url.pathname.includes("/renditions/")),
    false,
  );
});
