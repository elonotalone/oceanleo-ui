"use client";

// ============================================================================
// 上传缩略块 —— ChatGPT 式（操作员 2026-10-31：「只显示图片，且过程简洁」）
// ----------------------------------------------------------------------------
// 一个附件 = 一块圆角方块，别无他物：
//   · 图片：本地 blob 缩略图 object-cover 铺满，不写文件名。
//   · 非图片：同尺寸方块，文件图标 + 一行截断的名字（全名在 title 里）。
//   · 上传中：整块轻微压暗 + 中间一个小圆环。总线报了数就画真百分比圆环，
//     没报数就转一个不确定态的小圈。不显示字节、不显示已用时、不另起进度行。
//   · 失败：右下角一个红色小圆徽章；宿主给了 onRetry 它就是重试键。
//   · 悬停 / 聚焦（触屏上恒显）：右上角一个小 ×。
//
// 【为什么 tt 是参数】与旧 progress-view 同一条理由：这一层要能在没有
// `I18nProvider` 的地方直接渲染（单测、视觉夹具），翻译函数由调用方传入。
// ============================================================================

import { useEffect, useState, type CSSProperties } from "react";

import type { UploadProgressSnapshot } from "./progress";
import { progressPercent } from "./progress";
import type { UploadInFlight } from "./use-attachment-intake";

/** 与 `i18n/ui/useUI` 的 `UITranslate` 结构一致；这里不 import，避免把 i18n 运行时拖进 `src/lib/upload/`。 */
export type ProgressTranslate = (
  zh: string,
  vars?: Record<string, string | number>,
) => string;

export type UploadTileState = "ready" | "uploading" | "failed";

/** 这份读数值不值得画进度：有读数、还没结束。 */
export function liveProgress(
  snapshot: UploadProgressSnapshot | null | undefined,
): snapshot is UploadProgressSnapshot {
  return Boolean(snapshot) && !snapshot!.done && !snapshot!.failed;
}

/**
 * 把进度总线上的读数配到宿主的附件上。
 *
 * 宿主（`useAttachments` 等）按契约不回传进度，只回传 `uploading: true` 与文件名；
 * 本组件交出去的 File 名就是宿主记的名（粘贴改名发生在交出去之前），所以按名字
 * 一对一配：每条读数最多配一个附件，宿主自己给了 `progress` 的不动。
 */
export function withBusProgress<
  T extends { name?: string; uploading?: boolean; progress?: UploadProgressSnapshot | null },
>(attachments: readonly T[], inFlight: readonly UploadInFlight[]): T[] {
  if (!inFlight.length) return attachments.slice();
  const unused = inFlight.slice();
  return attachments.map((a) => {
    if (!a.uploading || a.progress) return a;
    const at = unused.findIndex((entry) => entry.name === a.name);
    if (at < 0) return a;
    const [entry] = unused.splice(at, 1);
    return { ...a, progress: entry.snapshot };
  });
}

/** 是不是图片（决定画缩略图还是文件图标）。 */
export function isImageTile(mime?: string, name?: string, previewUrl?: string): boolean {
  const type = (mime || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  if (type) return false;
  if (/\.(png|jpe?g|webp|gif|avif|heic|bmp)$/i.test(name || "")) return true;
  return Boolean(previewUrl);
}

/** 能不能悬停。触屏上没有悬停，× 必须恒显，否则删不掉。 */
function useHoverCapable(): boolean {
  const [canHover, setCanHover] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(hover: hover)");
    setCanHover(query.matches);
    const onChange = () => setCanHover(query.matches);
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);
  return canHover;
}

