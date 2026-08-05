// ============================================================================
// W4 —— 「用户的改动完完全全独立于素材本身」的机器化表达（合同 §0.5）
// ----------------------------------------------------------------------------
// 操作员的本意：用户可以编辑预制模板素材，但改动必须存成**用户自己的**副本，官方
// 原件不得有任何变化。本文件锁死两侧判据：
//   ① 官方素材（哪怕带着 `all/*` 的历史 `edit` 授权、`canEdit === true`）一律先
//      fork，原件字节与元数据零变化；
//   ② 用户自己的条目不得莫名 fork 出副本——这是改判据最容易造成的回归。
// ============================================================================

import assert from "node:assert/strict";
import test from "node:test";

import { normalizeArtifactProjection } from "../src/shell/artifact-contract.ts";
import { artifactProjectionToLibraryItem } from "../src/shell/library-data.ts";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const authStubUrl = dataModule(`
  export async function accessToken() {
    return "library-edit-independence-token";
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
  getCurrentPrincipalId,
  primeCurrentPrincipalId,
  resetCurrentPrincipalId,
  resolveArtifactEditOwnership,
} = await import(artifactClientUrl);

const CURRENT_PRINCIPAL = "oceanleo:user:me";
const PLATFORM_PRINCIPAL = "oceanleo:platform";

/** 一份可编辑的 single_file_image 投影，字段齐到能通过 contract 校验。 */
function projection({
  id = "official-template",
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

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function libraryItem(raw) {
  const normalized = normalizeArtifactProjection(raw);
  assert.ok(normalized, "fixture 无法通过 artifact contract 校验");
  return artifactProjectionToLibraryItem(normalized);
}

/**
 * 一个够诚实的假服务端：原件与 fork 件各存一份**可变**投影。
 *
 * 任何打到 `/v1/artifacts/<id>/revisions`（唯一的内容变更端点）的请求都会真的改掉
 * 那份投影，所以「原件零变化」不是靠数请求数猜的，是靠事后 deepEqual 证的。
 */
function mockGateway({
  original,
  forked = null,
  minePayload = {
    schema: "oceanleo.library.v1",
    scope: "mine",
    ownerPrincipalId: CURRENT_PRINCIPAL,
    items: [],
    total: 0,
  },
  mineStatus = 200,
  // 身份探测的第二个来源（`/v1/library/favorites`）。默认让它也答不上来，这样
  // 「mine 坏了」的用例仍然测的是「两个来源都失败」这一最坏情形。
  favoritesPayload = { detail: "favorites unavailable" },
  favoritesStatus = 503,
}) {
  const store = new Map();
  store.set(original.artifact_id, structuredClone(original));
  if (forked) store.set(forked.artifact_id, structuredClone(forked));
  const calls = [];
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
    const revisionMatch = /^\/v1\/artifacts\/(.+)\/revisions$/.exec(
      url.pathname,
    );
    if (revisionMatch) {
      // 真的改一次，好让「原件零变化」这条断言有牙齿。
      const target = store.get(revisionMatch[1]);
      if (target) {
        target.revision_id = "MUTATED";
        target.title = `${target.title}（被改过）`;
      }
      return jsonResponse(target || {});
    }
    const capabilityMatch = /^\/v1\/artifacts\/(.+)\/edit-capability$/.exec(
      url.pathname,
    );
    if (capabilityMatch) {
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
    stored: (id) => store.get(id),
    /** 打到某个 artifact 的非 GET 请求（`:fork` 是造新 root，不算改原件）。 */
    writesAgainst: (id) =>
      calls.filter(
        ({ method, pathname }) =>
          method !== "GET" &&
          pathname.includes(id) &&
          !pathname.endsWith(":fork"),
      ),
    forkCalls: () => calls.filter(({ pathname }) => pathname.endsWith(":fork")),
  };
}

test.beforeEach(() => {
  resetCurrentPrincipalId();
});

// ── ① 官方原件零变化 ────────────────────────────────────────────────────────

test("官方素材带着 all/* 的 edit 授权也一律 fork，原件字节与元数据零变化", async () => {
  const original = projection({ canEdit: true, canFork: true });
  const forked = projection({
    id: "user-copy",
    title: "官方模板素材 副本",
    ownerPrincipalId: CURRENT_PRINCIPAL,
    visibility: "private",
  });
  // 决策之前先拍一张原件快照：这就是「完完全全独立」要比对的基准。
  const before = structuredClone(original);
  const gateway = mockGateway({ original, forked });

  const decision = await getArtifactEditDecision(libraryItem(original));

  // (a) 真的发生了 fork —— 旧判据 `!canEdit && canFork` 在 canEdit === true 时会跳过。
  assert.equal(decision.ok, true, decision.error);
  assert.equal(gateway.forkCalls().length, 1);
  assert.equal(
    gateway.forkCalls()[0].pathname,
    "/v1/artifacts/official-template:fork",
  );
  // (b) 拿回来的是另一个 artifact root，且 owner 是当前用户。
  assert.equal(decision.data.item.artifactId, "user-copy");
  assert.notEqual(decision.data.item.artifactId, "official-template");
  assert.equal(
    decision.data.item.artifact.owner.principalId,
    CURRENT_PRINCIPAL,
  );
  assert.equal(decision.data.item.artifact.owner.visibility, "private");
  // (c) 没有任何写请求打到原 artifact，而且服务端那份原件逐字未变。
  assert.deepEqual(gateway.writesAgainst("official-template"), []);
  assert.deepEqual(gateway.stored("official-template"), before);
  // 编辑能力也只对副本问，不对原件问。
  assert.deepEqual(
    gateway.calls
      .filter(({ pathname }) => pathname.endsWith("/edit-capability"))
      .map(({ pathname }) => pathname),
    ["/v1/artifacts/user-copy/edit-capability"],
  );
});

test("fork 判据只看 owner，canEdit 完全不参与", async () => {
  for (const canEdit of [true, false]) {
    resetCurrentPrincipalId();
    const original = projection({ canEdit, canFork: true });
    const forked = projection({
      id: "user-copy",
      ownerPrincipalId: CURRENT_PRINCIPAL,
      visibility: "private",
    });
    const gateway = mockGateway({ original, forked });
    const decision = await getArtifactEditDecision(libraryItem(original));
    assert.equal(decision.ok, true, `canEdit=${canEdit}: ${decision.error}`);
    assert.equal(
      gateway.forkCalls().length,
      1,
      `canEdit=${canEdit} 时应当照样 fork`,
    );
    assert.equal(decision.data.item.artifactId, "user-copy");
  }
});

// ── ② 回归：编辑自己的东西不得多出一份副本 ──────────────────────────────────

test("编辑自己的库条目不会 fork 出副本，改的就是自己那个 root", async () => {
  const mine = projection({
    id: "my-own-work",
    title: "我自己的作品",
    ownerPrincipalId: CURRENT_PRINCIPAL,
    visibility: "private",
    canEdit: true,
    canFork: true,
  });
  const gateway = mockGateway({ original: mine });

  const decision = await getArtifactEditDecision(libraryItem(mine));

  assert.equal(decision.ok, true, decision.error);
  assert.deepEqual(gateway.forkCalls(), []);
  assert.equal(decision.data.item.artifactId, "my-own-work");
  assert.equal(
    decision.data.item.artifact.owner.principalId,
    CURRENT_PRINCIPAL,
  );
});

test("自己的条目即使 canEdit 为假也不 fork：能不能编辑由服务端 edit-capability 说了算", async () => {
  const mine = projection({
    id: "my-own-work",
    ownerPrincipalId: CURRENT_PRINCIPAL,
    visibility: "private",
    canEdit: false,
    canFork: true,
  });
  const gateway = mockGateway({ original: mine });

  const decision = await getArtifactEditDecision(libraryItem(mine));

  assert.equal(decision.ok, true, decision.error);
  assert.deepEqual(gateway.forkCalls(), []);
  assert.equal(decision.data.item.artifactId, "my-own-work");
});

test("我的库一旦回过权威 ownerPrincipalId，后续判定不再重复探测", async () => {
  const mine = projection({
    id: "my-own-work",
    ownerPrincipalId: CURRENT_PRINCIPAL,
    visibility: "private",
  });
  const gateway = mockGateway({ original: mine });

  await getArtifactEditDecision(libraryItem(mine));
  await getArtifactEditDecision(libraryItem(mine));

  assert.equal(
    gateway.calls.filter(({ pathname }) => pathname === "/v1/library/mine")
      .length,
    1,
  );
});

// ── ③ 身份不可知 / 缺 source 时的行为 ───────────────────────────────────────

test("拿不到当前 principalId 时中止编辑，绝不当成「我就是 owner」", async () => {
  const original = projection({ canEdit: true, canFork: true });
  const before = structuredClone(original);
  const gateway = mockGateway({
    original,
    forked: projection({ id: "user-copy" }),
    minePayload: { detail: "unauthorized" },
    mineStatus: 401,
  });

  const decision = await getArtifactEditDecision(libraryItem(original));

  assert.equal(decision.ok, false);
  assert.equal(decision.status, 401);
  assert.match(decision.error, /登录后才能编辑素材/);
  // 401 是「真的没登录」，不该再去问第二个端点浪费一次请求。
  assert.deepEqual(
    gateway.calls.filter(({ pathname }) => pathname === "/v1/library/favorites"),
    [],
  );
  assert.deepEqual(gateway.writesAgainst("official-template"), []);
  assert.deepEqual(gateway.forkCalls(), []);
  assert.deepEqual(gateway.stored("official-template"), before);
});

test("我的库响应没声明 ownerPrincipalId 时同样中止，不猜归属", async () => {
  const original = projection({ canEdit: true, canFork: true });
  const gateway = mockGateway({
    original,
    forked: projection({ id: "user-copy" }),
    minePayload: { schema: "oceanleo.library.v1", items: [], total: 0 },
  });

  const decision = await getArtifactEditDecision(libraryItem(original));

  assert.equal(decision.ok, false);
  assert.match(decision.error, /素材库暂时无法确认你的账号归属/);
  assert.deepEqual(gateway.forkCalls(), []);
});

// ── ③b V5 BLOCKER-2：坏数据不得表现成「登录有问题」，也不得连坐身份 ──────────

test("一条坏投影让 /v1/library/mine 整页 409 时，身份改从收藏端点拿", async () => {
  // V5 实测的那个形状：登录是好的，坏的是 mine 那一页的数据。
  const mine = projection({
    id: "my-own-work",
    ownerPrincipalId: CURRENT_PRINCIPAL,
    visibility: "private",
  });
  const gateway = mockGateway({
    original: mine,
    minePayload: {
      detail: "canonical library page contains an invalid projection",
    },
    mineStatus: 409,
    favoritesPayload: {
      schema: "oceanleo.library.v1",
      scope: "favorites",
      ownerPrincipalId: CURRENT_PRINCIPAL,
      items: [],
      total: 0,
    },
    favoritesStatus: 200,
  });

  const decision = await getArtifactEditDecision(libraryItem(mine));

  // 身份拿到了 → 编辑照常进行；坏数据没有把「我是谁」一起拖下水。
  assert.equal(decision.ok, true, decision.error);
  assert.equal(decision.data.item.artifactId, "my-own-work");
  assert.deepEqual(gateway.forkCalls(), []);
  assert.deepEqual(
    gateway.calls
      .filter(({ pathname }) => pathname.startsWith("/v1/library/"))
      .map(({ pathname }) => pathname)
      .filter((pathname) => !pathname.startsWith("/v1/library/items/")),
    ["/v1/library/mine", "/v1/library/favorites"],
  );
});

test("两个身份端点都答不上来时，文案说的是素材库故障，不是登录问题", async () => {
  const original = projection({ canEdit: true, canFork: true });
  const before = structuredClone(original);
  const gateway = mockGateway({
    original,
    forked: projection({ id: "user-copy" }),
    minePayload: {
      detail: "canonical library page contains an invalid projection",
    },
    mineStatus: 409,
  });

  const decision = await getArtifactEditDecision(libraryItem(original));

  assert.equal(decision.ok, false);
  // 必须**不**把后端数据缺陷说成登录问题——那会把用户和排障的人引到重登一遍。
  assert.doesNotMatch(decision.error, /登录后才能编辑素材/);
  assert.match(decision.error, /素材库暂时无法确认你的账号归属/);
  assert.match(decision.error, /不是你的登录出了问题/);
  // 原件依然零变化：中止的语义没有因为换了文案而松动。
  assert.deepEqual(gateway.forkCalls(), []);
  assert.deepEqual(gateway.writesAgainst("official-template"), []);
  assert.deepEqual(gateway.stored("official-template"), before);
});

test("resolveArtifactEditOwnership 用 reason 区分「没登录」与「库里有坏数据」", async () => {
  const official = projection({ canEdit: true, canFork: true });

  resetCurrentPrincipalId();
  mockGateway({
    original: official,
    minePayload: { detail: "unauthorized" },
    mineStatus: 401,
  });
  const unauthenticated = await resolveArtifactEditOwnership(
    libraryItem(official),
  );
  assert.equal(unauthenticated.kind, "unknown");
  assert.equal(unauthenticated.reason, "unauthenticated");

  resetCurrentPrincipalId();
  mockGateway({
    original: official,
    minePayload: { detail: "invalid projection" },
    mineStatus: 409,
  });
  const unavailable = await resolveArtifactEditOwnership(
    libraryItem(official),
  );
  assert.equal(unavailable.kind, "unknown");
  assert.equal(unavailable.reason, "unavailable");
});

test("缺 source 授权导致 canFork 为假时给可读错误，而不是静默无反应", async () => {
  const original = projection({ canEdit: true, canFork: false });
  const before = structuredClone(original);
  const gateway = mockGateway({ original });

  const decision = await getArtifactEditDecision(libraryItem(original));

  assert.equal(decision.ok, false);
  assert.equal(decision.status, 403);
  assert.match(decision.error, /source 授权/);
  assert.match(decision.error, /官方原件不会被改动/);
  assert.deepEqual(gateway.forkCalls(), []);
  assert.deepEqual(gateway.writesAgainst("official-template"), []);
  assert.deepEqual(gateway.stored("official-template"), before);
});

// ── ④ owner 判定本身 ───────────────────────────────────────────────────────

test("resolveArtifactEditOwnership 对齐三种结论", async () => {
  const gateway = mockGateway({ original: projection() });
  assert.deepEqual(
    await resolveArtifactEditOwnership(
      libraryItem(
        projection({
          ownerPrincipalId: CURRENT_PRINCIPAL,
          visibility: "private",
        }),
      ),
    ),
    { kind: "own" },
  );
  assert.deepEqual(
    await resolveArtifactEditOwnership(libraryItem(projection())),
    { kind: "fork" },
  );
  // 非 durable 的临时结果由 ensure 以当前主体身份落库，不需要 fork。
  assert.deepEqual(
    await resolveArtifactEditOwnership({
      key: "creation:t1",
      source: "creation",
      id: "t1",
      title: "临时结果",
      kind: "image",
      siteId: "image",
      favorite: false,
      meta: {},
    }),
    { kind: "own" },
  );
  assert.ok(gateway.calls.length >= 1);
});

test("身份已由我的库喂进缓存时，编辑决策一个探测请求都不发", async () => {
  // 这条同时是 `tests/artifact-surface-rendered.test.mjs` 两个既有用例的依据：
  // 它们 prime 缓存后，调用序列与本轮改动前逐字一致。
  for (const [primed, expectFork] of [
    ["user-1", false],
    ["someone-else", true],
  ]) {
    resetCurrentPrincipalId();
    const original = projection({
      id: "primed-template",
      ownerPrincipalId: "user-1",
      visibility: "public",
      canEdit: true,
      canFork: true,
    });
    const gateway = mockGateway({
      original,
      forked: projection({
        id: "user-copy",
        ownerPrincipalId: primed,
        visibility: "private",
      }),
    });
    primeCurrentPrincipalId(primed);

    const decision = await getArtifactEditDecision(libraryItem(original));

    assert.equal(decision.ok, true, decision.error);
    assert.deepEqual(
      gateway.calls.filter(({ pathname }) => pathname === "/v1/library/mine"),
      [],
      `prime 之后不该再探测身份（primed=${primed}）`,
    );
    assert.equal(
      gateway.forkCalls().length,
      expectFork ? 1 : 0,
      `primed=${primed} 的 fork 次数不对`,
    );
  }
});

test("身份探测失败不会被缓存成空身份", async () => {
  const original = projection();
  mockGateway({
    original,
    minePayload: { detail: "unauthorized" },
    mineStatus: 401,
  });
  const failed = await getCurrentPrincipalId();
  assert.equal(failed.ok, false);

  mockGateway({ original });
  const recovered = await getCurrentPrincipalId();
  assert.equal(recovered.ok, true);
  assert.equal(recovered.data, CURRENT_PRINCIPAL);
});
