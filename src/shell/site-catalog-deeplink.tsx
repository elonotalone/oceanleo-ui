"use client";

// ============================================================================
// @oceanleo/ui — 目录深链意图
// （`?fill=preset` / `?open=advanced` / `?open=template` / `?tab=library&mode=preview`）
// ----------------------------------------------------------------------------
// 从 `SiteCatalogConsole.tsx` 抽出来单独成文件（V1 判定书 §6.2 / §9.1-3）：那个文件
// 基线就有 767 行、已超共享包 ≤600 的约定，深链这套一次性意图不应该继续把它顶高。
//
// 三件事都在本文件里，`SiteCatalogConsole` 只剩「调一个 hook + 渲染两个节点」：
//   ① `useCatalogDeepLink()` —— 把 URL 上的一次性意图锁存、消费、并从地址栏抹掉；
//   ② `CatalogDeepLinkFillProvider` —— 把预填待办下发进 OperatorConsole 子树；
//   ③ `CatalogDeepLinkNotice` —— 深链退化时的可见提示（绝不静默无反应）。
//
// 取值规则本身不在这里：代表 prompt 与整套参数由 `app-catalog.ts` 独家提供
// （`representativePrompt` / `representativeFill`），本层只做编排与时序。
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { GoalApp } from "./app-catalog";
import {
  libraryPreviewIntentAction,
  libraryPreviewIntentFromSearch,
} from "./library-edit-intent";
import {
  catalogAdvancedOpenPlan,
  catalogPresetFill,
  catalogTemplateOpenPlan,
  resolveCatalogDeepLinkIntent,
  searchWithoutCatalogDeepLinkIntent,
  type CatalogDeepLinkIntent,
  type CatalogPresetFill,
} from "./site-catalog-controller";
import { dispatchWorkspaceAction } from "./workspace-actions";

/** `?fill=preset` 的待办：只对 `appId` 这一个 app 有效，灌完由宿主标记消费。 */
export interface CatalogDeepLinkFill {
  appId: string;
  fill: CatalogPresetFill;
  onConsumed: (appId: string) => void;
}

const CatalogDeepLinkFillCtx = createContext<CatalogDeepLinkFill | null>(null);

/**
 * 目录子树的深链外壳：把预填待办下发进 OperatorConsole，并渲染退化提示。
 *
 * 待办走 context 而不是 `functions` 的 props，是为了不让一次性意图参与目录 memo，
 * 避免每次消费都重建全部 app 的 ops 元素。
 */
export function CatalogDeepLinkBoundary({
  state,
  accent,
  children,
}: {
  state: CatalogDeepLinkState;
  accent: string;
  children: ReactNode;
}) {
  return (
    <CatalogDeepLinkFillCtx.Provider value={state.fill}>
      {children}
      <CatalogDeepLinkNotice
        message={state.notice}
        accent={accent}
        onDismiss={state.dismissNotice}
      />
    </CatalogDeepLinkFillCtx.Provider>
  );
}

/** 操作台侧读取当前待办（`CatalogOps` 用）。 */
export function useCatalogDeepLinkFill(): CatalogDeepLinkFill | null {
  return useContext(CatalogDeepLinkFillCtx);
}

export interface CatalogDeepLinkInput {
  activeAppId: string;
  apps: readonly GoalApp[];
  siteKey: string;
  locationSearch: string;
  /** embed 没有自己的地址栏，不改写 URL。 */
  embed?: boolean;
  /** 意图消费后把 canonical 结果同步回宿主（本地 search state + router.replace）。 */
  onDeepLinkQueryStripped: (nextSearch: string, nextHref: string) => void;
}

export interface CatalogDeepLinkState {
  /** 待灌进操作台的一次性预填；无待办为 null。 */
  fill: CatalogDeepLinkFill | null;
  /** 退化提示文案；正常路径为空串。 */
  notice: string;
  dismissNotice: () => void;
}

/**
 * 目录深链意图的完整生命周期。
 *
 * 规范化 redirect 只删 legacy 的 `fn`/`mode`，所以这几个参数在收敛到 `/workspace/<id>`
 * 之后仍在地址栏。这里把它们**锁存**成本次进入的一次性待办，消费后立刻从地址栏抹掉：
 * 刷新、重挂载、以及用户手动清空输入框之后都不会被回灌。
 *
 * 未知 appId 时 `activeAppId` 为空串，所有待办都不触发，「这个 App 不存在或已下线」
 * 路径原样保留。
 */
