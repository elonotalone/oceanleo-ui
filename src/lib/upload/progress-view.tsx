"use client";

// ============================================================================
// 上传进度的渲染件 —— 三个消费点显示**同一套字**
// ----------------------------------------------------------------------------
// 「4.2 MB / 18.6 MB」在一个组件里叫这个名，在另一个组件里就不该叫「4.2M/18.6M」。
// 格式化函数已经在 `progress.ts` 里统一过一次，但那只统一了字；行与行之间的
// **结构**（百分比在哪、剩余时间估不出来时怎么办）如果各写各的，照样会漂。
// 所以把这三件渲染件也收在一处，`InputCard` 与 `LeoComposer` 各引一行。
//
// 【为什么 tt 是参数而不是在这里 useUI()】
// 这一层要能在没有 `I18nProvider` 的地方（测试、以及将来任何非 Next 宿主）直接
// 渲染。翻译函数由调用方传进来，本文件因此不依赖 i18n 运行时。
//
// 【为什么估不出剩余时间就不显示】
// P1 点名「纯百分比在大文件上体感很差」，但**假的剩余时间比没有更糟**：用户会
// 按那个数字安排自己接下来几分钟。`createProgressTracker` 在样本不够时给 `null`，
// 这里就整段不渲染。
// ============================================================================

import {
  formatBytes,
  formatDuration,
  progressPercent,
  type UploadProgressSnapshot,
} from "./progress";
import type { CompressionSummary, UploadInFlight } from "./use-attachment-intake";

/** 与 `i18n/ui/useUI` 的 `UITranslate` 结构一致；这里不 import，避免把 i18n 运行时拖进 `src/lib/upload/`。 */
export type ProgressTranslate = (
  zh: string,
  vars?: Record<string, string | number>,
) => string;

/** 这份读数值不值得画进度条：有读数、还没结束。 */
export function liveProgress(
  snapshot: UploadProgressSnapshot | null | undefined,
): snapshot is UploadProgressSnapshot {
  return Boolean(snapshot) && !snapshot!.done && !snapshot!.failed;
}

/** 「4.2 MB / 18.6 MB · 已用 0:12 · 剩余约 0:35」。剩余估不出来时那一段整个不出现。 */
export function progressDetail(
  snapshot: UploadProgressSnapshot,
  tt: ProgressTranslate,
): string {
  const parts = [
    `${formatBytes(snapshot.loaded)} / ${formatBytes(snapshot.total)}`,
    tt("已用 {elapsed}", { elapsed: formatDuration(snapshot.elapsedMs) }),
  ];
  if (snapshot.remainingMs !== null) {
    parts.push(
      tt("剩余约 {remaining}", { remaining: formatDuration(snapshot.remainingMs) }),
    );
  }
  return parts.join(" · ");
}

/**
 * 进度条本体。动效 token 不写 fallback（裁定 A-2）——W01 把它们生成进 CSS 之前
 * 这里解析失败即 0s，不会退化成一个裸时长（红线 9）。
 */
function Bar({
  percent,
  accent,
  thin,
}: {
  percent: number;
  accent?: string;
  thin?: boolean;
}) {
  return (
    <span
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={`block ${thin ? "h-1 w-10" : "h-1.5 w-full"} overflow-hidden rounded-full bg-[var(--upload-track,#e7e5e4)]`}
    >
      <span
        className="block h-full rounded-full"
        style={{
          width: `${percent}%`,
          background: accent || "var(--upload-bar,#78716c)",
          transitionProperty: "width",
          transitionDuration: "var(--leo-dur-2)",
          transitionTimingFunction: "var(--leo-ease-standard)",
        }}
      />
    </span>
  );
}

/**
 * 缩略条里那一小截进度。**替换的是今天那个不确定态转圈**——
 * 转圈只说明「在忙」，这个说明「还要多久」。
 * 细节（已传/总计、已用、剩余）放 `title`：缩略条本身只有 120px，塞不下也不该塞。
 */
export function AttachmentProgressChip({
  snapshot,
  tt,
}: {
  snapshot: UploadProgressSnapshot;
  tt: ProgressTranslate;
}) {
  const percent = progressPercent(snapshot);
  return (
    <span
      data-attachment-progress={percent}
      title={progressDetail(snapshot, tt)}
      className="flex items-center gap-1"
    >
      <Bar percent={percent} thin />
      <span className="tabular-nums text-[10px] text-[var(--muted,#78716c)]">
        {percent}%
      </span>
    </span>
  );
}

/** 一行完整读数：文件名 + 百分比 + 已传/总计 + 已用/剩余。 */
export function UploadProgressRow({
  name,
  snapshot,
  accent,
  tt,
}: {
  name: string;
  snapshot: UploadProgressSnapshot;
  accent?: string;
  tt: ProgressTranslate;
}) {
  const percent = progressPercent(snapshot);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[11px] text-[var(--muted,#78716c)]">
        <span className="min-w-0 truncate">{name}</span>
        <span className="shrink-0 tabular-nums">{percent}%</span>
      </div>
      <div className="mt-1">
        <Bar percent={percent} accent={accent} />
      </div>
      <p className="mt-1 text-[11px] tabular-nums text-[var(--muted,#78716c)]">
        {progressDetail(snapshot, tt)}
      </p>
    </div>
  );
}

/**
 * 「业务正在传我刚交出去的那几个文件」。
 * 空数组时**返回 null**：宿主拿了文件却不上传时不许挂一行永远不动的进度。
 */
export function UploadProgressList({
  entries,
  accent,
  tt,
}: {
  entries: readonly UploadInFlight[];
  accent?: string;
  tt: ProgressTranslate;
}) {
  if (entries.length === 0) return null;
  return (
    <div data-upload-progress className="space-y-2">
      {entries.map((entry) => (
        <UploadProgressRow
          key={`${entry.name}:${entry.file.size}:${entry.file.lastModified}`}
          name={entry.name}
          snapshot={entry.snapshot}
          accent={accent}
          tt={tt}
        />
      ))}
    </div>
  );
}

/**
 * 「已压缩：4.2 MB → 900 KB · 用原图」。
 * 前后字节是用户信任这个功能的唯一方式（P3 原话），所以它不是可选的装饰。
 */
export function CompressionNote({
  summary,
  accent,
  tt,
  onUseOriginals,
}: {
  summary: CompressionSummary | null;
  accent?: string;
  tt: ProgressTranslate;
  onUseOriginals: () => void;
}) {
  if (!summary) return null;
  return (
    <p
      data-upload-compression
      className="text-[11px] text-[var(--muted,#78716c)]"
    >
      {tt("已压缩：{before} → {after}", {
        before: formatBytes(summary.originalBytes),
        after: formatBytes(summary.uploadBytes),
      })}{" "}
      <button
        type="button"
        onClick={onUseOriginals}
        className="font-medium underline underline-offset-2"
        style={accent ? { color: accent } : undefined}
      >
        {tt("用原图")}
      </button>
    </p>
  );
}
