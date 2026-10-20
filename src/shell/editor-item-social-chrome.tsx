"use client";

import { useEffect, useRef, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import { IconButton } from "../ui/Button";
import { useToast } from "../ui/Toast";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
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

export function EditorItemSocialChrome({
  item,
}: {
  item: LibraryItem | null | undefined;
}) {
  const tt = useUI();
  const toast = useToast();
  const [favorite, setFavorite] = useState(Boolean(item?.favorite));
  const [busy, setBusy] = useState<"share" | "favorite" | "">("");
  const [error, setError] = useState("");
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const itemRef = useRef(item);
  itemRef.current = item;
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
  }, [item?.artifactId, item?.favorite, item?.id, item?.revisionId]);
  if (!item) return null;
  const shareUrl = shareUrlForLibraryItem(item);
  const durable = isDurableLibraryItem(item) ? item : null;
  const favoriteAvailable = Boolean(
    durable &&
      durable.artifact.access.canRead &&
      durable.artifact.integrity.ok &&
      durable.artifact.access.canFavorite,
  );
  const favoriteReason = favoriteAvailable
    ? favorite
      ? tt("已收藏")
      : tt("收藏")
    : tt("操作失败，请重试");
  const share = async () => {
    if (!shareUrl || busy) return;
    const generation = generationRef.current;
    setBusy("share");
    setError("");
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: item.title, url: shareUrl });
        return;
      }
      const copied = await writeClipboardText(shareUrl);
      if (!copied) {
        throw new Error(tt("复制失败，请手动复制文案。"));
      }
      if (!mountedRef.current || generation !== generationRef.current) return;
      toast.success(tt("已复制"));
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      if (!mountedRef.current || generation !== generationRef.current) return;
      setError(humanErrorMessage(caught, tt("复制失败，请手动复制文案。")));
    } finally {
      if (mountedRef.current && generation === generationRef.current) {
        setBusy("");
      }
    }
  };
  const toggleFavorite = async () => {
    if (!favoriteAvailable || busy || !durable) return;
    const generation = generationRef.current;
    const requested = {
      artifactId: durable.artifactId,
      revisionId: durable.revisionId,
    };
    const next = !favorite;
    setBusy("favorite");
    setError("");
    try {
      const { setArtifactFavorite } = await import("./artifact-client");
      const result = await setArtifactFavorite(item, next);
      const current = itemRef.current;
      const currentDurable = current && isDurableLibraryItem(current) ? current : null;
      if (
        !mountedRef.current ||
        generation !== generationRef.current ||
        !currentDurable ||
        currentDurable.artifactId !== requested.artifactId ||
        currentDurable.revisionId !== requested.revisionId
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
    } catch (caught) {
      if (!mountedRef.current || generation !== generationRef.current) return;
      setError(humanErrorMessage(caught, tt("操作失败，请重试")));
    } finally {
      if (mountedRef.current && generation === generationRef.current) {
        setBusy("");
      }
    }
  };
  return (
    <div
      data-editor-item-social
      className="flex items-center gap-0.5"
      data-artifact-id={item.artifactId || undefined}
      data-revision-id={item.revisionId || undefined}
    >
      <span data-global-row-slot="share" className="flex items-center">
        {shareUrl ? (
          <IconButton
            data-editor-chrome-action="share"
            onClick={() => void share()}
            label={tt("分享")}
            title={error || tt("分享")}
            loading={busy === "share"}
            aria-busy={busy === "share" || undefined}
            icon={<AdvancedEditorIcon name="share" className="h-4 w-4" />}
          />
        ) : null}
      </span>
      <span data-global-row-slot="favorite" className="flex items-center">
        <IconButton
          data-editor-chrome-action="favorite"
          onClick={() => void toggleFavorite()}
          label={tt(favorite ? "取消收藏" : "收藏")}
          title={error || favoriteReason}
          aria-pressed={favorite}
          disabled={!favoriteAvailable}
          loading={busy === "favorite"}
          aria-busy={busy === "favorite" || undefined}
          icon={
            <AdvancedEditorIcon
              name="star"
              filled={favorite}
              className="h-4 w-4"
            />
          }
        />
      </span>
      <span className="sr-only" role="status" aria-live="polite">
        {error}
      </span>
    </div>
  );
}
