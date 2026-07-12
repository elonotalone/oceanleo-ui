"use client";

// ============================================================================
// @oceanleo/ui — 可复用「成品渲染器」ArtifactRenderer（单一事实源，宗旨 v22，2026-07-12）
// ----------------------------------------------------------------------------
// 操作员 2026-07-12：右栏展示 agent 产物时，不能所有非图片类型都回退成一坨 Markdown
// （截图 12b45dfe 那种「右侧空白太多、UI 差」）。本组件按 artifact.type / URL 后缀把产物
// 分发到**对应形态的富渲染**：
//   · 图片 image        → <img object-contain> 居中 + 下载/新窗
//   · 视频 video        → <video controls> 播放器
//   · 音频 audio        → <audio controls> + 图标
//   · 幻灯 ppt/slides   → Office 在线预览 iframe（.pptx 公网直链）+ 下载
//   · 表格 sheet/xlsx   → Office 在线预览 iframe（.xlsx）+ 下载
//   · 文档 doc/docx     → .docx 用 Office 在线预览 iframe；纯 markdown 文档用 Markdown
//   · 小红书 xhs        → 竖版图文卡（标题 + 正文 + 配图），贴合小红书笔记形态
//   · 网页预览 preview  → 实时 iframe（复用 website 建站台的即时预览形态）
//   · 3D                → <model-viewer>（若可用）或下载卡
//   · 其它/兜底          → Markdown（正文）
//
// 复用：各站右栏（AgentChat.DefaultArtifact 优先走它、SiteCatalogConsole、website 建站台
// 的 preview…）统一用它，改一处全家桶右栏成品展示同步升级。宿主仍可用 renderArtifact
// 完全接管（如 word 站用自己的编辑器）——本组件只是「没有专用编辑器时的高质量兜底」。
// ============================================================================

import { useMemo, useState, type ReactNode } from "react";
import type { ArtifactMeta } from "../lib/agent";
import { Markdown } from "./Markdown";
import { useUI } from "../i18n/ui/useUI";

export interface ArtifactRendererProps {
  artifact: ArtifactMeta;
  content: string;
  accent?: string;
}

// —— 类型判定帮助器 ————————————————————————————————————————————————
function extOf(url?: string): string {
  if (!url) return "";
  const clean = url.split("?")[0].split("#")[0];
  const m = /\.([a-z0-9]+)$/i.exec(clean);
  return m ? m[1].toLowerCase() : "";
}
function has(type: string, ...keys: string[]): boolean {
  const t = (type || "").toLowerCase();
  return keys.some((k) => t.includes(k));
}
const IMG_EXT = ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"];
const VIDEO_EXT = ["mp4", "webm", "mov", "m4v"];
const AUDIO_EXT = ["mp3", "wav", "ogg", "m4a", "flac", "aac"];
const PPT_EXT = ["ppt", "pptx"];
const SHEET_EXT = ["xls", "xlsx", "csv"];
const DOC_EXT = ["doc", "docx"];

/** Office 在线预览地址（.pptx/.xlsx/.docx 的公网直链才可用）。 */
function officeEmbedUrl(url: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
}

/** 该 URL 是否是可被 Office 在线预览接受的公网 https 直链（本地/内网不行）。 */
function isPublicHttps(url?: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname);
  } catch {
    return false;
  }
}

