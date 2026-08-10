"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import {
  isEnsureableTransient,
  type ArtifactCardAction,
} from "./artifact-contract";
import {
  artifactDownloadEvidence,
  getArtifactDownload,
  prepareArtifactForAction,
  setArtifactFavorite,
} from "./artifact-client";
import { DeckHtmlActionButton, deckHtmlEvidence } from "./DeckHtmlAction";
import { humanErrorMessage } from "./human-error-message";
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

/**
 * 这份素材的耐久身份取到了没有。
 *
 * 「下载」与「收藏」都要先有 `artifactId + revisionId`；官方模板目录行身上没有，
 * 得先向服务端要一次当前版本。那一次要是失败了，过去两颗按钮**整个消失**——读者
 * 看到的是一个少了两项的动作条，既不知道少了什么，也没有任何办法把它们要回来，
 * 只能刷新整页碰运气。
 *
 * 所以宿主要把这件事说出来：按钮**留在原地**，标注为什么现在按不动，并给一颗「重试」。
 * 不传这个字段时行为与过去逐字相同（身份从别处来，或本来就不该有这两项）。
 */
export interface ArtifactIdentityState {
  /** 正在取当前版本。 */
  resolving: boolean;
  /** 取失败了。 */
  failed: boolean;
  /** 给用户看的一句中文；必须说清下一步。 */
  reason: string;
  /** 重试这一次取数，免得读者只能刷新整页。 */
  onRetry?: () => void;
}

/**
 * 「全屏」到底有没有东西可放大。
 *
 * 过去这颗按钮的可见性只看宿主传没传回调（`typeof onFullscreen === "function"`），
 * 而宿主是无条件传的，于是它**对任何素材恒亮**：详情里明明只有一句「暂时无法预览」，
 * 按钮照样亮，点下去把一屏文字连同一排工具条送进原生全屏。
 *
 * 现在它要两个前提同时成立：宿主给了落点，**且**这份素材确实有可显示的本体或预览。
 * 判据直接复用「预览」那一套证据，避免同一件事在两处各写一遍、各自漂移。
 */
function fullscreenContentEvidence(item: LibraryItem): {
  visible: boolean;
  reason: string;
} {
  const preview = previewEvidence(item);
  return preview.available
    ? { visible: true, reason: "" }
    : {
        visible: false,
        reason: preview.reason || "这份素材现在没有可放大的内容。",
      };
}

