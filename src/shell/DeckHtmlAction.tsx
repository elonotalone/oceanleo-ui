"use client";

/**
 * 「网页版」——把 deck 稿子当场渲成一份能发链接、能嵌网页的静态网页。
 *
 * 为什么是**当场渲**而不是库里存第二份文件：`artifact_renditions` 上每个 revision
 * 每种 purpose 只有一行，交付位 `full` 已经被 pptx 占住了，网页版没有位置可入库
 * （裁定见 oceandino `docs/work-logs/2026-08/deck-overhaul/D1-two-formats-decision.md`）。
 * 所以这一层只做三件事：判断这份素材有没有稿子、把稿子取回来、交给
 * `deck-html-package.ts` 出字节。**中间不加工**——用户拿到的字节与直接调用那个出口
 * 对同一份稿子产出的字节逐字节相同，否则「按需渲染」就等于每次刷新看到的都不一样。
 */

import { useId, useState, type CSSProperties } from "react";
import { useUI } from "../i18n/ui/useUI";
import {
  buildDeckHtml,
  type DeckHtmlAsset,
  type DeckHtmlBuild,
} from "./doc-editors/deck-html-package";
import {
  DECK_IR_MAX_BYTES,
  DECK_IR_SCHEMA,
  validateDeckIr,
  type DeckIrDocument,
} from "./doc-editors/deck-ir";
import { humanErrorMessage } from "./human-error-message";
import { isDurableLibraryItem, type LibraryItem } from "./library-data";

export interface DeckHtmlEvidence {
  visible: boolean;
  available: boolean;
  reason: string;
  /** 稿子的地址；`available` 为真时必非空。 */
  sourceUrl: string;
}

export interface DeckHtmlDelivery {
  kind: "html";
  filename: string;
  mediaType: string;
  bytes: Uint8Array;
  build: DeckHtmlBuild;
}

export interface DeckHtmlDeliveryOptions {
  /**
   * 图片字节，键是 IR `assets[].id`。
   *
   * IR 自己**不带图片地址**（`DeckIrAsset` 只有 `sha256`/`mediaType`/尺寸），
   * 所以这一层没有办法自己去取图，只能由宿主喂进来。声明过的图片缺少任何一份字节，
   * 出口都会明确失败，不会交付带裂图或擅自删图的网页。
   */
  assets?: readonly DeckHtmlAsset[];
  packId?: string;
  aspect?: "16:9" | "4:3";
}

function httpUrl(value: unknown): string {
  const url = typeof value === "string" ? value.trim() : "";
  return /^https?:\/\//i.test(url) ? url : "";
}

