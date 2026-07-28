"use client";

// ============================================================================
// @oceanleo/ui — 详情浮层的「按归属 app 编辑」（合同 §3 W5 必做 2/3，口径 D3 §4）
// ----------------------------------------------------------------------------
// 两件事，都只服务于「安静预览详情」的头部：
//   ① `useMaterialDetailAppPlan` —— 选中一份素材时算出它的全部归属 app 与深链用的
//      artifact id；官方模板目录行还要先取回 durable 投影（见下）。
//   ② `MaterialOwningAppEdit` —— 每个归属 app 各一个编辑入口，点哪个进哪个。
//
// 单独成文件而不是塞进 `WorkspaceLibrary.tsx`：那个文件基线 634 行，本轮再加一段
// 就顶到共享包 ≤800 的约定上；而这段逻辑（归属解析 + durable 兜底取数 + 落点选择）
// 值得被 focused test 直接覆盖。
//
// 归属的解析**不在这里**：`libraryItemStoredAppAttributions` 是 W4 的单一事实源
// （`W4-interface-scope-and-dedupe.md` §4.3）。本模块只消费访问器，绝不自己再读一遍
// `meta` —— 同一个形状有两份实现，迟早各自漂移。
// ============================================================================

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import { getCurrentArtifactItem } from "./artifact-client";
import { isDurableLibraryItem, type LibraryItem } from "./library-data";
import {
  libraryItemStoredAppAttributions,
  type MaterialAppAttribution,
} from "./material-library-scope";
import { workspaceTemplatePreviewHref } from "./site-catalog-controller";
import {
  materialDeepLinkArtifactId,
  type WorkspaceLibraryEntry,
} from "./workspace-library-model";

export type { MaterialAppAttribution } from "./material-library-scope";

export interface MaterialDetailAppPlan {
  /** 动作条该用的那一份：能取到 durable 投影就是它，否则是货架原行。 */
  item: LibraryItem | null;
  /** 全部归属 app，已按 D3.3 排好序（`[0]` 是主 app）。 */
  apps: MaterialAppAttribution[];
  /** 深链指名的 artifact id；空串表示这份素材没有可深链的身份。 */
  artifactId: string;
  /**
   * 归属自己出编辑入口。为 true 时调用方必须把动作条上那颗**不指名 app** 的
   * 「编辑」藏掉，否则同一个浮层里会有两个说法不一样的编辑入口。
   */
  routeEditByApp: boolean;
}

const EMPTY_PLAN: MaterialDetailAppPlan = {
  item: null,
  apps: [],
  artifactId: "",
  routeEditByApp: false,
};

export function materialAppLabel(app: MaterialAppAttribution): string {
  return app.label || app.appId;
}

export interface MaterialDetailAppPlanInput {
  /** 当前选中的那一条；没选中传 null。 */
  entry: WorkspaceLibraryEntry | null;
  /** 选中项的稳定标识；变了就重新取数。 */
  selectionKey: string;
  /** 当前站；传了就只列本站归属（别站的绑定进不了本站工作台）。 */
  siteKey?: string;
  /** 当前工作台锚定的 app；归属等于它时不深链，就地进编辑器。 */
  appId?: string;
  /** 取数失败要出声——绝不留一块看不出所以然的浮层。 */
  onStatus: (message: string) => void;
}

