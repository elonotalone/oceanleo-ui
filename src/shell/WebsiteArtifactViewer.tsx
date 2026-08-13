"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import type { LibraryItem } from "./library-data";
import { useArtifactRendition } from "./ArtifactRendition";
import { fetchMediaBlob } from "../lib/media-proxy";
import type { ArtifactRenditionPurpose } from "./artifact-contract";
import { webViewerFrameSandbox } from "./editor-sandbox-origin";
import {
  isDisplayableText,
  websiteFrameAdmission,
  websiteInlineOutline,
  websiteViewerPlan,
  type WebsiteBodyProbe,
  type WebsiteInlineOutline,
  type WebsiteViewerReason,
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

/** 判读用的读取上限：整站内联 HTML 实测 ~300 KB，8 MB 足够且不至于吃内存。 */
const MAX_PROBE_BYTES = 8 * 1024 * 1024;

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
 * 判读失败（网络错、超限）留成 `unread`，由判读器决定怎么解释；这里不自己下结论，
 * 也不把取回来的字节带进 UI —— 它只用于判读，判完就留在这个 hook 里。
 */
function usePagePaintProbe(url: string, version: number): PageProbe {
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
      } catch {
        if (!cancelled) {
          setProbe({ status: "done", body: UNREAD_BODY, outline: null });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, version]);
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

/**
 * 每一档说的都是**这一件是什么**，不是替产品的空缺道歉。
 * 判据：文案里不出现「暂时」「抱歉」「制作得较早」这类替缺陷开脱的说法。
 */
const SURFACE_COPY: Record<WebsiteViewerReason, string> = {
  "self-painting": "",
  "script-bootstrapped":
    "这是一份要在浏览器里跑起来才成型的网站：页面结构由它自带的脚本在打开时现画。素材预览通道按平台隔离规则不执行脚本，所以这里给出它的封面与页面清单。",
  "cover-image-only":
    "这一件在素材库里只存了一张封面图，没有随附可打开的页面文件。",
  "opaque-bytes":
    "这一件存的是打包后的网站源码，不是可以直接打开的网页；要看到页面需要先把它构建出来。",
  "no-body": "这一件在素材库里没有可打开的文件。",
};

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
  const probe = usePagePaintProbe(pageUrl, rendition.version);
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
        {tt(SURFACE_COPY[plan.reason])}
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
        onClick={rendition.retry}
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
