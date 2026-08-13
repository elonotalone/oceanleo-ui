"use client";

import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import DOMPurify from "dompurify";
import { Markdown } from "./Markdown";
import { useUI } from "../i18n/ui/useUI";
import {
  isDurableLibraryItem,
  threeDSubtypeFor,
  type LibraryItem,
} from "./library-data";
import { prepareArtifactForAction } from "./artifact-client";
import { isArtifactSourceTreeUrl } from "./artifact-contract";
import {
  isTrustedInteractiveViewerUrl,
  webViewerFrameSandbox,
} from "./editor-sandbox-origin";
import {
  ArtifactRenditionFailure,
  useArtifactRendition,
  withResolvedRendition,
} from "./ArtifactRendition";
import {
  fetchValidatedOfficePackage,
  fetchValidatedSpreadsheetSource,
  officePackageKindForItem,
  officeViewerRenditionPurposes,
} from "./doc-editors/office-file";
import {
  DeckPreviewLayout,
  deckPreviewLogicalSize,
  type DeckPreviewLayoutSlide,
  type DeckPreviewLogicalSize,
} from "./doc-editors/DeckPreviewLayout";
import {
  ProgressiveArtifactImage,
  ViewerParsingPoster,
  ViewerThumbPoster,
  libraryViewerIsHeavy,
  useVisibleViewerGate,
} from "./library-viewer-first-paint";
import { WebsiteArtifactViewer } from "./WebsiteArtifactViewer";
import {
  isDisplayableText,
  websiteFrameAdmission,
} from "./website-inline-preview";
import {
  GamePlayDetail,
  MaterialDetailUnavailable,
  gamePlayEmbedHref,
  useMaterialDetailTarget,
} from "./material-detail-slot";

