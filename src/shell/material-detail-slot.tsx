"use client";

/**
 * 官方模板素材的**详情插槽**。
 *
 * 货架上那条目录行（`/v1/template-materials`）刻意不是 durable artifact，`kind` 被
 * 无条件写成 `image`（`material-library-template-source.ts:187`），于是卡片与详情
 * 读到同一个 `kind`，点开只有一张封面图。卡片显示封面图是既定产品决定，不动；
 * **详情要显示素材本身**，所以这里在打开详情时把目录行换成服务端权威的 durable
 * 投影，再交给既有的按 `kind` 分派的查看器。
 *
 * 取数不是新造的：`getCurrentArtifactItem()` 就是编辑链
 * （`artifact-client.ts` 的 `durableEditDecisionItem`）已经在走的那条，`auth: "optional"`。
 * 官方模板 `owner.visibility === "public"`，匿名实测 200 且 `canPreview` 为真——
 * 「匿名只有预览图可读」这条旧前提今天不成立，详情因此不必对匿名降级成一张图。
 *
 * 接口约定（W2 / W3 依赖）：
 * `docs/work-logs/2026-08/explore-inplace-preview/tasks/W1-viewer-slot.md`。
 */

import { useCallback, useEffect, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import { getCurrentArtifactItem } from "./artifact-client";
import {
  ARTIFACT_PLAY_ORIGIN,
  artifactPlayHref,
  safeArtifactPlayHref,
} from "./explore-artifact-class";
import {
  isDurableLibraryItem,
  libraryItemPosterUrl,
  type LibraryItem,
} from "./library-data";

const RESOLVE_TTL_MS = 5 * 60_000;
/** 与 `renditionNeedsRefresh` 同一档的时钟余量。 */
const RENDITION_SKEW_MS = 60_000;

const resolvedCache = new Map<
  string,
  { item: LibraryItem; usableUntil: number }
>();

/**
 * 这份投影还能安全复用到什么时候。
 *
 * 原来是「取回后 5 分钟」。`[实测 2026-08-07]` 投影里每个 rendition 的 `expiresAt`
 * 也正好是取回后约 5 分钟，两者一样长意味着**缓存快到期时命中，等于把省下的那一跳
 * 换成下游一次 rendition 刷新**，还可能把已经过期的 `full` grant 交给查看器。
 * 所以上限改成跟着投影自己的最早过期时间走，并留同样的 60 秒余量。
 */
function resolvedUsableUntil(item: LibraryItem, now: number): number {
  const ceiling = now + RESOLVE_TTL_MS;
  if (!isDurableLibraryItem(item)) return ceiling;
  let earliest = Number.POSITIVE_INFINITY;
  for (const rendition of Object.values(item.artifact.renditions)) {
    const expiresAt = rendition?.expiresAt;
    if (!expiresAt) continue;
    const parsed = Date.parse(expiresAt);
    if (Number.isFinite(parsed)) earliest = Math.min(earliest, parsed);
  }
  if (!Number.isFinite(earliest)) return ceiling;
  return Math.min(ceiling, earliest - RENDITION_SKEW_MS);
}

function cachedResolvedItem(
  artifactId: string,
  now = Date.now(),
): LibraryItem | null {
  const cached = artifactId ? resolvedCache.get(artifactId) : undefined;
  if (!cached) return null;
  if (now >= cached.usableUntil) {
    resolvedCache.delete(artifactId);
    return null;
  }
  return cached.item;
}

/**
 * 把目录行手里那张现成的 OSS 封面留在 durable 投影上。
 *
 * `[R1 实测]` 货架上 154/161 件 deck 没有可当海报的缩略图，而目录行自己带的
 * `preview_key` 封面只有 13,716 B / TTFB 237 ms —— 它在换成 durable 投影时被整件
 * 丢掉，于是从点开到首帧全程白屏。这里只补一个**保证是图片**的 `posterUrl`，
 * 不碰投影自己的任何 rendition 字段：投影有真图时以投影为准。
 */
function withCatalogPoster(
  resolved: LibraryItem,
  catalogPoster: string,
): LibraryItem {
  if (!catalogPoster || libraryItemPosterUrl(resolved)) return resolved;
  return { ...resolved, posterUrl: catalogPoster };
}

function metaText(item: LibraryItem, key: string): string {
  const value = item.meta?.[key];
  return typeof value === "string" ? value.trim() : "";
}

/** 目录行携带的官方 artifact root id；不是模板行就是空串。 */
export function templateMaterialArtifactId(item: LibraryItem): string {
  if (!metaText(item, "template_material_id")) return "";
  return metaText(item, "template_material_artifact_id");
}

/**
 * 这一条是不是「需要在详情里解析成真素材」的官方模板行。
 *
 * 已经是 durable 的条目不走这条路：它自己就带着 renditions，今天的分派已经对了。
 */
export function isTemplateMaterialDetailItem(item: LibraryItem): boolean {
  return Boolean(templateMaterialArtifactId(item)) && !isDurableLibraryItem(item);
}

export type MaterialDetailTarget =
  | { status: "passthrough"; item: LibraryItem }
  | { status: "resolving"; item: LibraryItem }
  | { status: "resolved"; item: LibraryItem }
  | {
      status: "unavailable";
      item: LibraryItem;
      message: string;
      /** 未登录导致的读不到；文案与按钮口径不同。 */
      needsSignIn: boolean;
      retry: () => void;
    };

/**
 * 失败文案一律中文人话，且**只说这一层知道的事**：具体到某个按钮该不该亮、
 * 浏览器原文该怎么收，是失败面 owner 的活，这里只保证不把英文原文摆给用户、
 * 也不假装素材是一张图。
 */
function unavailableMessage(code: string | undefined, status: number): string {
  if (code === "unauthorized" || status === 401 || status === 403) {
    return "登录后可预览完整内容。";
  }
  if (code === "not-found" || status === 404) {
    return "这份素材的完整内容已经不在了，暂时无法预览。";
  }
  return "暂时打不开这份素材的完整内容，请稍后重试。";
}

/**
 * 目录行 →（可预览的）durable 投影。
 *
 * 不是模板行就 `passthrough`，一步取数都不发：36 个消费站的其余条目行为逐字不变。
 */
export function useMaterialDetailTarget(item: LibraryItem): MaterialDetailTarget {
  const artifactId = isTemplateMaterialDetailItem(item)
    ? templateMaterialArtifactId(item)
    : "";
  /**
   * 只取字符串，不把整个 `item` 放进 effect 依赖：目录行每次渲染都是新对象，
   * 依赖它会让这一跳取数在每次父组件重渲时重跑。
   */
  const catalogPoster = libraryItemPosterUrl(item);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    resolved: LibraryItem | null;
    message: string;
    needsSignIn: boolean;
    loading: boolean;
  }>(() => {
    const cached = cachedResolvedItem(artifactId);
    return {
      resolved: cached,
      message: "",
      needsSignIn: false,
      loading: Boolean(artifactId) && !cached,
    };
  });

  const retry = useCallback(() => {
    if (artifactId) resolvedCache.delete(artifactId);
    setAttempt((value) => value + 1);
  }, [artifactId]);

  useEffect(() => {
    if (!artifactId) {
      setState({ resolved: null, message: "", needsSignIn: false, loading: false });
      return;
    }
    const cached = cachedResolvedItem(artifactId);
    if (cached) {
      setState({
        resolved: cached,
        message: "",
        needsSignIn: false,
        loading: false,
      });
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setState({ resolved: null, message: "", needsSignIn: false, loading: true });
    void (async () => {
      const result = await getCurrentArtifactItem(artifactId, controller.signal);
      if (cancelled) return;
      if (result.ok && result.data && isDurableLibraryItem(result.data)) {
        const resolved = withCatalogPoster(result.data, catalogPoster);
        resolvedCache.set(artifactId, {
          item: resolved,
          usableUntil: resolvedUsableUntil(resolved, Date.now()),
        });
        setState({
          resolved,
          message: "",
          needsSignIn: false,
          loading: false,
        });
        return;
      }
      const status = result.status || 0;
      const needsSignIn =
        result.code === "unauthorized" || status === 401 || status === 403;
      setState({
        resolved: null,
        // 服务端 200 但投影不 durable：拿不到 revision 身份就没有可信的字节来源，
        // 与读不到一样处理，不许退回「就当它是封面图」。
        message: result.ok
          ? "这份素材暂时没有可预览的完整内容。"
          : unavailableMessage(result.code, status),
        needsSignIn,
        loading: false,
      });
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [artifactId, attempt, catalogPoster]);

  if (!artifactId) return { status: "passthrough", item };
  if (state.resolved) return { status: "resolved", item: state.resolved };
  if (state.loading) return { status: "resolving", item };
  return {
    status: "unavailable",
    item,
    message: state.message,
    needsSignIn: state.needsSignIn,
    retry,
  };
}

/**
 * 打不开完整内容时的详情面。
 *
 * 封面图仍然显示，但**明说它只是封面**——这与「继续假装素材就是一张图」是两回事：
 * 用户看得懂自己看到的是什么，也知道下一步能做什么。
 */
export function MaterialDetailUnavailable({
  item,
  message,
  needsSignIn,
  onRetry,
}: {
  item: LibraryItem;
  message: string;
  needsSignIn: boolean;
  onRetry: () => void;
}) {
  const tt = useUI();
  // `previewUrl` / `thumbUrl` 都可能就是 pptx / docx 本体（货架上是常态），
  // 直接喂 `<img>` 只会得到一个碎图标。只认保证是图片的那一个。
  const cover = libraryItemPosterUrl(item);
  return (
    <div role="status" className="flex h-full min-h-[420px] flex-col items-center justify-center gap-4 p-6">
      {cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt={item.title}
          referrerPolicy="no-referrer"
          className="max-h-40 max-w-full rounded-lg object-contain opacity-60 shadow-sm"
        />
      )}
      <p className="text-[12px] text-stone-400">{tt("以上只是这份素材的封面图")}</p>
      <p className="max-w-md text-center text-[14px] font-medium leading-relaxed text-stone-700">
        {tt(message)}
      </p>
      {!needsSignIn && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-stone-800 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-stone-700"
        >
          {tt("重新加载")}
        </button>
      )}
    </div>
  );
}

/**
 * 「就地内嵌开玩」的地址。
 *
 * 只认 `ARTIFACT_PLAY_ORIGIN` 上的**绝对** https 地址：根相对路径在其余 35 个站上
 * 指向的是本站自己，内嵌进去只会 404。没有声明就不内嵌，走下面的落点面板。
 * 内嵌用的沙箱是既有最严的那一档（`webViewerFrameSandbox(false)`，不含同源授权），
 * 本模块不新增也不放松任何 sandbox 授权。
 */
export function gamePlayEmbedHref(item: LibraryItem): string {
  // 境内 v1 没有 game 子站，`ARTIFACT_PLAY_ORIGIN` 是空串。这一句不是多余的：
  // 少了它，下面的 `startsWith(`${""}/`)` 会退化成「任何根相对路径都算数」，
  // 把本站的 /play/... 当成可内嵌的绝对落点。
  if (!ARTIFACT_PLAY_ORIGIN) return "";
  for (const key of ["play_embed_href", "playEmbedHref"]) {
    const declared = safeArtifactPlayHref(item.meta?.[key]);
    if (declared && declared.startsWith(`${ARTIFACT_PLAY_ORIGIN}/`)) {
      return declared;
    }
  }
  return "";
}

/**
 * 游戏详情的默认落点面板：把用户交给既有的「开玩」通路
 * （`explore-artifact-class.ts` 的 `artifactPlayHref`），而不是在这里造第二套播放器。
 *
 * 算不出落点就如实说明，不假装能玩。
 */
export function GamePlayDetail({ item }: { item: LibraryItem }) {
  const tt = useUI();
  const href = artifactPlayHref(item);
  const cover = libraryItemPosterUrl(item);
  return (
    <div className="flex h-full min-h-[520px] flex-col items-center justify-center gap-5 bg-stone-50 p-6">
      {cover && (
        // 这张是封面，不是游戏本身——真东西在隔离域的播放页上。标成 exempt，
        // 动作条那颗「全屏」就不会为了放大一张封面而亮起来。
        <div data-fullscreen-exempt>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover}
            alt={item.title}
            referrerPolicy="no-referrer"
            className="max-h-[46vh] max-w-full rounded-xl object-contain shadow-sm"
          />
        </div>
      )}
      <div className="flex flex-col items-center gap-2">
        <p className="text-[15px] font-semibold text-stone-800">{item.title}</p>
        <p className="max-w-md text-center text-[13px] leading-relaxed text-stone-500">
          {href
            ? tt("这是一款可以直接玩的游戏，不用下载，也不用进编辑器。")
            : tt("这款游戏暂时算不出可玩地址，所以现在还打不开。")}
        </p>
      </div>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg bg-stone-800 px-5 py-2.5 text-[14px] font-medium text-white hover:bg-stone-700"
        >
          {tt("开始游玩")}
        </a>
      )}
    </div>
  );
}

/** 仅为测试可见：清掉解析缓存。 */
export function resetMaterialDetailCache(): void {
  resolvedCache.clear();
}
