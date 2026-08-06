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
import { isDurableLibraryItem, type LibraryItem } from "./library-data";

const RESOLVE_TTL_MS = 5 * 60_000;

const resolvedCache = new Map<
  string,
  { item: LibraryItem; storedAt: number }
>();

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
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    resolved: LibraryItem | null;
    message: string;
    needsSignIn: boolean;
    loading: boolean;
  }>(() => {
    const cached = artifactId ? resolvedCache.get(artifactId) : undefined;
    return {
      resolved:
        cached && Date.now() - cached.storedAt < RESOLVE_TTL_MS
          ? cached.item
          : null,
      message: "",
      needsSignIn: false,
      loading: Boolean(artifactId),
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
    const cached = resolvedCache.get(artifactId);
    if (cached && Date.now() - cached.storedAt < RESOLVE_TTL_MS) {
      setState({
        resolved: cached.item,
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
        resolvedCache.set(artifactId, {
          item: result.data,
          storedAt: Date.now(),
        });
        setState({
          resolved: result.data,
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
  }, [artifactId, attempt]);

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
  const cover = item.previewUrl || item.thumbUrl || "";
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
  const cover = item.previewUrl || item.thumbUrl || "";
  return (
    <div className="flex h-full min-h-[520px] flex-col items-center justify-center gap-5 bg-stone-50 p-6">
      {cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt={item.title}
          referrerPolicy="no-referrer"
          className="max-h-[46vh] max-w-full rounded-xl object-contain shadow-sm"
        />
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
