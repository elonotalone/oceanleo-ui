"use client";

// ============================================================================
// @oceanleo/ui — 目录深链意图（`?fill=preset` / `?open=advanced`）的编排层
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
  catalogAdvancedOpenPlan,
  catalogPresetFill,
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
 * 规范化 redirect 只删 legacy 的 `fn`/`mode`，所以这两个参数在收敛到 `/workspace/<id>`
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
    if (!activeAppId || (!intent.fillPreset && !intent.openAdvanced)) return;
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
