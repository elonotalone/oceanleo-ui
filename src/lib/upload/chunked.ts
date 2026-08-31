"use client";

// ============================================================================
// 大文件续传 —— 稳定幂等键、文件同一性、断点凭据
// ----------------------------------------------------------------------------
// ⚠ 先读这一段，否则会以为本文件没做完它的名字承诺的事。
//
// 【网关不支持分片，这是实测结论，不是没时间做】
//
// `POST /v1/media/upload/init` 发的是 Supabase 的**一次性签名直传 URL**
// （`oceanleo/backend/app/routers/media_proxy_router.py:986`
//  `bucket.create_signed_upload_url(path)`），语义是**单发 PUT**。整条协议里
// 没有 part number、没有 per-part ETag、没有 `Content-Range`、没有 uploadPart 端点。
// 更硬的一条在 `:980-985`：服务端**主动把半截对象删掉**——
//
//     if bucket.exists(path):
//         if int(info.get("size") or 0) == body.bytes: upload_complete = True
//         else: bucket.remove([path])          # ← 残片当垃圾清掉
//
// 所以「记录已完成分片的 index + etag，重开页面接着传」在**现协议下无法实现**：
// 没有分片这个概念，半截字节也不会被留着等你续。W08 任务书 P2 对这种情况有明确
// 授权：「不要自己发明协议，写进 signals 说明缺口，续传降级为失败后从头重试 +
// 保留用户选择」。缺口已写进 `signals/W08-request.md`。
// 「分片大小自适应（起始 5MB）」同理不落地——没有分片可调。
//
// 【但协议里已经有一条真续传能力，客户端一直在把它扔掉】
//
// `_safe_upload_path()`（同文件 `:343-366`）决定对象键：
//
//     serial = sha256(f"{user_id}:{sid}:{idempotency_key}")[:20]  if idempotency_key
//              else uuid.uuid4().hex[:12]                          # ← 每次随机
//
// 而客户端传的是 `opts.idempotencyKey || ""`（`src/lib/database.ts`），**默认空串**
// ⇒ 默认走随机分支 ⇒ 同一个文件重传必然落到一个新对象键上 ⇒ 上面那个
// `bucket.exists(path)` 永远 miss ⇒ `upload_complete` 永远是 false。
// **这就是「今天完全没有续传」的机制性原因，且它整个在客户端这一侧。**
//
// 把幂等键稳定化并落盘，白拿到三档行为：
//
//   ① PUT 传完了、finalize 之前崩（关标签页、断网、刷新）
//      → 重开时 `init` 直接回 `upload_complete: true`，**一个字节都不用重传**，
//        直接 finalize。这是最常见的一档：大文件传了十分钟，最后一个 POST 没发出去。
//   ② finalize 也成了，只是前端没收到响应
//      → `init` 回 `already_finalized` + file，直接拿结果，也不重传。
//   ③ PUT 传到一半崩
//      → 服务端删残片重签，**只能从 0 重来**。这是协议硬限（见上），
//        我们能做的是把「用户选了什么」（压缩与否、标题、站点）留住，
//        不让用户重新选一遍，并且把「这是重传，不是新上传」告诉用户。
//
// 【为什么必须校验文件同一性】
//
// 幂等键若只由「文件名 + 站点」推出来，用户把 `report.pdf` 改了内容再传同名文件，
// 会命中 ① 那条分支：服务端一看 `size` 相同就回 `upload_complete: true`，
// **新内容一个字节都没上传，库里存的还是旧文件，而界面显示上传成功**。
// 那是静默数据损坏。所以键里必须绑内容身份：`size + lastModified + 前 1MB 的哈希`
// （P2 点名的三件）。三者任一不同 ⇒ 不同的键 ⇒ 从头传。
//
// 只哈希前 1MB 而不是全文：200MB 视频全文哈希要读满 200MB 并占住主线程好几秒，
// 而这里要防的是「用户换了个同名文件」，不是防篡改。`size` 与 `lastModified` 已经
// 挡掉绝大多数，前 1MB 再挡掉「同样大小、同样时间戳、但换了内容」这种构造。
// 真正的内容校验在服务端：`finalize` 会拿对象存储实际字节数与 `body.bytes` 对账，
// 不符直接 409。
//
// 【为什么不开第三个 IndexedDB 库】
//
// 01-verified-facts.md §1.1 实测仓里已有两个库。本文件**复用**
// `src/shell/advanced-recovery-store.ts` 已导出的读写删三个函数，
// 不新开库、不新建 object store、不改那份文件（它不在 W08 独占面上）。
// 断点凭据存进 `payload`，键加 `upload-resume:` 前缀与草稿记录分开。
// 那份 store 自带 7 天 TTL，正好合用：签名 URL 只活 7200 秒
// （`init` 的 `expires_in`），服务端 3 小时清理废弃对象，
// 过期凭据留着也只是白跑一次 `init`，不会错。
// ============================================================================

