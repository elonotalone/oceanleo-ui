"use client";

// ============================================================================
// @oceanleo/ui — 「我的数据库」统一客户端（单一事实源）
// ----------------------------------------------------------------------------
// 全 OceanLeo 系列共享同一个「我的数据库」：跨站可见，含三类——
//   works     用户在各站产出的全部 AI 作品（image/video/model3d/avatar/audio/
//             logo/ppt/doc …）。底层 user_creations，与 /v1/creations 同表。
//   assets    用户上传 / 收藏进来的输入素材（user_assets）。
//   knowledge 用户写下 / 上传、供各站 AI 生成参考的知识条目（user_knowledge）。
//
// 后端：作品走 /v1/creations，其余分类走 /v1/database/*。
// 旧的「我的图片（image 站私有作品库）」概念被本统一数据库替代。
// ============================================================================

import { accessToken } from "./auth/client";
import { GATEWAY_BASE } from "./auth/config";
// W08：上传进度 / 续传 / 同一性校验的原语。只有 `uploadFile` 用它们。
import {
  createProgressTracker,
  publishUploadProgress,
  xhrUpload,
  xhrUploadAvailable,
  type UploadProgressSnapshot,
} from "./upload/progress";
import {
  deleteResumeTicket,
  deriveUploadIdentity,
  identityIsTrustworthy,
  readResumeTicket,
  writeResumeTicket,
  type UploadResumeTicket,
} from "./upload/chunked";

export type MediaType =
  | "image"
  | "video"
  | "model3d"
  | "avatar"
  | "audio"
  | "logo"
  | "ppt"
  | "sheet"
  | "doc"
  | "website"
  | "canvas"
  | "video_canvas"
  | "xhs"
  | "other";

export interface Creation {
  id: string;
  url: string;
  thumb_url?: string;
  title?: string;
  kind?: string;
  media_type?: MediaType;
  prompt?: string;
  model?: string;
  ratio?: string;
  site_id?: string;
  meta?: Record<string, unknown>;
  favorite?: boolean;
  created_at?: string;
  /** New generation paths return these; url remains a rendition only. */
  artifact_id?: string;
  revision_id?: string;
  artifact?: unknown;
}

/** @deprecated Use Creation. The backend resource is user_creations. */
export type WorkItem = Creation;

export interface AssetItem {
  id: string;
  url: string;
  thumb_url?: string;
  title?: string;
  media_type?: MediaType;
  mime?: string;
  bytes?: number;
  site_id?: string;
  meta?: Record<string, unknown>;
  created_at?: string;
  artifact_id?: string;
  revision_id?: string;
  artifact?: unknown;
}

export interface KnowledgeItem {
  id: string;
  title?: string;
  content?: string;
  url?: string;
  kind?: string;
  site_id?: string;
  meta?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface DatabaseOverview {
  works: Creation[];
  assets: AssetItem[];
  knowledge: KnowledgeItem[];
  files?: FileItem[];
  artifacts?: Array<{
    id: string;
    title?: string;
    kind?: string;
    content?: unknown;
    url?: string;
    favorite?: boolean;
    created_at?: string;
    task_id?: string;
    session_id?: string;
    artifact_id?: string;
    revision_id?: string;
    artifact_type?: string;
    artifact?: unknown;
  }>;
  counts: {
    works: number;
    assets: number;
    knowledge: number;
    files?: number;
    artifacts?: number;
  };
}

export type DatabaseItemSource = "work" | "asset" | "artifact" | "platform";

export interface ResolvedDatabaseItem {
  source: DatabaseItemSource;
  item: Record<string, unknown>;
}

type Result<T> = { ok: boolean; data?: T; error?: string; status?: number };

async function authed<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  const token = await accessToken();
  if (!token) return { ok: false, error: "未登录", status: 401 };
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "网络错误：无法连接到 AI 网关。", status: 0 };
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    return {
      ok: false,
      error: (data as { detail?: string } | null)?.detail || `HTTP ${res.status}`,
      status: res.status,
    };
  }
  return { ok: true, data: data as T };
}

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// ---------- overview ----------
export function getDatabaseOverview(opts: { mediaType?: MediaType; limit?: number } = {}) {
  return authed<DatabaseOverview>(
    `/v1/database/overview${qs({ media_type: opts.mediaType, limit: opts.limit })}`,
  );
}

