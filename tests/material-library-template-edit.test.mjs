// 官方模板素材「编辑」链路的契约。
//
// 根因：目录端点 `/v1/template-materials` 不下发 revision 身份，条目既非 durable
// artifact 也没有生成 receipt，于是 `editEvidence` 禁用按钮、`getArtifactEditDecision`
// 被 `ensureDurableArtifactItem` 409 卡死。
//
// 修复后钉四件事：
//   ① 货架上的条目仍然不是 durable artifact（不在 shelf 上冒充 durable）；
//   ② 点「编辑」凭目录里的 artifactId 解析服务端当前 head，走 owner 判定 → fork 出
//      用户副本，`prepareArtifactForAction("edit")` 把 durable 副本交给编辑器；
//   ③ 官方原件零变化：没有任何写请求打到原 root（`:fork` 是造新 root，不算改原件）；
//   ④ canFork 为假 / 未登录时编辑被拒绝并给出可读原因，绝不猜、绝不放行。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import {
  normalizeTemplateMaterial,
  templateMaterialLibraryItem,
} from "../src/shell/material-library-template-source.ts";
import { isDurableLibraryItem } from "../src/shell/library-data.ts";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);

const authStubUrl = dataModule(`
  export async function accessToken() {
    return "template-edit-token";
  }
`);
const configStubUrl = dataModule(`
  export const GATEWAY_BASE = "https://api.test";
`);
const artifactClientUrl = await compileModule("src/shell/artifact-client.ts", {
  "../lib/auth/client": authStubUrl,
  "../lib/auth/config": configStubUrl,
});
const {
  getArtifactEditDecision,
  getCurrentArtifactItem,
  prepareArtifactForAction,
  resetCurrentPrincipalId,
} = await import(artifactClientUrl);

const uiStubUrl = dataModule(`
  export function useUI() {
    return (value) => value;
  }
`);
const contractStubUrl = dataModule(`
  export function isEnsureableTransient(value) {
    return Boolean(value?.idempotencyKey && value?.resultId);
  }
`);
const libraryDataStubUrl = dataModule(`
  export function isDurableLibraryItem(item) {
    return Boolean(
      item?.artifactId &&
      item?.revisionId &&
      item?.artifactType &&
      item?.artifact?.artifactId === item.artifactId &&
      item?.artifact?.revisionId === item.revisionId
    );
  }
  // 动作条要问「这一行是不是官方模板目录行」——「查看」不欠耐久身份。判据与
  // library-data 同源，替身只是把同一句话说一遍。
  export function templateMaterialArtifactId(item) {
    const id = item?.meta?.template_material_id;
    if (typeof id !== "string" || !id.trim()) return "";
    const artifactId = item?.meta?.template_material_artifact_id;
    return typeof artifactId === "string" ? artifactId.trim() : "";
  }
  export function isTemplateMaterialDetailItem(item) {
    return Boolean(templateMaterialArtifactId(item)) && !isDurableLibraryItem(item);
  }
`);
const clientStubUrl = dataModule(`
  export function artifactDownloadEvidence() {
    return { visible: false, available: false, reason: "", purpose: null, mode: null };
  }
  export async function prepareArtifactForAction() {
    throw new Error("matrix 测试不打网络");
  }
  export async function getArtifactDownload() {
    throw new Error("matrix 测试不打网络");
  }
  export async function setArtifactFavorite() {
    throw new Error("matrix 测试不打网络");
  }
`);
const routesStubUrl = dataModule(`
  export function editorCapabilityFor() {
    return {
      available: true,
      unavailableReason: "",
      route: { type: "image" },
    };
  }
`);
const { artifactActionMatrix } = await import(
  await compileModule("src/shell/ArtifactActions.tsx", {
    "../i18n/ui/useUI": uiStubUrl,
    "./artifact-contract": contractStubUrl,
    "./artifact-client": clientStubUrl,
    "./library-data": libraryDataStubUrl,
    "./workbench-routes": routesStubUrl,
  })
);

const CURRENT_PRINCIPAL = "oceanleo:user:me";
const PLATFORM_PRINCIPAL = "oceanleo:platform";
const OFFICIAL_ID = "official-template";
const COPY_ID = "user-copy";

