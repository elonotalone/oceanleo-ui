"use client";

import { useEffect, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import { IconButton } from "../ui/Button";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import { humanErrorMessage } from "./human-error-message";
import { isDurableLibraryItem, type LibraryItem } from "./library-data";

export function shareUrlForLibraryItem(item: LibraryItem): string {
  if (typeof window === "undefined") return "";
  try {
    const url = new URL(window.location.href);
    const identity = item.artifactId || item.id;
    if (identity) url.searchParams.set("item", identity);
    return url.toString();
  } catch {
    return window.location.href || "";
  }
}

export function EditorItemSocialChrome({
  item,
}: {
  item: LibraryItem | null | undefined;
}) {
  const tt = useUI();
  const [favorite, setFavorite] = useState(Boolean(item?.favorite));
  const [busy, setBusy] = useState<"share" | "favorite" | "">("");
  const [error, setError] = useState("");
  useEffect(() => {
    setFavorite(Boolean(item?.favorite));
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
    setBusy("share");
    setError("");
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: item.title, url: shareUrl });
        return;
      }
      if (!navigator.clipboard) {
        throw new Error(tt("复制失败，请手动复制文案。"));
      }
      await navigator.clipboard.writeText(shareUrl);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(humanErrorMessage(caught, tt("复制失败，请手动复制文案。")));
    } finally {
      setBusy("");
    }
  };
  const toggleFavorite = async () => {
    if (!favoriteAvailable || busy) return;
    setBusy("favorite");
    const next = !favorite;
    setError("");
    try {
      const { setArtifactFavorite } = await import("./artifact-client");
      const result = await setArtifactFavorite(item, next);
      if (
        !result.ok ||
        !result.data ||
        !durable ||
        result.data.artifactId !== durable.artifactId ||
        result.data.revisionId !== durable.revisionId
      ) {
        throw new Error(result.error || tt("操作失败，请重试"));
      }
      setFavorite(next);
    } catch (caught) {
      setError(humanErrorMessage(caught, tt("操作失败，请重试")));
    } finally {
      setBusy("");
    }
  };
  return (
    <div
      data-editor-item-social
      className="flex items-center gap-0.5"
      data-artifact-id={item.artifactId || undefined}
      data-revision-id={item.revisionId || undefined}
    >
      {shareUrl ? (
        <IconButton
          data-editor-chrome-action="share"
          onClick={() => void share()}
          label={tt("分享")}
          title={error || tt("分享")}
          aria-busy={busy === "share" || undefined}
          icon={<AdvancedEditorIcon name="share" className="h-4 w-4" />}
        />
      ) : null}
      <IconButton
        data-editor-chrome-action="favorite"
        onClick={() => void toggleFavorite()}
        label={tt(favorite ? "取消收藏" : "收藏")}
        title={error || favoriteReason}
        aria-pressed={favorite}
        disabled={!favoriteAvailable}
        aria-busy={busy === "favorite" || undefined}
        icon={
          <AdvancedEditorIcon
            name="star"
            filled={favorite}
            className="h-4 w-4"
          />
        }
      />
      <span className="sr-only" role="status" aria-live="polite">
        {error}
      </span>
    </div>
  );
}
