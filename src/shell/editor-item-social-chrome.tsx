"use client";

// 编辑器里「分享」「收藏」的状态与动作（W01，编辑器整改波 2026-10-23）。
//
// D1 之后这两项不再是第一行上的独立图标，住进 `···` 菜单（plugin-chrome/PluginMoreMenu）。
// 状态必须留在一直挂着的菜单宿主里，不能放进弹层内容：弹层每次打开都会重挂子树，
// 收藏请求在途时关掉菜单，结果就落不回来了。所以这里只给 hook，不画任何东西。
//
// 身份保护照旧（V1 验收的那两条竞态）：
//   · 分享的链接带当前条目的 artifactId，不带地址栏里旧的 `?item=`；
//   · 收藏请求在途时换了条目，迟到的结果不许改新条目的状态。

import { useCallback, useEffect, useRef, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import { useToast } from "../ui/Toast";
import { humanErrorMessage } from "./human-error-message";
import { isDurableLibraryItem, type LibraryItem } from "./library-data";
import { writeClipboardText } from "./share/share-clipboard";

export function shareUrlForLibraryItem(item: LibraryItem): string {
  const identity = String(item.artifactId || item.id || "").trim();
  if (typeof window === "undefined") return String(item.url || "");
  try {
    const url = new URL(window.location.href);
    if (identity) {
      url.searchParams.set("item", identity);
      url.searchParams.delete("mode");
    }
    return url.toString();
  } catch {
    return window.location.href || item.url || "";
  }
}

export interface EditorItemSocial {
  /** 当前条目的身份；菜单根上落成 data-artifact-id / data-revision-id。 */
  artifactId: string | null;
  revisionId: string | null;
  /** 有可分享的链接才给「分享」。 */
  shareAvailable: boolean;
  /** 真条目、可读、完整、允许收藏才给「收藏」——做不到就不出这一项，不放灰按钮。 */
  favoriteAvailable: boolean;
  favorite: boolean;
  busy: "share" | "favorite" | "";
  /** 最近一次失败的人话原因（同时已经弹过 toast）。 */
  error: string;
  /**
   * 最近一次成功的人话反馈（「已复制」「已加入收藏」…），与 toast 同文，
   * {@link EDITOR_ITEM_SOCIAL_NOTICE_MS} 后自动清空。宿主没挂 toast 时，`···` 靠它把反馈画在按钮旁。
   */
  notice: string;
  share(): Promise<void>;
  toggleFavorite(): Promise<void>;
}

export const EDITOR_ITEM_SOCIAL_NOTICE_MS = 2400;

export function useEditorItemSocial(
  item: LibraryItem | null | undefined,
): EditorItemSocial {
  const tt = useUI();
  const toast = useToast();
  const [favorite, setFavorite] = useState(Boolean(item?.favorite));
  const [busy, setBusy] = useState<"share" | "favorite" | "">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const itemRef = useRef(item);
  itemRef.current = item;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const favoriteRef = useRef(favorite);
  favoriteRef.current = favorite;
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    generationRef.current += 1;
    setFavorite(Boolean(item?.favorite));
    setBusy("");
    setError("");
    setNotice("");
  }, [item?.artifactId, item?.favorite, item?.id, item?.revisionId]);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), EDITOR_ITEM_SOCIAL_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const shareUrl = item ? shareUrlForLibraryItem(item) : "";
  const durable = item && isDurableLibraryItem(item) ? item : null;
  const favoriteAvailable = Boolean(
    durable &&
      durable.artifact.access.canRead &&
      durable.artifact.integrity.ok &&
      durable.artifact.access.canFavorite,
  );

  const fail = useCallback(
    (generation: number, caught: unknown, fallback: string) => {
      if (!mountedRef.current || generation !== generationRef.current) return;
      const message = humanErrorMessage(caught, fallback);
      setNotice("");
      setError(message);
      toast.error(message);
    },
    [toast],
  );

  const share = useCallback(async () => {
    const current = itemRef.current;
    if (!current || busyRef.current) return;
    const url = shareUrlForLibraryItem(current);
    if (!url) return;
    const generation = generationRef.current;
    setBusy("share");
    setError("");
    setNotice("");
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title: current.title, url });
        return;
      }
      const copied = await writeClipboardText(url);
      if (!copied) throw new Error(tt("复制失败，请手动复制文案。"));
      if (!mountedRef.current || generation !== generationRef.current) return;
      const copiedMessage = tt("已复制");
      setNotice(copiedMessage);
      toast.success(copiedMessage);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      fail(generation, caught, tt("复制失败，请手动复制文案。"));
    } finally {
      if (mountedRef.current && generation === generationRef.current) {
        setBusy("");
      }
    }
  }, [fail, toast, tt]);

  const toggleFavorite = useCallback(async () => {
    const current = itemRef.current;
    const currentDurable =
      current && isDurableLibraryItem(current) ? current : null;
    if (!currentDurable || busyRef.current) return;
    const access = currentDurable.artifact.access;
    if (
      !access.canRead ||
      !currentDurable.artifact.integrity.ok ||
      !access.canFavorite
    ) {
      return;
    }
    const generation = generationRef.current;
    const requested = {
      artifactId: currentDurable.artifactId,
      revisionId: currentDurable.revisionId,
    };
    const next = !favoriteRef.current;
    setBusy("favorite");
    setError("");
    setNotice("");
    try {
      const { setArtifactFavorite } = await import("./artifact-client");
      const result = await setArtifactFavorite(currentDurable, next);
      const latest = itemRef.current;
      const latestDurable =
        latest && isDurableLibraryItem(latest) ? latest : null;
      if (
        !mountedRef.current ||
        generation !== generationRef.current ||
        !latestDurable ||
        latestDurable.artifactId !== requested.artifactId ||
        latestDurable.revisionId !== requested.revisionId
      ) {
        return;
      }
      if (
        !result.ok ||
        !result.data ||
        result.data.artifactId !== requested.artifactId ||
        result.data.revisionId !== requested.revisionId
      ) {
        throw new Error(result.error || tt("操作失败，请重试"));
      }
      setFavorite(next);
      const favoriteMessage = tt(next ? "已加入收藏" : "已取消收藏");
      setNotice(favoriteMessage);
      toast.success(favoriteMessage);
    } catch (caught) {
      fail(generation, caught, tt("操作失败，请重试"));
    } finally {
      if (mountedRef.current && generation === generationRef.current) {
        setBusy("");
      }
    }
  }, [fail, toast, tt]);

  return {
    artifactId: item?.artifactId || null,
    revisionId: item?.revisionId || null,
    shareAvailable: Boolean(shareUrl),
    favoriteAvailable,
    favorite,
    busy,
    error,
    notice,
    share,
    toggleFavorite,
  };
}