export function ArtifactRenderer({ artifact, content, accent = "#4f46e5" }: ArtifactRendererProps) {
  const tt = useUI();
  const type = artifact.type || "";
  const url = artifact.url || "";
  const ext = extOf(url);

  const kind = useMemo<
    | "image"
    | "video"
    | "audio"
    | "ppt"
    | "sheet"
    | "doc"
    | "xhs"
    | "preview"
    | "threed"
    | "markdown"
  >(() => {
    if (has(type, "image") || IMG_EXT.includes(ext)) return "image";
    if (has(type, "video") || VIDEO_EXT.includes(ext)) return "video";
    if (has(type, "audio", "music", "voice") || AUDIO_EXT.includes(ext)) return "audio";
    if (has(type, "ppt", "slide", "presentation") || PPT_EXT.includes(ext)) return "ppt";
    if (has(type, "sheet", "xlsx", "excel", "table") || SHEET_EXT.includes(ext)) return "sheet";
    if (has(type, "xhs", "小红书", "note", "redbook")) return "xhs";
    if (has(type, "preview", "site", "web")) return "preview";
    if (has(type, "3d", "threed", "model", "mesh", "glb", "gltf") || ["glb", "gltf", "obj"].includes(ext))
      return "threed";
    if (has(type, "doc") || DOC_EXT.includes(ext)) return "doc";
    return "markdown";
  }, [type, url, ext]);

  if (kind === "image" && url) {
    return (
      <FillCenter>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={artifact.title || ""} className="max-h-full max-w-full rounded-lg object-contain" />
        <DownloadBar url={url} label={tt("下载图片")} accent={accent} />
      </FillCenter>
    );
  }

  if (kind === "video" && url) {
    return (
      <FillCenter>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video src={url} controls className="max-h-full max-w-full rounded-lg bg-black" />
        <DownloadBar url={url} label={tt("下载视频")} accent={accent} />
      </FillCenter>
    );
  }

  if (kind === "audio" && url) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-stone-100 text-stone-400">
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18V6l11-2v12" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="6.5" cy="18" r="2.5" />
            <circle cx="17.5" cy="16" r="2.5" />
          </svg>
        </span>
        {artifact.title && <p className="text-[14px] font-medium text-stone-700">{artifact.title}</p>}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio src={url} controls className="w-full max-w-md" />
        <DownloadBar url={url} label={tt("下载音频")} accent={accent} inline />
      </div>
    );
  }

  // 幻灯 / 表格 / Word：公网 https 直链 → Office 在线预览 iframe；否则给下载卡。
  if ((kind === "ppt" || kind === "sheet" || kind === "doc") && url) {
    const label = kind === "ppt" ? tt("下载幻灯片") : kind === "sheet" ? tt("下载表格") : tt("下载文档");
    if (isPublicHttps(url)) {
      return (
        <OfficeFrame src={officeEmbedUrl(url)} downloadUrl={url} downloadLabel={label} title={artifact.title} accent={accent} />
      );
    }
    // 无法在线预览：文档类回退正文 Markdown（若有），否则下载卡。
    if (kind === "doc" && content.trim()) {
      return <MarkdownPane content={content} />;
    }
    return <DownloadCard url={url} title={artifact.title || label} label={label} accent={accent} />;
  }

  if (kind === "preview" && url) {
    return <PreviewFrame url={url} title={artifact.title} accent={accent} />;
  }

  if (kind === "threed" && url) {
    // model-viewer 若被宿主注册为自定义元素则用它，否则给下载卡（不引入重依赖）。
    return <ThreeDPane url={url} title={artifact.title} accent={accent} />;
  }

  if (kind === "xhs") {
    return <XhsCard content={content} coverUrl={url} title={artifact.title} />;
  }

  // 兜底：Markdown 正文（+ 若带 URL 给个打开链接）。
  return <MarkdownPane content={content} url={url} />;
}

// —— 子组件 ————————————————————————————————————————————————————————
function FillCenter({ children }: { children: ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-3 p-4">{children}</div>;
}

function DownloadBar({ url, label, accent, inline }: { url: string; label: string; accent: string; inline?: boolean }) {
  const tt = useUI();
  return (
    <div className={inline ? "flex gap-2" : "flex shrink-0 gap-2"}>
      <a
        href={url}
        download
        target="_blank"
        rel="noreferrer"
        className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-white transition hover:opacity-90"
        style={{ background: accent }}
      >
        {label}
      </a>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="rounded-lg border border-stone-200 px-3 py-1.5 text-[13px] text-stone-600 transition hover:bg-stone-50"
      >
        {tt("新窗口打开")}
      </a>
    </div>
  );
}

function OfficeFrame({
  src,
  downloadUrl,
  downloadLabel,
  title,
  accent,
}: {
  src: string;
  downloadUrl: string;
  downloadLabel: string;
  title?: string;
  accent: string;
}) {
  const tt = useUI();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-stone-100 px-1 pb-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-stone-700">{title || tt("预览")}</span>
        <a
          href={downloadUrl}
          download
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-medium text-white transition hover:opacity-90"
          style={{ background: accent }}
        >
          {downloadLabel}
        </a>
      </div>
      <iframe
        src={src}
        title={title || "office-preview"}
        className="min-h-0 w-full flex-1 rounded-b-lg border-0"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
    </div>
  );
}

