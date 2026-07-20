"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import {
  isEnsureableTransient,
  type ArtifactCardAction,
} from "./artifact-contract";
import {
  getArtifactDownload,
  prepareArtifactForAction,
  setArtifactFavorite,
} from "./artifact-client";
import {
  isDurableLibraryItem,
  type LibraryItem,
} from "./library-data";
import { editorCapabilityFor } from "./workbench-routes";

export interface ArtifactActionState {
  action: ArtifactCardAction;
  visible: boolean;
  available: boolean;
  reason: string;
  requiresEnsure: boolean;
}

export interface ArtifactTargetActionEvidence {
  visible: boolean;
  available: boolean;
  reason: string;
}

export interface ArtifactActionMatrixOptions {
  canOpenPreview?: boolean;
  canOpenEdit?: boolean;
  insert?: ArtifactTargetActionEvidence;
  replace?: ArtifactTargetActionEvidence;
}

function previewEvidence(item: LibraryItem): {
  visible: boolean;
  available: boolean;
  reason: string;
} {
  if (isDurableLibraryItem(item)) {
    if (!item.artifact.access.canRead || !item.artifact.access.canPreview) {
      return {
        visible: false,
        available: false,
        reason: "当前主体没有这个 revision 的 Preview 权限。",
      };
    }
    if (
      !item.artifact.renditions.preview &&
      !item.artifact.renditions.full
    ) {
      return {
        visible: true,
        available: false,
        reason: "当前 revision 没有 preview 或 full rendition。",
      };
    }
    return { visible: true, available: true, reason: "" };
  }
  if (item.url || item.previewUrl || item.content) {
    return { visible: true, available: true, reason: "" };
  }
  return {
    visible: true,
    available: false,
    reason: "这个条目没有可查看的 rendition。",
  };
}

function editEvidence(item: LibraryItem): {
  visible: boolean;
  available: boolean;
  reason: string;
  requiresEnsure: boolean;
} {
  const localCapability = editorCapabilityFor(item);
  if (isDurableLibraryItem(item)) {
    if (!item.artifact.access.canRead) {
      return {
        visible: false,
        available: false,
        reason: "当前主体没有读取这个 revision 的权限。",
        requiresEnsure: false,
      };
    }
    if (!item.artifact.access.canEdit && !item.artifact.access.canFork) {
      return {
        visible: false,
        available: false,
        reason: "当前主体没有编辑原 root 或 fork 用户副本的权限。",
        requiresEnsure: false,
      };
    }
    if (item.artifact.editability === "view_only") {
      return {
        visible: true,
        available: false,
        reason: "此 revision 明确为只读。",
        requiresEnsure: false,
      };
    }
    if (!item.artifact.integrity.ok) {
      return {
        visible: true,
        available: false,
        reason: item.artifact.integrity.reason,
        requiresEnsure: false,
      };
    }
    if (!item.artifact.editorCapability) {
      return {
        visible: true,
        available: false,
        reason: "服务端没有为此 revision 声明 typed editor capability。",
        requiresEnsure: false,
      };
    }
    if (!localCapability.available) {
      return {
        visible: true,
        available: false,
        reason: localCapability.unavailableReason,
        requiresEnsure: false,
      };
    }
    return {
      visible: true,
      available: true,
      reason: "",
      requiresEnsure: false,
    };
  }
  if (!isEnsureableTransient(item.transient)) {
    return {
      visible: true,
      available: false,
      reason:
        "临时结果缺少稳定幂等 receipt；不能用临时 URL 直接进入编辑器。",
      requiresEnsure: false,
    };
  }
  if (!localCapability.available) {
    return {
      visible: true,
      available: false,
      reason: localCapability.unavailableReason,
      requiresEnsure: true,
    };
  }
  return {
    visible: true,
    available: true,
    reason: "",
    requiresEnsure: true,
  };
}

function mutationSourceEvidence(
  item: LibraryItem,
  action: "insert" | "replace",
): {
  visible: boolean;
  available: boolean;
  reason: string;
  requiresEnsure: boolean;
} {
  if (isDurableLibraryItem(item)) {
    if (!item.artifact.access.canRead) {
      return {
        visible: false,
        available: false,
        reason: "当前主体没有读取这个 revision 的权限。",
        requiresEnsure: false,
      };
    }
    const allowed =
      action === "insert"
        ? item.artifact.access.canInsert
        : item.artifact.access.canReplace;
    if (!allowed) {
      return {
        visible: false,
        available: false,
        reason: `当前主体没有以此 revision 执行${
          action === "insert" ? "插入" : "替换"
        }的权限。`,
        requiresEnsure: false,
      };
    }
    if (!item.artifact.integrity.ok) {
      return {
        visible: true,
        available: false,
        reason: item.artifact.integrity.reason,
        requiresEnsure: false,
      };
    }
    return {
      visible: true,
      available: true,
      reason: "",
      requiresEnsure: false,
    };
  }
  return isEnsureableTransient(item.transient)
    ? {
        visible: true,
        available: true,
        reason: "",
        requiresEnsure: true,
      }
    : {
        visible: true,
        available: false,
        reason: "必须先取得 durable artifactId/revisionId。",
        requiresEnsure: false,
      };
}

