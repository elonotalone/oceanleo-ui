"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getDatabaseOverview,
  saveWorks,
  type MediaType,
  type WorkItem,
} from "../lib/database";
import { useUI } from "../i18n/ui/useUI";
import { AdvancedAgentPanel } from "./AdvancedAgentPanel";
import {
  ImageWorkbenchCanvas,
  ImageWorkbenchControls,
  useImageWorkbench,
} from "./AdvancedImageEditor";
import {
  SheetWorkbenchCanvas,
  SheetWorkbenchControls,
  TextWorkbenchCanvas,
  TextWorkbenchControls,
  useSheetWorkbench,
  useTextWorkbench,
} from "./AdvancedStructuredEditors";
import type { LibraryItem, LibraryKind } from "./library-data";
import { LibraryItemViewer, libraryKindLabel } from "./library-viewers";

type WorkbenchTool =
  | "agent"
  | "edit"
  | "specialist"
  | "preview"
  | "info"
  | "versions"
  | "export";

export interface AdvancedContentWorkbenchProps {
  item: LibraryItem;
  previewContent?: ReactNode;
  linkUrl?: string;
  taskId?: string | null;
  siteId?: string;
  accent?: string;
  onClose: () => void;
}

function mediaType(kind: LibraryKind): MediaType {
  const map: Partial<Record<LibraryKind, MediaType>> = {
    website: "website",
    canvas: "canvas",
    ppt: "ppt",
    sheet: "sheet",
    document: "doc",
    image: "image",
    video: "video",
    video_canvas: "video_canvas",
    audio: "audio",
    xhs: "xhs",
    threed: "model3d",
  };
  return map[kind] || "other";
}

function withAsset(base: string, item: LibraryItem): string {
  const url = new URL(base);
  const source = item.url || item.previewUrl || "";
  if (source) url.searchParams.set("assetUrl", source);
  url.searchParams.set("assetTitle", item.title);
  url.searchParams.set("assetKind", item.kind);
  return url.toString();
}

function specialistUrl(item: LibraryItem): string {
  const isPdf =
    item.meta.mime === "application/pdf" ||
    /\.pdf(?:[?#]|$)/i.test(item.url || item.previewUrl || "");
  switch (item.kind) {
    case "image":
    case "xhs":
      return withAsset(
        "https://design.oceanleo.com/workspace?embed=1&solo=1&fn=editor",
        item,
      );
    case "video_canvas":
      return withAsset(
        "https://video.oceanleo.com/canvas-board?embed=1&solo=1",
        item,
      );
    case "video":
    case "audio":
      return withAsset(
        "https://video.oceanleo.com/workspace?embed=1&solo=1&fn=clip-editor",
        item,
      );
    case "website":
      {
        const websiteId = [
          item.meta.website_id,
          item.meta.site_id,
          item.meta.project_id,
        ].find((value) => typeof value === "string" && value.trim());
        if (typeof websiteId === "string") {
          return withAsset(
            `https://website.oceanleo.com/sites/${encodeURIComponent(websiteId)}?embed=1`,
            item,
          );
        }
      }
      return withAsset(
        "https://website.oceanleo.com/workspace?embed=1&solo=1",
        item,
      );
    case "canvas":
      return withAsset(
        item.siteId === "video"
          ? "https://video.oceanleo.com/canvas-board?embed=1&solo=1"
          : "https://design.oceanleo.com/workspace?embed=1&solo=1&fn=editor",
        item,
      );
    case "ppt":
      return withAsset(
        "https://slide.oceanleo.com/workspace?embed=1&solo=1",
        item,
      );
    case "sheet":
      return withAsset(
        "https://excel.oceanleo.com/workspace?embed=1&solo=1",
        item,
      );
    case "document":
      return withAsset(
        isPdf
          ? "https://converter.oceanleo.com/workspace?embed=1&solo=1&fn=pdf-to-word"
          : "https://word.oceanleo.com/workspace?embed=1&solo=1",
        item,
      );
    case "threed":
      return withAsset(
        "https://3d.oceanleo.com/workspace?embed=1&solo=1",
        item,
      );
    default:
      return "";
  }
}

function ToolIcon({ tool }: { tool: WorkbenchTool }) {
  const paths: Record<WorkbenchTool, ReactNode> = {
    agent: <><path d="M12 3v3M5.6 5.6l2.1 2.1M3 12h3M18 12h3M16.3 7.7l2.1-2.1" /><rect x="6" y="7" width="12" height="12" rx="4" /><path d="M9.5 13h.01M14.5 13h.01M9.5 16h5" /></>,
    edit: <><path d="M4 20l4.2-1 10.4-10.4a2 2 0 00-2.8-2.8L5.4 16.2 4 20z" /><path d="M14.5 7.1l2.8 2.8" /></>,
    specialist: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 4v16M12 9h6M12 13h6M12 17h4" /></>,
    preview: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" /><circle cx="12" cy="12" r="2.5" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
    versions: <><path d="M4 7h11a5 5 0 010 10H8" /><path d="M8 13l-4 4 4 4M8 3v8" /></>,
    export: <><path d="M12 3v12M8 7l4-4 4 4" /><path d="M5 13v7h14v-7" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5" strokeLinecap="round" strokeLinejoin="round">
      {paths[tool]}
    </svg>
  );
}

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border-b border-stone-100 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-stone-400">{label}</dt>
      <dd className="mt-0.5 break-words text-[12px] text-stone-700">{value || "—"}</dd>
    </div>
  );
}