import {
  deleteAdvancedRecovery,
  readAdvancedRecovery,
  writeAdvancedRecovery,
} from "../../shell/advanced-recovery-store";

/** 断点凭据键的前缀。与 `advancedRecoveryKey()` 产出的编辑器草稿键不会撞。 */
const RESUME_KEY_PREFIX = "upload-resume:";

/** 同一性哈希只读这么多字节。理由见文件头。 */
export const IDENTITY_PROBE_BYTES = 1024 * 1024;

/**
 * 走直传（而非网关 multipart）的门槛，与 `uploadFile` 里的分支**同一个常量**。
 * 8MB 已由 W08 P0 自核：`src/lib/database.ts` 的 `file.size > 8 * 1024 * 1024`，
 * 网关小文件路的上限是 20MB（`backend/app/routers/database_router.py:53`）。
 */
export const DIRECT_UPLOAD_THRESHOLD_BYTES = 8 * 1024 * 1024;

/** 一个文件的身份。两个文件这三项全同才算「同一个文件」。 */
export interface FileIdentity {
  size: number;
  lastModified: number;
  /** 前 `IDENTITY_PROBE_BYTES` 字节的 SHA-256（hex）。算不出来时是空串。 */
  headDigest: string;
}

/** 落盘的断点凭据。 */
export interface UploadResumeTicket {
  /** 稳定幂等键——服务端据此推出同一个对象键。 */
  idempotencyKey: string;
  /** `init` 回的对象键。有它就能直接 finalize。 */
  path: string;
  identity: FileIdentity;
  /** 供人读的文件名，只用于「你上次在传 X」这类文案。 */
  filename: string;
  siteId: string;
  bytes: number;
  contentType: string;
  /** 直传 PUT 是否已经确认完成。true 时重开可跳过传输直接 finalize。 */
  uploaded: boolean;
  updatedAt: number;
}

/**
 * 前 1MB 的 SHA-256。
 *
 * 用 Web Crypto（`crypto.subtle`），零依赖、浏览器与 node 22 都有。
 * 拿不到时返回空串而不是抛：`crypto.subtle` 在**非安全上下文**（http 的局域网调试）
 * 下是 undefined，那种环境里上传该照常能用，只是不享受续传。
 */
export async function fileHeadDigest(file: Blob): Promise<string> {
  const subtle =
    typeof crypto !== "undefined" && crypto && "subtle" in crypto
      ? crypto.subtle
      : undefined;
  if (!subtle) return "";
  try {
    const head = file.slice(0, Math.min(IDENTITY_PROBE_BYTES, file.size));
    const buffer = await head.arrayBuffer();
    const digest = await subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return "";
  }
}

/** 一个 File 的身份。 */
export async function fileIdentity(file: File): Promise<FileIdentity> {
  return {
    size: file.size,
    lastModified: Number.isFinite(file.lastModified) ? file.lastModified : 0,
    headDigest: await fileHeadDigest(file),
  };
}

/**
 * 两个身份是否是同一个文件。
 *
 * `headDigest` 为空（算不出哈希的环境）时**不放行**：宁可重传一遍，
 * 也不能在没验过内容的情况下认下一个断点——那正是静默覆盖旧文件的那条路。
 */
export function sameFileIdentity(a: FileIdentity, b: FileIdentity): boolean {
  if (a.size !== b.size) return false;
  if (a.lastModified !== b.lastModified) return false;
  if (!a.headDigest || !b.headDigest) return false;
  return a.headDigest === b.headDigest;
}

/** 推导幂等键要绑住的那些元数据。字段选取的理由见 `deriveUploadIdentity`。 */
export interface UploadKeyInput {
  filename: string;
  contentType: string;
  siteId: string;
  registerAsset: boolean;
}

/** 一次上传的身份 + 由它推出的稳定幂等键。 */
export interface UploadIdentity {
  identity: FileIdentity;
  idempotencyKey: string;
}

async function sha256Hex(text: string): Promise<string> {
  const subtle =
    typeof crypto !== "undefined" && crypto && "subtle" in crypto
      ? crypto.subtle
      : undefined;
  if (!subtle) return "";
  try {
    const bytes = new TextEncoder().encode(text);
    const digest = await subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return "";
  }
}