export function artifactActionMatrix(
  item: LibraryItem,
  options: ArtifactActionMatrixOptions = {},
): Record<ArtifactCardAction, ArtifactActionState> {
  const preview = previewEvidence(item);
  const edit = editEvidence(item);
  const insertSource = mutationSourceEvidence(item, "insert");
  const replaceSource = mutationSourceEvidence(item, "replace");
  const insertTarget = options.insert;
  const replaceTarget = options.replace;
  return {
    preview: {
      action: "preview",
      visible: preview.visible,
      available: preview.available && options.canOpenPreview !== false,
      reason:
        preview.reason ||
        (options.canOpenPreview === false
          ? "当前工作区没有 Preview 宿主。"
          : ""),
      requiresEnsure: false,
    },
    edit: {
      action: "edit",
      visible: edit.visible,
      available: edit.available && options.canOpenEdit !== false,
      reason:
        edit.reason ||
        (options.canOpenEdit === false
          ? "当前工作区没有注册 typed Edit route。"
          : ""),
      requiresEnsure: edit.requiresEnsure,
    },
    insert: {
      action: "insert",
      visible:
        insertSource.visible && insertTarget?.visible === true,
      available:
        insertSource.available && insertTarget?.available === true,
      reason: insertSource.reason || insertTarget?.reason || "",
      requiresEnsure: insertSource.requiresEnsure,
    },
    replace: {
      action: "replace",
      visible:
        replaceSource.visible && replaceTarget?.visible === true,
      available:
        replaceSource.available && replaceTarget?.available === true,
      reason: replaceSource.reason || replaceTarget?.reason || "",
      requiresEnsure: replaceSource.requiresEnsure,
    },
  };
}

const ACTION_LABEL: Record<ArtifactCardAction, string> = {
  preview: "预览",
  edit: "编辑",
  insert: "插入",
  replace: "替换",
};