export interface ArtifactActionMatrixOptions {
  canOpenPreview?: boolean;
  canOpenEdit?: boolean;
  /** Library surfaces hide the Preview button; quiet preview is the detail page. */
  hidePreview?: boolean;
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
    // Editable shelves are filtered by the host. Always show Edit here; keep
    // availability tied to typed capability / mutate rights so missing
    // editorCapability remains the hard gate.
    if (!item.artifact.access.canEdit && !item.artifact.access.canFork) {
      return {
        visible: true,
        available: false,
        reason: "当前主体没有编辑原 root 或 fork 用户副本的权限。",
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
  // 官方模板目录行不是 durable artifact，也没有生成 receipt，但编辑决策链能凭
  // 目录里的 artifactId 解析服务端当前 head 并 fork 成用户副本（见 artifact-client
  // 的 durableEditDecisionItem）。这张卡片不预判 canFork / 登录态 / 编辑器能力——
  // 预览图的扩展名不代表素材本体的编辑器；点击后的决策链会裁决并据实上报原因。
  if (
    String(item.meta?.template_material_id || "").trim() &&
    String(item.meta?.template_material_artifact_id || "").trim()
  ) {
    return {
      visible: true,
      available: true,
      reason: "",
      requiresEnsure: true,
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
  const hidePreview = options.hidePreview === true;
  return {
    preview: {
      action: "preview",
      visible: hidePreview ? false : preview.visible,
      available:
        !hidePreview &&
        preview.available &&
        options.canOpenPreview !== false,
      reason: hidePreview
        ? ""
        : preview.reason ||
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

const ACTION_PENDING_STATUS: Record<ArtifactCardAction, string> = {
  preview: "正在打开预览…",
  edit: "正在打开编辑器…",
  insert: "正在插入素材…",
  replace: "正在替换素材…",
};

const ACTION_ENSURE_PENDING_STATUS: Record<ArtifactCardAction, string> = {
  preview: "正在建立耐久 artifact identity 并打开预览…",
  edit: "正在建立耐久 artifact identity 并打开编辑器…",
  insert: "正在建立耐久 artifact identity 并插入素材…",
  replace: "正在建立耐久 artifact identity 并替换素材…",
};

const ACTION_SUCCESS_STATUS: Record<ArtifactCardAction, string> = {
  preview: "预览已打开。",
  edit: "编辑器已打开。",
  insert: "素材已插入。",
  replace: "素材已替换。",
};

export function ArtifactActionButtons({
  item,
  matrix,
  onPreview,
  onEdit,
  onInsert,
  onReplace,
  onFullscreen,
  fullscreenContentPresent,
  identity,
  linkUrl,
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
  onFullscreen?: () => void | Promise<void>;
  /**
   * 宿主已经渲染出来的那块详情里，**当下**有没有可放大的东西。素材本身的证据
   * （`fullscreenContentEvidence`）只知道「应该有」，知道「真的有」的只有宿主。
   * 不传就只按素材证据判断。
   */
  fullscreenContentPresent?: boolean;
  identity?: ArtifactIdentityState;
  linkUrl?: string;
  onStatus?: (message: string) => void;
  accent?: string;
  compact?: boolean;
}) {
  const tt = useUI();
  const reasonId = useId();
  /**
   * **每个入口各自记自己在不在忙**。过去这里是一个单值 `pending`：任何一颗按钮一动，
   * 其余全部 `disabled`——「下载」在跑的十几秒里「收藏」是死的，一次失败的请求还没
   * 落地之前整条动作条都按不动。合同 §4「这两个入口应各自独立可用」说的就是这件事。
   * 真正需要互斥的是插入/替换那种会改编辑器历史的命令，那道闸在宿主的
   * `applyMaterialAction` 里，不该由这排按钮代劳。
   */
  const [busy, setBusy] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const isBusy = (key: string) => busy.has(key);
  const beginBusy = (key: string) =>
    setBusy((previous) => new Set(previous).add(key));
  const endBusy = (key: string) =>
    setBusy((previous) => {
      const next = new Set(previous);
      next.delete(key);
      return next;
    });
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
    if (!state.available || !handler || isBusy(action)) {
      if (state.reason) report(state.reason);
      return;
    }
    beginBusy(action);
    report(
      state.requiresEnsure
        ? ACTION_ENSURE_PENDING_STATUS[action]
        : ACTION_PENDING_STATUS[action],
    );
    try {
      const prepared = await prepareArtifactForAction(action, item);
      if (!prepared.ok || !prepared.data) {
        throw new Error(prepared.error || `${ACTION_LABEL[action]}失败。`);
      }
      await handler(prepared.data);
      report(ACTION_SUCCESS_STATUS[action]);
    } catch (error) {
      // 抛上来的可能是我们自己那句中文，也可能是宿主编辑器里冒出来的运行时异常
      // （`Cannot read properties of undefined` 之类）。后者不许摆给读者。
      report(
        humanErrorMessage(error, `${ACTION_LABEL[action]}失败，请重试。`),
      );
    } finally {
      endBusy(action);
    }
  };
  const durableItem = isDurableLibraryItem(item) ? item : null;
  const downloadEvidence = artifactDownloadEvidence(item);
  /**
   * 身份还在路上、或者刚刚没取回来时，「下载」与「收藏」**留在原地**，
   * 只是按不动并写清为什么。消失掉才是最坏的一种：读者既看不出少了什么，也没有
   * 任何办法把它们要回来（复现见 W4-journal J3）。
   */
  const identityPending = identity?.resolving === true;
  const identityFailed = identity?.failed === true;
  const identityBlocked = identityPending || identityFailed;
  const identityReason = identityPending
    ? "正在取这份素材的当前版本…"
    : identity?.reason || "没取到这份素材的当前版本，重试一次即可。";
  const downloadVisible = downloadEvidence.visible || identityBlocked;
  const downloadReason = identityBlocked
    ? identityReason
    : downloadEvidence.reason;
  const downloadAvailable = downloadEvidence.available && !identityBlocked;
  const favoriteVisible =
    Boolean(durableItem && durableItem.artifact.access.canRead) ||
    identityBlocked;
  const favoriteAvailable = Boolean(
    !identityBlocked &&
      durableItem &&
      durableItem.artifact.access.canRead &&
      durableItem.artifact.integrity.ok &&
      durableItem.artifact.access.canFavorite,
  );
  const favoriteReason = identityBlocked
    ? identityReason
    : "当前主体没有收藏这个 artifact 的权限。";
  /**
   * 「网页版」是从稿子当场渲的，所以它跟着**稿子**在不在，而不是跟着 rendition 走。
   * 身份还没取回来时它与下载同口径：留在原地、按不动、说同一句话——那一刻我们连
   * 当前 revision 是哪个都还不知道，渲出来的很可能不是用户看的这一版。
   */
  const deckHtmlSource = deckHtmlEvidence(item);
  const deckHtml = {
    ...deckHtmlSource,
    available: deckHtmlSource.available && !identityBlocked,
    reason: identityBlocked ? identityReason : deckHtmlSource.reason,
  };
  const fullscreenEvidence = fullscreenContentEvidence(item);
  const fullscreenVisible =
    typeof onFullscreen === "function" &&
    fullscreenEvidence.visible &&
    fullscreenContentPresent !== false;
  const retryVisible = identityFailed && typeof identity?.onRetry === "function";
  const linkVisible = Boolean(linkUrl);
  const runDownload = async () => {
    if (!downloadAvailable || isBusy("download")) {
      if (!downloadAvailable) {
        report(downloadReason);
      }
      return;
    }
    beginBusy("download");
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
      link.type = result.data.mediaType;
      link.rel = "noopener noreferrer";
      link.referrerPolicy = "no-referrer";
      link.style.display = "none";
      document.body.append(link);
      link.click();
      link.remove();
      report("下载已开始。");
    } catch (error) {
      report(humanErrorMessage(error, "下载没能开始，请稍后重试。"));
    } finally {
      endBusy("download");
    }
  };
  const toggleFavorite = async () => {
    if (!favoriteAvailable || isBusy("favorite")) {
      if (!favoriteAvailable) {
        report(favoriteReason);
      }
      return;
    }
    beginBusy("favorite");
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
      report(humanErrorMessage(error, "收藏没能保存，请稍后重试。"));
    } finally {
      endBusy("favorite");
    }
  };
  const runFullscreen = async () => {
    if (!fullscreenVisible || isBusy("fullscreen")) return;
    beginBusy("fullscreen");
    report("正在进入全屏…");
    try {
      await onFullscreen?.();
      report("已进入全屏。");
    } catch (error) {
      // 这一条最常踩：`requestFullscreen()` 被拒时浏览器抛的是
      // `TypeError: Permissions check failed` 这种英文原文——嵌在没开
      // `allowfullscreen` 的 iframe 里、或者手势判定没通过时每次都会走到这儿。
      report(
        humanErrorMessage(error, "浏览器没有允许进入全屏，可以改用整页浏览。"),
      );
    } finally {
      endBusy("fullscreen");
    }
  };
  const runIdentityRetry = () => {
    report("正在重新取这份素材的当前版本…");
    identity?.onRetry?.();
  };
  // Library material order: 编辑 → 下载 → 收藏 → 全屏 → 链接.
  // 「网页版」紧跟在下载后面，只在 deck 条目上出现（`deckHtmlEvidence` 自己判可见性）。
  // Insert/Replace follow when an editor host registers them.
  // Preview is hidden for library materials via matrix.hidePreview.
  const primaryActions = (
    ["edit", "preview"] as ArtifactCardAction[]
  ).filter((action) => matrix[action].visible);
  const mutationActions = (
    ["insert", "replace"] as ArtifactCardAction[]
  ).filter((action) => matrix[action].visible);
  const visible = [...primaryActions, ...mutationActions];
  // 「下载」「收藏」也要进这条理由行：它们现在会以**按不动但仍在原地**的形态出现，
  // 而一颗灰着的按钮如果不写为什么，比消失好不了多少。
  const unavailableReason = [
    ...new Set(
      [
        ...visible
          .map((action) => matrix[action])
          .filter((state) => !state.available && state.reason)
          .map((state) => `${ACTION_LABEL[state.action]}：${state.reason}`),
        ...(downloadVisible && !downloadAvailable && downloadReason
          ? [`下载：${downloadReason}`]
          : []),
        ...(favoriteVisible && !favoriteAvailable && favoriteReason
          ? [`收藏：${favoriteReason}`]
          : []),
        ...(deckHtml.visible && !deckHtml.available && deckHtml.reason
          ? [`网页版：${deckHtml.reason}`]
          : []),
      ],
    ),
  ].join(" · ");
  const chipClass = `inline-flex min-h-8 min-w-11 items-center justify-center rounded-lg border font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45 ${
    compact ? "px-1.5 text-[10px]" : "px-2.5 text-[11px]"
  }`;
  const chipStyle = (enabled: boolean) => ({
    borderColor: enabled ? `${accent}66` : "var(--border,#e7e5e4)",
    color: enabled ? accent : "var(--muted,#a8a29e)",
    outlineColor: accent,
  });
  const renderAction = (action: ArtifactCardAction) => {
    const state = matrix[action];
    const disabled =
      !state.available || !handlers[action] || isBusy(action);
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
        className={chipClass}
        style={chipStyle(state.available)}
      >
        {isBusy(action) ? tt("处理中…") : tt(ACTION_LABEL[action])}
      </button>
    );
  };
  return (
    <div className="min-w-0">
      <div
        className={`flex flex-wrap items-center ${compact ? "gap-1" : "gap-1.5"}`}
        role="group"
        aria-label={tt("素材操作")}
      >
        {primaryActions.map(renderAction)}
        {downloadVisible && (
          <button
            type="button"
            onClick={() => void runDownload()}
            disabled={!downloadAvailable || isBusy("download")}
            aria-disabled={!downloadAvailable || isBusy("download")}
            aria-describedby={!downloadAvailable ? reasonId : undefined}
            aria-label={tt(
              `下载「${item.title}」revision ${durableItem?.revisionId || ""}`,
            )}
            title={tt(
              downloadAvailable
                ? "下载"
                : downloadReason,
            )}
            className={chipClass}
            style={chipStyle(downloadAvailable)}
          >
            {isBusy("download") ? tt("处理中…") : tt("下载")}
          </button>
        )}
        <DeckHtmlActionButton
          item={item}
          evidence={deckHtml}
          report={report}
          reasonId={reasonId}
          className={chipClass}
          style={chipStyle(deckHtml.available)}
        />
        {favoriteVisible && (
          <button
            type="button"
            onClick={() => void toggleFavorite()}
            disabled={!favoriteAvailable || isBusy("favorite")}
            aria-disabled={!favoriteAvailable || isBusy("favorite")}
            aria-describedby={!favoriteAvailable ? reasonId : undefined}
            aria-pressed={favorite}
            aria-label={tt(
              `${favorite ? "取消收藏" : "收藏"}「${item.title}」revision ${item.revisionId}`,
            )}
            title={tt(
              favoriteAvailable
                ? favorite
                  ? "已收藏"
                  : "收藏"
                : favoriteReason,
            )}
            className={chipClass}
            style={chipStyle(favoriteAvailable)}
          >
            {isBusy("favorite")
              ? tt("处理中…")
              : tt(favorite ? "已收藏" : "收藏")}
          </button>
        )}
        {fullscreenVisible && (
          <button
            type="button"
            onClick={() => void runFullscreen()}
            disabled={isBusy("fullscreen")}
            aria-disabled={isBusy("fullscreen")}
            aria-label={tt(`全屏「${item.title}」`)}
            title={tt("全屏")}
            className={chipClass}
            style={chipStyle(true)}
          >
            {isBusy("fullscreen") ? tt("处理中…") : tt("全屏")}
          </button>
        )}
        {retryVisible && (
          <button
            type="button"
            onClick={runIdentityRetry}
            aria-label={tt(`重新取「${item.title}」的当前版本`)}
            title={tt("重试")}
            data-artifact-identity-retry="true"
            className={chipClass}
            style={chipStyle(true)}
          >
            {tt("重试")}
          </button>
        )}
        {linkVisible && (
          <a
            href={linkUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={tt(`链接「${item.title}」`)}
            title={tt("链接")}
            className={chipClass}
            style={chipStyle(true)}
          >
            {tt("链接")}
          </a>
        )}
        {mutationActions.map(renderAction)}
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
