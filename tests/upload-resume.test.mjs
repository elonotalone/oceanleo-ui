// 整文件级续传的行为契约（W08 P2/P5）。
//
// 先说清这份测试**不**钉什么：它不钉分片续传。网关发的是 Supabase 一次性签名
// PUT，没有 part number、没有 per-part ETag、没有 Content-Range，服务端还会主动
// 删残片（`media_proxy_router.py:980-985`）。分片续传在现协议下不存在，缺口写在
// `signals/W08-request.md`。
//
// 它钉的是**真实存在、而客户端一直在扔掉的那一档**能力：
// `_safe_upload_path()` 在 `idempotency_key` 非空时把对象键推成确定值，为空时
// 发一个随机 uuid。客户端原来传的是 `opts.idempotencyKey || ""`，也就是**默认走
// 随机分支**——所以 `bucket.exists()` 永远 miss，「今天完全没有续传」的原因整个在
// 客户端这一侧，不在网关。把键稳定下来就白拿到：
//
//   ① PUT 传完、finalize 前崩 → `init` 回 `upload_complete:true` → **零字节重传**；
//   ② finalize 也成了、只是没收到响应 → `already_finalized` → 直接拿结果；
//   ③ PUT 传一半崩 → 服务端删残片，只能从 0 重来（协议硬限，这里也钉住它不假装能续）。
//
// 判据取**行为**：真的调 `uploadFile`，数它到底发没发那一发 PUT。
// 「零字节重传」这句话的唯一可信证据就是 `xhr.calls.length === 0`。

import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// ---------------------------------------------------------------- 桩表
// 桩的只有「要联网 / 要浏览器存储」两类。`upload/chunked.ts` 与 `uploadFile` 本体
// 一律编真源码——被测的就是它们。
//
// `./auth/client` 必须把整张导出表摆齐：ESM 具名导入是静态解析的，编译图里
// `workflows.ts` / `agent.ts` / `media-proxy.ts` 都从同一个说明符取别的名字，
// 少一个就是整图 SyntaxError，而且报错点落在那个无关模块上。
const STUBS = {
  "./auth/client": dataModule(`
    export function browserClient(){ return null; }
    export function oceanleoConfigured(){ return true; }
    export async function accessToken(){ return "test-token"; }
    export function cachedAccessToken(){ return "test-token"; }
    export async function isSignedIn(){ return true; }
    export async function getUserEmail(){ return "test@example.com"; }
    export async function getUserId(){ return "user-test"; }
    export async function signIn(){ return {}; }
    export function normalizeCnPhone(raw){ return String(raw); }
    export async function sendPhoneOtp(){ return {}; }
    export async function verifyPhoneOtp(){ return {}; }
    export async function wechatLoginUrl(){ return {}; }
    export async function startOauthSignIn(){ return {}; }
    export const PASSWORD_RESET_PATH = "/account?reset=1";
    export function isPasswordResetLanding(){ return false; }
    export function passwordResetRedirectTo(){ return "/account?reset=1"; }
    export async function sendPasswordReset(){ return {}; }
    export async function reauthenticate(){ return {}; }
    export async function updatePassword(){ return {}; }
    export async function listMfaFactors(){ return { factors: [] }; }
    export async function enrollTotp(){ return {}; }
    export async function challengeAndVerify(){ return {}; }
    export async function unenrollFactor(){ return {}; }
    export async function currentAal(){ return { current: null, next: null }; }
    export function needsMfaChallenge(){ return false; }
    export async function signOutEverywhere(){}
  `),
  "./auth/config": dataModule(`
    export const GATEWAY_BASE = "https://gateway.test";
    export const SUPABASE_URL = "https://supabase.test";
    export const SUPABASE_ANON_KEY = "anon-test";
    export function configured(){ return true; }
    export function cookieDomainFor(){ return undefined; }
    export function cookieOptions(){ return {}; }
    export function loginUnavailableNoticeFor(){ return null; }
    export function loginUnavailableNotice(){ return null; }
  `),
  // node 里没有 indexedDB，`openRecoveryDatabase()` 会直接 reject。换成同形状的
  // 内存实现——被测的是 `chunked.ts` 怎么用这三个函数，不是 IndexedDB 本身。
  // 行表挂到 globalThis，测试才能断言「断点记录确实落盘了」；桩模块在 bench 的
  // 编译上下文里，没有别的通路能把它读出来。
  "../../shell/advanced-recovery-store": dataModule(`
    const rows = new Map();
    globalThis.__w08ResumeRows = rows;
    export function advancedRecoveryKey(...parts){ return parts.join(":"); }
    export async function writeAdvancedRecovery(record){ rows.set(record.key, record); }
    export async function readAdvancedRecovery(key){ return rows.get(key) ?? null; }
    export async function deleteAdvancedRecovery(key){ rows.delete(key); }
  `),
};

