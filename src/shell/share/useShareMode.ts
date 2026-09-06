"use client";

// ============================================================================
// @oceanleo/ui — 选段模式的状态与四个动作
// ----------------------------------------------------------------------------
// 选段模式是**临时页面模式**：进入后底部输入框整块换成操作条，退出即恢复。所有
// 状态与副作用收在这个 hook 里，`AgentChat` 只负责把它接到界面上。
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentMessage } from "../../lib/agent";
import { useUI } from "../../i18n/ui/useUI";
import {
  isAllShareSelected,
  pruneShareSelection,
  selectedShareMessages,
  shareSelectableMessages,
  toggleSelectAll,
  toggleShareSelection,
} from "./share-selection";
import { shareMessagesToText } from "./share-text";
import { writeClipboardText } from "./share-clipboard";
import { ShareLinkError, createShareLink } from "./share-client";
import { generateShareCard } from "./ShareCard";
import type { ShareCardImages } from "./share-image";
import { downloadBlob, shareMessagesToDocxBlob } from "./share-docx";
import { buildShareCardMessages } from "./ShareCard";

export type ShareAction =
  | "copyText"
  | "copyLink"
  | "image"
  | "document"
  | null;

export interface ShareNotice {
  tone: "ok" | "error";
  text: string;
}

export interface UseShareModeInput {
  messages: readonly AgentMessage[];
  taskId?: string | null;
  /** 卡片标题，一般用 task.title。 */
  title?: string;
  /** 副标题里的站点名。 */
  siteLabel?: string;
  /** 助手侧的说话人标签，默认 OceanLeo。 */
  assistantLabel?: string;
}

export interface ShareModeState {
  active: boolean;
  enter: (messageId?: number) => void;
  exit: () => void;
  selectable: AgentMessage[];
  selectedIds: ReadonlySet<number>;
  selectedCount: number;
  allSelected: boolean;
  toggle: (messageId: number) => void;
  toggleAll: () => void;
  busy: ShareAction;
  notice: ShareNotice | null;
  preview: ShareCardImages | null;
  closePreview: () => void;
  copyText: () => Promise<void>;
  copyLink: () => Promise<void>;
  generateImage: () => Promise<void>;
  generateDocument: () => Promise<void>;
}

function safeFileName(value: string, fallback: string): string {
  const cleaned = String(value || "")
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return cleaned || fallback;
}