export function AdvancedContentWorkbench({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const tt = useUI();
  const editor = useImageWorkbench(item, siteId);
  const textEditor = useTextWorkbench(item, siteId);
  const sheetEditor = useSheetWorkbench(item, siteId);
  const specialist = useMemo(() => specialistUrl(item), [item]);
  const itemUrl = item.url || item.previewUrl || "";
  const isPdf =
    item.meta.mime === "application/pdf" || /\.pdf(?:[?#]|$)/i.test(itemUrl);
  const hasInlineText =
    Boolean(item.content?.trim()) ||
    ["content", "text", "markdown", "source"].some(
      (key) => typeof item.meta[key] === "string" && String(item.meta[key]).trim(),
    );
  const textNative =
    !isPdf &&
    (hasInlineText ||
      (!itemUrl && (item.kind === "document" || item.kind === "file")) ||
      /\.(?:txt|md|markdown|json|html?|css|js|ts)(?:[?#]|$)/i.test(itemUrl));
  const sheetNative =
    item.kind === "sheet" &&
    (hasInlineText || !itemUrl || /\.csv(?:[?#]|$)/i.test(itemUrl));
  const nativeEditor = item.kind === "image" || textNative || sheetNative;
  const [activeTool, setActiveTool] = useState<WorkbenchTool>("agent");
  const [stage, setStage] = useState<"preview" | "edit">(
    item.kind === "image" ? "edit" : "preview",
  );
  const [panelWidth, setPanelWidth] = useState(330);
  const [embedState, setEmbedState] = useState("");
  const [copyState, setCopyState] = useState("");
  const [versions, setVersions] = useState<WorkItem[]>([]);
  const [versionRevision, setVersionRevision] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const instanceId = useRef(
    `wb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
  );

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    void getDatabaseOverview({ limit: 300 }).then((result) => {
      if (!alive || !result.ok) return;
      const related = (result.data?.works || []).filter((work) => {
        const parent = String(work.meta?.parent_asset_id || "");
        return String(work.id) === item.id || parent === item.id;
      });
      setVersions(related);
    });
    return () => {
      alive = false;
    };
  }, [
    editor.savedUrl,
    item.id,
    sheetEditor.saveRevision,
    textEditor.saveRevision,
    versionRevision,
  ]);

  useEffect(() => {
    if (!specialist) return;
    const origin = new URL(specialist).origin;
    const receive = (event: MessageEvent) => {
      if (event.origin !== origin || !event.data || typeof event.data !== "object") return;
      const data = event.data as Record<string, unknown>;
      if (
        data.protocol !== "oceanleo.editor.v1" ||
        data.instanceId !== instanceId.current
      ) return;
      if (data.type === "ready") setEmbedState(tt("专业编辑器已就绪"));
      if (data.type === "dirty") setEmbedState(tt("有未保存的修改"));
      if (data.type === "error") setEmbedState(String(data.message || tt("编辑器发生错误")));
      if (
        (data.type === "artifact-created" || data.type === "artifact-updated") &&
        typeof data.url === "string"
      ) {
        void saveWorks(siteId || "oceanleo", [{
          url: data.url,
          thumb_url: typeof data.previewUrl === "string" ? data.previewUrl : data.url,
          media_type: mediaType(item.kind),
          title: typeof data.title === "string" ? data.title : `${item.title}-编辑版`,
          kind: item.kind,
          meta: { parent_asset_id: item.id, editor_instance: instanceId.current },
        }])
          .then((result) => {
            setEmbedState(
              result.ok
                ? tt("新版本已保存到我的库")
                : result.error || tt("新版本登记失败"),
            );
            if (result.ok) setVersionRevision((value) => value + 1);
          })
          .catch((caught) =>
            setEmbedState(
              caught instanceof Error ? caught.message : tt("新版本登记失败"),
            ),
          );
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [item, siteId, specialist, tt]);

  function sendOpenMessage() {
    if (!specialist || !iframeRef.current?.contentWindow) return;
    const origin = new URL(specialist).origin;
    iframeRef.current.contentWindow.postMessage(
      {
        protocol: "oceanleo.editor.v1",
        type: "open-asset",
        instanceId: instanceId.current,
        asset: {
          id: item.id,
          kind: item.kind,
          title: item.title,
          url: item.url,
          previewUrl: item.previewUrl,
          meta: item.meta,
          writable: !(
            item.siteId === "asset" ||
            item.key.startsWith("asset:") ||
            item.meta.asset_id ||
            item.meta.platform_asset_id
          ),
        },
      },
      origin,
    );
    setEmbedState(tt("专业编辑器已打开"));
  }

  function chooseTool(tool: WorkbenchTool) {
    setActiveTool(tool);
    if (tool === "preview") setStage("preview");
    if (tool === "edit" || tool === "specialist") setStage("edit");
  }

  function beginResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = panelWidth;
    const move = (next: PointerEvent) =>
      setPanelWidth(Math.min(560, Math.max(260, startWidth + next.clientX - startX)));
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  async function saveCopy() {
    const url = item.url || item.previewUrl;
    if (!url) return;
    setCopyState(tt("保存中…"));
    try {
      const result = await saveWorks(siteId || "oceanleo", [{
        url,
        thumb_url: item.previewUrl || url,
        media_type: mediaType(item.kind),
        title: `${item.title}-副本`,
        kind: item.kind,
        meta: {
          parent_asset_id: item.id,
          source_site: item.siteId || "",
          copied_from: item.source || "library",
        },
      }]);
      setCopyState(result.ok ? tt("已保存到我的库") : result.error || tt("保存失败"));
      if (result.ok) setVersionRevision((value) => value + 1);
    } catch (caught) {
      setCopyState(caught instanceof Error ? caught.message : tt("保存失败"));
    }
  }

  const tools: { id: WorkbenchTool; label: string }[] = [
    { id: "agent", label: tt("Agent") },
    {
      id: "edit",
      label:
        item.kind === "image"
          ? tt("图片调整")
          : nativeEditor
            ? tt("编辑")
            : specialist
              ? tt("专业工具")
              : tt("处理"),
    },
    ...(nativeEditor && specialist
      ? [{ id: "specialist" as const, label: tt("专业画布") }]
      : []),
    { id: "preview", label: tt("预览") },
    { id: "info", label: tt("信息") },
    { id: "versions", label: tt("版本") },
    { id: "export", label: tt("导出") },
  ];

  let panel: ReactNode;
  if (activeTool === "agent") {
    panel = <AdvancedAgentPanel item={item} taskId={taskId} siteId={siteId} accent={accent} />;
  } else if (activeTool === "edit" && item.kind === "image") {
    panel = <ImageWorkbenchControls editor={editor} accent={accent} />;
  } else if (activeTool === "edit" && textNative) {
    panel = <TextWorkbenchControls editor={textEditor} accent={accent} />;
  } else if (activeTool === "edit" && sheetNative) {
    panel = <SheetWorkbenchControls editor={sheetEditor} accent={accent} />;
  } else if (activeTool === "edit" || activeTool === "specialist") {
    panel = (
      <div className="space-y-3 p-3 text-[12px] leading-relaxed text-stone-600">
        <p>{tt("当前内容会在右侧专业工作区中处理；保存的新版本会回到我的库，不覆盖原素材。")}</p>
        {embedState && <p className="rounded-lg bg-stone-100 px-3 py-2 text-stone-500">{embedState}</p>}
        {!specialist && <p className="text-amber-700">{tt("此类型目前提供统一查看、Agent 处理与导出。")}</p>}
      </div>
    );
  } else if (activeTool === "preview") {
    panel = <div className="p-3 text-[12px] leading-relaxed text-stone-600">{tt("右侧使用与预览、素材库和我的库完全相同的内容查看器。")}</div>;
  } else if (activeTool === "info") {
    panel = (
      <dl className="px-3 py-1">
        <MetaRow label={tt("类型")} value={tt(libraryKindLabel(item.kind))} />
        <MetaRow label={tt("来源")} value={String(item.meta.library_source || item.source || item.siteId || "")} />
        <MetaRow label={tt("格式")} value={String(item.meta.mime || item.meta.format || "")} />
        <MetaRow label={tt("创建时间")} value={item.createdAt ? new Date(item.createdAt).toLocaleString() : ""} />
        <MetaRow label={tt("标识")} value={item.id} />
      </dl>
    );
  } else if (activeTool === "versions") {
    panel = (
      <div className="space-y-3 p-3 text-[12px] leading-relaxed text-stone-600">
        <div className="rounded-xl border border-stone-200 bg-white p-3">
          <p className="font-medium text-stone-800">{tt("原始版本")}</p>
          <p className="mt-1 text-[11px] text-stone-400">{item.createdAt ? new Date(item.createdAt).toLocaleString() : tt("当前素材")}</p>
        </div>
        {versions.map((version, index) => (
          <a
            key={version.id}
            href={version.url}
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl border border-stone-200 bg-white p-3 transition hover:border-stone-300"
          >
            <p className="font-medium text-stone-800">
              {version.title || `${tt("编辑版本")} ${index + 1}`}
            </p>
            <p className="mt-1 text-[11px] text-stone-400">
              {version.created_at
                ? new Date(version.created_at).toLocaleString()
                : tt("已保存到我的库")}
            </p>
          </a>
        ))}
        <p>{tt("平台素材保持只读；首次保存会创建个人副本。之后每次专业编辑器保存都会写入新的版本记录。")}</p>
      </div>
    );
  } else {
    panel = (
      <div className="space-y-2 p-3">
        {item.kind !== "image" && (
          <button type="button" onClick={() => void saveCopy()} className="w-full rounded-xl px-3 py-2 text-[12px] font-semibold text-white" style={{ background: accent }}>
            {tt("保存副本到我的库")}
          </button>
        )}
        {(linkUrl || item.url || item.previewUrl) && (
          <a href={linkUrl || item.url || item.previewUrl} target="_blank" rel="noreferrer" className="block w-full rounded-xl border border-stone-200 px-3 py-2 text-center text-[12px] text-stone-600 hover:bg-stone-50">
            {tt("打开内容链接")}
          </a>
        )}
        {copyState && <p className="text-center text-[11px] text-stone-500">{copyState}</p>}
        <p className="pt-2 text-[11px] leading-relaxed text-stone-400">{tt("图片可直接选择格式并下载；其他类型由右侧专业编辑器提供其原生导出能力。")}</p>
      </div>
    );
  }

  const showSpecialist =
    activeTool === "specialist" || (stage === "edit" && !nativeEditor);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white text-stone-800">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-stone-200 px-3">
        <button type="button" onClick={onClose} className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[11px] text-stone-600 hover:bg-stone-50">
          ← {tt("返回")}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{item.title}</p>
          <p className="truncate text-[10px] text-stone-400">{tt("高级功能")} · {tt(libraryKindLabel(item.kind))}</p>
        </div>
        <span className="hidden text-[11px] text-stone-400 md:block">{embedState}</span>
        <button type="button" onClick={onClose} aria-label={tt("关闭")} className="grid h-8 w-8 place-items-center rounded-lg text-lg text-stone-400 hover:bg-stone-100">×</button>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-stone-200 bg-stone-50 py-2">
          {tools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => chooseTool(tool.id)}
              className={`group relative grid h-10 w-10 place-items-center rounded-xl transition ${
                activeTool === tool.id ? "bg-white shadow-sm" : "text-stone-400 hover:bg-white hover:text-stone-700"
              }`}
              style={activeTool === tool.id ? { color: accent } : undefined}
              aria-label={tool.label}
            >
              <ToolIcon tool={tool.id} />
              <span className="pointer-events-none absolute left-full z-20 ml-2 hidden whitespace-nowrap rounded-md bg-stone-900 px-2 py-1 text-[10px] text-white shadow-lg group-hover:block">
                {tool.label}
              </span>
            </button>
          ))}
        </nav>
        <aside className="min-h-0 shrink-0 overflow-hidden border-r border-stone-200 bg-white" style={{ width: panelWidth }}>
          <div className="flex h-10 items-center border-b border-stone-100 px-3 text-[12px] font-semibold">
            {tools.find((tool) => tool.id === activeTool)?.label}
          </div>
          <div className="h-[calc(100%-2.5rem)] min-h-0 overflow-hidden">{panel}</div>
        </aside>
        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={beginResize}
          className="-ml-1 w-2 shrink-0 cursor-col-resize touch-none bg-transparent transition hover:bg-stone-200/70"
          title={tt("拖动调整工具区宽度")}
        />
        <main className="min-h-0 min-w-0 flex-1 bg-stone-100">
              {item.kind === "image" && !showSpecialist ? (
            <ImageWorkbenchCanvas editor={editor} accent={accent} />
              ) : textNative && stage === "edit" && !showSpecialist ? (
                <TextWorkbenchCanvas editor={textEditor} />
              ) : sheetNative && stage === "edit" && !showSpecialist ? (
                <SheetWorkbenchCanvas editor={sheetEditor} />
          ) : showSpecialist && specialist ? (
            <iframe
              ref={iframeRef}
              src={specialist}
              title={`${item.title} - ${tt("专业编辑器")}`}
              onLoad={sendOpenMessage}
              className="h-full w-full border-0 bg-white"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads allow-modals allow-presentation"
              allow="clipboard-read; clipboard-write; fullscreen"
              referrerPolicy="strict-origin-when-cross-origin"
            />
                ) : previewContent ? (
                  <div className="h-full min-h-0 overflow-auto bg-white">
                    {previewContent}
                  </div>
                ) : (
            <div className="h-full overflow-auto bg-white">
              <LibraryItemViewer item={item} accent={accent} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