function declaresDeckIr(...hints: unknown[]): boolean {
  return hints.some(
    (hint) =>
      typeof hint === "string" && hint.trim().toLowerCase() === DECK_IR_SCHEMA,
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * 这份素材的 `oceanleo.deck.v1` 稿子在哪。
 *
 * 判据刻意只认**声明出来的那个 schema 字面量**：pptx 交付物、渲染图、编辑器
 * 内部模型都不算稿子，认宽了就会拿一份 OOXML 去喂 IR 解析器然后炸在用户脸上。
 */
export function deckHtmlSourceUrl(item: LibraryItem): string {
  const artifact = item.artifact;
  const source = artifact?.renditions.source;
  const manifest = artifact?.renditions.editor_manifest;
  const meta = item.meta || {};
  const editorManifestMeta = record(meta.editor_manifest);
  const editorManifestSource = record(editorManifestMeta?.source);
  const candidates: Array<{ url: unknown; declared: unknown[] }> = [
    { url: source?.url, declared: [source?.format, artifact?.sourceFormat] },
    { url: manifest?.url, declared: [manifest?.format] },
    {
      url: meta.editor_project_url || meta.editor_working_head_project_url,
      declared: [
        meta.editor_working_head_schema,
        meta.editor_project_schema,
        meta.project_schema,
      ],
    },
    {
      url: editorManifestSource?.url,
      declared: [editorManifestSource?.format],
    },
    { url: meta.source_url, declared: [meta.source_format] },
  ];
  for (const candidate of candidates) {
    const url = httpUrl(candidate.url);
    if (url && declaresDeckIr(...candidate.declared)) return url;
  }
  return "";
}

/**
 * 网页版这颗按钮该不该在、按不按得动、按不动时说哪一句。
 *
 * 形状与 `previewEvidence()` / `artifactDownloadEvidence()` 一致，理由一律是人话。
 */
export function deckHtmlEvidence(item: LibraryItem): DeckHtmlEvidence {
  const blank = { visible: false, available: false, sourceUrl: "" };
  if (!isDurableLibraryItem(item)) {
    return {
      ...blank,
      reason: "网页版需要 durable artifact identity。",
    };
  }
  const artifact = item.artifact;
  if (artifact.artifactType !== "deck") {
    return { ...blank, reason: "只有演示文稿可以生成网页版。" };
  }
  if (!artifact.access.canRead) {
    return {
      ...blank,
      reason: "当前主体没有读取这个 revision 的权限。",
    };
  }
  if (!artifact.integrity.ok) {
    return {
      visible: true,
      available: false,
      reason: artifact.integrity.reason || "当前 revision 未通过完整性校验。",
      sourceUrl: "",
    };
  }
  const sourceUrl = deckHtmlSourceUrl(item);
  if (!sourceUrl) {
    // 拿不到稿子就渲不出网页版，这不是这一次操作的失败，而是这份素材根本没有那样
    // 东西——货架上 275 个老 deck 全是 pptx，永远补不出来。过去这里留一颗灰按钮
    // 外加一句替产品空缺道歉的话（「这份素材制作得较早…」）；操作员裁定那种话不
    // 许出现，正确做法是**按钮不出现**：用户看不到入口，就没有需要被解释的失败。
    // 新产的 deck 带 `oceanleo.deck.v1` 稿子，按钮照常长出来。
    return {
      visible: false,
      available: false,
      reason: "",
      sourceUrl: "",
    };
  }
  return { visible: true, available: true, reason: "", sourceUrl };
}

function deckFileStem(title: string): string {
  const stem = (title || "演示文稿")
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return stem || "演示文稿";
}

/**
 * 稿子 → 用户拿到手的那串字节。
 *
 * 这里不做二次加工：交付字节就是 `buildDeckHtml()` 出的那份自包含 HTML 原文。
 */
export async function buildDeckHtmlDelivery(
  project: DeckIrDocument,
  options: DeckHtmlDeliveryOptions = {},
): Promise<DeckHtmlDelivery> {
  const build = await buildDeckHtml(project, {
    assets: options.assets,
    packId: options.packId,
    aspect: options.aspect,
  });
  const stem = deckFileStem(project.title);
  return {
    kind: "html",
    filename: `${stem}.html`,
    mediaType: "text/html;charset=utf-8",
    bytes: new TextEncoder().encode(build.html),
    build,
  };
}

class DeckHtmlProjectRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeckHtmlProjectRejectedError";
  }
}