const lazyStub = dataModule(
  "const noop = () => undefined;\n" +
    "export default new Proxy(noop, { get: () => noop });\n" +
    "export const __stub = true;\n",
);

// 同一张桩表 = 同一个编译上下文 = 同一份模块实例（`module-bench.mjs:521-528`）。
// 编两份的话 `uploadFile` 写的是另一个 Map，测试怎么找都找不到那条凭据。
const load = (path) =>
  compileModule(path, STUBS, { missingPackageStub: lazyStub }).then((url) =>
    import(url),
  );

const { uploadFile } = await load("src/lib/database.ts");
const chunked = await load("src/lib/upload/chunked.ts");
const {
  deriveUploadIdentity,
  sameFileIdentity,
  identityIsTrustworthy,
  usesDirectUpload,
  fileIdentity,
  DIRECT_UPLOAD_THRESHOLD_BYTES,
} = chunked;

// ---------------------------------------------------------------- 夹具

/** 刚好越过直传门槛。多一个字节都是白占内存——这台机器上并发着十几个 agent。 */
const OVER_THRESHOLD = DIRECT_UPLOAD_THRESHOLD_BYTES + 1024;

/**
 * 造一个走直传路的大文件。`fill` 决定前 1MB 的内容，也就决定 `headDigest`——
 * 「同名同大小同时间戳、但换了内容」这个必须重传的场景就是靠它造出来的。
 */
function bigFile({ name = "发布会.mp4", fill = 7, type = "video/mp4" } = {}) {
  const bytes = new Uint8Array(OVER_THRESHOLD);
  bytes.fill(fill);
  return new File([bytes], name, { type, lastModified: 1_700_000_000_000 });
}

const resumeRows = () => globalThis.__w08ResumeRows ?? new Map();
const resumeTickets = () =>
  [...resumeRows().entries()]
    .filter(([key]) => key.startsWith("upload-resume:"))
    .map(([, record]) => record.payload);

function clearResumeRows() {
  resumeRows().clear();
}

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

/**
 * 假网关。只认 `init` 与 `finalize` 两个端点，其余一律炸——测试里出现第三个
 * 请求一定是意料之外的事，静默放过它比红更糟。
 */
function installGateway({ init, finalize = { ok: true, file: { id: "f1" } } }) {
  const previous = globalThis.fetch;
  const seen = { init: [], finalize: [] };
  globalThis.fetch = async (url, request) => {
    const target = String(url);
    const body = request?.body ? JSON.parse(request.body) : null;
    if (target.endsWith("/v1/media/upload/init")) {
      seen.init.push(body);
      const reply = typeof init === "function" ? init(body) : init;
      return jsonResponse(reply.body ?? reply, reply.status ?? 200);
    }
    if (target.endsWith("/v1/media/upload/finalize")) {
      seen.finalize.push(body);
      const reply = typeof finalize === "function" ? finalize(body) : finalize;
      return jsonResponse(reply.body ?? reply, reply.status ?? 200);
    }
    throw new Error(`假网关收到意料之外的请求：${target}`);
  };
  return {
    seen,
    restore() {
      if (previous === undefined) delete globalThis.fetch;
      else globalThis.fetch = previous;
    },
  };
}

/**
 * 假 XHR，直传那一发 PUT 走它。
 * `calls` 是本份测试最重要的证据：**「零字节重传」= 这个数组是空的。**
 */