export function ArtifactActionButtons({
  item,
  matrix,
  onPreview,
  onEdit,
  onInsert,
  onReplace,
  onStatus,
  accent = "#4f46e5",
  compact = false,
}: {
  item: LibraryItem;
  matrix: Record<ArtifactCardAction, ArtifactActionState>;
  onPreview?: (item: LibraryItem) => void | Promise<void>;
  onEdit?: (item: LibraryItem) => void | Promise<void>;
  onInsert?: (item: LibraryItem) => void | Promise<void>;
  onReplace?: (item: LibraryItem) => void | Promise<void>;
  onStatus?: (message: string) => void;
  accent?: string;
  compact?: boolean;
}) {
  const tt = useUI();
  const reasonId = useId();
  const [pending, setPending] = useState<
    ArtifactCardAction | "download" | "favorite" | null
  >(null);
  const [favorite, setFavorite] = useState(item.favorite);
  const [liveStatus, setLiveStatus] = useState("");
  useEffect(() => {
    setFavorite(item.favorite);
  }, [item.artifactId, item.favorite, item.revisionId]);
  const report = (message: string) => {
    const translated = tt(message);
    setLiveStatus(translated);
    onStatus?.(translated);
  };
  const handlers = useMemo(
    () => ({
      preview: onPreview,
      edit: onEdit,
      insert: onInsert,
      replace: onReplace,
    }),
    [onEdit, onInsert, onPreview, onReplace],
  );
  const run = async (action: ArtifactCardAction) => {
    const state = matrix[action];
    const handler = handlers[action];
    if (!state.available || !handler || pending) {
      if (state.reason) report(state.reason);
      return;
    }
    setPending(action);
    report(
      state.requiresEnsure
        ? "正在建立耐久 artifact identity…"
        : `${ACTION_LABEL[action]}中…`,
    );
    try {
      const prepared = await prepareArtifactForAction(action, item);
      if (!prepared.ok || !prepared.data) {
        throw new Error(prepared.error || `${ACTION_LABEL[action]}失败。`);
      }
      await handler(prepared.data);
      report(`${ACTION_LABEL[action]}已执行。`);
    } catch (error) {
      report(
        error instanceof Error
          ? error.message
          : `${ACTION_LABEL[action]}失败，请重试。`,
      );
    } finally {
      setPending(null);
    }
  };
  const durableItem = isDurableLibraryItem(item) ? item : null;
  const downloadAvailable = Boolean(
    durableItem &&
      durableItem.artifact.access.canRead &&
      durableItem.artifact.access.canPreview,
  );
  const favoriteVisible = Boolean(
    durableItem &&
      durableItem.artifact.access.canRead &&
      durableItem.artifact.integrity.ok &&
      durableItem.artifact.access.canFavorite,
  );
  const runDownload = async () => {
    if (!downloadAvailable || pending) return;
    setPending("download");
    report("正在准备固定 revision 的下载…");
    try {
      const result = await getArtifactDownload(item);
      if (
        !result.ok ||
        !result.data ||
        !durableItem ||
        result.data.artifactId !== durableItem.artifactId ||
        result.data.revisionId !== durableItem.revisionId
      ) {
        throw new Error(result.error || "下载 identity 校验失败。");
      }
      const link = document.createElement("a");
      link.href = result.data.url;
      link.download = result.data.filename;
      link.rel = "noopener noreferrer";
      link.style.display = "none";
      document.body.append(link);
      link.click();
      link.remove();
      report("下载已开始。");
    } catch (error) {
      report(error instanceof Error ? error.message : "下载失败。");
    } finally {
      setPending(null);
    }
  };
  const toggleFavorite = async () => {
    if (!favoriteVisible || pending) return;
    setPending("favorite");
    const next = !favorite;
    report(next ? "正在收藏…" : "正在取消收藏…");
    try {
      const result = await setArtifactFavorite(item, next);
      if (
        !result.ok ||
        !result.data ||
        !durableItem ||
        result.data.artifactId !== durableItem.artifactId ||
        result.data.revisionId !== durableItem.revisionId
      ) {
        throw new Error(result.error || "收藏 identity 校验失败。");
      }
      setFavorite(next);
      report(next ? "已收藏。" : "已取消收藏。");
    } catch (error) {
      report(error instanceof Error ? error.message : "收藏失败。");
    } finally {
      setPending(null);
    }
  };
  const visible = (
    ["preview", "edit", "insert", "replace"] as ArtifactCardAction[]
  ).filter((action) => matrix[action].visible);
  const unavailableReason = [
    ...new Set(
      visible
        .map((action) => matrix[action])
        .filter((state) => !state.available && state.reason)
        .map(
          (state) =>
            `${ACTION_LABEL[state.action]}：${state.reason}`,
        ),
    ),
  ].join(" · ");
  return (
    <div className="min-w-0">
      <div
        className={`flex flex-wrap items-center ${compact ? "gap-1" : "gap-1.5"}`}
        role="group"
        aria-label={tt("素材操作")}
      >
        {visible.map((action) => {
          const state = matrix[action];
          const disabled =
            !state.available || !handlers[action] || pending !== null;
          return (
            <button
              key={action}
              type="button"
              onClick={() => void run(action)}
              disabled={disabled}
              aria-disabled={disabled}
              aria-describedby={
                !state.available && state.reason ? reasonId : undefined
              }
              aria-label={tt(
                `${ACTION_LABEL[action]}「${item.title}」${
                  state.reason ? `：${state.reason}` : ""
                }`,
              )}
              title={tt(state.reason || ACTION_LABEL[action])}
              className={`inline-flex min-h-8 min-w-11 items-center justify-center rounded-lg border font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45 ${
                compact ? "px-1.5 text-[10px]" : "px-2.5 text-[11px]"
              }`}
              style={{
                borderColor: state.available
                  ? `${accent}66`
                  : "var(--border,#e7e5e4)",
                color: state.available
                  ? accent
                  : "var(--muted,#a8a29e)",
                outlineColor: accent,
              }}
            >
              {pending === action
                ? tt("处理中…")
                : tt(ACTION_LABEL[action])}
            </button>
          );
        })}
        {downloadAvailable && (
          <button
            type="button"
            onClick={() => void runDownload()}
            disabled={!downloadAvailable || pending !== null}
            aria-disabled={!downloadAvailable || pending !== null}
            aria-label={tt(
              `下载「${item.title}」revision ${durableItem?.revisionId || ""}`,
            )}
            title={tt(
              downloadAvailable
                ? "下载"
                : "当前 revision 没有可下载的授权 rendition。",
            )}
            className={`inline-flex min-h-8 min-w-11 items-center justify-center rounded-lg border font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45 ${
              compact ? "px-1.5 text-[10px]" : "px-2.5 text-[11px]"
            }`}
            style={{
              borderColor: downloadAvailable
                ? `${accent}66`
                : "var(--border,#e7e5e4)",
              color: downloadAvailable
                ? accent
                : "var(--muted,#a8a29e)",
              outlineColor: accent,
            }}
          >
            {pending === "download" ? tt("处理中…") : tt("下载")}
          </button>
        )}
        {favoriteVisible && (
          <button
            type="button"
            onClick={() => void toggleFavorite()}
            disabled={pending !== null}
            aria-disabled={pending !== null}
            aria-pressed={favorite}
            aria-label={tt(
              `${favorite ? "取消收藏" : "收藏"}「${item.title}」revision ${item.revisionId}`,
            )}
            className={`inline-flex min-h-8 min-w-11 items-center justify-center rounded-lg border font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45 ${
              compact ? "px-1.5 text-[10px]" : "px-2.5 text-[11px]"
            }`}
            style={{
              borderColor: `${accent}66`,
              color: accent,
              outlineColor: accent,
            }}
          >
            {pending === "favorite"
              ? tt("处理中…")
              : tt(favorite ? "已收藏" : "收藏")}
          </button>
        )}
      </div>
      {unavailableReason && (
        <p
          id={reasonId}
          className="mt-1 line-clamp-2 text-[9px] leading-snug text-[var(--muted,#a8a29e)]"
          role="note"
        >
          {tt(unavailableReason)}
        </p>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {liveStatus}
      </span>
    </div>
  );
}