/** 稿子取回来并验一遍。信封形态与裸 IR 都认（历史上两种都发布过）。 */
export async function loadDeckHtmlProject(
  url: string,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<DeckIrDocument> {
  const request = options.fetchImpl || fetch;
  const response = await request(url, {
    signal: options.signal,
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`稿子没能读回来（HTTP ${response.status}）。`);
  }
  const text = await response.text();
  if (!text.trim()) {
    throw new DeckHtmlProjectRejectedError("这份稿子是空的。");
  }
  if (new TextEncoder().encode(text).byteLength > DECK_IR_MAX_BYTES) {
    throw new DeckHtmlProjectRejectedError("这份稿子超过了 2MB 安全上限。");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DeckHtmlProjectRejectedError("这份稿子不是可读的 JSON。");
  }
  const envelope = record(parsed);
  const candidate =
    envelope && envelope.schema === DECK_IR_SCHEMA && envelope.data !== undefined
      ? envelope.data
      : parsed;
  const validation = validateDeckIr(candidate);
  if (!validation.ok) {
    throw new DeckHtmlProjectRejectedError(
      "这份稿子的格式不受支持，暂时生成不了网页版。",
    );
  }
  return validation.project;
}

function saveDelivery(delivery: DeckHtmlDelivery): void {
  const blob = new Blob([delivery.bytes as BlobPart], {
    type: delivery.mediaType,
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = delivery.filename;
  link.rel = "noopener noreferrer";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export interface DeckHtmlActionButtonProps {
  item: LibraryItem;
  evidence: DeckHtmlEvidence;
  /** 报给宿主那条 live region 的一句话；宿主负责翻译与朗读。 */
  report: (message: string) => void;
  className?: string;
  style?: CSSProperties;
  /** 按不动时指向宿主那条理由行，读屏才连得起来。 */
  reasonId?: string;
  /** 图片字节的来源。IR 不带图片地址；有图片的稿子必须由宿主提供。 */
  resolveAssets?: (
    project: DeckIrDocument,
    item: LibraryItem,
  ) => Promise<readonly DeckHtmlAsset[]> | readonly DeckHtmlAsset[];
  /** 取稿子的通道，测试与非浏览器宿主用得上。 */
  fetchImpl?: typeof fetch;
  /** 交付落点；默认存成文件。 */
  onDelivery?: (delivery: DeckHtmlDelivery, item: LibraryItem) => void | Promise<void>;
}

export function DeckHtmlActionButton({
  item,
  evidence,
  report,
  className,
  style,
  reasonId,
  resolveAssets,
  fetchImpl,
  onDelivery,
}: DeckHtmlActionButtonProps) {
  const tt = useUI();
  const [busy, setBusy] = useState(false);
  const [rejection, setRejection] = useState<{
    projectKey: string;
    reason: string;
  } | null>(null);
  const generatedReasonId = useId();
  if (!evidence.visible) return null;
  const projectKey = JSON.stringify([
    item.artifact?.artifactId || item.artifactId || "",
    item.artifact?.revisionId || item.revisionId || "",
    evidence.sourceUrl,
  ]);
  const rejectionReason =
    evidence.available && rejection?.projectKey === projectKey
      ? rejection.reason
      : "";
  const unavailableReason = evidence.available
    ? rejectionReason
    : evidence.reason;
  const rejectionReasonId = reasonId || generatedReasonId;
  const disabled = !evidence.available || busy || Boolean(rejectionReason);
  const run = async () => {
    if (busy || rejectionReason) {
      if (rejectionReason) report(rejectionReason);
      return;
    }
    if (!evidence.available) {
      report(evidence.reason);
      return;
    }
    setBusy(true);
    report("正在生成网页版…");
    try {
      const project = await loadDeckHtmlProject(evidence.sourceUrl, {
        fetchImpl,
      });
      const assets = resolveAssets
        ? await resolveAssets(project, item)
        : undefined;
      const delivery = await buildDeckHtmlDelivery(project, { assets });
      if (onDelivery) await onDelivery(delivery, item);
      else saveDelivery(delivery);
      setRejection(null);
      report("网页版已生成。");
    } catch (error) {
      const message = humanErrorMessage(
        error,
        "网页版没能生成，请稍后重试。",
      );
      if (error instanceof DeckHtmlProjectRejectedError) {
        setRejection({ projectKey, reason: message });
      }
      report(message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={() => void run()}
        disabled={disabled}
        aria-disabled={disabled}
        aria-describedby={
          rejectionReason
            ? rejectionReasonId
            : !evidence.available && reasonId
              ? reasonId
              : undefined
        }
        data-deck-html-action="true"
        aria-label={tt(
          `网页版「${item.title}」${unavailableReason ? `：${unavailableReason}` : ""}`,
        )}
        title={tt(unavailableReason || "网页版")}
        className={className}
        style={
          rejectionReason
            ? {
                ...style,
                borderColor: "var(--border,#e7e5e4)",
                color: "var(--muted,#a8a29e)",
              }
            : style
        }
      >
        {busy ? tt("处理中…") : tt("网页版")}
      </button>
      {rejectionReason && (
        <span
          id={rejectionReasonId}
          className="basis-full text-[9px] leading-snug text-[var(--muted,#a8a29e)]"
          role="note"
          data-deck-html-rejection="true"
        >
          {tt(`网页版：${rejectionReason}`)}
        </span>
      )}
    </>
  );
}
