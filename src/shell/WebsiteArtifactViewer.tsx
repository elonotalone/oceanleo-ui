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
 * 这一件是不是「有匿名整站预览通道」的官方模板，以及那条通道的 `{template_id}`。
 *
 * 两条来路，因为详情面在打开时会把目录行整件换成服务端 durable 投影
 * （`material-detail-slot.tsx:135-230`），catalog `id` 与 `template_material_*` meta
 * 在那一跳全部丢失：
 *
 *   - 目录行直接渲染（passthrough）：`meta` 里就有 `template_material_id`，而
 *     `TEMPLATE_MATERIAL_PREVIEW_META_KEY` 只在网站这一类出现，所以它同时是「有没有
 *     这条通道」的判据；
 *   - durable 投影：只剩 `artifactId`，向目录源模块反查 catalog id。查不到就是空串，
 *     此时**不回退**，而不是编一个 id 去撞端点。
 */
function templateMaterialPreviewId(item: LibraryItem): string {
  const declaredPath = item.meta?.[TEMPLATE_MATERIAL_PREVIEW_META_KEY];
  const declaredId = item.meta?.template_material_id;
  if (
    typeof declaredPath === "string" &&
    declaredPath.trim() &&
    typeof declaredId === "string" &&
    declaredId.trim()
  ) {
    return declaredId.trim();
  }
  if (!isDurableLibraryItem(item) || item.artifactType !== "website") return "";
  return templateMaterialIdForArtifact(item.artifactId);
}

interface PreviewPage {
  slug: string;
  title: string;
}

/**
 * 页面清单（`GET /v1/template-materials/{id}/preview/manifest`）。
 *
 * 清单只决定**要不要出翻页控件**，不决定第一屏看什么：`/preview` 本身就是整站入口，
 * 所以清单没回来、回来是空的、或者只有一页时，用户看到的仍然是同一个页面，
 * 只是没有那排页签。翻页控件依据 `pages` 的长度而不是响应里的 `pageCount` ——
 * 两者不一致时按 `pageCount` 出页签会画出一排点不动的空标签。
 */