export function useShareMode(input: UseShareModeInput): ShareModeState {
  const tt = useUI();
  const [active, setActive] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(
    () => new Set<number>(),
  );
  const [busy, setBusy] = useState<ShareAction>(null);
  const [notice, setNotice] = useState<ShareNotice | null>(null);
  const [preview, setPreview] = useState<ShareCardImages | null>(null);
  const linkRef = useRef<{ key: string; url: string } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectable = useMemo(
    () => shareSelectableMessages(input.messages),
    [input.messages],
  );

  const say = useCallback((tone: "ok" | "error", text: string) => {
    setNotice({ tone, text });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2600);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  // 换对话 / 消息被删：把失效的勾选丢掉，计数不许撒谎。
  useEffect(() => {
    setSelectedIds((current) => {
      const next = pruneShareSelection(current, selectable);
      return next.size === current.size ? current : next;
    });
  }, [selectable]);

  useEffect(() => {
    linkRef.current = null;
  }, [input.taskId]);

  const enter = useCallback(
    (messageId?: number) => {
      setActive(true);
      setNotice(null);
      setSelectedIds(
        typeof messageId === "number" ? new Set([messageId]) : new Set<number>(),
      );
    },
    [],
  );

  const exit = useCallback(() => {
    setActive(false);
    setSelectedIds(new Set<number>());
    setNotice(null);
    setBusy(null);
  }, []);

  const toggle = useCallback((messageId: number) => {
    setSelectedIds((current) => toggleShareSelection(current, messageId));
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((current) => toggleSelectAll(current, selectable));
  }, [selectable]);

  const chosen = useMemo(
    () => selectedShareMessages(input.messages, selectedIds),
    [input.messages, selectedIds],
  );

  const speakers = useMemo(
    () => ({
      user: tt("我"),
      assistant: input.assistantLabel || "OceanLeo",
    }),
    [input.assistantLabel, tt],
  );

  const requireSelection = useCallback(() => {
    if (chosen.length) return true;
    say("error", tt("先勾选要分享的消息。"));
    return false;
  }, [chosen.length, say, tt]);

  const copyText = useCallback(async () => {
    if (busy || !requireSelection()) return;
    setBusy("copyText");
    try {
      const text = shareMessagesToText(chosen, {
        user: speakers.user,
        assistant: speakers.assistant,
        attachment: tt("附件"),
        artifact: tt("已生成"),
      });
      const copied = await writeClipboardText(text);
      say(
        copied ? "ok" : "error",
        copied
          ? tt("已复制 {count} 条消息。", { count: chosen.length })
          : tt("复制失败，请手动选中文本复制。"),
      );
    } finally {
      setBusy(null);
    }
  }, [busy, chosen, requireSelection, say, speakers, tt]);

  /** 建一次链接就缓存起来：Copy Link 与长图上的二维码指向同一个地址。 */
  const ensureLink = useCallback(async (): Promise<string> => {
    const ids = chosen.map((message) => message.id);
    const key = `${input.taskId || ""}:${ids.join(",")}`;
    if (linkRef.current?.key === key) return linkRef.current.url;
    const link = await createShareLink({
      taskId: String(input.taskId || ""),
      messageIds: ids,
    });
    linkRef.current = { key, url: link.url };
    return link.url;
  }, [chosen, input.taskId]);

  const copyLink = useCallback(async () => {
    if (busy || !requireSelection()) return;
    setBusy("copyLink");
    try {
      let url = "";
      try {
        url = await ensureLink();
      } catch (err) {
        // 兜底回落：分享接口未上线或报错时，复制当前对话任务的 URL，确保复制可用
        if (typeof window !== "undefined") {
          const u = new URL(window.location.href);
          if (input.taskId) u.searchParams.set("taskId", input.taskId);
          url = u.toString();
        } else {
          throw err;
        }
      }
      const copied = await writeClipboardText(url);
      say(
        copied ? "ok" : "error",
        copied ? tt("链接已复制。") : tt("复制失败，请手动复制链接。"),
      );
    } catch (error) {
      say(
        "error",
        tt(
          error instanceof ShareLinkError
            ? error.message
            : "分享链接创建失败，请稍后再试。",
        ),
      );
    } finally {
      setBusy(null);
    }
  }, [busy, ensureLink, requireSelection, say, tt, input.taskId]);

  const generateImage = useCallback(async () => {
    if (busy || !requireSelection()) return;
    setBusy("image");
    try {
      // 二维码要回链到 Copy Link 的同一个地址；接口没上线就退回站点首页，
      // 图照出，只是扫码到首页而不是这段对话。
      let link = "";
      try {
        link = await ensureLink();
      } catch {
        link =
          typeof window !== "undefined" ? window.location.origin : "";
      }
      const images = await generateShareCard({
        messages: chosen,
        speakers,
        title: input.title,
        siteLabel: input.siteLabel,
        link,
        tt,
      });
      setPreview(images);
      say(
        "ok",
        images.blobs.length > 1
          ? tt("长图已生成 · 共 {count} 张", { count: images.blobs.length })
          : tt("长图已生成"),
      );
    } catch (error) {
      say(
        "error",
        tt(error instanceof Error ? error.message : "长图生成失败。"),
      );
    } finally {
      setBusy(null);
    }
  }, [
    busy,
    chosen,
    ensureLink,
    input.siteLabel,
    input.title,
    requireSelection,
    say,
    speakers,
    tt,
  ]);

  const generateDocument = useCallback(async () => {
    if (busy || !requireSelection()) return;
    setBusy("document");
    try {
      const title = (input.title || "").trim() || tt("与 OceanLeo 的对话");
      const blob = await shareMessagesToDocxBlob({
        title,
        subtitle: [input.siteLabel, new Date().toLocaleDateString()]
          .filter(Boolean)
          .join(" · "),
        brand: "Generated by OceanLeo",
        linkText: linkRef.current?.url,
        messages: buildShareCardMessages(chosen, speakers, tt),
      });
      downloadBlob(blob, `${safeFileName(title, "oceanleo-share")}.docx`);
      say("ok", tt("文档已开始下载。"));
    } catch (error) {
      say(
        "error",
        tt(error instanceof Error ? error.message : "文档生成失败。"),
      );
    } finally {
      setBusy(null);
    }
  }, [busy, chosen, input.siteLabel, input.title, requireSelection, say, speakers, tt]);

  return {
    active,
    enter,
    exit,
    selectable,
    selectedIds,
    selectedCount: chosen.length,
    allSelected: isAllShareSelected(selectedIds, selectable),
    toggle,
    toggleAll,
    busy,
    notice,
    preview,
    closePreview: () => setPreview(null),
    copyText,
    copyLink,
    generateImage,
    generateDocument,
  };
}