function projection({
  id = OFFICIAL_ID,
  revisionId = "r1",
  title = "官方模板素材",
  ownerPrincipalId = PLATFORM_PRINCIPAL,
  visibility = "public",
  canEdit = true,
  canFork = true,
} = {}) {
  return {
    schema: "oceanleo.artifact.v1",
    artifact_id: id,
    revision_id: revisionId,
    artifact_type: "single_file_image",
    roles: ["template"],
    title,
    favorite: false,
    owner: {
      principal_id: ownerPrincipalId,
      visibility,
      origin_site_key: "image",
      origin_app_id: "poster",
    },
    access: {
      can_read: true,
      can_preview: true,
      can_edit: canEdit,
      can_fork: canFork,
      can_insert: true,
      can_replace: true,
      can_favorite: true,
      can_bind: true,
      can_export_source: true,
    },
    editability: "bounded",
    editor_capability: "image-editor",
    source_format: "png",
    renditions: {
      thumbnail: {
        purpose: "thumbnail",
        revision_id: revisionId,
        url: `https://signed.test/${id}.thumb.webp`,
        format: "webp",
      },
      preview: {
        purpose: "preview",
        revision_id: revisionId,
        url: `https://signed.test/${id}.webp`,
        format: "webp",
      },
      source: {
        purpose: "source",
        revision_id: revisionId,
        url: `https://signed.test/${id}-source.png`,
        format: "png",
        digest: `sha256:${id}`,
      },
    },
    provenance: {
      id: `prov-${id}`,
      source_kind: "owned",
      license_code: "owned",
    },
    integrity: { ok: true, code: "ok", reason: "" },
    context_bindings: [
      {
        context_id: "ctx:image:poster",
        role: "primary",
        rank: 1,
        pinned_revision_id: revisionId,
      },
    ],
  };
}

/** 货架上那张官方模板卡片：非 durable、无 receipt，只带目录铸造的 meta。 */
function templateShelfItem(artifactId = OFFICIAL_ID) {
  const material = normalizeTemplateMaterial({
    id: "study-homework-1",
    title: "作业批改示例",
    summary: "官方样例",
    tags: [],
    previewUrl: "tpl-material/study-homework-1",
    artifactId,
    artifactType: "single_file_image",
    siteKey: "study",
    appId: "homework",
    width: 1240,
    height: 1754,
  });
  assert.ok(material, "fixture 无法通过目录行校验");
  return templateMaterialLibraryItem(material);
}

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

/** 与 library-edit-independence 同款诚实假服务端：原件可变，fork 造新 root。 */
function mockGateway({
  original,
  forked = null,
  capabilityStatuses = [],
  /** ensure 入库后服务端回的 artifact，连同与请求一致的 receipt。 */
  ensured = null,
  minePayload = {
    schema: "oceanleo.library.v1",
    scope: "mine",
    ownerPrincipalId: CURRENT_PRINCIPAL,
    items: [],
    total: 0,
  },
  mineStatus = 200,
  favoritesPayload = { detail: "favorites unavailable" },
  favoritesStatus = 503,
}) {
  const store = new Map();
  store.set(original.artifact_id, structuredClone(original));
  if (forked) store.set(forked.artifact_id, structuredClone(forked));
  if (ensured) store.set(ensured.artifact_id, structuredClone(ensured));
  const calls = [];
  const pendingCapabilityStatuses = [...capabilityStatuses];
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = String(init.method || "GET").toUpperCase();
    calls.push({ method, pathname: url.pathname, search: url.search });
    if (url.pathname === "/v1/library/mine") {
      return jsonResponse(minePayload, mineStatus);
    }
    if (url.pathname === "/v1/library/favorites") {
      return jsonResponse(favoritesPayload, favoritesStatus);
    }
    if (url.pathname === "/v1/artifacts/ensure") {
      if (!ensured) return jsonResponse({ detail: "ensure-not-configured" }, 403);
      const body = JSON.parse(String(init.body || "{}"));
      return jsonResponse({
        ...store.get(ensured.artifact_id),
        receipt: {
          resultId: body.result_id,
          payloadDigest: body.payload_digest,
          idempotencyKey: String(init.headers?.["Idempotency-Key"] || ""),
        },
      });
    }
    const forkMatch = /^\/v1\/artifacts\/(.+):fork$/.exec(url.pathname);
    if (forkMatch) {
      if (!forked) return jsonResponse({ detail: "fork-not-configured" }, 403);
      return jsonResponse({
        ...store.get(forked.artifact_id),
        forkedFrom: {
          artifactId: forkMatch[1],
          revisionId: original.revision_id,
        },
      });
    }
    const capabilityMatch = /^\/v1\/artifacts\/(.+)\/edit-capability$/.exec(
      url.pathname,
    );
    if (capabilityMatch) {
      const status = pendingCapabilityStatuses.shift() || 200;
      if (status !== 200) {
        return jsonResponse(
          {
            code: "control-plane-unavailable",
            message: "artifact control plane is unavailable",
            details: {},
          },
          status,
        );
      }
      const target = store.get(capabilityMatch[1]);
      return jsonResponse({
        available: true,
        editor_capability: target?.editor_capability || null,
        item: target,
      });
    }
    const detailMatch = /^\/v1\/library\/items\/(.+)$/.exec(url.pathname);
    if (detailMatch) {
      const target = store.get(detailMatch[1]);
      return target
        ? jsonResponse(target)
        : jsonResponse({ detail: "not-found" }, 404);
    }
    return jsonResponse({ detail: `unexpected ${url.pathname}` }, 500);
  };
  return {
    calls,
    clearCalls: () => {
      calls.length = 0;
    },
    stored: (id) => store.get(id),
    /** 不带 revisionId 的 items 读 = 「解析服务端当前 head」。 */
    headReads: (id) =>
      calls.filter(
        ({ method, pathname, search }) =>
          method === "GET" &&
          pathname === `/v1/library/items/${id}` &&
          search === "",
      ),
    writesAgainst: (id) =>
      calls.filter(
        ({ method, pathname }) =>
          method !== "GET" &&
          pathname.includes(id) &&
          !pathname.endsWith(":fork"),
      ),
    forkCalls: () => calls.filter(({ pathname }) => pathname.endsWith(":fork")),
    restore: () => {
      globalThis.fetch = previous;
    },
  };
}

