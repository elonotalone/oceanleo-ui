// ============================================================================
// W4 —— R-7：fork 一份官方素材之后，用户自己的「我的库」不许整个坏掉
// ----------------------------------------------------------------------------
// V5 实测的形状：库里只要存在一份 fork 副本，`listMyArtifacts` 就整份 `ok:false`
// （`第三方 artifact 同时缺少 license URL 与 attribution。`），一个条目都列不出来——
// 不是只隐藏那一份。退役该副本后立刻恢复正常。
//
// 根因是同一条规则有两份实现、只改了一份：后端
// `typed_artifact_service.py`（搜 `third-party provenance lacks license URL and
// attribution`）用 `rights_asserted` 放行了官方素材的副本，前端
// `artifact-contract.ts` 这份没跟上。
//
// **本文件刻意不用合成投影。** V5 点名：既有前端单测用的都是合成数据，这正是
// BLOCKER-2 当初被漏掉的原因。下面每一个字段都是 2026-07-27 从生产库抄下来的，
// 抄录用的 SQL 附在各自上方，可原样复跑核对。
// ============================================================================

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import ts from "typescript";

import {
  artifactIntegrityFor,
  normalizeArtifactProjection,
} from "../src/shell/artifact-contract.ts";

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

const artifactClientUrl = await compileModule("src/shell/artifact-client.ts", {
  "../lib/auth/client": dataModule(
    `export async function accessToken() { return "fork-copy-integrity-token"; }`,
  ),
  "../lib/auth/config": dataModule(
    `export const GATEWAY_BASE = "https://api.test";`,
  ),
  "./artifact-contract": pathToFileURL(
    resolve("src/shell/artifact-contract.ts"),
  ).href,
  "./library-data": pathToFileURL(resolve("src/shell/library-data.ts")).href,
});
const { listMyArtifacts, resetCurrentPrincipalId } = await import(
  artifactClientUrl
);

// 真实的 fork 副本 owner（生产 `artifact_roots.owner_principal_id`）。
const REAL_OWNER_PRINCIPAL = "2ffeef37-102a-431b-b2c2-51c5675dba79";

/**
 * 一份**真实**的 fork 副本投影。
 *
 * 每个字段的来源（2026-07-27，`supabase-sql oceanleo`）：
 *
 *   select r.id revision_id, r.artifact_id, r.title, r.artifact_type,
 *          r.source_format, r.editability, r.editor_capability,
 *          root.owner_principal_id, root.visibility,
 *          root.origin_site_key, root.origin_app_id
 *     from artifact_revisions r
 *     join artifact_roots root on root.id = r.artifact_id
 *    where r.artifact_id = 'cb10ec92-2a6c-4130-9ebb-2242ce35917c';
 *
 *   select purpose, media_type, format from artifact_renditions
 *    where revision_id = 'e8e63d1c-f772-41cb-b18d-61fb2be2ab70';
 *
 *   select source_format, source_blob_sha256 from artifact_sources
 *    where revision_id = 'e8e63d1c-f772-41cb-b18d-61fb2be2ab70';
 *
 *   select source_kind, rights_asserted, license_code,
 *          coalesce(license_url,''), coalesce(attribution,'')
 *     from artifact_provenance where revision_id = 'e8e63d1c-…';
 *     → derivative | true | OCEANLEO-AIGEN | '' | ''
 *
 * 它是「用户 fork 了 law 站的官方虚构样例」——正是 R-7 报告里那一份。
 */