/**
 * 内容绑定的稳定幂等键。
 *
 * 【键里为什么必须绑这些字段，而不只是内容哈希】
 *
 * 服务端命中幂等重放时会把请求元数据与上次的逐项比对，**不符直接 409**
 * （`media_proxy_router.py:946-957` 与 `:1080-1091`）：
 *
 *     bytes / site_id / mime / meta.filename / meta.is_upload
 *
 * 也就是说「同一个键 + 任一项元数据不同」不是「拿回上次的结果」，
 * 而是**一次硬失败**。所以键必须至少绑住被比对的每一项：
 *   · `bytes` ← `identity.size`
 *   · `site_id` ← `siteId`
 *   · `mime` ← `contentType`
 *   · `meta.filename` ← `filename`
 *   · `meta.is_upload` ← `registerAsset`
 *
 * 少绑一项就换来一类 409。举一个会真的发生的：只绑内容哈希、不绑文件名，
 * 用户把 `报表.xlsx` 改名成 `报表-终版.xlsx` 再传——键相同、`filename` 不同
 * ⇒ 服务端 409「幂等键已用于不同的上传内容」，上传直接失败。
 * 绑上之后，改名会自然错开成一个新键，走一次正常的全新上传。
 *
 * 【形状】
 * `upload:v1:<site>:<size>-<lastModified>-<内容前缀 24 位>-<元数据 16 位>`。
 * 网关那个字段 `max_length=300`（`DirectUploadInitBody.idempotency_key`），
 * 而文件名本身就可能有 300 字符，所以元数据一律先哈希再截断，键长恒定。
 * 24 位十六进制 = 96 bit，与仓里既有的内容绑定键同宽
 * （`tests/w13-upload-idempotency-digest.test.mjs` 锁的 `[0-9a-f]{24}`）。
 */
export async function deriveUploadIdentity(
  file: File,
  input: UploadKeyInput,
): Promise<UploadIdentity> {
  const identity = await fileIdentity(file);
  const site = input.siteId || "home";
  const metaDigest = await sha256Hex(
    [input.filename, input.contentType, site, input.registerAsset ? "1" : "0"].join(
      "\u0000",
    ),
  );
  const idempotencyKey = [
    "upload:v1",
    site,
    `${identity.size}-${identity.lastModified}-${identity.headDigest.slice(0, 24)}-${metaDigest.slice(0, 16)}`,
  ].join(":");
  return { identity, idempotencyKey };
}

/**
 * 这个身份够不够资格做续传凭据。
 *
 * 哈希算不出来（非安全上下文、`crypto.subtle` 缺失）时**一律不续传**：
 * 没有内容指纹就无法保证「续到的是同一个文件」，而认错断点等于静默覆盖
 * 用户库里的旧文件。宁可从头传一遍。
 */
export function identityIsTrustworthy(identity: FileIdentity): boolean {
  return Boolean(identity.headDigest) && identity.size > 0;
}

function resumeStoreKey(idempotencyKey: string): string {
  return `${RESUME_KEY_PREFIX}${idempotencyKey}`;
}

/**
 * 存一份断点凭据。
 *
 * 失败一律吞掉：IndexedDB 在隐私模式 / 存储配额满 / 用户禁用时会拒绝，
 * **那种情况下上传必须照常进行**，只是没有续传。续传是加分项，不是前置条件。
 */
export async function writeResumeTicket(ticket: UploadResumeTicket): Promise<void> {
  try {
    await writeAdvancedRecovery({
      key: resumeStoreKey(ticket.idempotencyKey),
      editorId: "upload-resume",
      revision: ticket.identity.headDigest || String(ticket.identity.size),
      updatedAt: ticket.updatedAt,
      payload: ticket,
    });
  } catch {
    /* 没有续传能力也要能上传 */
  }
}

/**
 * 取回断点凭据，并**用当前文件的身份验一次**。
 *
 * 身份不符（用户换了个同名不同内容的文件）时：删掉旧凭据并返回 null ⇒ 从头传。
 * 这条是 P5 点名的安全性判据，反面验证把 `sameFileIdentity` 摘掉必须当场红。
 */
export async function readResumeTicket(
  idempotencyKey: string,
  identity: FileIdentity,
): Promise<UploadResumeTicket | null> {
  let record: Awaited<ReturnType<typeof readAdvancedRecovery>> = null;
  try {
    record = await readAdvancedRecovery(resumeStoreKey(idempotencyKey));
  } catch {
    return null;
  }
  if (!record) return null;
  const ticket = record.payload as UploadResumeTicket | undefined;
  if (!ticket || typeof ticket !== "object") return null;
  if (!ticket.path || !ticket.idempotencyKey) return null;
  if (!ticket.identity || !sameFileIdentity(ticket.identity, identity)) {
    await deleteResumeTicket(idempotencyKey);
    return null;
  }
  return ticket;
}

/** 传完了就把凭据删掉，别让它在库里躺 7 天。 */
export async function deleteResumeTicket(idempotencyKey: string): Promise<void> {
  try {
    await deleteAdvancedRecovery(resumeStoreKey(idempotencyKey));
  } catch {
    /* 同 writeResumeTicket */
  }
}

/**
 * 这个文件走不走直传路。
 * 给 UI 用：只有直传路才有续传可言，网关 multipart 那条路（≤8MB）不值得也没法续。
 */
export function usesDirectUpload(file: File): boolean {
  return file.size > DIRECT_UPLOAD_THRESHOLD_BYTES;
}