test.beforeEach(() => {
  resetCurrentPrincipalId();
});

test("官方模板条目点「编辑」：解析当前 head → fork 用户副本 → durable 副本进编辑器", async () => {
  const original = projection({ canEdit: true, canFork: true });
  const forked = projection({
    id: COPY_ID,
    title: "官方模板素材 副本",
    ownerPrincipalId: CURRENT_PRINCIPAL,
    visibility: "private",
  });
  const before = structuredClone(original);
  const gateway = mockGateway({ original, forked });
  const shelfItem = templateShelfItem();
  try {
    // ① 货架约束不变：条目本身仍然不是 durable artifact，也没有 receipt。
    assert.equal(isDurableLibraryItem(shelfItem), false);
    assert.equal(shelfItem.transient, undefined);
    assert.equal(shelfItem.artifactId, undefined);
    assert.equal(
      shelfItem.meta.template_material_artifact_id,
      OFFICIAL_ID,
    );

    const prepared = await prepareArtifactForAction("edit", shelfItem);

    // ② 编辑器拿到的是 fork 出来的 durable 用户副本。
    assert.equal(prepared.ok, true, prepared.error);
    assert.equal(isDurableLibraryItem(prepared.data), true);
    assert.equal(prepared.data.artifactId, COPY_ID);
    assert.equal(
      prepared.data.artifact.owner.principalId,
      CURRENT_PRINCIPAL,
    );
    assert.equal(prepared.data.artifact.owner.visibility, "private");
    // 编辑器 source 由副本的 projection 给出，不是预览图。
    assert.equal(
      prepared.data.meta.editor_source_url,
      `https://signed.test/${COPY_ID}-source.png`,
    );

    // 解析走的是服务端权威当前 head：不带 revisionId 的 items 端点（fork 内部
    // 那次带 ?revisionId= 的刷新不算 head 解析）。
    assert.equal(gateway.headReads(OFFICIAL_ID).length, 1);
    // ③ fork 只发生一次，且打在官方 root 上造新 root；原件零写、零变化。
    assert.equal(gateway.forkCalls().length, 1);
    assert.equal(
      gateway.forkCalls()[0].pathname,
      `/v1/artifacts/${OFFICIAL_ID}:fork`,
    );
    assert.deepEqual(gateway.writesAgainst(OFFICIAL_ID), []);
    assert.deepEqual(gateway.stored(OFFICIAL_ID), before);
    // 编辑能力只对副本问，不对原件问。
    assert.deepEqual(
      gateway.calls
        .filter(({ pathname }) => pathname.endsWith("/edit-capability"))
        .map(({ pathname }) => pathname),
      [`/v1/artifacts/${COPY_ID}/edit-capability`],
    );
  } finally {
    gateway.restore();
  }
});

