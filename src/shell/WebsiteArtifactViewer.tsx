"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import { isDurableLibraryItem, type LibraryItem } from "./library-data";
import { useArtifactRendition } from "./ArtifactRendition";
import { fetchMediaBlob } from "../lib/media-proxy";
import type { ArtifactRenditionPurpose } from "./artifact-contract";
import { webViewerFrameSandbox } from "./editor-sandbox-origin";
import {
  TEMPLATE_MATERIAL_PREVIEW_META_KEY,
  templateMaterialIdForArtifact,
  templateMaterialPreviewManifestUrl,
  templateMaterialPreviewUrl,
} from "./material-library-template-source";
import {
  isDisplayableText,
  isMediaOversizeError,
  MAX_PROBE_BYTES,
  websiteFrameAdmission,
  websiteInlineOutline,
  websiteViewerPlan,
  type WebsiteBodyProbe,
  type WebsiteInlineOutline,
} from "./website-inline-preview";

/**
 * 网站素材的就地预览承载。
 *
 * 为什么不能沿用查看器默认的 rendition 顺序：`viewerRenditionOrder("website")`
 * 是 `["preview","full"]`，而网站的 `preview` 是一张 webp 封面
 * （`artifact-contract.ts:2357-2376`）。那个顺序是**卡片**要的——卡片必须是位图，
 * 这条产品决定不动。详情要的是页面本身，所以这里显式先要 `full`。
 *
 * 隔离面一个字没松：frame 仍用 `webViewerFrameSandbox(false)`
 * （UNTRUSTED_FRAME_SANDBOX，不含 same-origin 授权），页面字节仍来自网关那条
 * 带 `Content-Security-Policy: sandbox` 的只读通道，既不 `srcdoc` 也不 `blob:`
 * ——`advanced-routes/GameRoute.tsx:101` 已经写清 `srcdoc` 会让域隔离失效。
 */
const WEBSITE_PAGE_PURPOSES: readonly ArtifactRenditionPurpose[] = [
  "full",
  "preview",
];

interface PageProbe {
  status: "probing" | "done";
  body: WebsiteBodyProbe;
  outline: WebsiteInlineOutline | null;
}

/**
 * `DOMParser` 不执行脚本，但 `textContent` **会**把 `<script>` 的源码算进去
 * ——整站内联 HTML 的脚本有 25 万字，直接读就会把空白引导页误判成有内容的页面。
 * 所以先把 script/style/template 从副本里摘掉再量文字。
 */
function documentShape(html: string) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const body = parsed.body;
  if (!body) return { elementCount: 0, textLength: 0, scriptCount: 0 };
  const scriptCount = parsed.querySelectorAll("script").length;
  const visible = body.cloneNode(true) as HTMLElement;
  for (const node of visible.querySelectorAll("script, style, template")) {
    node.remove();
  }
  return {
    elementCount: visible.querySelectorAll("*").length,
    textLength: (visible.textContent || "").trim().length,
    scriptCount,
  };
}

const UNREAD_BODY: WebsiteBodyProbe = { status: "unread" };

/**
 * 取回页面字节，交给 `websiteViewerPlan` 判读。
 *
 * 取不回来时**分两档**交给判读器，而不是一律 `unread`：
 * `unread` 的含义是「判读器这次没跑成」，判读器会因此宁可把声明了 `text/html`
 * 的真页面放进 frame；而超限件是**注定**判读不了的，把它按 `unread` 交上去，
 * 等于让一份没人核对过的整站包直接上屏 —— 那正是操作员截图里的那一屏。
 *
 * 精确体积只能从 rendition 的登记里拿（`declaredBytes`）：超限是在下载之前
 * 按 `content-length` 挡下的，这里手里没有内容，也就没有实测字节数。
 */