function PreviewFrame({ url, title, accent }: { url: string; title?: string; accent: string }) {
  const tt = useUI();
  const [nonce, setNonce] = useState(0);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-stone-100 px-1 pb-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-stone-700">{title || tt("实时预览")}</span>
        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          title={tt("刷新")}
          className="shrink-0 rounded-lg border border-stone-200 p-1 text-stone-500 transition hover:bg-stone-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-3-6.7L21 8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-medium text-white transition hover:opacity-90"
          style={{ background: accent }}
        >
          {tt("新窗口打开")}
        </a>
      </div>
      <iframe
        key={nonce}
        src={url}
        title={title || "preview"}
        className="min-h-0 w-full flex-1 rounded-b-lg border-0 bg-white"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  );
}

function ThreeDPane({ url, title, accent }: { url: string; title?: string; accent: string }) {
  const tt = useUI();
  const hasViewer =
    typeof window !== "undefined" && Boolean((window as unknown as { customElements?: CustomElementRegistry }).customElements?.get?.("model-viewer"));
  if (hasViewer) {
    // model-viewer 已注册（宿主自行引入）→ 用它渲染。
    return (
      <div className="h-full w-full">
        {/* @ts-expect-error custom element */}
        <model-viewer src={url} camera-controls auto-rotate style={{ width: "100%", height: "100%" }} />
      </div>
    );
  }
  return <DownloadCard url={url} title={title || tt("3D 模型")} label={tt("下载模型")} accent={accent} />;
}

function XhsCard({ content, coverUrl, title }: { content: string; coverUrl?: string; title?: string }) {
  // 小红书笔记形态：竖版卡片，封面图（若有）+ 标题 + 正文。贴合小红书图文笔记观感。
  return (
    <div className="flex h-full justify-center overflow-y-auto p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        {coverUrl && (
          <div className="w-full overflow-hidden bg-stone-100" style={{ aspectRatio: "3 / 4" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverUrl} alt={title || ""} className="h-full w-full object-cover" />
          </div>
        )}
        <div className="p-4">
          {title && <p className="mb-2 text-[15px] font-semibold text-stone-900">{title}</p>}
          <div className="prose prose-sm max-w-none text-[14px] leading-relaxed text-stone-700">
            <Markdown>{content}</Markdown>
          </div>
        </div>
      </div>
    </div>
  );
}

function DownloadCard({ url, title, label, accent }: { url: string; title: string; label: string; accent: string }) {
  const tt = useUI();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-stone-100 text-stone-400">
        <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <p className="text-[14px] font-medium text-stone-800">{title}</p>
      <div className="flex gap-2">
        <a
          href={url}
          download
          target="_blank"
          rel="noreferrer"
          className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-white transition hover:opacity-90"
          style={{ background: accent }}
        >
          {label}
        </a>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-stone-200 px-3 py-1.5 text-[13px] text-stone-600 transition hover:bg-stone-50"
        >
          {tt("新窗口打开")}
        </a>
      </div>
    </div>
  );
}

function MarkdownPane({ content, url }: { content: string; url?: string }) {
  const tt = useUI();
  return (
    <div className="h-full overflow-y-auto p-5">
      <Markdown>{content}</Markdown>
      {url && (
        <div className="mt-4">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-[13px] font-medium text-stone-600 underline decoration-stone-300 underline-offset-2 hover:text-stone-800"
          >
            {tt("新窗口打开")}
          </a>
        </div>
      )}
    </div>
  );
}