function realForkCopyProjection() {
  const revisionId = "e8e63d1c-f772-41cb-b18d-61fb2be2ab70";
  const mediaType =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const rendition = (purpose) => ({
    purpose,
    revision_id: revisionId,
    url: `https://signed.test/${purpose}.docx`,
    media_type: mediaType,
    format: "docx",
    digest:
      "sha256:9c27bd18480b0250ee44fbf22d123b9005dd01468cdf85b364a87a385a7a8faf",
  });
  return {
    schema: "oceanleo.artifact.v1",
    artifact_id: "cb10ec92-2a6c-4130-9ebb-2242ce35917c",
    revision_id: revisionId,
    artifact_type: "document",
    roles: [],
    title: "类案检索报告体例（官方虚构样例）",
    favorite: false,
    owner: {
      principal_id: REAL_OWNER_PRINCIPAL,
      visibility: "private",
      origin_site_key: "law",
      origin_app_id: "case-search",
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
    source_format: "docx",
    renditions: {
      thumbnail: rendition("thumbnail"),
      preview: rendition("preview"),
      full: rendition("full"),
      source: rendition("source"),
    },
    // ← R-7 的全部要害就在这四个值上。
    provenance: {
      id: "prov-real-fork",
      source_kind: "derivative",
      license_code: "OCEANLEO-AIGEN",
      license_url: "",
      attribution: "",
      rights_asserted: true,
    },
    integrity: { ok: true, code: "ok", reason: "" },
    context_bindings: [],
  };
}

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test.beforeEach(() => {
  resetCurrentPrincipalId();
});

// ── 核心回归：真实 fork 副本必须能被列出来 ──────────────────────────────────

test("库里有一份真实官方素材的 fork 副本时，listMyArtifacts 仍然 ok 并列得出它", async () => {
  const copy = realForkCopyProjection();
  globalThis.fetch = async () =>
    jsonResponse({
      schema: "oceanleo.library.v1",
      scope: "mine",
      ownerPrincipalId: REAL_OWNER_PRINCIPAL,
      items: [copy],
      total: 1,
    });

  const result = await listMyArtifacts();

  // R-7 之前这里是 ok:false / code:"invalid-response"，整页一个条目都没有。
  assert.equal(result.ok, true, result.error);
  assert.equal(result.data.items.length, 1);
  assert.equal(
    result.data.items[0].artifactId,
    "cb10ec92-2a6c-4130-9ebb-2242ce35917c",
  );
  assert.equal(result.data.ownerPrincipalId, REAL_OWNER_PRINCIPAL);
  assert.equal(result.data.items[0].artifact.integrity.ok, true);
});

test("一份 fork 副本不得连坐同页其它条目", async () => {
  // V5 的原话：「不是只隐藏那一份」。同页放一份普通自有作品，两份都要在。
  const copy = realForkCopyProjection();
  const own = {
    ...realForkCopyProjection(),
    artifact_id: "11111111-1111-4111-8111-111111111111",
    title: "我自己写的文档",
    provenance: {
      id: "prov-own",
      // 生产实测的第一方形状：owned + rights_asserted + 无 URL 无 attribution。
      source_kind: "owned",
      license_code: "OCEANLEO-AIGEN",
      license_url: "",
      attribution: "",
      rights_asserted: true,
    },
  };
  globalThis.fetch = async () =>
    jsonResponse({
      schema: "oceanleo.library.v1",
      scope: "mine",
      ownerPrincipalId: REAL_OWNER_PRINCIPAL,
      items: [own, copy],
      total: 2,
    });

  const result = await listMyArtifacts();

  assert.equal(result.ok, true, result.error);
  assert.deepEqual(
    result.data.items.map((item) => item.artifactId).sort(),
    [
      "11111111-1111-4111-8111-111111111111",
      "cb10ec92-2a6c-4130-9ebb-2242ce35917c",
    ],
  );
});

test("服务端跳过一行时，前端不得自己再把整页判死（后端爆炸半径修复的另一半）", async () => {
  // W7 把后端改成「跳过那一行、计进 invalidCount」而不是整页失败。前端若仍然
  // 「invalidCount > 0 就整页 invalid-response」，后端那半个修复等于白做——用户看到
  // 的还是一个条目都没有。
  globalThis.fetch = async () =>
    jsonResponse({
      schema: "oceanleo.library.v1",
      scope: "mine",
      ownerPrincipalId: REAL_OWNER_PRINCIPAL,
      items: [realForkCopyProjection()],
      total: 2,
      invalidCount: 1,
    });

  const result = await listMyArtifacts();

  assert.equal(result.ok, true, result.error);
  assert.equal(result.data.items.length, 1, "好的那一条必须照常列出来");
  assert.equal(
    result.data.items[0].artifactId,
    "cb10ec92-2a6c-4130-9ebb-2242ce35917c",
  );
});

test("服务端跳过的坏行身份要原样带出来，否则用户永远删不掉它", async () => {
  // 后端跳过一行而不是整页失败之后，删掉它需要 revisionId + If-Match，而这两个值
  // 读不出来——所以后端专门发 `invalidItems`。前端丢掉它 = 用户没有清理的抓手。
  globalThis.fetch = async () =>
    jsonResponse({
      schema: "oceanleo.library.v1",
      scope: "mine",
      ownerPrincipalId: REAL_OWNER_PRINCIPAL,
      items: [realForkCopyProjection()],
      total: 2,
      invalidCount: 1,
      invalidItems: [
        {
          artifactId: "9dcf1f4a-0000-4000-8000-000000000001",
          revisionId: "5c0b7e11-0000-4000-8000-000000000002",
        },
      ],
    });

  const result = await listMyArtifacts();

  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.data.invalidItems, [
    {
      artifactId: "9dcf1f4a-0000-4000-8000-000000000001",
      revisionId: "5c0b7e11-0000-4000-8000-000000000002",
    },
  ]);
});