function installFakeXhr({ outcome = "ok", status = 200 } = {}) {
  const previous = globalThis.XMLHttpRequest;
  const calls = [];
  class FakeXhr {
    constructor() {
      this.upload = {};
      this.status = 0;
      this.responseText = "";
      this.headers = {};
      calls.push(this);
    }
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(name, value) {
      this.headers[name] = value;
    }
    abort() {
      this.onabort?.();
    }
    send(body) {
      this.body = body;
      this.upload.onprogress?.({
        loaded: OVER_THRESHOLD,
        total: OVER_THRESHOLD,
        lengthComputable: true,
      });
      if (outcome === "network-error") {
        this.onerror?.();
        return;
      }
      this.status = status;
      this.responseText = "";
      this.onload?.();
    }
  }
  globalThis.XMLHttpRequest = FakeXhr;
  return {
    calls,
    restore() {
      if (previous === undefined) delete globalThis.XMLHttpRequest;
      else globalThis.XMLHttpRequest = previous;
    },
  };
}

/** 起一次直传，收工时把三个全局都还回去。 */
async function withUpload({ init, finalize, xhr }, run) {
  clearResumeRows();
  const gateway = installGateway({ init, finalize });
  const fake = installFakeXhr(xhr);
  try {
    await run({ gateway, xhr: fake });
  } finally {
    fake.restore();
    gateway.restore();
  }
}

const signedInit = (extra = {}) => ({
  ok: true,
  path: "u/user-test/home/abc123/发布会.mp4",
  signed_url: "https://supabase.test/object/upload/signed/abc123",
  ...extra,
});

// ---------------------------------------------------------------- 幂等键本身

test("幂等键非空且确定：这一条就是「今天完全没有续传」的病根", async () => {
  const file = bigFile();
  const first = await deriveUploadIdentity(file, {
    filename: file.name,
    contentType: file.type,
    siteId: "home",
    registerAsset: true,
  });
  const second = await deriveUploadIdentity(bigFile(), {
    filename: file.name,
    contentType: file.type,
    siteId: "home",
    registerAsset: true,
  });

  assert.notEqual(first.idempotencyKey, "", "空键 ⇒ 服务端发随机对象键 ⇒ 永远没有断点");
  assert.equal(
    first.idempotencyKey,
    second.idempotencyKey,
    "同一个文件两次推导必须得到同一个键，否则 bucket.exists() 依然 miss",
  );
  assert.match(first.idempotencyKey, /^upload:v1:home:/);
  // 网关那个字段 max_length=300，而文件名本身就可能有 300 字符。
  assert.ok(first.idempotencyKey.length <= 300, "键超过网关的 max_length=300");
});

test("键绑齐服务端重放时会比对的每一项——少绑一项就是一类 409", async () => {
  const file = bigFile();
  const base = {
    filename: file.name,
    contentType: file.type,
    siteId: "home",
    registerAsset: true,
  };
  const keyOf = async (overrides) =>
    (await deriveUploadIdentity(file, { ...base, ...overrides })).idempotencyKey;

  const baseline = await keyOf({});
  // `media_proxy_router.py:946-957` / `:1080-1091` 逐项比对
  // bytes / site_id / mime / meta.filename / meta.is_upload，不符**直接 409**。
  // 所以这几项每一项都必须让键错开。
  assert.notEqual(await keyOf({ filename: "发布会-终版.mp4" }), baseline, "改名没换键 ⇒ 409");
  assert.notEqual(await keyOf({ contentType: "video/webm" }), baseline, "换 mime 没换键 ⇒ 409");
  assert.notEqual(await keyOf({ siteId: "studio" }), baseline, "换站点没换键 ⇒ 409");
  assert.notEqual(await keyOf({ registerAsset: false }), baseline, "换登记意图没换键 ⇒ 409");

  // bytes 那一项由文件本身带来。
  const bigger = new File([new Uint8Array(OVER_THRESHOLD + 4096)], file.name, {
    type: file.type,
    lastModified: file.lastModified,
  });
  const biggerKey = (await deriveUploadIdentity(bigger, base)).idempotencyKey;
  assert.notEqual(biggerKey, baseline, "换大小没换键 ⇒ 409");
});

test("同一性：换内容 / 算不出哈希，都不许认下这个断点", async () => {
  const a = await fileIdentity(bigFile({ fill: 1 }));
  const b = await fileIdentity(bigFile({ fill: 2 }));
  assert.equal(sameFileIdentity(a, a), true);
  assert.equal(sameFileIdentity(a, b), false, "内容不同却判成同一个文件");

  // 没有内容指纹就一律不放行：宁可重传一遍，也不能在没验过内容的情况下认断点。
  const blind = { ...a, headDigest: "" };
  assert.equal(sameFileIdentity(blind, blind), false, "空指纹被放行了");
  assert.equal(identityIsTrustworthy(blind), false);
  assert.equal(identityIsTrustworthy(a), true);
});