function extension(url?: string): string {
  const match = /\.([a-z0-9]+)(?:$|[?#])/i.exec(url || "");
  return match?.[1]?.toLowerCase() || "";
}

/**
 * UC-1 / UC-3 —— 免沙箱 PDF frame 的第一方主机白名单。
 * 规范来源：docs/architecture/oceanleo-untrusted-content-isolation.md §4.1、
 * §7.5、§8.1、§8.3。
 *
 * Chromium 的内建 PDF 查看器是插件式实现，加**任何** sandbox 属性都会让 PDF 完全
 * 不渲染（crbug 413851），所以这条渲染路径只能免沙箱；主机白名单是它唯一还剩下的
 * 边界。跨源只阻止 frame 读**宿主**的 DOM，并不阻止 frame 读**它自己
 * origin** 的 cookie，而会话 cookie 的 `Domain=.oceanleo.com` 且不是 httpOnly，对
 * 任何 `*.oceanleo.com` 主机来说都是「自己的 cookie」。因此：
 *   - 落在 SSO cookie 域内的地址，只放行写死的第一方 rendition 网关——它的响应带
 *     `Content-Security-Policy: sandbox`，即便被喂了 HTML 也运行在 opaque origin；
 *   - cookie 域外的对象存储主机（Supabase / OSS）本就读不到会话 cookie；
 *   - 用户内容可注册域 `oceanleo.app` 即使在 cookie 域外也要挡掉：免沙箱 frame 仍
 *     可顶层导航、弹窗、下载。
 * 判据禁止改成域名后缀授信：新开的任意 `*.oceanleo.com` 子域必须默认不可信。
 */
// 两个家族的网关都写在这里，判定按「落在哪个 cookie 域里」逐个 host 走，不按页面
// 当前属于哪个家族 —— 这一层是**降权**判定，多覆盖一个家族只会更严：
//   * `.oceanleo.cn` 下的主机以前落在「cookie 域外」，被当成对象存储放行；
//     现在它落在 cn 家族的 cookie 域内，于是只有 cn 网关能放行，其余一律拒。
//   * leoapp.cn 以前完全没被排除，现在与 oceanleo.app 同等挡掉。
// 对 `.com` 主机的结论与本轮改动前逐字相同（`api.oceanleo.com` 放行，其余 cookie
// 域内主机拒，域外对象存储放行）。
const PDF_FRAME_TRUSTED_GATEWAY_HOSTS: readonly string[] = [
  "api.oceanleo.com",
  "api.oceanleo.cn",
];
const PDF_FRAME_UNTRUSTED_REGISTRABLE_DOMAINS: readonly string[] = [
  "oceanleo.app",
  "leoapp.cn",
];
const SSO_COOKIE_REGISTRABLE_DOMAINS: readonly string[] = [
  "oceanleo.com",
  "oceanleo.cn",
];

/** 判定 host 是否落在**任一家族**的共享 cookie 域内。这是降权判定，不是授信判定。 */
function isUnderSsoCookieDomain(host: string): boolean {
  return SSO_COOKIE_REGISTRABLE_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

function isSandboxExemptPdfFrameUrl(value: string | undefined): boolean {
  let parsed: URL;
  try {
    // 相对地址证明不了自己落在哪个 origin，一律 fail closed。
    parsed = new URL(String(value || ""));
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password || parsed.port) return false;
  const host = parsed.hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return false;
  if (
    PDF_FRAME_UNTRUSTED_REGISTRABLE_DOMAINS.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    )
  ) {
    return false;
  }
  if (isUnderSsoCookieDomain(host)) {
    return PDF_FRAME_TRUSTED_GATEWAY_HOSTS.includes(host);
  }
  return true;
}

/** Office binary preview needs an opaque source grant, not a poster image. */
function usePreparedOfficeLibraryItem(item: LibraryItem): {
  item: LibraryItem;
  loading: boolean;
  error: string;
} {
  const needsPrepare =
    isDurableLibraryItem(item) && Boolean(officePackageKindForItem(item));
  const sourceUrl = item.artifact?.renditions.source?.url || "";
  const needsUpgrade =
    needsPrepare &&
    (isArtifactSourceTreeUrl(sourceUrl) ||
      !sourceUrl ||
      /\.(png|jpe?g|webp|gif)(?:$|[?#])/i.test(item.url || ""));
  const [prepared, setPrepared] = useState<LibraryItem>(item);
  const [loading, setLoading] = useState(needsUpgrade);
  const [error, setError] = useState("");
  useEffect(() => {
    setPrepared(item);
    if (!needsUpgrade) {
      setLoading(false);
      setError("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    void prepareArtifactForAction("preview", item).then((result) => {
      if (cancelled) return;
      if (result.ok && result.data) {
        setPrepared(result.data);
        setError("");
      } else {
        setError(result.error || "无法签发 PPT/文档源访问地址。");
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [
    item.artifactId,
    item.revisionId,
    item.url,
    needsUpgrade,
    sourceUrl,
  ]);
  return { item: prepared, loading, error };
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
      )
    : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function Center({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-4 p-4">
      {children}
    </div>
  );
}

function LoadingView({ label }: { label: string }) {
  return (
    <Center>
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-200 border-t-stone-500" />
      <p className="text-[13px] text-stone-400">{label}</p>
    </Center>
  );
}

function ErrorView({
  message,
  url,
  onRetry,
}: {
  message: string;
  url?: string;
  onRetry?: () => void;
}) {
  const tt = useUI();
  return (
    <div role="alert">
      <Center>
        <svg
          className="h-10 w-10 text-stone-300"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" />
          <path d="M14 3v5h5M9 13h6M9 17h4" strokeLinecap="round" />
        </svg>
        <p className="max-w-md text-center text-[13px] leading-relaxed text-stone-500">
          {message}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg bg-stone-800 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-stone-700"
            >
              {tt("刷新安全地址并重试")}
            </button>
          )}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-stone-200 px-3 py-1.5 text-[13px] text-stone-600 hover:bg-stone-50"
            >
              {tt("打开原文件")}
            </a>
          )}
        </div>
      </Center>
    </div>
  );
}

function SandboxedWebViewer({
  url,
  title,
  trustedInteractive = false,
}: {
  url: string;
  title: string;
  trustedInteractive?: boolean;
}) {
  return (
    <div className="flex h-full min-h-[520px] flex-col bg-stone-100">
      <iframe
        src={url}
        title={title}
        className="min-h-0 flex-1 border-0 bg-white"
        sandbox={webViewerFrameSandbox(trustedInteractive)}
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

function StructuredCanvas({ item }: { item: LibraryItem }) {
  const rawNodes =
    asRecords(item.meta.nodes).length > 0
      ? asRecords(item.meta.nodes)
      : asRecords(item.meta.scenes);
  if (rawNodes.length === 0) {
    return (
      <ErrorView
        message="这张画布还没有可显示的节点快照。"
        url={item.url}
      />
    );
  }
  return (
    <div className="min-h-[520px] bg-[radial-gradient(circle_at_1px_1px,#d6d3d1_1px,transparent_0)] bg-[size:20px_20px] p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rawNodes.map((node, index) => (
          <article
            key={String(node.id || index)}
            className="min-h-28 rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
              {stringValue(node.type) || `NODE ${index + 1}`}
            </p>
            <h3 className="mt-2 text-[14px] font-semibold text-stone-800">
              {stringValue(node.title) ||
                stringValue(node.label) ||
                stringValue(node.name) ||
                `节点 ${index + 1}`}
            </h3>
            {(stringValue(node.content) ||
              stringValue(node.text) ||
              stringValue(node.description)) && (
              <p className="mt-2 line-clamp-5 whitespace-pre-wrap text-[12px] leading-relaxed text-stone-500">
                {stringValue(node.content) ||
                  stringValue(node.text) ||
                  stringValue(node.description)}
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

interface PptxPreviewModel {
  width: number;
  height: number;
  slides: Array<{ name?: string }>;
}

interface PptxPreviewInstance {
  htmlRender: {
    options: {
      viewPort?: {
        width?: number;
        height?: number;
      };
    };
  };
  options: {
    width?: number;
    height?: number;
  };
  wrapper: HTMLElement;
  load: (file: ArrayBuffer) => Promise<PptxPreviewModel>;
  renderSingleSlide: (slideIndex: number) => void;
  destroy: () => void;
}

interface PptxRenderedSlide {
  id: string;
  index: number;
  label: string;
  /**
   * 首帧那一刻**故意**是 `null`：页轨缩略图由 `startPptxThumbnailPass` 在首帧之后
   * 一页一页补上，在此之前页轨画的是页码占位。见 `PptViewer` 里的取舍说明。
   */
  thumbnail: HTMLElement | null;
}

type PptxPreviewInit = (
  node: HTMLElement,
  options: { mode: string; width: number; height: number },
) => unknown;

/**
 * 上游产物的本地副本，不是 `pptx-preview` 这个包。
 *
 * 上游 ESM 第一行 `import*as h from"echarts"` 把整份 echarts@5 焊进了 PPT 预览的依赖
 * 闭包（实测 23 chunk / 5,565,729 B 未压缩，占闭包 6,061,093 B 的 91.8%），首帧一个字节
 * 都用不上。这一行只能在产物上改，而 `pnpm.patchedDependencies` 只有工作区根认，
 * 36 个消费站装的是它们自己那份 `pptx-preview` —— 补丁到不了。所以副本随本包一起发。
 * 生成器与读数：`scripts/vendor-pptx-preview.mjs`、`vendor/pptx-preview/chart-engine.js`。
 */
async function loadPptxPreview(): Promise<{ init: PptxPreviewInit }> {
  return (await import(
    "../../vendor/pptx-preview/pptx-preview.es.js"
  )) as unknown as { init: PptxPreviewInit };
}

/** pptx 自带的页面尺寸要同时写进三处，否则舞台与缩略图会各画各的。 */
function applyPptxLogicalSize(
  previewer: PptxPreviewInstance,
  logicalSize: DeckPreviewLogicalSize,
) {
  previewer.options.width = logicalSize.width;
  previewer.options.height = logicalSize.height;
  const viewPort = previewer.htmlRender.options.viewPort ?? {};
  viewPort.width = logicalSize.width;
  viewPort.height = logicalSize.height;
  previewer.htmlRender.options.viewPort = viewPort;
  previewer.wrapper.style.width = `${logicalSize.width}px`;
  previewer.wrapper.style.height = `${logicalSize.height}px`;
  previewer.wrapper.style.margin = "0";
  previewer.wrapper.style.overflow = "hidden";
  previewer.wrapper.style.background = "transparent";
}

/** 一格空闲时间；没有 `requestIdleCallback` 就退到宏任务，但**绝不**退到同步。 */
function scheduleAfterPaint(run: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(run, { timeout: 400 });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(run, 16);
  return () => clearTimeout(handle);
}

/**
 * 页轨缩略图的后台补渲。
 *
 * 为什么必须是**第二个** previewer 实例：上游的
 * `renderSingleSlide(i)` = `removeCurrentSlide(); renderSlide(i)` —— 它会先把上一页从
 * wrapper 里摘掉。在舞台那个实例上补渲，等于把用户正在看的那一页一页页换走。
 *
 * 为什么可以渲到屏幕外：全 bundle 里 `getBoundingClientRect` / `clientWidth` /
 * `clientHeight` / `offsetWidth` 零命中，渲染尺寸全部来自 pptx 自带的 width/height ×
 * scale，不读布局。宿主仍然挂进 document（只是移到视口外），这样 `<canvas>` 的
 * `drawImage` 与图片解码走的还是正常路径。
 *
 * 返回值是取消函数。整轮失败只让页轨停在占位，**不影响舞台**。
 */
function startPptxThumbnailPass({
  init,
  arrayBuffer,
  logicalSize,
  onSlide,
  onSettled,
}: {
  init: PptxPreviewInit;
  arrayBuffer: ArrayBuffer;
  logicalSize: DeckPreviewLogicalSize;
  onSlide: (index: number, thumbnail: HTMLElement) => void;
  onSettled: (status: "done" | "failed") => void;
}): () => void {
  let cancelled = false;
  let cancelScheduled = () => {};
  let previewer: PptxPreviewInstance | null = null;
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.setAttribute("data-pptx-thumbnail-workshop", "");
  // 图表引擎在这里一律不取：页轨缩略图今天本来就没有图表（上游把 echarts 的 init 包在
  // setTimeout 里，补渲下一页会先把上一页摘掉，回调落空）。理由见 chart-engine.js。
  host.setAttribute("data-pptx-chart-engine", "off");
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${logicalSize.width}px;height:${logicalSize.height}px;pointer-events:none;opacity:0;`;

  const teardown = () => {
    cancelScheduled();
    try {
      previewer?.destroy();
    } catch {
      // 拆一个屏幕外的工场失败没有用户可见后果，不值得把它抛进 UI。
    }
    previewer = null;
    host.remove();
  };

  document.body.append(host);
  void (async () => {
    try {
      const activePreviewer = init(host, {
        mode: "slide",
        width: logicalSize.width,
        height: logicalSize.height,
      }) as PptxPreviewInstance;
      previewer = activePreviewer;
      const model = await activePreviewer.load(arrayBuffer);
      if (cancelled) return;
      applyPptxLogicalSize(activePreviewer, logicalSize);
      let index = 0;
      const step = () => {
        if (cancelled || !previewer) return;
        try {
          activePreviewer.renderSingleSlide(index);
          const rendered = activePreviewer.wrapper.querySelector<HTMLElement>(
            `.pptx-preview-slide-wrapper-${index}`,
          );
          if (rendered) onSlide(index, clonePptxSlideSurface(rendered, index));
        } catch {
          // 单页渲不出来只让那一格保持占位，不中断整轮。
        }
        index += 1;
        if (index >= model.slides.length) {
          onSettled("done");
          teardown();
          return;
        }
        cancelScheduled = scheduleAfterPaint(step);
      };
      cancelScheduled = scheduleAfterPaint(step);
    } catch {
      if (!cancelled) onSettled("failed");
      teardown();
    }
  })();

  return () => {
    cancelled = true;
    teardown();
  };
}

function namespacePptxSurfaceIds(surface: HTMLElement, prefix: string) {
  const idMap = new Map<string, string>();
  for (const element of surface.querySelectorAll<HTMLElement>("[id]")) {
    if (!element.id) continue;
    const nextId = `${prefix}-${element.id}`;
    idMap.set(element.id, nextId);
    element.id = nextId;
  }
  const replacements = [...idMap.entries()].sort(
    ([left], [right]) => right.length - left.length,
  );
  const replaceReferences = (value: string) => {
    let next = value;
    for (const [currentId, nextId] of replacements) {
      next = next.replaceAll(`#${currentId}`, `#${nextId}`);
    }
    return next;
  };
  for (const element of surface.querySelectorAll<HTMLElement>("*")) {
    for (const attribute of [...element.attributes]) {
      if (attribute.name === "id" || !attribute.value) continue;
      const nextValue = replaceReferences(attribute.value);
      if (nextValue !== attribute.value) {
        element.setAttribute(attribute.name, nextValue);
      }
    }
  }
  for (const style of surface.querySelectorAll("style")) {
    if (style.textContent) {
      style.textContent = replaceReferences(style.textContent);
    }
  }
}

function clonePptxSlideSurface(
  surface: HTMLElement,
  slideIndex: number,
): HTMLElement {
  const clone = surface.cloneNode(true) as HTMLElement;
  const sourceCanvases = surface.querySelectorAll("canvas");
  const clonedCanvases = clone.querySelectorAll("canvas");
  sourceCanvases.forEach((source, index) => {
    const target = clonedCanvases[index];
    if (!target) return;
    try {
      target.getContext("2d")?.drawImage(source, 0, 0);
    } catch {
      // A tainted chart canvas remains a truthful DOM thumbnail without pixels.
    }
  });
  namespacePptxSurfaceIds(clone, `pptx-thumbnail-${slideIndex + 1}`);
  return clone;
}

function PptxSlideThumbnail({
  surface,
  logicalSize,
}: {
  surface: HTMLElement;
  logicalSize: DeckPreviewLogicalSize;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    surface.style.position = "absolute";
    surface.style.inset = "0 auto auto 0";
    surface.style.margin = "0";
    surface.style.pointerEvents = "none";
    surface.style.transformOrigin = "top left";
    node.replaceChildren(surface);
    const fit = () => {
      if (!node.clientWidth) return;
      const scale = node.clientWidth / logicalSize.width;
      surface.style.transform = `scale(${scale})`;
      node.style.height = `${logicalSize.height * scale}px`;
    };
    fit();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    observer?.observe(node);
    window.addEventListener("resize", fit);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", fit);
      node.replaceChildren();
    };
  }, [logicalSize.height, logicalSize.width, surface]);

  return (
    <div
      ref={host}
      aria-hidden="true"
      className="relative w-full overflow-hidden rounded bg-white shadow-sm"
      style={{ aspectRatio: `${logicalSize.width} / ${logicalSize.height}` }}
    />
  );
}

function StructuredSlidePreview({
  slide,
  index,
  count,
  thumbnail = false,
}: {
  slide: Record<string, unknown>;
  index: number;
  count: number;
  thumbnail?: boolean;
}) {
  const bullets = Array.isArray(slide.bullets)
    ? slide.bullets.map(String)
    : [];
  return (
    <article className="relative h-full w-full overflow-hidden bg-white p-[7%]">
      <span
        className={`absolute right-[4%] top-[3%] text-stone-300 ${
          thumbnail ? "text-[5px]" : "text-[10px]"
        }`}
      >
        {index + 1} / {count}
      </span>
      <h3
        className={`max-w-[85%] font-semibold leading-tight text-stone-900 ${
          thumbnail ? "text-[7px]" : "text-[clamp(18px,3vw,34px)]"
        }`}
      >
        {stringValue(slide.title) || `第 ${index + 1} 页`}
      </h3>
      {bullets.length > 0 && (
        <ul
          className={`mt-[6%] space-y-[2%] leading-relaxed text-stone-600 ${
            thumbnail ? "text-[4px]" : "text-[clamp(12px,1.7vw,20px)]"
          }`}
        >
          {bullets.map((bullet, bulletIndex) => (
            <li key={bulletIndex} className="flex gap-[3%]">
              <span>•</span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/**
 * 页轨占位：真缩略图补上之前（以及解析期间）画的那一格。
 *
 * 有结构化元数据就画标题与要点，没有就只画页码 —— 两种都比空白格更能让人定位到页。
 */
function PendingSlideThumbnail({
  slide,
  index,
  count,
}: {
  slide?: Record<string, unknown>;
  index: number;
  count: number;
}) {
  return (
    <div
      aria-hidden="true"
      data-deck-thumbnail-pending=""
      className="aspect-video animate-pulse overflow-hidden rounded bg-white shadow-sm"
    >
      {slide ? (
        <StructuredSlidePreview
          slide={slide}
          index={index}
          count={count}
          thumbnail
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[7px] text-stone-300">
          {index + 1} / {count}
        </div>
      )}
    </div>
  );
}

/**
 * pptx 模型里的 `slide.name` 是**包内部件路径**（`ppt/slides/slide1.xml`），
 * 不是给人看的名字。它被当成页轨按钮的无障碍名，屏幕阅读器会把这串原样念出来。
 * 认出这种形态就当作没有名字，让调用方退回「第 N 页」。
 */
function readableSlideName(name: string | undefined): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "";
  if (trimmed.includes("/") || /\.[a-z0-9]+$/i.test(trimmed)) return "";
  return trimmed;
}

function PptViewer({
  item,
  onResourceError,
}: {
  item: LibraryItem;
  onResourceError?: () => void;
}) {
  const tt = useUI();
  const host = useRef<HTMLDivElement | null>(null);
  const previewerRef = useRef<PptxPreviewInstance | null>(null);
  /**
   * `DeckPreviewLayout` 在舞台的逻辑页上挂着 `key={activeSlideId}`，所以**换一次页，
   * 整棵 children 就被卸载重建一次**，这个宿主 div 会换成一个全新的空节点。
   * 而 pptx-preview 只在 `init()` 那一刻往宿主里塞一个 wrapper，之后所有渲染都进
   * wrapper（`this.wrapper.append(slide)`），再也不碰宿主——于是 wrapper 连同已渲好的
   * 那一页一起留在被丢弃的旧节点上，用户看到的舞台是一片白。
   *
   * 解析完成那一次同样会踩到：`activeSlideId` 从空串变成第一页的 id。
   * 所以每次拿到新宿主都要把 wrapper 收养过来，不能只在挂载时做一次。
   */
  const attachStageHost = useCallback((node: HTMLDivElement | null) => {
    host.current = node;
    const previewer = previewerRef.current;
    if (node && previewer && previewer.wrapper.parentNode !== node) {
      node.append(previewer.wrapper);
    }
  }, []);
  const structuredSlides = useMemo(
    () => asRecords(item.meta.slides),
    [item.meta.slides],
  );
  const [state, setState] = useState<"loading" | "ready" | "error">(
    item.url ? "loading" : "error",
  );
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [logicalSize, setLogicalSize] = useState<DeckPreviewLogicalSize>(() =>
    deckPreviewLogicalSize(),
  );
  const [renderedSlides, setRenderedSlides] = useState<PptxRenderedSlide[]>([]);
  const [activeSlideId, setActiveSlideId] = useState("");
  /**
   * 代理指标，替代拿不到的浏览器计时（`_COMMON.md` §2.4 禁止浏览器验证）。
   * `firstPaintRenders` = `setState("ready")` 之前舞台实例被要求渲了几页。
   * 它必须**恒为 1**，与页数无关；这就是「首帧不再等全部页渲完」的可测形式，
   * 也是 `tests/library-ppt-preview-adapter.test.mjs` 里 8 页 / 40 页两组的断言对象。
   */
  const [firstPaintRenders, setFirstPaintRenders] = useState(0);

  // 依赖里刻意没有 `tt`：这个 effect 会下载并重新解析整份 pptx（最大 64MB），语言换一次
  // 就重下重解一次，还会把已渲好的幻灯片清空。`tt` 在这里只用于失败文案，所以一律只存
  // 中文原文（词典 key），翻译推迟到渲染（下面两处 `tt(error)`）；抛出的 Error 也照此
  // 办理，它的 message 最终就落进同一个 `error`。
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    node.replaceChildren();
    setRenderedSlides([]);
    setLogicalSize(deckPreviewLogicalSize());
    setActiveSlideId("");
    setFirstPaintRenders(0);
    if (!item.url) {
      setError("没有可解析的 PPT 地址。");
      setState("error");
      return;
    }
    let cancelled = false;
    let previewer: PptxPreviewInstance | null = null;
    let stopThumbnailPass: (() => void) | null = null;
    setState("loading");
    setError("");
    void (async () => {
      try {
        const { arrayBuffer } = await fetchValidatedOfficePackage(
          item.url!,
          "pptx",
          {
            maxBytes: 64 * 1024 * 1024,
            onAccessDenied: onResourceError,
          },
        );
        if (cancelled) return;
        const { init } = await loadPptxPreview();
        if (cancelled) return;
        const activePreviewer = init(node, {
          mode: "slide",
          width: 960,
          height: 540,
        }) as PptxPreviewInstance;
        previewer = activePreviewer;
        previewerRef.current = activePreviewer;
        const model = await activePreviewer.load(arrayBuffer);
        if (cancelled) return;
        if (!model.slides.length) {
          throw new Error("PPT 中没有可显示的幻灯片。");
        }
        const nextLogicalSize = deckPreviewLogicalSize(
          model.width / model.height,
        );
        applyPptxLogicalSize(activePreviewer, nextLogicalSize);

        /**
         * 首帧只做**一页**的活。
         *
         * 这里原来是 `model.slides.map(...)`：一个同步 `map`，每页真渲一整页 DOM、
         * 深拷贝一次整页、再对每个元素的每个属性做一遍 id 重写，跑完才 `setState("ready")`
         * ——外加末尾多渲一次第 1 页，所以第 1 页被渲了两遍。
         * 页轨缩略图是这轮活的唯一消费方，而页轨在首帧那一刻还没人看
         * （`renderedSlides` 的下游已被穷举：只有本组件的 `layoutSlides` 与 `selectSlide`）。
         * 所以先把第 1 页交出去，缩略图交给下面的后台补渲。
         */
        activePreviewer.renderSingleSlide(0);
        if (
          !activePreviewer.wrapper.querySelector(
            ".pptx-preview-slide-wrapper-0",
          )
        ) {
          // 这句原本套着 `tt(...)`，但 key 是拼出来的动态串，词典永远命不中，
          // 等同于原样返回；去掉包装不改行为，只是不再假装它被翻译过。
          throw new Error("无法渲染第 1 页幻灯片。");
        }
        const outline: PptxRenderedSlide[] = model.slides.map(
          (slide, index) => {
            const metadata = structuredSlides[index];
            return {
              id: `pptx-slide-${index + 1}`,
              index,
              label:
                stringValue(metadata?.title) ||
                stringValue(metadata?.label) ||
                readableSlideName(slide.name) ||
                `第 ${index + 1} 页`,
              thumbnail: null,
            };
          },
        );
        if (cancelled) return;
        setLogicalSize(nextLogicalSize);
        setRenderedSlides(outline);
        setActiveSlideId(outline[0].id);
        setFirstPaintRenders(1);
        setState("ready");

        if (outline.length > 0) {
          stopThumbnailPass = startPptxThumbnailPass({
            init,
            arrayBuffer,
            logicalSize: nextLogicalSize,
            onSlide: (index, thumbnail) => {
              if (cancelled) return;
              setRenderedSlides((slides) =>
                slides.map((slide) =>
                  slide.index === index ? { ...slide, thumbnail } : slide,
                ),
              );
            },
            onSettled: () => {
              stopThumbnailPass = null;
            },
          });
        }
      } catch (reason) {
        if (cancelled) return;
        if (previewerRef.current === previewer) previewerRef.current = null;
        previewer?.destroy();
        // 清的是**当下挂着的**宿主，不是 effect 起跑时那个：中途换过页的话
        // wrapper 已经被收养到新节点上，清旧节点等于把残页留在屏幕上。
        host.current?.replaceChildren();
        setError(reason instanceof Error ? reason.message : String(reason));
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
      stopThumbnailPass?.();
      if (previewerRef.current === previewer) previewerRef.current = null;
      previewer?.destroy();
      host.current?.replaceChildren();
    };
  }, [attempt, item.url, onResourceError, structuredSlides]);

  const layoutSlides = useMemo<DeckPreviewLayoutSlide[]>(() => {
    if (state === "ready") {
      return renderedSlides.map((slide) => ({
        id: slide.id,
        label: slide.label,
        thumbnail: slide.thumbnail ? (
          <PptxSlideThumbnail
            surface={slide.thumbnail}
            logicalSize={logicalSize}
          />
        ) : (
          <PendingSlideThumbnail
            slide={structuredSlides[slide.index]}
            index={slide.index}
            count={renderedSlides.length}
          />
        ),
      }));
    }
    /**
     * 解析期间也给页轨一份占位，前提是目录行带了结构化幻灯片元数据。
     * 没有元数据就仍然是空页轨——那不算「白屏」，白屏那半边由舞台上的海报兜底。
     */
    if (state === "loading") {
      return structuredSlides.map((slide, index) => ({
        id: `pending-slide-${index + 1}`,
        label: stringValue(slide.title) || `第 ${index + 1} 页`,
        thumbnail: (
          <PendingSlideThumbnail
            slide={slide}
            index={index}
            count={structuredSlides.length}
          />
        ),
      }));
    }
    if (state === "error") {
      return structuredSlides.map((slide, index) => ({
        id: `structured-slide-${index + 1}`,
        label: stringValue(slide.title) || `第 ${index + 1} 页`,
        thumbnail: (
          <div className="aspect-video overflow-hidden rounded bg-white shadow-sm">
            <StructuredSlidePreview
              slide={slide}
              index={index}
              count={structuredSlides.length}
              thumbnail
            />
          </div>
        ),
      }));
    }
    return [];
  }, [logicalSize, renderedSlides, state, structuredSlides]);
  const effectiveActiveSlideId = layoutSlides.some(
    (slide) => slide.id === activeSlideId,
  )
    ? activeSlideId
    : layoutSlides[0]?.id || "";
  const activeStructuredIndex = layoutSlides.findIndex(
    (slide) => slide.id === effectiveActiveSlideId,
  );
  const hasStructuredFallback =
    state === "error" &&
    activeStructuredIndex >= 0 &&
    Boolean(structuredSlides[activeStructuredIndex]);

  const selectSlide = (slideId: string) => {
    const renderedSlide = renderedSlides.find((slide) => slide.id === slideId);
    if (state === "ready" && renderedSlide && previewerRef.current) {
      try {
        previewerRef.current.renderSingleSlide(renderedSlide.index);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
        setState("error");
        return;
      }
    }
    setActiveSlideId(slideId);
  };
  const retry = () => {
    onResourceError?.();
    setAttempt((value) => value + 1);
  };

  return (
    <DeckPreviewLayout
      slides={layoutSlides}
      activeSlideId={effectiveActiveSlideId}
      onActiveSlideChange={selectSlide}
      logicalSize={logicalSize}
      railLabel={tt("页面")}
      stageLabel={tt("演示文稿预览")}
      busy={state === "loading"}
      className="min-h-[520px]"
      stageOverlay={
        <>
          {state === "loading" && (
            <div className="absolute inset-0 z-40">
              <ViewerParsingPoster item={item} label={tt("正在解析 PPT…")} />
            </div>
          )}
          {state === "error" && hasStructuredFallback && (
            <div
              role="alert"
              className="absolute left-1/2 top-4 z-40 flex max-w-[calc(100%_-_2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 shadow-sm"
            >
              <span>
                {tt("PPT 在线解析失败，正在显示结构化幻灯片快照。")}
                {error ? `（${tt(error)}）` : ""}
              </span>
              <button
                type="button"
                onClick={retry}
                className="rounded border border-amber-300 px-2 py-1 font-medium hover:bg-amber-100"
              >
                {tt("重试")}
              </button>
            </div>
          )}
          {state === "error" && !hasStructuredFallback && (
            <div className="absolute inset-0 z-40 bg-white">
              <ErrorView
                message={`${tt("PPT 在线解析失败，可打开原文件。")}${error ? `（${tt(error)}）` : ""}`}
                url={item.url}
                onRetry={retry}
              />
            </div>
          )}
        </>
      }
    >
      <div
        className="relative h-full w-full overflow-hidden bg-white"
        data-pptx-first-paint-renders={firstPaintRenders}
        data-pptx-thumbnail-progress={`${renderedSlides.filter((slide) => slide.thumbnail).length}/${renderedSlides.length}`}
      >
        <div
          ref={attachStageHost}
          className={`absolute inset-0 h-full w-full overflow-hidden ${
            state === "ready" ? "" : "invisible"
          }`}
        />
        {hasStructuredFallback && (
          <div className="absolute inset-0">
            <StructuredSlidePreview
              slide={structuredSlides[activeStructuredIndex]}
              index={activeStructuredIndex}
              count={structuredSlides.length}
            />
          </div>
        )}
      </div>
    </DeckPreviewLayout>
  );
}

function SpreadsheetViewer({
  item,
  onResourceError,
}: {
  item: LibraryItem;
  onResourceError?: () => void;
}) {
  const tt = useUI();
  const [sheets, setSheets] = useState<
    Array<{ name: string; rows: unknown[][] }>
  >([]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(item.url));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!item.url) {
      const rows = Array.isArray(item.meta.rows)
        ? (item.meta.rows as unknown[][])
        : [];
      setSheets(rows.length ? [{ name: "Sheet1", rows }] : []);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const data = await fetchValidatedSpreadsheetSource(item.url!, item, {
          maxBytes: 64 * 1024 * 1024,
          onAccessDenied: onResourceError,
        });
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(data, { dense: true });
        const parsed = workbook.SheetNames.map((name) => ({
          name,
          rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
            header: 1,
            raw: false,
            defval: "",
          }) as unknown[][],
        }));
        if (!cancelled) {
          setSheets(parsed);
          setActive(0);
        }
      } catch (reason) {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, item, onResourceError]);

  if (loading) return <LoadingView label={tt("正在读取工作簿…")} />;
  if (error || sheets.length === 0)
    return (
      <ErrorView
        message={`${tt("未能读取表格内容。")}${error ? `（${error}）` : ""}`}
        url={item.url}
        onRetry={() => {
          onResourceError?.();
          setAttempt((value) => value + 1);
        }}
      />
    );

  const rows = sheets[active]?.rows ?? [];
  const columnCount = Math.min(
    60,
    rows.reduce((max, row) => Math.max(max, row.length), 0),
  );
  return (
    <div className="flex h-full min-h-[520px] flex-col bg-white">
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-stone-200 px-3 py-2">
        {sheets.map((sheet, index) => (
          <button
            key={sheet.name}
            type="button"
            onClick={() => setActive(index)}
            className={`rounded-md px-3 py-1 text-[12px] ${
              active === index
                ? "bg-stone-800 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            {sheet.name}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-[12px]">
          <tbody>
            {rows.slice(0, 300).map((row, rowIndex) => (
              <tr key={rowIndex}>
                <th className="sticky left-0 z-10 border-b border-r border-stone-200 bg-stone-50 px-2 py-1.5 text-right font-normal text-stone-400">
                  {rowIndex + 1}
                </th>
                {Array.from({ length: columnCount }).map((_, columnIndex) => (
                  <td
                    key={columnIndex}
                    className={`min-w-24 max-w-72 border-b border-r border-stone-100 px-2.5 py-1.5 align-top ${
                      rowIndex === 0
                        ? "bg-stone-50 font-medium text-stone-700"
                        : "text-stone-600"
                    }`}
                  >
                    {String(row[columnIndex] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(rows.length > 300 || columnCount >= 60) && (
        <p className="shrink-0 border-t border-stone-100 px-3 py-2 text-[11px] text-stone-400">
          {tt("预览显示前 300 行、60 列；下载原文件可查看全部内容。")}
        </p>
      )}
    </div>
  );
}

function DocumentViewer({
  item,
  onResourceError,
}: {
  item: LibraryItem;
  onResourceError?: () => void;
}) {
  const tt = useUI();
  const ext = extension(item.url);
  const packageKind = officePackageKindForItem(item);
  const isDocx = packageKind === "docx" || ext === "docx";
  const isPdf = item.artifactType === "pdf" || ext === "pdf";
  const viewerMediaType = String(
    item.meta.viewer_media_type || item.meta.content_type || "",
  ).toLowerCase();
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(isDocx);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!item.url || !isDocx) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const { arrayBuffer } = await fetchValidatedOfficePackage(
          item.url!,
          "docx",
          {
            maxBytes: 64 * 1024 * 1024,
            onAccessDenied: onResourceError,
          },
        );
        const module = await import("mammoth");
        const result = await module.default.convertToHtml(
          { arrayBuffer },
          { convertImage: module.default.images.dataUri },
        );
        if (!cancelled) setHtml(DOMPurify.sanitize(result.value));
      } catch (reason) {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, isDocx, item.url, onResourceError]);

  useEffect(() => {
    if (!isDocx) {
      setHtml("");
      setError("");
      setLoading(false);
    }
  }, [isDocx]);

  if (isPdf && item.url && viewerMediaType.startsWith("image/")) {
    return (
      <Center>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.url}
          alt={item.title}
          referrerPolicy="no-referrer"
          className="max-h-[72vh] max-w-full rounded-xl object-contain shadow-sm"
        />
      </Center>
    );
  }
  if (isPdf && item.url) {
    if (!isSandboxExemptPdfFrameUrl(item.url)) {
      // 拒绝时不给「打开原文件」链接：顶层导航到 *.oceanleo.com 上的敌手页面是
      // 隔离文档 §4.3 点名的最危险形态，比免沙箱 frame 更糟。
      return (
        <ErrorView
          message={tt(
            "这个 PDF 的地址不在第一方渲染网关白名单内，已拒绝在免沙箱预览框中打开。",
          )}
        />
      );
    }
    return (
      // sandbox-exempt: pdf-plugin —— 见 editor-sandbox-origin 的豁免说明。
      // 免沙箱成立的前提由上面的 isSandboxExemptPdfFrameUrl() 主机白名单提供。
      <iframe
        src={item.url}
        title={item.title}
        referrerPolicy="no-referrer"
        className="h-full min-h-[560px] w-full border-0 bg-stone-100"
      />
    );
  }
  if (loading) return <LoadingView label={tt("正在读取 Word 文档…")} />;
  if (html) {
    return (
      <article
        className="prose prose-stone mx-auto min-h-[520px] max-w-3xl bg-white px-8 py-10 text-[14px] leading-relaxed shadow-sm"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  /**
   * `item.content` 是「正文」的最后一条来路，而它也可能是被按文本读出来的二进制
   * （docx/pdf 字节）。那种内容进 `Markdown` 就是一屏乱码，所以先判它是不是文字。
   */
  if (item.content && !isDocx && isDisplayableText(item.content)) {
    return (
      <article className="mx-auto min-h-[520px] max-w-3xl bg-white px-8 py-10 shadow-sm">
        <Markdown>{item.content}</Markdown>
      </article>
    );
  }
  if (item.content && !isDocx) {
    return (
      <ErrorView
        message={tt(
          "这一件存的是文件字节，没有可直接显示的正文；下载原文件可以用对应的软件打开。",
        )}
        url={item.url}
      />
    );
  }
  return (
    <ErrorView
      message={`${tt("没有可显示的文档正文。")}${error ? `（${error}）` : ""}`}
      url={item.url}
      onRetry={
        isDocx
          ? () => {
              onResourceError?.();
              setAttempt((value) => value + 1);
            }
          : undefined
      }
    />
  );
}

function ThreeDViewer({
  item,
  onResourceError,
}: {
  item: LibraryItem;
  onResourceError?: () => void;
}) {
  const tt = useUI();
  const subtype = threeDSubtypeFor(item);
  const modelUrl = item.url || "";
  const previewUrl = item.previewUrl || item.thumbUrl || "";
  const viewerMediaType = String(
    item.meta.viewer_media_type || item.meta.mime || "",
  ).toLowerCase();
  const modelFormat =
    ["glb", "gltf"].includes(extension(modelUrl)) ||
    ["model/gltf-binary", "model/gltf+json"].includes(
      viewerMediaType,
    );
  const [ready, setReady] = useState(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.customElements?.get("model-viewer")),
  );
  const [loadError, setLoadError] = useState("");
  const viewerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (subtype !== "model" || !modelFormat || ready || typeof window === "undefined") {
      return;
    }
    let alive = true;
    void import("@google/model-viewer")
      .then(() => {
        if (alive) setReady(Boolean(window.customElements?.get("model-viewer")));
      })
      .catch((reason) => {
        if (alive)
          setLoadError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      alive = false;
    };
  }, [modelFormat, ready, subtype]);
  // 依赖里刻意没有 `tt`：这个 effect 每次重跑都会 `setLoadError("")` 并把 model-viewer
  // 的 error/load 监听拆了重挂——语言换一次就把已经报出来的失败擦掉一次。文案只存中文
  // 原文（词典 key），或 model-viewer 自己给的英文 detail，翻译推迟到渲染（`tt(loadError)`）。
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || subtype !== "model") return;
    setLoadError("");
    const failed = (event: Event) => {
      const detail = (event as Event & {
        detail?: { message?: string; type?: string };
      }).detail;
      setLoadError(
        detail?.message || detail?.type || "模型文件或其依赖资源加载失败",
      );
      onResourceError?.();
    };
    const loaded = () => setLoadError("");
    viewer.addEventListener("error", failed);
    viewer.addEventListener("load", loaded);
    return () => {
      viewer.removeEventListener("error", failed);
      viewer.removeEventListener("load", loaded);
    };
  }, [modelUrl, onResourceError, subtype, ready]);
  if (subtype === "hdri" || subtype === "texture") {
    const label =
      subtype === "hdri"
        ? tt("HDRI 环境光照素材")
        : tt("3D 纹理贴图素材");
    return (
      <Center>
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={item.title}
            referrerPolicy="no-referrer"
            className="max-h-[64vh] max-w-full rounded-xl object-contain shadow-sm"
          />
        ) : (
          <div className="rounded-xl border border-stone-200 bg-stone-50 px-6 py-10 text-sm text-stone-400">
            {tt("没有可显示的预览图。")}
          </div>
        )}
        <p className="text-sm font-medium text-stone-700">{label}</p>
        <p className="max-w-lg text-center text-xs leading-relaxed text-stone-400">
          {subtype === "hdri"
            ? tt("它用于场景环境与照明，不是 mesh 模型，因此不会发送给 model-viewer。")
            : tt("它用于贴到模型表面，不是 mesh 模型，因此不会发送给 model-viewer。")}
        </p>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-600 hover:bg-stone-50"
          >
            {tt("打开原素材")}
          </a>
        )}
      </Center>
    );
  }
  if (subtype === "model" && !modelFormat && previewUrl) {
    return (
      <Center>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt={item.title}
          referrerPolicy="no-referrer"
          className="max-h-[64vh] max-w-full rounded-xl object-contain shadow-sm"
        />
        <p className="text-sm text-stone-500">
          {tt("当前展示已验证的模型预览；编辑时会加载固定 revision 的完整模型。")}
        </p>
      </Center>
    );
  }
  if (subtype !== "model" || !modelFormat) {
    return (
      <ErrorView
        message={tt("这个 3D 条目不是可加载的 GLB/已整包托管 glTF 模型。")}
        url={item.url}
      />
    );
  }
  if (!modelUrl) return <ErrorView message={tt("没有 3D 模型文件。")} />;
  if (loadError)
    return (
      <ErrorView
        message={`${tt("3D 查看器加载失败。")}（${tt(loadError)}）`}
        url={modelUrl}
      />
    );
  if (!ready) return <LoadingView label={tt("正在加载 3D 查看器…")} />;
  return (
    <div className="h-full min-h-[520px] bg-[radial-gradient(circle_at_50%_0%,#e0f2fe,transparent_60%)]">
      {createElement("model-viewer", {
        ref: (node: HTMLElement | null) => {
          viewerRef.current = node;
        },
        src: modelUrl,
        poster: item.thumbUrl,
        "camera-controls": true,
        "auto-rotate": true,
        "shadow-intensity": "1",
        exposure: "1",
        style: { width: "100%", height: "100%", minHeight: 520 },
      })}
    </div>
  );
}

function XiaohongshuViewer({ item }: { item: LibraryItem }) {
  const covers = [
    ...((Array.isArray(item.meta.images) ? item.meta.images : []) as unknown[]),
    item.url,
  ].filter((value): value is string => typeof value === "string" && Boolean(value));
  const candidateBody =
    item.content ||
    stringValue(item.meta.body) ||
    stringValue(item.meta.content) ||
    stringValue(item.meta.caption);
  // 正文位同样只收文字：读不成文字的内容一个字都不摆，宁可让这块留白。
  const body = isDisplayableText(candidateBody) ? candidateBody : "";
  return (
    <div className="flex min-h-[540px] justify-center bg-stone-100 p-5">
      <article className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-sm">
        {covers[0] && (
          <div className="aspect-[3/4] overflow-hidden bg-stone-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={covers[0]}
              alt={item.title}
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <div className="p-4">
          <h2 className="text-[17px] font-semibold leading-snug text-stone-900">
            {item.title}
          </h2>
          <div className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-stone-700">
            {body}
          </div>
        </div>
      </article>
    </div>
  );
}

function VideoCanvasViewer({ item }: { item: LibraryItem }) {
  const clips =
    asRecords(item.meta.timeline).length > 0
      ? asRecords(item.meta.timeline)
      : asRecords(item.meta.clips);
  const mediaUrl =
    stringValue(item.meta.video_url) ||
    stringValue(item.meta.preview_url) ||
    (["mp4", "webm", "mov", "m4v"].includes(extension(item.url))
      ? item.url
      : "");
  if (
    clips.length === 0 &&
    item.url &&
    /^https?:\/\//i.test(item.url) &&
    !["mp4", "webm", "mov", "m4v", "mkv"].includes(extension(item.url))
  ) {
    // 域名后缀不构成信任依据：预览/UGC 主机（oceanleo.app 全域与迁移期残留的
    // *.website.oceanleo.com 预览域）跑的是用户代码，绝不授予 allow-same-origin。
    const trustedInteractive =
      item.siteId === "asset" &&
      item.meta.asset_type === "video_workflow" &&
      isTrustedInteractiveViewerUrl(item.url);
    return (
      <SandboxedWebViewer
        url={item.url}
        title={item.title}
        trustedInteractive={trustedInteractive}
      />
    );
  }
  return (
    <div className="flex min-h-[520px] flex-col bg-[#151515] text-white">
      <div className="min-h-0 flex-1 p-4">
        {mediaUrl ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={mediaUrl}
            controls
            className="mx-auto h-full max-h-[380px] max-w-full rounded-lg bg-black"
          />
        ) : (
          <div className="grid h-full min-h-64 place-items-center rounded-lg border border-white/10 bg-black/40 text-sm text-white/40">
            视频预览
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-white/10 bg-[#202020] p-3">
        <div className="mb-2 flex items-center justify-between text-[11px] text-white/40">
          <span>时间线</span>
          <span>{clips.length} 个片段</span>
        </div>
        <div className="flex min-h-20 gap-1 overflow-x-auto">
          {(clips.length ? clips : [{ title: "完整视频" }]).map((clip, index) => (
            <div
              key={String(clip.id || index)}
              className="min-w-28 rounded-md border border-white/10 bg-white/5 p-2"
            >
              <p className="truncate text-[11px] text-white/80">
                {stringValue(clip.title) ||
                  stringValue(clip.label) ||
                  `片段 ${index + 1}`}
              </p>
              <p className="mt-1 text-[10px] text-white/30">
                {stringValue(clip.duration) || stringValue(clip.time) || "—"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 类型分发的只读查看器。3D 可拖拽转角度、website 在沙箱 iframe 里可交互、文档可
 * 翻页——全部由下面的分支复用现成 viewer，本层不新造渲染路径。
 */
export function LibraryItemViewer({
  item,
  accent,
}: {
  item: LibraryItem;
  accent?: string;
}) {
  const gate = useVisibleViewerGate(!libraryViewerIsHeavy(item));
  if (!gate.ready) {
    return <ViewerThumbPoster item={item} containerRef={gate.ref} />;
  }
  return <LibraryItemDetailTarget item={item} accent={accent} />;
}

/**
 * 官方模板目录行在**详情**里先换成 durable 投影，再进下面的类型分派。
 *
 * 卡片不经过这里：卡片读的是目录行自己的封面图（`material-library-template-source`
 * 的 `kind: "image"` + OSS 预览图），那是既定产品决定，本改动一个字节没动它。
 * 其余条目 `passthrough`，一步取数都不发。
 */
function LibraryItemDetailTarget({
  item,
  accent,
}: {
  item: LibraryItem;
  accent?: string;
}) {
  const tt = useUI();
  const target = useMaterialDetailTarget(item);
  if (target.status === "resolving") {
    return <LoadingView label={tt("正在打开这份素材…")} />;
  }
  if (target.status === "unavailable") {
    return (
      <MaterialDetailUnavailable
        item={target.item}
        message={target.message}
        needsSignIn={target.needsSignIn}
        onRetry={target.retry}
      />
    );
  }
  return <LibraryItemViewerBody item={target.item} accent={accent} />;
}

function LibraryItemViewerBody({
  item,
}: {
  item: LibraryItem;
  accent?: string;
}) {
  const preparedOffice = usePreparedOfficeLibraryItem(item);
  const viewerItem = preparedOffice.item;
  const rendition = useArtifactRendition(
    viewerItem,
    officeViewerRenditionPurposes(viewerItem),
  );
  const resolvedItem = withResolvedRendition(viewerItem, rendition);
  const url =
    rendition.url || resolvedItem.previewUrl || resolvedItem.url;
  if (preparedOffice.loading) {
    return (
      <ArtifactRenditionFailure
        message="正在签发文档源访问地址…"
        loading
        onRetry={() => undefined}
      />
    );
  }
  if (preparedOffice.error) {
    return (
      <ArtifactRenditionFailure
        message={preparedOffice.error}
        onRetry={() => undefined}
      />
    );
  }
  if (
    isDurableLibraryItem(viewerItem) &&
    (rendition.error || (!url && rendition.loading))
  ) {
    return (
      <ArtifactRenditionFailure
        message={rendition.error || "当前 revision 没有可用 rendition。"}
        loading={rendition.loading}
        onRetry={rendition.retry}
      />
    );
  }
  /**
   * 游戏走独立的「开玩」通路，不进任何文档/图片查看器：它的 `full` rendition 是
   * game-bundle JSON，喂给下面任何一支都只会渲出一坨源码或一句失败。
   *
   * 默认给落点面板（跳 W7 的 `/play/artifact/…`）；只有 game 站显式声明了可内嵌的
   * 播放地址时才就地内嵌，沙箱一律走 `SandboxedWebViewer` 的不可信档
   * （`webViewerFrameSandbox(false)`，不含同源授权）——用户自制游戏的隔离域判定在
   * 播放页自己那一层，这里不新增也不放松任何一项授权。
   */
  if (resolvedItem.kind === "game") {
    const embed = gamePlayEmbedHref(resolvedItem);
    return embed ? (
      <SandboxedWebViewer url={embed} title={resolvedItem.title} />
    ) : (
      <GamePlayDetail item={resolvedItem} />
    );
  }
  if (resolvedItem.kind === "website") {
    // 网站详情要的是页面本身，不是卡片那张封面 webp，所以承载自己按
    // `["full","preview"]` 取 rendition（W3；接入约定见 tasks/W1-viewer-slot.md §4.3）。
    return <WebsiteArtifactViewer item={resolvedItem} />;
  }
  if (resolvedItem.kind === "canvas") {
    /**
     * 画布的 rendition 也可能是 JSON 工程信封或打包字节。把它塞进 frame，浏览器
     * 会把它当纯文本铺满一屏——那就是「拿不到可显示本体时摆原始字节」。这一档改走
     * 结构化快照，读不出快照时由它自己落到空状态。
     */
    const framable =
      websiteFrameAdmission(rendition.rendition?.mediaType) !== "opaque-bytes";
    return url && framable ? (
      <SandboxedWebViewer url={url} title={resolvedItem.title} />
    ) : (
      <StructuredCanvas item={resolvedItem} />
    );
  }
  if (resolvedItem.kind === "ppt")
    return (
      <PptViewer
        item={resolvedItem}
        onResourceError={rendition.resourceFailed}
      />
    );
  if (resolvedItem.kind === "sheet")
    return (
      <SpreadsheetViewer
        item={resolvedItem}
        onResourceError={rendition.resourceFailed}
      />
    );
  if (resolvedItem.kind === "document" || resolvedItem.kind === "file")
    return (
      <DocumentViewer
        item={resolvedItem}
        onResourceError={rendition.resourceFailed}
      />
    );
  if (resolvedItem.kind === "video_canvas")
    return <VideoCanvasViewer item={resolvedItem} />;
  if (resolvedItem.kind === "xhs")
    return <XiaohongshuViewer item={resolvedItem} />;
  if (resolvedItem.kind === "threed")
    return (
      <ThreeDViewer
        item={resolvedItem}
        onResourceError={rendition.resourceFailed}
      />
    );
  /**
   * 两个新载体的查看器：只看渲出的 `preview` 位图。
   *
   * 它们的 `full` rendition 是 JSON 工程信封，**MUST NOT** 送进
   * `SandboxedWebViewer` 当 HTML 打开（ADR-04：热 HTML 不得冒充素材），也
   * **MUST NOT** 落到下面 `DocumentViewer` 那条把 JSON 当富文本渲染。可交互的
   * 图面与重算联动由 `GeoMapRoute` / `InteractiveDocRoute` 承担，不在查看器里。
   */
  if (
    resolvedItem.kind === "geo_map" ||
    resolvedItem.kind === "interactive_doc"
  ) {
    const poster = resolvedItem.previewUrl || resolvedItem.thumbUrl || "";
    return poster ? (
      <Center>
        <ProgressiveArtifactImage
          thumbUrl={resolvedItem.thumbUrl || ""}
          fullUrl={poster}
          alt={resolvedItem.title}
          onError={rendition.resourceFailed}
        />
      </Center>
    ) : (
      <ErrorView
        message={
          resolvedItem.kind === "geo_map"
            ? "这张地图还没有渲出预览图；打开地图编辑器可从工程源重新渲染。"
            : "这份交互文档还没有渲出预览图；打开交互文档编辑器可从工程源重新渲染。"
        }
        url={resolvedItem.url}
      />
    );
  }
  if (resolvedItem.kind === "image" && url) {
    return (
      <Center>
        <ProgressiveArtifactImage
          thumbUrl={resolvedItem.thumbUrl || ""}
          fullUrl={url}
          alt={resolvedItem.title}
          onError={rendition.resourceFailed}
        />
      </Center>
    );
  }
  if (resolvedItem.kind === "video" && url) {
    return (
      <Center>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          src={url}
          controls
          onError={rendition.resourceFailed}
          className="max-h-[70vh] max-w-full rounded-lg bg-black"
        />
      </Center>
    );
  }
  if (resolvedItem.kind === "audio" && url) {
    return (
      <Center>
        <div className="grid h-20 w-20 place-items-center rounded-3xl bg-stone-100 text-stone-400">
          <svg
            className="h-9 w-9"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          >
            <path d="M9 18V6l11-2v12M9 8l11-2" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="17" cy="16" r="3" />
          </svg>
        </div>
        <p className="text-sm font-medium text-stone-700">
          {resolvedItem.title}
        </p>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio
          src={url}
          controls
          onError={rendition.resourceFailed}
          className="w-full max-w-md"
        />
      </Center>
    );
  }
  return (
    <ErrorView
      message="这个内容还没有可用的查看器数据。"
      url={resolvedItem.url}
    />
  );
}

export function libraryKindLabel(kind: LibraryItem["kind"]): string {
  return {
    website: "网站",
    canvas: "画布",
    ppt: "PPT",
    sheet: "Excel",
    document: "文档",
    image: "图片",
    video: "视频",
    video_canvas: "视频工作流",
    audio: "音频",
    xhs: "小红书",
    threed: "3D",
    game: "游戏",
    geo_map: "地图",
    interactive_doc: "交互文档",
    file: "文件",
  }[kind];
}

export function LibraryKindIcon({
  kind,
  className = "h-5 w-5",
}: {
  kind: LibraryItem["kind"];
  className?: string;
}) {
  const path = useMemo(
    () =>
      ({
        website: "M3 5h18v14H3zM3 9h18M6 7h.01M9 7h.01",
        canvas: "M4 4h6v6H4zM14 4h6v6h-6zM9 14h6v6H9zM10 7h4M7 10l3 4M17 10l-3 4",
        ppt: "M4 4h16v12H4zM8 20h8M12 16v4M8 12V8h3a2 2 0 010 4H8z",
        sheet: "M5 3h14v18H5zM5 8h14M5 13h14M10 8v13M15 8v13",
        document: "M6 3h8l4 4v14H6zM14 3v5h5M9 12h6M9 16h6",
        image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M8 9h.01",
        video: "M4 6h12v12H4zM16 10l4-2v8l-4-2z",
        video_canvas: "M3 5h18v11H3zM7 20v-4M17 20v-4M5 20h14M8 9l3 2-3 2zM13 9h5",
        audio: "M9 18V6l11-2v12M9 8l11-2M6 21a3 3 0 100-6 3 3 0 000 6zM17 19a3 3 0 100-6 3 3 0 000 6z",
        xhs: "M6 3h12v18H6zM9 8h6M9 12h6M9 16h4",
        threed: "M12 2l9 5v10l-9 5-9-5V7zM12 12l9-5M12 12v10M12 12L3 7",
        game: "M7 9h10a4 4 0 014 4v1a3 3 0 01-5.4 1.8L14 14h-4l-1.6 1.8A3 3 0 013 14v-1a4 4 0 014-4zM7 11v3M5.5 12.5h3M16 12h.01M18 14h.01",
        // 折叠地图 + 定位针：与 `canvas`（矩形分栏）和 `image`（山景）都不同形，
        // 两个新类型在卡片列表里必须一眼分得开。
        geo_map: "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14M12 9a2 2 0 100 4 2 2 0 000-4z",
        // 文档纸 + 滑杆 + 结果卡：图形本身说明「可调参数、会重算」，
        // 与 `document` 的纯横线纸区分（`interactive-doc.md` §1.3 的分工）。
        interactive_doc: "M6 3h9l3 3v15H6zM15 3v4h3M9 11h6M9 15h2M12 15h.01M14 15a2 2 0 104 0 2 2 0 00-4 0M9 19h9",
        file: "M6 3h8l4 4v14H6zM14 3v5h5",
      })[kind],
    [kind],
  );
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}