test("收藏那一半同样不得被一条坏行判死（我的库把两边合并成一个面）", async () => {
  const { listFavoriteArtifacts } = await import(artifactClientUrl);
  const favorite = {
    ...realForkCopyProjection(),
    favorite: true,
    owner: {
      ...realForkCopyProjection().owner,
      visibility: "public",
    },
  };
  globalThis.fetch = async () =>
    jsonResponse({
      schema: "oceanleo.library.v1",
      scope: "favorites",
      ownerPrincipalId: REAL_OWNER_PRINCIPAL,
      items: [favorite],
      total: 2,
      invalidCount: 1,
    });

  const result = await listFavoriteArtifacts();

  assert.equal(result.ok, true, result.error);
  assert.equal(result.data.items.length, 1);
});

// ── 判据本身：与后端逐项对齐，且没有把第三方一起放行 ────────────────────────

test("provenance 判据与后端逐项对齐：rightsAsserted 是第三条出路", () => {
  const base = normalizeArtifactProjection(realForkCopyProjection());
  assert.ok(base);
  const integrityFor = (provenance) =>
    artifactIntegrityFor({ ...base, provenance });

  // 生产实测的五种真实 provenance 形状（`select source_kind, rights_asserted,
  // license_code, license_url, attribution, count(*) … group by 1,2,3,4,5`）。
  const real = [
    // 官方素材的用户副本：19 行。R-7 就是它们被拒。
    ["derivative", true, "OCEANLEO-AIGEN", "", "", true],
    // 历史 derivative：104 行，带 license URL，本来就通过。
    [
      "derivative",
      false,
      "CC0",
      "https://creativecommons.org/publicdomain/zero/1.0/",
      "",
      true,
    ],
    // 第一方：2315 + 538 + 720 行，无 URL 无 attribution，靠 rights_asserted。
    ["owned", true, "OCEANLEO-AIGEN", "", "", true],
    ["generated", true, "OCEANLEO-AIGEN", "", "", true],
    // 第三方：21289 行，rights_asserted 恒假，但一定带 license URL。
    [
      "approved_provider",
      false,
      "PDM",
      "https://creativecommons.org/publicdomain/mark/1.0/",
      "",
      true,
    ],
  ];
  for (const [
    sourceKind,
    rightsAsserted,
    licenseCode,
    licenseUrl,
    attribution,
    expectOk,
  ] of real) {
    const integrity = integrityFor({
      id: "p",
      sourceKind,
      licenseCode,
      licenseUrl,
      attribution,
      rightsAsserted,
    });
    assert.equal(
      integrity.ok,
      expectOk,
      `${sourceKind}/${rightsAsserted}/${licenseCode} 判定不对：${integrity.reason}`,
    );
  }
});

test("放宽只针对 rightsAsserted，真正的第三方复用仍然必须出示证据", () => {
  const base = normalizeArtifactProjection(realForkCopyProjection());
  // 第三方素材的 fork 继承 rights_asserted=false，没有 URL 也没有 attribution
  // 时**仍然要被拒**——这条放宽不能变成对所有 derivative 开门。
  const denied = artifactIntegrityFor({
    ...base,
    provenance: {
      id: "p",
      sourceKind: "derivative",
      licenseCode: "CC-BY",
      licenseUrl: "",
      attribution: "",
      rightsAsserted: false,
    },
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "license-restricted");
  assert.match(denied.reason, /第三方 artifact 同时缺少 license URL 与 attribution/);

  // 只要出示任意一份证据就放行（license URL 或 attribution，与后端注释一致）。
  for (const evidence of [
    { licenseUrl: "https://creativecommons.org/licenses/by/4.0/", attribution: "" },
    { licenseUrl: "", attribution: "Some Provider (CC BY 4.0)" },
  ]) {
    const allowed = artifactIntegrityFor({
      ...base,
      provenance: {
        id: "p",
        sourceKind: "derivative",
        licenseCode: "CC-BY",
        rightsAsserted: false,
        ...evidence,
      },
    });
    assert.equal(allowed.ok, true, allowed.reason);
  }
});

test("老部署不发 rights_asserted 时按 false 处理，与后端默认值一致", () => {
  const withoutFlag = normalizeArtifactProjection({
    ...realForkCopyProjection(),
    provenance: {
      id: "prov-legacy",
      source_kind: "approved_provider",
      license_code: "CC-BY",
      license_url: "",
      attribution: "",
    },
  });
  // 归一化后 flag 是 false，因此这份（第三方 + 无证据）应当被判为不完整。
  assert.ok(withoutFlag);
  assert.equal(withoutFlag.provenance.rightsAsserted, false);
  assert.equal(withoutFlag.integrity.ok, false);
  assert.equal(withoutFlag.integrity.code, "license-restricted");
});