test("门槛：只有直传路才谈得上续传", () => {
  assert.equal(usesDirectUpload(bigFile()), true);
  assert.equal(
    usesDirectUpload(new File([new Uint8Array(4096)], "小.pdf", { type: "application/pdf" })),
    false,
  );
});

// ---------------------------------------------------------------- 三档行为

test("首传：断点凭据落盘，且 init 收到的是那个稳定键（不是空串）", async () => {
  await withUpload({ init: signedInit() }, async ({ gateway, xhr }) => {
    const file = bigFile();
    const result = await uploadFile(file, { siteId: "home" });

    assert.equal(result.ok, true, `首传应该成功：${result.error}`);
    assert.equal(xhr.calls.length, 1, "首传必须真的发一次 PUT");
    assert.equal(xhr.calls[0].method, "PUT");

    const sentKey = gateway.seen.init[0].idempotency_key;
    assert.notEqual(sentKey, "", "又把空串传给网关了——那正是随机对象键的开关");
    assert.match(sentKey, /^upload:v1:home:/);

    // 传完并 finalize 成功 ⇒ 凭据没用了，不该在库里躺到 7 天 TTL。
    assert.equal(resumeTickets().length, 0, "finalize 成功了却把凭据留着");
  });
});

test("中断后 IndexedDB 里有断点记录，而且标着 uploaded:true（最值钱的一次写）", async () => {
  // PUT 成功、finalize 失败：这是最常见的丢失窗口——大文件传了十分钟，
  // 最后那个 POST 没发出去。
  await withUpload(
    { init: signedInit(), finalize: { status: 503, body: { detail: "网关抖了一下" } } },
    async ({ xhr }) => {
      const result = await uploadFile(bigFile(), { siteId: "home" });
      assert.equal(result.ok, false, "finalize 失败了却报成功");
      assert.equal(xhr.calls.length, 1);

      const tickets = resumeTickets();
      assert.equal(tickets.length, 1, "中断了却没留下断点记录——下次只能从头传");
      assert.equal(tickets[0].uploaded, true, "字节已经进桶了，凭据却没记上");
      assert.ok(tickets[0].path, "凭据没记住对象键，续不回去");
      assert.equal(tickets[0].bytes, OVER_THRESHOLD);
    },
  );
});

test("重开从断点继续：init 回 upload_complete:true ⇒ 零字节重传", async () => {
  await withUpload(
    { init: signedInit({ signed_url: undefined, upload_complete: true }) },
    async ({ gateway, xhr }) => {
      const seen = [];
      const result = await uploadFile(bigFile(), {
        siteId: "home",
        onProgress: (loaded, total) => seen.push([loaded, total]),
      });

      assert.equal(result.ok, true, `续传应该成功：${result.error}`);
      // 这一行就是「零字节重传」的全部证据。
      assert.equal(xhr.calls.length, 0, "服务端说已经传完了，客户端还是又传了一遍");
      assert.equal(gateway.seen.finalize.length, 1, "该直接 finalize 却没发");

      // 进度不能停在 0% 然后突然出结果——用户会以为卡住了。
      assert.ok(seen.length >= 1, "命中续传时一次都没报进度");
      assert.deepEqual(seen.at(-1), [OVER_THRESHOLD, OVER_THRESHOLD], "没把读数推到 100%");
    },
  );
});

test("重开从断点继续：init 回 already_finalized ⇒ 连 finalize 都不用发", async () => {
  await withUpload(
    {
      init: signedInit({
        signed_url: undefined,
        already_finalized: true,
        file: { id: "f-existing", name: "发布会.mp4" },
      }),
    },
    async ({ gateway, xhr }) => {
      const result = await uploadFile(bigFile(), { siteId: "home" });

      assert.equal(result.ok, true);
      assert.equal(result.data.file.id, "f-existing", "没把上次的结果拿回来");
      assert.equal(xhr.calls.length, 0, "整条链上次都成了，客户端还是又传了一遍");
      assert.equal(gateway.seen.finalize.length, 0, "已经 finalize 过了还再发一次");
      assert.equal(resumeTickets().length, 0, "拿到结果了却把凭据留着");
    },
  );
});