// ---------- 容量（我的库用了多少、上限多少、买不买加量包） ----------
//
// 后端两个读数（快读=数库索引、精读=数对象存储）与它们的取舍写在
// `oceanleo/backend/app/storage_quota.py` 顶部；界面只管把 `source` 如实标出来，
// 绝不把快读当账单。`precise=1` 是用户点「重新核对」时才发的，它会慢十几秒。
export interface StorageUsage {
  used_bytes: number;
  limit_bytes: number;
  remaining_bytes: number;
  file_count: number;
  used_text: string;
  limit_text: string;
  remaining_text: string;
  source: string;
  unavailable?: boolean;
  truncated?: boolean;
  cached?: boolean;
  /** 已买的加量包数（老后端没有这些字段时按 0 / 缺失处理）。 */
  packs?: number;
  /** 单包月价（账本货币主单位）+ 货币码；`pack_price_cny` 是旧网关（仅 CNY 账本）的别名。 */
  pack_price?: number;
  currency?: string;
  pack_price_cny?: number;
  pack_bytes?: number;
  max_packs?: number;
  pack_state?: string;
  pack_in_grace?: boolean;
  /**
   * 「满了之后还能怎么办」的那句话，**由后端出**：价格、包多大、买到上限了、
   * 因欠费停了——四种情形的措辞都在 `storage_quota._upgrade_hint()` 一处。
   * 界面照抄，不在这里拼第二份文案（拼了就会和后端说的不一致）。
   */
  upgrade_hint?: string;
  by_site?: Record<string, number>;
  largest?: { name: string; size_text: string }[];
}

export function getStorageUsage(opts: { precise?: boolean } = {}) {
  return authed<StorageUsage>(
    `/v1/database/storage${qs({ precise: opts.precise ? 1 : undefined })}`,
  );
}

/** 买/退加量包。`packs` 为正是加、为负是减；钱从钱包扣，不走新的支付通道。 */
export function changeStoragePacks(packs: number) {
  return authed<{
    ok: boolean;
    packs: number;
    limit_bytes: number;
    currency?: string;
    charged_minor?: number;
    balance_minor?: number;
    /** 旧网关字段名（同一个数，最小单位）。 */
    charged_fen?: number;
    balance_fen?: number;
    message?: string;
  }>(`/v1/storage/packs`, {
    method: "POST",
    body: JSON.stringify({ packs }),
  });
}

/** Resolve a stable advanced-feature deep link without depending on workspace state. */
export function resolveDatabaseItem(source: DatabaseItemSource, id: string) {
  return authed<ResolvedDatabaseItem>(
    `/v1/database/item${qs({ source, id })}`,
  );
}

/** Generate and persist a real first-page/frame thumbnail when a row has none. */
export function ensureDatabaseThumbnail(
  source: Exclude<DatabaseItemSource, "platform">,
  id: string,
) {
  return authed<{ thumb_url: string; generated: boolean }>(
    `/v1/database/thumbnail`,
    {
      method: "POST",
      body: JSON.stringify({ source, id }),
    },
  );
}