test("fork 后首次能力查询 503：同一副本自动恢复并进入编辑器，不重复 fork", async () => {
  const original = projection({ canEdit: true, canFork: true });
  const forked = projection({
    id: COPY_ID,
    title: "官方模板素材 副本",
    ownerPrincipalId: CURRENT_PRINCIPAL,
    visibility: "private",
  });
  const gateway = mockGateway({
    original,
    forked,
    capabilityStatuses: [503, 200],
  });
  try {
    const prepared = await prepareArtifactForAction("edit", templateShelfItem());

    assert.equal(prepared.ok, true, prepared.error);
    assert.equal(prepared.data.artifactId, COPY_ID);
    assert.equal(prepared.data.revisionId, "r1");
    assert.equal(gateway.forkCalls().length, 1);
    assert.deepEqual(
      gateway.calls
        .filter(({ pathname }) => pathname.endsWith("/edit-capability"))
        .map(({ pathname, search }) => `${pathname}${search}`),
      [
        `/v1/artifacts/${COPY_ID}/edit-capability?revisionId=r1`,
        `/v1/artifacts/${COPY_ID}/edit-capability?revisionId=r1`,
      ],
    );
  } finally {
    gateway.restore();
  }
});

test("canFork 为假时编辑被拒绝并给出可读原因，官方原件零变化", async () => {
  const original = projection({ canEdit: true, canFork: false });
  const before = structuredClone(original);
  const gateway = mockGateway({ original });
  try {
    const prepared = await prepareArtifactForAction("edit", templateShelfItem());

    assert.equal(prepared.ok, false);
    assert.equal(prepared.status, 403);
    assert.match(prepared.error, /source 授权/);
    assert.match(prepared.error, /官方原件不会被改动/);
    assert.deepEqual(gateway.forkCalls(), []);
    assert.deepEqual(gateway.writesAgainst(OFFICIAL_ID), []);
    assert.deepEqual(gateway.stored(OFFICIAL_ID), before);
  } finally {
    gateway.restore();
  }
});

test("未登录时中止编辑：文案是「登录后才能编辑」，绝不猜归属、绝不 fork", async () => {
  const original = projection({ canEdit: true, canFork: true });
  const before = structuredClone(original);
  const gateway = mockGateway({
    original,
    forked: projection({ id: COPY_ID }),
    minePayload: { detail: "unauthorized" },
    mineStatus: 401,
  });
  try {
    const decision = await getArtifactEditDecision(templateShelfItem());

    assert.equal(decision.ok, false);
    assert.equal(decision.status, 401);
    assert.match(decision.error, /登录后才能编辑素材/);
    assert.deepEqual(gateway.forkCalls(), []);
    assert.deepEqual(gateway.writesAgainst(OFFICIAL_ID), []);
    assert.deepEqual(gateway.stored(OFFICIAL_ID), before);
  } finally {
    gateway.restore();
  }
});

test("目录里查无此 artifact 时不回退成 409 receipt 文案，据实上报服务端错误", async () => {
  const original = projection();
  const gateway = mockGateway({ original });
  try {
    const prepared = await prepareArtifactForAction(
      "edit",
      templateShelfItem("catalog-row-without-artifact"),
    );

    assert.equal(prepared.ok, false);
    assert.equal(prepared.status, 404);
    assert.doesNotMatch(prepared.error || "", /幂等 receipt/);
    assert.deepEqual(gateway.forkCalls(), []);
  } finally {
    gateway.restore();
  }
});

test("fork 与否由 head 的 owner 判定，不由「是不是官方模板」判定", async () => {
  // 同一条目录行，服务端 head 说 owner 就是我（例如这份素材本来就是我发布的）：
  // 此时再 fork 一份副本纯属凭空造垃圾，该改的就是这个 root。
  const original = projection({ ownerPrincipalId: CURRENT_PRINCIPAL });
  const gateway = mockGateway({ original });
  try {
    const prepared = await prepareArtifactForAction("edit", templateShelfItem());

    assert.equal(prepared.ok, true, prepared.error);
    assert.equal(prepared.data.artifactId, OFFICIAL_ID);
    assert.equal(gateway.headReads(OFFICIAL_ID).length, 1);
    assert.deepEqual(gateway.forkCalls(), []);
    assert.deepEqual(
      gateway.calls
        .filter(({ pathname }) => pathname.endsWith("/edit-capability"))
        .map(({ pathname }) => pathname),
      [`/v1/artifacts/${OFFICIAL_ID}/edit-capability`],
    );
  } finally {
    gateway.restore();
  }
});

test("只有半个目录身份的行不进模板通道：编辑仍禁用，且一个请求都不发", async () => {
  const shelfItem = templateShelfItem();
  // 缺 artifactId 就没有可解析的 root，缺 catalog key 就不是这条链铸出来的行；
  // 两种残缺都必须落回原有的「没有身份」判定，不能凭半个键去问服务端。
  for (const overrides of [
    { template_material_artifact_id: "" },
    { template_material_artifact_id: "   " },
    { template_material_id: "" },
  ]) {
    const halfIdentity = {
      ...shelfItem,
      meta: { ...shelfItem.meta, ...overrides },
    };
    const gateway = mockGateway({ original: projection() });
    try {
      const matrix = artifactActionMatrix(halfIdentity);
      assert.equal(matrix.edit.available, false, JSON.stringify(overrides));
      assert.match(matrix.edit.reason, /稳定幂等 receipt/);

      const prepared = await prepareArtifactForAction("edit", halfIdentity);
      assert.equal(prepared.ok, false);
      assert.equal(prepared.status, 409);
      assert.match(prepared.error, /没有 durable artifact identity/);
      assert.deepEqual(gateway.calls, []);
    } finally {
      gateway.restore();
    }
  }
});