test("安全性判据：同名同大小同时间戳、内容不同的文件必须从头传，不许续到旧的上面", async () => {
  // 用户把 `发布会.mp4` 重新导出了一版：名字、大小、时间戳都能一模一样。
  // 若键只由文件名推出来，服务端一看 size 相同就回 upload_complete:true，
  // **新内容一个字节都没上传，库里还是旧文件，而界面显示上传成功**——静默数据损坏。
  const first = bigFile({ fill: 1 });
  const second = bigFile({ fill: 2 });
  assert.equal(second.size, first.size, "夹具没造对：大小必须相同才验得到这条");
  assert.equal(second.name, first.name);
  assert.equal(second.lastModified, first.lastModified);

  clearResumeRows();

  // 假网关照真网关的语义演：只有**见过的那个键**才回 upload_complete:true
  // （`bucket.exists(path)` 命中）。这样同一套夹具既能证明「同一个文件续得上」，
  // 又能证明「换了内容续不上」——后者若失手，前者会立刻暴露它不是因为没接线。
  const completed = new Set();
  const gateway = installGateway({
    init: (body) =>
      completed.has(body.idempotency_key)
        ? signedInit({ signed_url: undefined, upload_complete: true })
        : signedInit(),
    // 第一次 finalize 故意失败：PUT 已经进桶、凭据留着，这正是要续的那个断点。
    finalize: () => ({ status: 503, body: { detail: "网关抖了一下" } }),
  });
  let xhr = installFakeXhr();
  let firstKey = "";
  try {
    await uploadFile(first, { siteId: "home" });
    firstKey = gateway.seen.init.at(-1).idempotency_key;
    completed.add(firstKey); // 桶里现在真有 first 的字节了
    assert.equal(xhr.calls.length, 1, "首传应该真的传一遍");
  } finally {
    xhr.restore();
  }

  // 对照组：同一个文件重来一次 —— 必须零字节。
  xhr = installFakeXhr();
  try {
    await uploadFile(first, { siteId: "home" });
    assert.equal(xhr.calls.length, 0, "同一个文件没能续上，那下面那条判据就不算数");
  } finally {
    xhr.restore();
  }

  // 判据本身：换了内容的同名文件 —— 必须从头传。
  xhr = installFakeXhr();
  try {
    await uploadFile(second, { siteId: "home" });
    const secondKey = gateway.seen.init.at(-1).idempotency_key;
    assert.notEqual(
      secondKey,
      firstKey,
      "同名不同内容却推出同一个幂等键 ⇒ 服务端会说「已传完」⇒ 新内容静默丢失",
    );
    assert.equal(xhr.calls.length, 1, "换了内容却没重传——库里存的还是旧文件");
  } finally {
    xhr.restore();
    gateway.restore();
  }
});

test("PUT 传一半崩：不假装能续，凭据留着但没标 uploaded", async () => {
  // 协议硬限：服务端 `bucket.remove([path])` 把残片删了，只能从 0 重来。
  // 这里钉的是「不撒谎」——凭据不许标成 uploaded:true，否则下次会跳过传输，
  // 而桶里其实什么都没有。
  await withUpload(
    { init: signedInit(), xhr: { outcome: "network-error" } },
    async ({ xhr }) => {
      const result = await uploadFile(bigFile(), { siteId: "home" });
      assert.equal(result.ok, false);
      assert.equal(xhr.calls.length, 1);

      const tickets = resumeTickets();
      assert.equal(tickets.length, 1, "断了却没留下断点记录");
      assert.equal(tickets[0].uploaded, false, "PUT 都没成，凭据却标成传完了");
    },
  );
});

test("disableResume:true 时既不推稳定键也不落凭据", async () => {
  await withUpload({ init: signedInit() }, async ({ gateway }) => {
    await uploadFile(bigFile(), { siteId: "home", disableResume: true });
    assert.equal(gateway.seen.init[0].idempotency_key, "", "关了续传还在推键");
    assert.equal(resumeTickets().length, 0, "关了续传还在落凭据");
  });
});

test("调用方给了自己的幂等键就用它，不覆盖", async () => {
  await withUpload({ init: signedInit() }, async ({ gateway }) => {
    await uploadFile(bigFile(), { siteId: "home", idempotencyKey: "caller-owns-this" });
    assert.equal(gateway.seen.init[0].idempotency_key, "caller-owns-this");
  });
});