/** 删除单个 Agent 交付物，但保留它所属的对话/任务。 */
export function deleteArtifact(id: string) {
  return authed<{ ok: boolean }>(
    `/v1/database/artifacts/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

// ---------- creations (= legacy overview "works", user_creations) ----------
export interface ListCreationsOptions {
  siteId?: string;
  mediaType?: MediaType;
  limit?: number;
}

export interface CreationSaveItem {
  url: string;
  media_type?: MediaType;
  thumb_url?: string;
  title?: string;
  kind?: string;
  prompt?: string;
  model?: string;
  ratio?: string;
  meta?: Record<string, unknown>;
}

export interface CreationArtifactError {
  result_id: string;
  detail: string;
}

export interface SaveCreationsResponse {
  ok: true;
  saved: number;
  items: Creation[];
  /** Canonical v1 contract; callers must not treat item URLs as identity. */
  artifacts?: unknown[];
  artifact_errors: CreationArtifactError[];
  request_id?: string;
  durable: boolean;
}

export function listCreations(
  opts: ListCreationsOptions = {},
) {
  return authed<{ items: Creation[] }>(
    `/v1/creations${qs({ site_id: opts.siteId, media_type: opts.mediaType, limit: opts.limit })}`,
  );
}

export function deleteCreation(id: string) {
  return authed<{ ok: boolean; id: string }>(`/v1/creations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/**
 * 归档一批刚生成的作品到「我的数据库」。各站生成成功后调用即可（best-effort，
 * 失败不应阻塞出图/出视频）。media_type 决定它在数据库里被归为哪类。
 */
export function saveCreations(
  siteId: string,
  items: CreationSaveItem[],
) {
  return authed<SaveCreationsResponse>(`/v1/creations`, {
    method: "POST",
    body: JSON.stringify({ site_id: siteId, items }),
  });
}

/** @deprecated Use listCreations. Kept as a direct alias for pinned consumers. */
export const listWorks = listCreations;
/** @deprecated Use deleteCreation. Kept as a direct alias for pinned consumers. */
export const deleteWork = deleteCreation;
/** @deprecated Use saveCreations. Kept as a direct alias for pinned consumers. */
export const saveWorks = saveCreations;

// ---------- assets (user uploads) ----------
export function listAssets(
  opts: { siteId?: string; mediaType?: MediaType; limit?: number } = {},
) {
  return authed<{ items: AssetItem[] }>(
    `/v1/database/assets${qs({ site_id: opts.siteId, media_type: opts.mediaType, limit: opts.limit })}`,
  );
}

export function saveAssets(
  items: Array<{
    url: string;
    media_type?: MediaType;
    thumb_url?: string;
    title?: string;
    mime?: string;
    bytes?: number;
    site_id?: string;
  }>,
) {
  return authed<{ ok: boolean; saved: number }>(`/v1/database/assets`, {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export function deleteAsset(id: string) {
  return authed<{ ok: boolean }>(`/v1/database/assets/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ---------- files (用户上传的文件，文件库) ----------
export interface FileItem {
  id: string;
  url: string;
  thumb_url?: string;
  title?: string;
  media_type?: MediaType;
  mime?: string;
  bytes?: number;
  site_id?: string;
  meta?: Record<string, unknown>;
  created_at?: string;
  artifact_id?: string;
  revision_id?: string;
  artifact?: unknown;
}

/** 文件库列表。scope="site"（默认当前站）| "all"（跨站全系列）。 */
export function listFiles(
  opts: { siteId?: string; scope?: "site" | "all"; limit?: number } = {},
) {
  return authed<{ items: FileItem[]; scope: string }>(
    `/v1/database/files${qs({ site_id: opts.siteId, scope: opts.scope, limit: opts.limit })}`,
  );
}

/**
 * `uploadFile` 的进度出口。把三件事收在一处：钉单调、回调调用方、发布到总线。
 *
 * 为什么要有总线（不只是回调）：三个消费点里有两个按契约不负责上传
 * （`InputCard` / `LeoComposer` 的文件头写着「本组件不负责上传」），
 * 业务层拿走 File 自己传，组件手里只有 File 对象。总线按 File 身份发布，
 * 组件订阅自己刚交出去的那几个 File 就能看见进度，
 * **不需要 31 个站改一行调用，也不需要给它们加「请把进度回传给我」的 prop。**
 */
function createUploadProgressReporter(
  file: File,
  opts: { onProgress?: (loaded: number, total: number) => void },
) {
  const tracker = createProgressTracker(file.size);
  const emit = (snapshot: UploadProgressSnapshot) => {
    publishUploadProgress(file, snapshot);
    opts.onProgress?.(snapshot.loaded, snapshot.total);
  };
  return {
    report(loaded: number) {
      // 结束之后不再报数。P5 点名「失败时不再回调」，`finish`/`fail` 之后
      // XHR 仍可能吐出一个迟到的 progress 事件，那一个必须被吃掉。
      if (tracker.settled) return;
      emit(tracker.report(loaded));
    },
    /** 传输段已完成（还没 finalize）。 */
    finish() {
      if (tracker.settled) return;
      emit(tracker.finish());
    },
    fail() {
      if (tracker.settled) return;
      emit(tracker.fail());
    },
    /**
     * 这一段不用传（命中续传 / 服务端说已完成）：直接把读数推到 100%。
     * 不这样做的话，UI 会停在 0% 然后突然出现结果，用户以为卡住了。
     */
    skipToComplete() {
      if (tracker.settled) return;
      emit(tracker.finish());
    },
  };
}

type UploadProgressReporter = ReturnType<typeof createUploadProgressReporter>;

export interface UploadFileOptions {
  siteId?: string;
  title?: string;
  registerAsset?: boolean;
  /**
   * 显式幂等键。**不传时 `uploadFile` 自己推一个内容绑定的稳定键**
   * （`upload/chunked.ts` 的 `deriveUploadIdentity`），那是续传成立的前提——
   * 传空串时服务端会给每次上传发一个随机对象键，`bucket.exists()` 永远 miss。
   * 传了就用你的，不覆盖调用方的判断。
   */
  idempotencyKey?: string;
  /**
   * 上传进度。`total` 为 0 表示这一段的长度不可知。
   * 两条路径（网关 multipart / 直传 PUT）都会回调，形状相同。
   */
  onProgress?: (loaded: number, total: number) => void;
  /** 取消上传。取消后返回 `ok:false` + `status:0`，不抛。 */
  signal?: AbortSignal;
  /**
   * 关掉续传（默认开）。
   * 只影响直传路：不再读写断点凭据，也不再推稳定幂等键。
   */
  disableResume?: boolean;
}

/**
 * 上传到文件库：小文件 multipart，大文件 signed direct upload。跨站可见。
 *
 * W08 在这里加了三件，**两条路径的既有分支结构一个字没动**：
 *   1. 进度：两条路都改走 `xhrUpload`（选型理由见 `upload/progress.ts` 文件头，
 *      一句话是 fetch 的上传进度要 request streaming，Safari/Firefox 上会直接抛）。
 *      同时按 File 对象身份发布到进度总线，好让不负责上传的组件也看得见。
 *   2. 续传（整文件级，非分片）：直传路默认推一个内容绑定的稳定幂等键并把断点
 *      凭据落进既有 IndexedDB。**网关不支持分片**，这是实测结论，
 *      详见 `upload/chunked.ts` 文件头与 `signals/W08-request.md`。
 *   3. 取消：`signal` 透到 XHR。
 */
export async function uploadFile(
  file: File,
  opts: UploadFileOptions = {},
): Promise<Result<{ ok: boolean; file: FileItem }>> {
  const progress = createUploadProgressReporter(file, opts);
  // FastAPI's small multipart path intentionally caps at 20 MB and buffers
  // bytes in the gateway. Large editor media goes browser → signed Supabase
  // URL directly, then the gateway verifies size/ownership and registers it.
  if (file.size > 8 * 1024 * 1024) {
    const extension = (file.name.split(".").pop() || "").toLowerCase();
    const inferredType: Record<string, string> = {
      mp4: "video/mp4",
      webm: "video/webm",
      mov: "video/quicktime",
      mkv: "video/x-matroska",
      m4v: "video/x-m4v",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      m4a: "audio/mp4",
      flac: "audio/flac",
      ogg: "audio/ogg",
      opus: "audio/opus",
      glb: "model/gltf-binary",
      gltf: "model/gltf+json",
      pdf: "application/pdf",
      docx:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xlsx:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      pptx:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    };
    const contentType =
      file.type || inferredType[extension] || "application/octet-stream";
    const filename = file.name || "file";
    const siteId = opts.siteId || "home";
    const registerAsset = opts.registerAsset !== false;

    // ── 续传凭据 ────────────────────────────────────────────────────────────
    // 调用方给了自己的幂等键就用它（`doc-io.ts` 那一族已经在传内容绑定的键）。
    // 没给才自己推：**这一步是续传成立的唯一前提**，因为服务端在
    // `idempotency_key` 为空时给的是随机对象键（`media_proxy_router.py:359-365`），
    // 随机键意味着 `bucket.exists()` 永远 miss，也就永远没有断点可续。
    const resumeEnabled = opts.disableResume !== true;
    let idempotencyKey = opts.idempotencyKey || "";
    let resumeKey = "";
    // 身份只算一次：`headDigest` 要读满 1MB 并做一次 SHA-256，
    // 在 200MB 文件上重复算三遍是白花的钱。
    let identity: Awaited<ReturnType<typeof deriveUploadIdentity>>["identity"] | null =
      null;
    if (resumeEnabled) {
      const derived = await deriveUploadIdentity(file, {
        filename,
        contentType,
        siteId,
        registerAsset,
      });
      // 算不出内容指纹的环境（非安全上下文下 `crypto.subtle` 缺席）不参与续传：
      // 没验过内容就认断点，等于可能把用户库里的旧文件当成这一次的结果。
      if (identityIsTrustworthy(derived.identity)) {
        if (!idempotencyKey) idempotencyKey = derived.idempotencyKey;
        resumeKey = derived.idempotencyKey;
        identity = derived.identity;
        // 读凭据时会**再用当前文件的身份验一次**；换了个同名不同内容的文件
        // 会在这里被判为不同一，旧凭据当场删掉、从头传（P5 的安全性判据）。
        const existing = await readResumeTicket(resumeKey, derived.identity);
        if (!existing) {
          await writeResumeTicket({
            idempotencyKey: derived.idempotencyKey,
            path: "",
            identity: derived.identity,
            filename,
            siteId,
            bytes: file.size,
            contentType,
            uploaded: false,
            updatedAt: Date.now(),
          });
        }
      }
    }

    const common = {
      filename,
      content_type: contentType,
      bytes: file.size,
      site_id: siteId,
      title: opts.title || filename,
      register_asset: registerAsset,
      idempotency_key: idempotencyKey,
    };
    const initialized = await authed<{
      ok: boolean;
      path: string;
      signed_url?: string;
      already_finalized?: boolean;
      upload_complete?: boolean;
      file?: FileItem;
    }>("/v1/media/upload/init", {
      method: "POST",
      body: JSON.stringify(common),
    });
    if (
      initialized.ok &&
      initialized.data?.already_finalized &&
      initialized.data.file
    ) {
      // 上一次整条链都成了，只是前端没收到响应。一个字节都不用重传。
      progress.skipToComplete();
      if (resumeKey) await deleteResumeTicket(resumeKey);
      return {
        ok: true,
        data: { ok: true, file: initialized.data.file },
      };
    }
    if (
      !initialized.ok ||
      (!initialized.data?.signed_url && !initialized.data?.upload_complete) ||
      !initialized.data.path
    ) {
      progress.fail();
      return {
        ok: false,
        error: initialized.error || "创建大文件上传通道失败",
        status: initialized.status,
      };
    }
    if (initialized.data.upload_complete) {
      // 断点续传命中的**主要**一档：上次 PUT 传完了、finalize 之前崩掉。
      // 服务端核对过对象大小与声明一致（`media_proxy_router.py:980-983`），
      // 所以这里直接跳到 finalize。
      progress.skipToComplete();
    } else {
      const signedUrl = initialized.data.signed_url!;
      const ticketFor = (uploaded: boolean): UploadResumeTicket => ({
        idempotencyKey,
        path: initialized.data!.path,
        identity: identity!,
        filename,
        siteId,
        bytes: file.size,
        contentType,
        uploaded,
        updatedAt: Date.now(),
      });
      // 传输开始前先把断点记下来（带上 `path`）。中断后 IndexedDB 里有记录，
      // 这是 P5 那条「中断后 IndexedDB 里有断点记录」的判据。
      if (resumeKey) await writeResumeTicket(ticketFor(false));
      // 直传这一段是大文件的全部耗时所在，也是唯一值得报进度的一段。
      // 走 XHR 而不是 fetch：理由见 `upload/progress.ts` 文件头。
      if (xhrUploadAvailable()) {
        const uploaded = await xhrUpload({
          url: signedUrl,
          method: "PUT",
          headers: { "Content-Type": common.content_type },
          body: file,
          onProgress: (loaded) => progress.report(loaded),
          signal: opts.signal,
        });
        if (uploaded.aborted) {
          progress.fail();
          return { ok: false, error: "上传已取消", status: 0 };
        }
        if (uploaded.networkError) {
          progress.fail();
          return {
            ok: false,
            error: "大文件直传失败：无法连接对象存储",
            status: 0,
          };
        }
        if (!uploaded.ok) {
          progress.fail();
          return {
            ok: false,
            error: `大文件直传失败 HTTP ${uploaded.status}`,
            status: uploaded.status,
          };
        }
      } else {
        // SSR / 没有 XHR 的运行时：保留原来的 fetch 路径，只是没有进度。
        let uploaded: Response;
        try {
          uploaded = await fetch(signedUrl, {
            method: "PUT",
            headers: { "Content-Type": common.content_type },
            body: file,
            signal: opts.signal,
          });
        } catch {
          progress.fail();
          return {
            ok: false,
            error: "大文件直传失败：无法连接对象存储",
            status: 0,
          };
        }
        if (!uploaded.ok) {
          progress.fail();
          return {
            ok: false,
            error: `大文件直传失败 HTTP ${uploaded.status}`,
            status: uploaded.status,
          };
        }
      }
      progress.finish();
      // 字节已经进桶了。**这一条落盘是整个续传里最值钱的一次写**：
      // 此刻到 finalize 返回之间崩掉（关标签页、断网、刷新）是最常见的丢失窗口，
      // 而重开之后 `init` 会凭同一个幂等键回 `upload_complete: true`。
      // `ticketFor(true)` 复用上面算过的 `identity`：重新推导会再读 1MB 并再做一次
      // SHA-256，在 200MB 文件上是白花的钱，而身份在这一次上传里不会变。
      if (resumeKey) await writeResumeTicket(ticketFor(true));
    }
    const finalized = await authed<{ ok: boolean; file: FileItem }>(
      "/v1/media/upload/finalize",
      {
        method: "POST",
        body: JSON.stringify({ ...common, path: initialized.data.path }),
      },
    );
    // 登记成了，凭据没用了。留着只会在库里躺到 7 天 TTL 到期。
    // 失败则**刻意留着**：那正是下一次要续的那个断点。
    if (finalized.ok && resumeKey) await deleteResumeTicket(resumeKey);
    return finalized;
  }

  // ── ≤8MB：网关 multipart ──────────────────────────────────────────────────
  // 这条路**没有续传**：网关收的是一次 multipart POST，中断了就没有断点可言
  // （对比直传路的整文件级续传，见上）。但它照样要报进度——小文件也不都是小的，
  // 8MB 在慢网上要走十几秒，今天那十几秒里界面上什么都没有。
  const token = await accessToken();
  if (!token) {
    progress.fail();
    return { ok: false, error: "未登录", status: 401 };
  }
  const fd = new FormData();
  fd.append("file", file);
  if (opts.siteId) fd.append("site_id", opts.siteId);
  if (opts.title) fd.append("title", opts.title);
  if (opts.registerAsset === false) fd.append("register_asset", "false");
  if (opts.idempotencyKey) fd.append("idempotency_key", opts.idempotencyKey);

  const uploadUrl = `${GATEWAY_BASE}/v1/database/upload`;
  // 错误口径与改造前逐字一致：网关的 `detail` 优先，没有就 `HTTP <status>`。
  const gatewayFailure = (
    data: unknown,
    status: number,
  ): Result<{ ok: boolean; file: FileItem }> => ({
    ok: false,
    error: (data as { detail?: string } | null)?.detail || `HTTP ${status}`,
    status,
  });

  if (xhrUploadAvailable()) {
    const sent = await xhrUpload({
      url: uploadUrl,
      method: "POST",
      // 只有 Authorization。**不许手写 `Content-Type`**：multipart 的 boundary
      // 由浏览器在 send(FormData) 时生成，手写一个 header 会覆盖掉它，
      // 网关拿不到 boundary，整个请求体解不出来（表现是 422，很难查）。
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
      onProgress: (loaded) => progress.report(loaded),
      signal: opts.signal,
    });
    if (sent.aborted) {
      progress.fail();
      return { ok: false, error: "上传已取消", status: 0 };
    }
    if (sent.networkError) {
      progress.fail();
      return { ok: false, error: "网络错误：无法连接到 AI 网关。", status: 0 };
    }
    let data: unknown = null;
    try {
      data = JSON.parse(sent.responseText);
    } catch {
      /* non-JSON */
    }
    if (!sent.ok) {
      progress.fail();
      return gatewayFailure(data, sent.status);
    }
    progress.finish();
    return { ok: true, data: data as { ok: boolean; file: FileItem } };
  }

  // 没有 XHR 的运行时（SSR / node）：原来的 fetch 路径原样保留，只是没有进度。
  let res: Response;
  try {
    res = await fetch(uploadUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
      cache: "no-store",
      signal: opts.signal,
    });
  } catch {
    progress.fail();
    return { ok: false, error: "网络错误：无法连接到 AI 网关。", status: 0 };
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    progress.fail();
    return gatewayFailure(data, res.status);
  }
  progress.finish();
  return { ok: true, data: data as { ok: boolean; file: FileItem } };
}

/** 删除一个上传的文件（底层即 user_assets 删除）。 */
export function deleteFile(id: string) {
  return deleteAsset(id);
}

// ---------- knowledge ----------
export function listKnowledge(opts: { siteId?: string; limit?: number } = {}) {
  return authed<{ items: KnowledgeItem[] }>(
    `/v1/database/knowledge${qs({ site_id: opts.siteId, limit: opts.limit })}`,
  );
}

export function addKnowledge(item: {
  title?: string;
  content?: string;
  url?: string;
  kind?: string;
  site_id?: string;
}) {
  return authed<{ ok: boolean; item: KnowledgeItem }>(`/v1/database/knowledge`, {
    method: "POST",
    body: JSON.stringify(item),
  });
}

export function deleteKnowledge(id: string) {
  return authed<{ ok: boolean }>(
    `/v1/database/knowledge/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

// ---------- 插件与连接器（MCP 市场目录，公开只读） ----------
export interface McpItem {
  code?: string;
  name?: string;
  vendor?: string;
  score?: number;
  price?: number | string;
  unit?: string;
  currency?: string;
  free?: boolean;
  detail_url?: string;
  description?: string;
}

export async function getMcpCatalog(): Promise<Result<{ items: McpItem[] }>> {
  try {
    const res = await fetch(`${GATEWAY_BASE}/v1/mcp/catalog`);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, status: res.status };
    const data = await res.json();
    return { ok: true, data: data as { items: McpItem[] } };
  } catch {
    return { ok: false, error: "网络错误：无法连接到 AI 网关。", status: 0 };
  }
}

export const MEDIA_TYPE_LABEL: Record<MediaType, string> = {
  image: "图片",
  video: "视频",
  model3d: "3D 模型",
  avatar: "数字人",
  audio: "音频",
  logo: "Logo",
  ppt: "演示文稿",
  sheet: "表格",
  doc: "文档",
  website: "网站",
  canvas: "画布",
  video_canvas: "视频工作流",
  xhs: "小红书",
  other: "其他",
};
