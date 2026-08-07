"use client";

// ============================================================================
// @oceanleo/ui — 详情浮层的「按归属 app 编辑」（合同 §3 W5 必做 2/3，口径 D3 §4）
// ----------------------------------------------------------------------------
// 两件事，都只服务于「安静预览详情」的头部：
//   ① `useMaterialDetailAppPlan` —— 选中一份素材时算出它的全部归属 app 与深链用的
//      artifact id；官方模板目录行还要先取回 durable 投影（见下）。
//   ② `MaterialOwningAppEdit` —— **一件素材一颗**编辑入口，落到它所在素材包的 app。
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
  /**
   * **那一颗编辑按钮要落的 app**，null 表示这份素材没有可用的落点。
   *
   * 一件素材只出一颗按钮，所以「落哪个 app」必须在这里一次定死，不能留给渲染层
   * 现挑（`W5-pack-model.md` §5.1）。选法见 `resolveEditApp`。
   */
  editApp: MaterialAppAttribution | null;
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
  editApp: null,
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
  /** 当前工作台锚定的 app（`?app=` 或工作台自身的 app）。 */
  appId?: string;
  /**
   * 这张卡是在**哪个素材包**里被点开的（`MaterialPackCard.appId`，
   * `W5-pack-model.md` §2/§5.1）。素材包 = 一个 app，所以它就是那颗编辑按钮的落点：
   * 用户从「海报生成」这个包里点开的素材，落到「海报生成」，上下文自洽。
   *
   * 传空串 = 调用方还没有包上下文（例如工作台抽屉里的素材货架）。那时按
   * `resolveEditApp` 的兜底顺序挑，绝不因为缺包上下文就退回「一排按钮」。
   */
  packAppId?: string;
  /** 取数失败要出声——绝不留一块看不出所以然的浮层。 */
  onStatus: (message: string) => void;
}

/**
 * 一件素材只有一颗编辑按钮，这里定它落到哪个 app。三级阶梯，第一个命中的胜出：
 *
 * 1. **这张卡所在素材包的 app**（`packAppId`）。操作员选「落在素材归属的那个 app」
 *    的理由就是上下文自洽——素材在哪个包里被点开就落哪个包，`W5-pack-model.md` §5.1。
 * 2. **当前锚定的 app**（`?app=`／工作台自身）。没有包上下文但页面本身就锚在某个 app 上时，
 *    落回它同样是自洽的。
 * 3. **主归属**（`apps[0]`，已按 D3.3 排序）。
 *
 * 前两级都要求那个 app **确实是这份素材的归属**；不是归属就往下走，绝不把用户送去
 * 一个根本没有这份素材的工作台。
 */
function resolveEditApp(
  apps: readonly MaterialAppAttribution[],
  packAppId: string,
  appId: string,
): MaterialAppAttribution | null {
  if (apps.length === 0) return null;
  return (
    (packAppId && apps.find((app) => app.appId === packAppId)) ||
    (appId && apps.find((app) => app.appId === appId)) ||
    apps[0]
  );
}

export function useMaterialDetailAppPlan({
  entry,
  selectionKey,
  siteKey = "",
  appId = "",
  packAppId = "",
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
      editApp: resolveEditApp(apps, packAppId, appId),
      artifactId,
      // 素材货架上的「编辑」**一律**走归属 app 的预览深链，包括归属就是当前 app 的
      // 那一档。过去那一档留给了就地打开 typed 编辑器（「深链等于原地打转」），但
      // 操作员把落点拍死成「右栏是这份素材的预览，用户看到的不是 agent 面板」，
      // 并且点名「不许把他一脚踹进编辑器」——点「编辑」往往只是想看看会出现什么。
      // 所以这一档也归深链：`?app=<归属>` + `libraryMode=preview` 是纯读，不 fork。
      routeEditByApp: onMaterialShelf && Boolean(artifactId) && apps.length > 0,
    };
  }, [appId, packAppId, resolved, shelfItem, siteKey]);
}

/**
 * 素材详情里的编辑入口：**一件素材一颗，不是一排**。
 *
 * 过去这里对 `plan.apps` 做 map，一份素材绑 4 个 app 就摆 4 颗「编辑 · xxx」，
 * 操作员看着屏幕说「这样子不对，太杂了」。收成一颗之后，「落哪个 app」这个问题由
 * **素材包**回答（`W5-pack-model.md` §5.1）：素材在哪个包的上下文里被点开就落哪个包，
 * 所以按钮上不再需要挂 app 名做区分，也不再需要用户先做一次选择。
 *
 * 落点永远是 `workspaceTemplatePreviewHref`：`?app=<归属>` + `libraryTab=materials`
 * + `libraryItem=<id>` + `libraryMode=preview`。三件事都是操作员拍死的——落在归属
 * app（不是 agent 面板）、右栏是这份素材的预览（不是编辑器）、且这条路是纯读不 fork。
 *
 * 用 `<a>` 而不是 `<button>`：这是一次**去别处**，链接才能新标签页打开、复制地址。
 */
export function MaterialOwningAppEdit({
  plan,
  item,
  accent = "#4f46e5",
  compact = false,
}: {
  plan: MaterialDetailAppPlan;
  item: LibraryItem;
  accent?: string;
  compact?: boolean;
}): ReactNode {
  const tt = useUI();
  const app = plan.editApp;
  if (!plan.routeEditByApp || !app) return null;
  const label = materialAppLabel(app);
  return (
    <a
      href={workspaceTemplatePreviewHref(app.appId, plan.artifactId)}
      data-material-edit-app={app.appId}
      data-material-edit-single="true"
      aria-label={tt(`在「${label}」里打开「${item.title}」的预览`)}
      title={tt(`前往「${label}」工作台，并在它的库里打开这份素材的预览`)}
      className={`inline-flex min-h-8 min-w-11 shrink-0 items-center justify-center rounded-lg border font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
        compact ? "px-1.5 text-[10px]" : "px-2.5 text-[11px]"
      }`}
      style={{
        borderColor: `${accent}66`,
        color: accent,
        outlineColor: accent,
      }}
    >
      {tt("编辑")}
    </a>
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