export function useCatalogDeepLink({
  activeAppId,
  apps,
  siteKey,
  locationSearch,
  embed = false,
  onDeepLinkQueryStripped,
}: CatalogDeepLinkInput): CatalogDeepLinkState {
  const [deepLink, setDeepLink] = useState<
    (CatalogDeepLinkIntent & { appId: string }) | null
  >(null);
  const deepLinkLatchRef = useRef("");
  useEffect(() => {
    const intent = resolveCatalogDeepLinkIntent(locationSearch);
    if (
      !activeAppId ||
      (!intent.fillPreset && !intent.openAdvanced && !intent.openTemplateId)
    ) {
      return;
    }
    const token = `${activeAppId}\u0000${locationSearch}`;
    if (deepLinkLatchRef.current === token) return;
    deepLinkLatchRef.current = token;
    setDeepLink({ appId: activeAppId, ...intent });
  }, [activeAppId, locationSearch]);

  // 宿主回调每次 render 都是新身份，存进 ref 才能让下面的 useCallback 保持稳定，
  // 否则「消费 → 改 state → 回调换身份 → 再消费」会连环触发。
  const strippedRef = useRef(onDeepLinkQueryStripped);
  strippedRef.current = onDeepLinkQueryStripped;
  const clearDeepLinkQuery = useCallback(() => {
    if (typeof window === "undefined" || embed) return;
    const stripped = searchWithoutCatalogDeepLinkIntent(
      window.location.search,
    );
    if (stripped === window.location.search.replace(/^\?/, "")) return;
    strippedRef.current(
      stripped ? `?${stripped}` : "",
      `${window.location.pathname}${stripped ? `?${stripped}` : ""}`,
    );
  }, [embed]);

  const presetFill = useMemo(
    () =>
      deepLink?.fillPreset && deepLink.appId === activeAppId
        ? catalogPresetFill(apps.find((app) => app.id === activeAppId))
        : null,
    [activeAppId, apps, deepLink],
  );
  const consumeFill = useCallback(
    (appId: string) => {
      setDeepLink((current) =>
        current && current.appId === appId && current.fillPreset
          ? { ...current, fillPreset: false }
          : current,
      );
      clearDeepLinkQuery();
    },
    [clearDeepLinkQuery],
  );
  const fill = useMemo<CatalogDeepLinkFill | null>(
    () =>
      presetFill && activeAppId
        ? { appId: activeAppId, fill: presetFill, onConsumed: consumeFill }
        : null,
    [activeAppId, consumeFill, presetFill],
  );
  // 代表 prompt 为空的 app（合同 §0.9）不灌空串，但意图仍要消费掉。
  useEffect(() => {
    if (!deepLink?.fillPreset || deepLink.appId !== activeAppId) return;
    if (presetFill) return;
    consumeFill(activeAppId);
  }, [activeAppId, consumeFill, deepLink, presetFill]);

  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!deepLink?.openAdvanced || deepLink.appId !== activeAppId) return;
    const app = apps.find((item) => item.id === activeAppId);
    if (!app) return;
    // 本 effect 属于 SiteCatalogConsole 这一层，必然晚于右栏 ResultCanvas 的监听注册
    // （React effect 子先父后），所以派发不需要任何定时器兜底。
    const plan = catalogAdvancedOpenPlan(app, siteKey);
    dispatchWorkspaceAction({
      nonce: `catalog-advanced:${activeAppId}:${Date.now()}`,
      action: plan.action,
    });
    setNotice(plan.notice);
    setDeepLink((current) =>
      current && current.appId === activeAppId && current.openAdvanced
        ? { ...current, openAdvanced: false }
        : current,
    );
    clearDeepLinkQuery();
  }, [activeAppId, apps, clearDeepLinkQuery, deepLink, siteKey]);

  // 模板编辑深链：与上面同一条派发通道，区别只在 envelope 指名了一份具体 artifact。
  // 同样不需要定时器——本 effect 在 SiteCatalogConsole 这一层，右栏监听（子）已注册；
  // 而右栏把 envelope 当 **prop** 交给我的库，所以即使我的库这一刻还没挂载，它挂载时
  // 第一帧就能拿到这份 action，不存在「派发早于接收方」的窗口。
  const templateId = deepLink?.openTemplateId || "";
  useEffect(() => {
    if (!templateId || deepLink?.appId !== activeAppId) return;
    const app = apps.find((item) => item.id === activeAppId);
    if (!app) return;
    const plan = catalogTemplateOpenPlan(app, templateId, siteKey);
    dispatchWorkspaceAction({
      nonce: `catalog-template:${activeAppId}:${templateId}:${Date.now()}`,
      action: plan.action,
    });
    setNotice(plan.notice);
    setDeepLink((current) =>
      current &&
      current.appId === activeAppId &&
      current.openTemplateId === templateId
        ? { ...current, openTemplateId: "" }
        : current,
    );
    clearDeepLinkQuery();
  }, [activeAppId, apps, clearDeepLinkQuery, deepLink, siteKey, templateId]);

  // ── 「预览&编辑」深链：`?tab=library&item=<artifactId>&mode=preview&app=<appId>` ──
  // 合同 §0.4 / §3.1。操作员的原话是「点击后不跳到编辑的页面，而是跳到库中的预览页面，
  // 防止用户在探索时误入重型功能」——在本 effect 落地之前，`libraryPreviewIntentFromSearch`
  // 与 `libraryPreviewIntentAction`（W4 产出）**一个调用者都没有**，只在 `index.ts` 里
  // 被 re-export，于是这条深链只把用户送到 app 操作台，也就是他要防的那件事本身
  // （V5 判定书 BLOCKER-3，law / threed / website 三站一致复现）。
  //
  // 解析**复用 W4 的 helper**，不在本文件另抄一份 query 解析：同一个 query 形状有两处
  // 实现，迟早会各自漂移。派发通道与上面两条完全一样（右栏把 envelope 当 prop 交给
  // 我的库，所以不存在「派发早于接收方」的窗口）。
  //
  // 与另外三条的**唯一区别：不抹地址栏**。`?fill=preset` 那种是一次性注入，留在 URL 上
  // 会在刷新时被回灌；而库预览是一个**位置**——「库中的预览页面」本身就该能被刷新、
  // 被收藏、被分享。抹掉的话用户一刷新就掉回操作台，等于这条 BLOCKER 只修了一半。
  // 重复派发由 latch 挡住，不靠抹 URL。
  const previewIntent = useMemo(
    () => libraryPreviewIntentFromSearch(locationSearch),
    [locationSearch],
  );
  const previewArtifactId = previewIntent?.artifactId || "";
  const previewLatchRef = useRef("");
  useEffect(() => {
    if (!previewArtifactId || !activeAppId) return;
    const token = `${activeAppId}\u0000${previewArtifactId}`;
    if (previewLatchRef.current === token) return;
    const action = libraryPreviewIntentAction({
      artifactId: previewArtifactId,
      mode: "preview",
    });
    if (!action) return;
    previewLatchRef.current = token;
    dispatchWorkspaceAction({
      nonce: `catalog-preview:${activeAppId}:${previewArtifactId}:${Date.now()}`,
      action,
    });
  }, [activeAppId, previewArtifactId]);

  useEffect(() => {
    setNotice("");
  }, [activeAppId]);

  const dismissNotice = useCallback(() => setNotice(""), []);
  return { fill, notice, dismissNotice };
}

/** 深链退化时的可见提示（例如 app 没有可编辑产物类型）。绝不静默无反应。 */
function CatalogDeepLinkNotice({
  message,
  accent,
  onDismiss,
}: {
  message: string;
  accent: string;
  onDismiss: () => void;
}) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    >
      <div className="pointer-events-auto flex max-w-lg items-start gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-[13px] leading-relaxed text-stone-600 shadow-lg">
        <span className="mt-0.5 shrink-0" style={{ color: accent }}>
          ●
        </span>
        <span className="min-w-0 flex-1">{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-md px-2 py-0.5 text-[12px] font-medium text-stone-400 hover:bg-stone-50 hover:text-stone-600"
        >
          知道了
        </button>
      </div>
    </div>
  );
}