function usePagePaintProbe(
  url: string,
  version: number,
  declaredBytes: number,
): PageProbe {
  const [probe, setProbe] = useState<PageProbe>({
    status: url ? "probing" : "done",
    body: UNREAD_BODY,
    outline: null,
  });
  useEffect(() => {
    if (!url) {
      setProbe({ status: "done", body: UNREAD_BODY, outline: null });
      return;
    }
    let cancelled = false;
    setProbe({ status: "probing", body: UNREAD_BODY, outline: null });
    void (async () => {
      try {
        const blob = await fetchMediaBlob(url, {
          cache: "no-store",
          maxBytes: MAX_PROBE_BYTES,
        });
        const html = await blob.text();
        if (cancelled) return;
        setProbe({
          status: "done",
          body: { status: "read", html, shape: documentShape(html) },
          outline: websiteInlineOutline(html),
        });
      } catch (error) {
        if (cancelled) return;
        setProbe({
          status: "done",
          body: isMediaOversizeError(error)
            ? { status: "oversize", byteLength: declaredBytes }
            : UNREAD_BODY,
          outline: null,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, version, declaredBytes]);
  return probe;
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-[520px] flex-col items-center justify-center gap-4 bg-stone-50 px-6 py-10">
      {children}
    </div>
  );
}

function PageOutline({ outline }: { outline: WebsiteInlineOutline }) {
  const tt = useUI();
  return (
    <div className="w-full max-w-xl rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-[12px] font-medium text-stone-600">
        {outline.siteName
          ? `${outline.siteName} · ${tt("共")} ${outline.pages.length} ${tt("页")}`
          : `${tt("共")} ${outline.pages.length} ${tt("页")}`}
      </p>
      <ul className="mt-3 divide-y divide-stone-100">
        {outline.pages.map((page) => (
          <li
            key={page.path}
            className="flex items-baseline justify-between gap-3 py-2"
          >
            <span className="truncate text-[13px] text-stone-700">
              {page.title}
            </span>
            <span className="shrink-0 text-[11px] text-stone-400">
              {page.path} · {page.sectionCount} {tt("个板块")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 出口本身在详情工具条上（那是动作条的面），这里只把它们指出来。 */
const EXIT_HINT = "可用的出口：详情工具条上的「下载」拿到源文件，「编辑」在网站编辑器里打开它。";

function StaticCover({ url, title }: { url: string; title: string }) {
  return (
    <div className="w-full max-w-xl overflow-hidden rounded-xl border border-stone-200 bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={title}
        referrerPolicy="no-referrer"
        className="max-h-[42vh] w-full object-contain"
      />
    </div>
  );
}

export function WebsiteArtifactViewer({ item }: { item: LibraryItem }) {
  const tt = useUI();
  const rendition = useArtifactRendition(item, WEBSITE_PAGE_PURPOSES);
  const mediaType = rendition.rendition?.mediaType;
  const admission = websiteFrameAdmission(mediaType);
  /**
   * 只有「声明自己是网页」的 rendition 才值得取回来判读。zip / octet-stream /
   * JSON 信封一律不取也不进 frame —— 用户看到的那一屏乱码就是这类字节被
   * 按 UTF-8 读出来直接摆进 frame 的结果。
   */
  const pageUrl =
    admission === "page" || admission === "unknown" ? rendition.url : "";
  /**
   * 判读自己也要能重来。非 durable 的老条目拿到的 `retry` 是空动作
   * （`ArtifactRendition.tsx:276`），而判读失败最常见的来路恰恰是取字节这一步
   * （超 `MAX_PROBE_BYTES` 或网络抖动）——不带上这个计数，「重试」对老条目就是
   * 一颗按下去什么都不会发生的按钮。
   */
  const [probeNonce, setProbeNonce] = useState(0);
  const probe = usePagePaintProbe(
    pageUrl,
    rendition.version + probeNonce,
    rendition.rendition?.byteSize || 0,
  );
  const plan = websiteViewerPlan({
    hasUrl: Boolean(rendition.url),
    mediaType,
    body: probe.body,
  });
  const cover =
    (admission === "cover-image" ? rendition.url : "") ||
    item.previewUrl ||
    item.thumbUrl ||
    "";

  if (rendition.loading && !rendition.url) {
    return (
      <Panel>
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-200 border-t-stone-500" />
        <p className="text-[13px] text-stone-400">{tt("正在打开网站页面…")}</p>
      </Panel>
    );
  }

  if (pageUrl && probe.status === "probing") {
    return (
      <Panel>
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-200 border-t-stone-500" />
        <p className="text-[13px] text-stone-400">{tt("正在打开网站页面…")}</p>
      </Panel>
    );
  }

  if (plan.surface === "page") {
    return <SandboxedPage url={pageUrl} title={item.title} />;
  }

  return (
    <Panel>
      {cover && <StaticCover url={cover} title={item.title} />}
      <p className="max-w-xl text-center text-[13px] leading-relaxed text-stone-700">
        {tt(plan.notice)}
      </p>
      {plan.surface === "script-explainer" && probe.outline && (
        <PageOutline outline={probe.outline} />
      )}
      <p className="max-w-xl text-center text-[12px] leading-relaxed text-stone-500">
        {tt(EXIT_HINT)}
      </p>
      {isDisplayableText(rendition.error) && (
        <p className="max-w-xl text-center text-[12px] leading-relaxed text-stone-400">
          {rendition.error}
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          rendition.retry();
          setProbeNonce((value) => value + 1);
        }}
        className="min-h-9 rounded-lg border border-stone-200 bg-white px-3 text-[12px] font-medium text-stone-600 hover:bg-stone-50"
      >
        {tt("重试")}
      </button>
    </Panel>
  );
}

/**
 * 与 `library-viewers.tsx` 的 `SandboxedWebViewer` 同一套沙箱值：单一事实源是
 * `editor-sandbox-origin.ts` 的 `webViewerFrameSandbox()`，这里不新增任何授权。
 */
function SandboxedPage({ url, title }: { url: string; title: string }) {
  return (
    <div className="flex h-full min-h-[520px] flex-col bg-stone-100">
      <iframe
        src={url}
        title={title}
        className="min-h-0 flex-1 border-0 bg-white"
        sandbox={webViewerFrameSandbox(false)}
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