const RING_RADIUS = 9;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** 小圆环：有百分比画真进度，没有就转一个不确定态的四分之一弧。 */
export function ProgressRing({ percent, size = 22 }: { percent: number | null; size?: number }) {
  const determinate = percent !== null;
  const shown = determinate ? Math.max(4, Math.min(100, percent)) : 25;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role={determinate ? "progressbar" : "status"}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? 100 : undefined}
      aria-valuenow={determinate ? percent : undefined}
      data-attachment-progress={determinate ? percent : undefined}
      data-attachment-spinner={determinate ? undefined : ""}
      className={determinate ? undefined : "animate-spin"}
    >
      <circle cx="12" cy="12" r={RING_RADIUS} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2.5" />
      <circle
        cx="12"
        cy="12"
        r={RING_RADIUS}
        fill="none"
        stroke="#fff"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={`${(shown / 100) * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
        transform="rotate(-90 12 12)"
        style={{
          transitionProperty: "stroke-dasharray",
          transitionDuration: "var(--leo-dur-2)",
          transitionTimingFunction: "var(--leo-ease-standard)",
        }}
      />
    </svg>
  );
}

function FileGlyph() {
  return (
    <svg className="h-6 w-6 shrink-0 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M14 3v4h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface UploadTileProps {
  /** 文件名：非图片块上截断显示；图片块只进 title / aria-label。 */
  name?: string;
  /** 本地 blob 缩略图（C2：永远是本地的，不是存储地址）。 */
  previewUrl?: string;
  mime?: string;
  state?: UploadTileState;
  /** 总线读数；只在 uploading 时用。 */
  progress?: UploadProgressSnapshot | null;
  /** 边长 px。输入框里 56，消息气泡里 64。 */
  size?: number;
  /** 点方块本体。不传则方块不可点（绝不退回到新标签页开原始地址）。 */
  onOpen?: () => void;
  onRemove?: () => void;
  onRetry?: () => void;
  tt: ProgressTranslate;
  className?: string;
}

/** 一块附件方块。见文件头。 */
export function UploadTile({
  name,
  previewUrl,
  mime,
  state = "ready",
  progress,
  size = 56,
  onOpen,
  onRemove,
  onRetry,
  tt,
  className = "",
}: UploadTileProps) {
  const canHover = useHoverCapable();
  const [hovered, setHovered] = useState(false);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [previewUrl]);
  const label = name || tt("附件");
  const image = isImageTile(mime, name, previewUrl) && Boolean(previewUrl) && !broken;
  const uploading = state === "uploading";
  const failed = state === "failed";
  const percent = uploading && liveProgress(progress) ? progressPercent(progress) : null;
  const box: CSSProperties = { width: size, height: size };

  const face = (
    <>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt=""
          draggable={false}
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1">
          <FileGlyph />
          <span className="w-full truncate text-center text-[11px] leading-tight text-neutral-500 dark:text-neutral-400">
            {label}
          </span>
        </span>
      )}
      {uploading ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/30">
          <ProgressRing percent={percent} />
        </span>
      ) : failed ? (
        <span className="absolute inset-0 bg-white/40 dark:bg-black/50" />
      ) : null}
    </>
  );

  const faceClass =
    "relative block h-full w-full overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 text-left dark:border-neutral-800 dark:bg-neutral-800";

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={box}
      title={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHovered(false);
      }}
      data-upload-tile={state}
      data-upload-kind={image ? "image" : "file"}
    >
      {onOpen ? (
        <button
          type="button"
          aria-label={label}
          onClick={onOpen}
          className={`${faceClass} cursor-pointer outline-none focus-visible:ring-2`}
        >
          {face}
        </button>
      ) : (
        <span aria-label={label} role="img" className={faceClass}>
          {face}
        </span>
      )}
      {failed ? (
        onRetry ? (
          // 命中区 44（hit-target 纪律），看得见的只是里面那枚 20px 红徽章。
          <button
            type="button"
            aria-label={tt("重试")}
            title={tt("上传失败")}
            data-upload-retry=""
            onClick={onRetry}
            className="absolute flex h-11 w-11 items-center justify-center"
            style={{ right: -14, bottom: -14 }}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow ring-2 ring-white hover:bg-red-600 dark:ring-neutral-900">
              <RetryGlyph />
            </span>
          </button>
        ) : (
          <span
            role="img"
            aria-label={tt("上传失败")}
            title={tt("上传失败")}
            data-upload-failed=""
            className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[11px] font-semibold leading-none text-white shadow ring-2 ring-white dark:ring-neutral-900"
          >
            !
          </span>
        )
      ) : null}
      {onRemove && (!canHover || hovered) ? (
        // 只在悬停/聚焦时挂出来（触屏恒显）：藏起来的 × 不许还留着一块看不见的命中区。
        <button
          type="button"
          aria-label={tt("移除")}
          data-upload-remove=""
          onClick={onRemove}
          className="absolute flex h-11 w-11 items-center justify-center"
          style={{ right: -14, top: -14 }}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-800 text-white shadow ring-2 ring-white hover:bg-neutral-900 dark:ring-neutral-900">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </span>
        </button>
      ) : null}
    </div>
  );
}

function RetryGlyph() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 11a8 8 0 10-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}