function usePreviewManifest(templateId: string): PreviewPage[] {
  const [pages, setPages] = useState<PreviewPage[]>([]);
  useEffect(() => {
    if (!templateId) {
      setPages([]);
      return;
    }
    const controller = new AbortController();
    setPages([]);
    void (async () => {
      try {
        const response = await fetch(
          templateMaterialPreviewManifestUrl(templateId),
          {
            method: "GET",
            headers: { Accept: "application/json" },
            // 公共产品内容：不带 cookie、不带 bearer，与目录端点同一条纪律
            // （`material-library-template-source.ts` 的 `fetchTemplateMaterials`）。
            credentials: "omit",
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error(String(response.status));
        const payload = (await response.json()) as unknown;
        if (controller.signal.aborted) return;
        setPages(previewPages(payload));
      } catch {
        if (controller.signal.aborted) return;
        // 清单取不回来不是错误态：整站入口照常能看，只是没有页签。
        setPages([]);
      }
    })();
    return () => controller.abort();
  }, [templateId]);
  return pages;
}

/** `slug` 是唯一进 URL 的响应可控字段，形状不合格就整条丢掉（URL 侧另有编码兜底）。 */
const PREVIEW_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function previewPages(payload: unknown): PreviewPage[] {
  const rawPages = (payload as { pages?: unknown } | null)?.pages;
  if (!Array.isArray(rawPages)) return [];
  const pages: PreviewPage[] = [];
  const seen = new Set<string>();
  for (const raw of rawPages) {
    const slug =
      typeof (raw as { slug?: unknown })?.slug === "string"
        ? (raw as { slug: string }).slug.trim()
        : "";
    if (!PREVIEW_SLUG.test(slug) || seen.has(slug)) continue;
    const title =
      typeof (raw as { title?: unknown })?.title === "string"
        ? (raw as { title: string }).title.trim()
        : "";
    seen.add(slug);
    pages.push({ slug, title: title || slug });
  }
  return pages;
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
  const previewTemplateId = templateMaterialPreviewId(item);

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

  /**
   * 拿不到可读页面 rendition，但这一件有匿名整站预览通道 —— 那就看站本身，
   * 而不是退回封面图。这条分支只对官方模板成立（`templateMaterialPreviewId` 空串
   * 即不成立），登录态拿得到 `full` 的路径在上一句就已经返回，逐字没动。
   */
  if (previewTemplateId) {
    return (
      <TemplateMaterialPreview
        templateId={previewTemplateId}
        title={item.title}
      />
    );
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
 * 匿名整站预览：iframe 里是站本身，下面是页签与那条界线说明。
 *
 * 三件事刻意不做：
 *   - **不新增沙箱授权**：frame 复用 `UntrustedFrame`，值仍来自
 *     `webViewerFrameSandbox(false)`，一个字没加；
 *   - **不弹窗**：界线说明是内容下面的一行常驻文字，既不遮内容也不打断浏览；
 *   - **不预取页面字节**：`/preview` 的响应带 `Content-Security-Policy: sandbox`
 *     由网关保证，判读那一套是给 rendition 用的，这条通道不重复一遍。
 *
 * 导出给首页大卡片（`ImageLightbox.tsx` 的 `TemplateShowcase`）复用：那一层的数据源
 * 不是素材目录，落点原本是一张 OSS 大图。两处各写一份 iframe + 页签 + 界线说明，
 * 沙箱值与文案就会各漂一点，所以首页与探索页共用这一个实现。
 */
export function TemplateMaterialPreview({
  templateId,
  title,
  layout = "viewer",
}: {
  templateId: string;
  title: string;
  /**
   * `"viewer"` = 库详情整幅，高度自己撑到 520px 起；
   * `"inline"` = 首页大卡片的主预览位，高度由那个舞台给（52–60vh），
   * 所以最小高度必须让位 —— 不让位的话 520px 会把舞台顶破，页签与界线说明被裁掉。
   */
  layout?: "viewer" | "inline";
}) {
  const tt = useUI();
  /**
   * `slug` 空串 = 整站入口 `/preview`（合同 §5 接口 A 的第一条），也就是第一页。
   * 第一个页签点回去也写空串，所以清单到达不会让 frame 白重载一次。
   */
  const pages = usePreviewManifest(templateId);
  const [slug, setSlug] = useState("");
  const activeIndex = slug
    ? pages.findIndex((page) => page.slug === slug)
    : 0;
  return (
    <div
      data-template-material-preview={layout}
      className={`flex h-full flex-col bg-stone-100 ${
        layout === "inline" ? "w-full min-h-0" : "min-h-[520px]"
      }`}
    >
      <UntrustedFrame
        url={templateMaterialPreviewUrl(templateId, slug)}
        title={title}
      />
      {pages.length > 1 && (
        <nav
          aria-label={tt("站内页面")}
          className="flex shrink-0 flex-wrap items-center gap-1 border-t border-stone-200 bg-white px-3 py-2"
        >
          {pages.map((page, index) => (
            <button
              key={page.slug}
              type="button"
              aria-current={index === activeIndex ? "page" : undefined}
              onClick={() => setSlug(index === 0 ? "" : page.slug)}
              className={`min-h-8 rounded-lg px-3 text-[12px] font-medium ${
                index === activeIndex
                  ? "bg-stone-900 text-white"
                  : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              {page.title}
            </button>
          ))}
        </nav>
      )}
      <p className="shrink-0 border-t border-stone-200 bg-white px-3 py-2 text-[12px] leading-relaxed text-stone-500">
        {tt(PREVIEW_BOUNDARY)}{" "}
        <a
          href="/account"
          className="font-medium text-stone-700 underline decoration-stone-300 underline-offset-2 hover:text-stone-900"
        >
          {tt("登录")}
        </a>
      </p>
    </div>
  );
}

/**
 * 界线说的是**这条预览通道**给什么、不给什么，而不是「你是谁」：查看器手里没有
 * 会话身份，只有「这次没拿到可读的页面 rendition」这一件事实。按身份措辞就得猜，
 * 猜错的那一半会对已登录的人说一句假话；按通道措辞对谁都成立。
 */
const PREVIEW_BOUNDARY =
  "这里能翻页看完整个站。下载源码、复制到工作台需要登录账号：";

/**
 * 与 `library-viewers.tsx` 的 `SandboxedWebViewer` 同一套沙箱值：单一事实源是
 * `editor-sandbox-origin.ts` 的 `webViewerFrameSandbox()`，这里不新增任何授权。
 */
function SandboxedPage({ url, title }: { url: string; title: string }) {
  return (
    <div className="flex h-full min-h-[520px] flex-col bg-stone-100">
      <UntrustedFrame url={url} title={title} />
    </div>
  );
}

/**
 * 两条渲染路径（rendition 页面 / 匿名预览端点）共用的同一个 frame。刻意只有一处：
 * 沙箱值出现两遍，将来就会有一遍被单独放宽。
 */
function UntrustedFrame({ url, title }: { url: string; title: string }) {
  return (
    <iframe
      src={url}
      title={title}
      className="min-h-0 flex-1 border-0 bg-white"
      sandbox={webViewerFrameSandbox(false)}
      referrerPolicy="no-referrer"
    />
  );
}