export function useMaterialDetailAppPlan({
  entry,
  selectionKey,
  siteKey = "",
  appId = "",
  onStatus,
}: MaterialDetailAppPlanInput): MaterialDetailAppPlan {
  const tt = useUI();
  // `/v1/template-materials` 的目录行**故意**不是 durable artifact（没有 revision
  // 身份），于是「下载」与「收藏」在浮层里连出现都不出现——摆三颗按钮说成五项，正是
  // 操作员点名要消灭的占位。这里按目录行携带的官方 artifact root id 取一次当前 head。
  // 取数是**纯 GET**：打开预览不得 fork（合同 §0.5）。
  const [resolved, setResolved] = useState<LibraryItem | null>(null);
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;
  const shelfItem = entry?.libraryItem || null;
  const shelfItemRef = useRef(shelfItem);
  shelfItemRef.current = shelfItem;

  useEffect(() => {
    setResolved(null);
    const item = shelfItemRef.current;
    if (!item || isDurableLibraryItem(item)) return;
    const artifactId = materialDeepLinkArtifactId(item);
    if (!artifactId) return;
    const controller = new AbortController();
    void (async () => {
      const result = await getCurrentArtifactItem(
        artifactId,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (!result.ok || !result.data) {
        statusRef.current(
          result.error || tt("取不到这份素材的当前版本；下载与收藏暂不可用。"),
        );
        return;
      }
      // 货架行的 meta 打底：W4 合并归属时写下的 `material_app_bindings` 只存在于
      // 货架那一条上，新取回的投影没有它。丢了它等于把跨 app 归属又去重掉一次。
      setResolved({
        ...result.data,
        meta: { ...item.meta, ...result.data.meta },
      });
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);

  return useMemo(() => {
    if (!shelfItem) return EMPTY_PLAN;
    const item = resolved || shelfItem;
    const apps = libraryItemStoredAppAttributions(item, siteKey);
    const artifactId = materialDeepLinkArtifactId(item);
    // 只对**素材货架**的条目按归属分派。我的库里的作品归属就是它自己的铸造地，把
    // 「编辑」换成整页跳转只会打断用户；那条路保持既有的内联 typed 编辑器。
    const onMaterialShelf =
      shelfItem.meta?.workspace_library_surface === "materials";
    return {
      item,
      apps,
      artifactId,
      routeEditByApp:
        onMaterialShelf &&
        Boolean(artifactId) &&
        apps.length > 0 &&
        // 唯一的归属就是当前 app 时，深链等于原地打转——保持内联编辑。
        (apps.length > 1 || apps[0].appId !== appId),
    };
  }, [appId, resolved, shelfItem, siteKey]);
}

/**
 * 跨 app 素材的编辑入口组：**每个归属 app 各一颗**，点哪个进哪个（D3 §4）。
 * 只有一个归属时保持单颗「编辑」，不给读者凭空多出一层选择。
 */
export function MaterialOwningAppEdit({
  plan,
  item,
  appId = "",
  accent = "#4f46e5",
  compact = false,
  onEditHere,
}: {
  plan: MaterialDetailAppPlan;
  item: LibraryItem;
  appId?: string;
  accent?: string;
  compact?: boolean;
  /** 归属就是当前 app 时的落点：就地进 typed 编辑器。 */
  onEditHere: (app: MaterialAppAttribution, item: LibraryItem) => void;
}): ReactNode {
  const tt = useUI();
  if (!plan.routeEditByApp) return null;
  const multiple = plan.apps.length > 1;
  const chipClass = `inline-flex min-h-8 min-w-11 items-center justify-center rounded-lg border font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
    compact ? "px-1.5 text-[10px]" : "px-2.5 text-[11px]"
  }`;
  const chipStyle = {
    borderColor: `${accent}66`,
    color: accent,
    outlineColor: accent,
  };
  return (
    <div
      className={`flex min-w-0 flex-wrap items-center ${
        compact ? "gap-1" : "gap-1.5"
      }`}
      role="group"
      aria-label={tt("按归属 app 编辑")}
    >
      {plan.apps.map((app) => {
        const label = materialAppLabel(app);
        const text = multiple ? `${tt("编辑")} · ${tt(label)}` : tt("编辑");
        const ariaLabel = tt(`在「${label}」工作台编辑「${item.title}」`);
        // 别的 app 名下的素材：这是一次**去别处**，不是就地动作，所以用链接而不是
        // 按钮——新标签页打开、复制地址都照常可用。落点由
        // `workspaceTemplatePreviewHref` 锁死：那个 app 的工作台 + 它的库里这份预览。
        return app.appId === appId ? (
          <button
            key={app.appId}
            type="button"
            data-material-edit-app={app.appId}
            onClick={() => onEditHere(app, item)}
            aria-label={ariaLabel}
            title={tt(`在「${label}」里编辑`)}
            className={chipClass}
            style={chipStyle}
          >
            {text}
          </button>
        ) : (
          <a
            key={app.appId}
            href={workspaceTemplatePreviewHref(app.appId, plan.artifactId)}
            data-material-edit-app={app.appId}
            aria-label={ariaLabel}
            title={tt(`前往「${label}」工作台，并在它的库里打开这份素材`)}
            className={chipClass}
            style={chipStyle}
          >
            {text}
          </a>
        );
      })}
    </div>
  );
}

/** 跨 app 素材的归属名单（浮层标题下那一行）。单归属不占版面。 */
export function MaterialOwningAppList({
  plan,
}: {
  plan: MaterialDetailAppPlan;
}): ReactNode {
  const tt = useUI();
  if (plan.apps.length <= 1) return null;
  return (
    <p
      className="mt-0.5 truncate text-[11px] text-[var(--muted,#a8a29e)]"
      data-material-owning-apps={plan.apps.map((app) => app.appId).join(",")}
    >
      {tt("归属 app")}：
      {plan.apps.map((app) => tt(materialAppLabel(app))).join(" · ")}
    </p>
  );
}