test("模板 meta 不劫持已有路径：durable 条目仍读固定 revision，不改读 head", async () => {
  const original = projection({ ownerPrincipalId: CURRENT_PRINCIPAL });
  const gateway = mockGateway({ original });
  try {
    const head = await getCurrentArtifactItem(OFFICIAL_ID);
    assert.equal(head.ok, true, head.error);
    // durable 条目也可能带着目录 meta（同一份素材从模板货架进过详情页）。
    const durableWithTemplateMeta = {
      ...head.data,
      meta: { ...head.data.meta, ...templateShelfItem().meta },
    };
    assert.equal(isDurableLibraryItem(durableWithTemplateMeta), true);
    gateway.clearCalls();

    const decision = await getArtifactEditDecision(durableWithTemplateMeta);

    assert.equal(decision.ok, true, decision.error);
    // durable 身份自带 revision 锚点，读的必须是那一版，而不是「现在的 head」。
    assert.deepEqual(gateway.headReads(OFFICIAL_ID), []);
    assert.deepEqual(
      gateway.calls
        .filter(
          ({ method, pathname }) =>
            method === "GET" &&
            pathname === `/v1/library/items/${OFFICIAL_ID}`,
        )
        .map(({ search }) => search),
      ["?revisionId=r1"],
    );
  } finally {
    gateway.restore();
  }
});

test("模板 meta 不劫持已有路径：带生成 receipt 的条目仍走 ensure 入库", async () => {
  const original = projection();
  const ensured = projection({
    id: COPY_ID,
    ownerPrincipalId: CURRENT_PRINCIPAL,
    visibility: "private",
  });
  const gateway = mockGateway({ original, ensured });
  const shelfItem = templateShelfItem();
  try {
    const prepared = await prepareArtifactForAction("edit", {
      ...shelfItem,
      transient: {
        schema: "oceanleo.transient-generation.v1",
        operation: "image.generate",
        resultId: "res-1",
        payloadDigest: "sha256:payload",
        idempotencyKey: "idem-1",
        artifactType: "single_file_image",
        title: "生成结果",
        renditionUrl: "https://signed.test/transient.webp",
      },
    });

    assert.equal(prepared.ok, true, prepared.error);
    // 有 receipt 就有真的入库凭据，入库结果才是编辑起点；目录 meta 不得改道。
    assert.equal(prepared.data.artifactId, COPY_ID);
    assert.deepEqual(gateway.headReads(OFFICIAL_ID), []);
    assert.equal(
      gateway.calls.filter(
        ({ method, pathname }) =>
          method === "POST" && pathname === "/v1/artifacts/ensure",
      ).length,
      1,
    );
    assert.deepEqual(gateway.forkCalls(), []);
  } finally {
    gateway.restore();
  }
});

test("action matrix：官方模板条目「编辑」可用且走 ensure 口径；无身份条目依旧禁用", () => {
  const templateMatrix = artifactActionMatrix(templateShelfItem());
  assert.equal(templateMatrix.edit.visible, true);
  assert.equal(templateMatrix.edit.available, true);
  assert.equal(templateMatrix.edit.reason, "");
  assert.equal(templateMatrix.edit.requiresEnsure, true);

  // 宿主没注册 typed Edit route 时仍然禁用，门禁不因模板例外而松动。
  const gated = artifactActionMatrix(templateShelfItem(), {
    canOpenEdit: false,
  });
  assert.equal(gated.edit.available, false);
  assert.match(gated.edit.reason, /没有注册 typed Edit route/);

  // 回归：既非 durable 又无 receipt、也不是官方模板的条目，维持原有禁用理由。
  const identityLess = artifactActionMatrix({
    key: "creation:no-receipt",
    source: "creation",
    id: "no-receipt",
    title: "无身份条目",
    kind: "image",
    siteId: "image",
    favorite: false,
    meta: {},
  });
  assert.equal(identityLess.edit.visible, true);
  assert.equal(identityLess.edit.available, false);
  assert.match(identityLess.edit.reason, /稳定幂等 receipt/);
});
