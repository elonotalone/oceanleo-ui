"use client";

import {
  createElement,
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
import {
  ArtifactRenditionFailure,
  useArtifactRendition,
  withResolvedRendition,
} from "./ArtifactRendition";

function extension(url?: string): string {
  const match = /\.([a-z0-9]+)(?:$|[?#])/i.exec(url || "");
  return match?.[1]?.toLowerCase() || "";
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
}: {
  message: string;
  url?: string;
}) {
  const tt = useUI();
  return (
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
    </Center>
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
        sandbox={`allow-scripts allow-forms allow-popups allow-downloads${
          trustedInteractive ? " allow-same-origin" : ""
        }`}
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

function PptViewer({
  item,
  onResourceError,
}: {
  item: LibraryItem;
  onResourceError?: () => void;
}) {
  const tt = useUI();
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">(
    item.url ? "loading" : "error",
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (!item.url || !host.current) return;
    let cancelled = false;
    let previewer: { destroy: () => void } | null = null;
    const node = host.current;
    node.replaceChildren();
    setState("loading");
    setError("");
    void (async () => {
      try {
        const response = await fetch(item.url!, {
          referrerPolicy: "no-referrer",
        });
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            onResourceError?.();
          }
          throw new Error(`HTTP ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        if (cancelled) return;
        const { init } = await import("pptx-preview");
        if (cancelled) return;
        const width = Math.max(
          320,
          Math.min(1100, node.getBoundingClientRect().width || 900),
        );
        previewer = init(node, {
          mode: "slide",
          width,
          height: Math.round((width * 9) / 16),
        });
        await (
          previewer as unknown as { preview: (file: ArrayBuffer) => Promise<unknown> }
        ).preview(buffer);
        if (!cancelled) setState("ready");
      } catch (reason) {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : String(reason));
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
      previewer?.destroy();
      node.replaceChildren();
    };
  }, [item.url, onResourceError]);

  const slides = asRecords(item.meta.slides);
  return (
    <div className="relative min-h-[520px] overflow-auto bg-stone-100 p-3">
      {state === "loading" && (
        <div className="absolute inset-0 z-10 bg-white">
          <LoadingView label={tt("正在解析 PPT…")} />
        </div>
      )}
      <div ref={host} className={state === "ready" ? "mx-auto" : "hidden"} />
      {state === "error" &&
        (slides.length > 0 ? (
          <StructuredSlides slides={slides} />
        ) : (
          <ErrorView
            message={`${tt("PPT 在线解析失败，可打开原文件。")}${error ? `（${error}）` : ""}`}
            url={item.url}
          />
        ))}
    </div>
  );
}

function StructuredSlides({
  slides,
}: {
  slides: Record<string, unknown>[];
}) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      {slides.map((slide, index) => {
        const bullets = Array.isArray(slide.bullets)
          ? slide.bullets.map(String)
          : [];
        return (
          <article
            key={String(slide.id || index)}
            className="relative aspect-video overflow-hidden rounded-lg bg-white p-[7%] shadow"
          >
            <span className="absolute right-4 top-3 text-[10px] text-stone-300">
              {index + 1} / {slides.length}
            </span>
            <h3 className="max-w-[85%] text-[clamp(18px,3vw,34px)] font-semibold leading-tight text-stone-900">
              {stringValue(slide.title) || `第 ${index + 1} 页`}
            </h3>
            {bullets.length > 0 && (
              <ul className="mt-[6%] space-y-[2%] text-[clamp(12px,1.7vw,20px)] leading-relaxed text-stone-600">
                {bullets.map((bullet, bulletIndex) => (
                  <li key={bulletIndex} className="flex gap-3">
                    <span>•</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        );
      })}
    </div>
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
        const response = await fetch(item.url!, {
          referrerPolicy: "no-referrer",
        });
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            onResourceError?.();
          }
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.arrayBuffer();
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
  }, [item.url, item.meta, onResourceError]);

  if (loading) return <LoadingView label={tt("正在读取工作簿…")} />;
  if (error || sheets.length === 0)
    return (
      <ErrorView
        message={`${tt("未能读取表格内容。")}${error ? `（${error}）` : ""}`}
        url={item.url}
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
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(ext === "docx");

  useEffect(() => {
    if (!item.url || ext !== "docx") return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const response = await fetch(item.url!, {
          referrerPolicy: "no-referrer",
        });
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            onResourceError?.();
          }
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.arrayBuffer();
        const module = await import("mammoth");
        const result = await module.default.convertToHtml(
          { arrayBuffer: data },
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
  }, [item.url, ext, onResourceError]);

  if (ext === "pdf" && item.url) {
    return (
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
  if (item.content) {
    return (
      <article className="mx-auto min-h-[520px] max-w-3xl bg-white px-8 py-10 shadow-sm">
        <Markdown>{item.content}</Markdown>
      </article>
    );
  }
  return (
    <ErrorView
      message={`${tt("没有可显示的文档正文。")}${error ? `（${error}）` : ""}`}
      url={item.url}
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
  const modelFormat =
    ["glb", "gltf"].includes(extension(modelUrl)) ||
    ["model/gltf-binary", "model/gltf+json"].includes(
      String(item.meta.mime || "").toLowerCase(),
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
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || subtype !== "model") return;
    setLoadError("");
    const failed = (event: Event) => {
      const detail = (event as Event & {
        detail?: { message?: string; type?: string };
      }).detail;
      setLoadError(
        detail?.message || detail?.type || tt("模型文件或其依赖资源加载失败"),
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
  }, [modelUrl, onResourceError, subtype, tt, ready]);
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
        message={`${tt("3D 查看器加载失败。")}（${loadError}）`}
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
  const body =
    item.content ||
    stringValue(item.meta.body) ||
    stringValue(item.meta.content) ||
    stringValue(item.meta.caption);
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
    let trustedInteractive = false;
    try {
      const hostname = new URL(item.url).hostname.toLowerCase();
      trustedInteractive =
        item.siteId === "asset" &&
        item.meta.asset_type === "video_workflow" &&
        (hostname === "oceanleo.com" || hostname.endsWith(".oceanleo.com"));
    } catch {
      trustedInteractive = false;
    }
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

export function LibraryItemViewer({
  item,
}: {
  item: LibraryItem;
  accent?: string;
}) {
  const rendition = useArtifactRendition(item);
  const resolvedItem = withResolvedRendition(item, rendition);
  const url =
    rendition.url || resolvedItem.previewUrl || resolvedItem.url;
  if (
    isDurableLibraryItem(item) &&
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
  if (resolvedItem.kind === "website") {
    return url ? (
      <SandboxedWebViewer url={url} title={resolvedItem.title} />
    ) : (
      <ErrorView message="没有可打开的网站预览地址。" />
    );
  }
  if (resolvedItem.kind === "canvas") {
    return url ? (
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
  if (resolvedItem.kind === "image" && url) {
    return (
      <Center>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={resolvedItem.title}
          onError={rendition.resourceFailed}
          referrerPolicy="no-referrer"
          className="max-h-[70vh] max-w-full rounded-lg object-contain"
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
