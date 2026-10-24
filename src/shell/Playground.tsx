"use client";

// ============================================================================
// @oceanleo/ui — Playground（doctrine v7，单一事实源）
// ----------------------------------------------------------------------------
// 主站 oceanleo.com/playground：不加入工作台即可试玩任一 app / skill。
// 操作员 2026-06-24 改版：
//   - **选择从左侧窄侧栏搬到右侧主区**（PlaygroundDetail 自带目录页）。侧栏不再
//     显示具体 app / 分类（PlaygroundSubNav 退化为不渲染列表）。
//   - 顶部「app / agent」二选一（**没有网站**——app 与 agent 都能在 oceanleo.com
//     站内直接操作，不必跳子站）。下面是统一 AppDirectory（二元分类器 + 卡片）。
//   - doctrine v8（2026-06-24）：原「skill」分区正名为「agent」（Tab 内部值仍叫 skill，
//     技术标识层不改；只改面向用户的标签 / 文案）。
//   - 点一个条目 → 右侧整页换成它的内嵌功能区（iframe），右上角出现「← 返回」回到
//     目录页；模型偏好统一在「AI 模型」页管理。
//   - doctrine v10（2026-06-26）：原 /all-sites 的「网站」分区（站卡片）
//     并入这里，成为第一个 tab。站点清单由消费端经 renderSites 注入，/all-sites 路由删除。
// ============================================================================

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppDirectory, type DirectoryItem } from "./AppDirectory";
import { CollectionItemCard, CollectionItemRow, CollectionItemList } from "./collection-items";
import { ItemDetailModal } from "./ItemDetailModal";
import { CreateSkillModal } from "./CreateSkillModal";
import { SkillPromptPanel } from "./SkillPromptPanel";
import { PromptCardModal, AddPromptModal } from "./HomeCards";
import { AppMarket } from "./AppMarket";
import {
  CollectionCardGrid,
  CollectionFilterRow,
  CollectionFilterSelect,
  CollectionPageToolbar,
  type CollectionView,
  type CollectionViewOption,
} from "./collection-chrome";
import {
  GENERIC_PROMPTS,
  PROMPT_LIBRARY,
  loadCustomPromptCards,
  saveCustomPromptCards,
  loadAllCustomPromptCards,
  type PromptCard,
} from "./home-cards";
import { listAgents, saveAgent, unsaveAgent, type AgentDef } from "../lib/agent";
import {
  listMarketApps,
  listMarketScenes,
  type MarketApp,
} from "../lib/app-market";
import { brandColorFor, tintOf } from "../lib/brand-color";
import { siteIconFor, siteBrandColorFor } from "./site-icons";
import { useUI } from "../i18n/ui/useUI";
import {
  APP_PAGE_FRAME_CLASS,
  APP_PAGE_TITLE_CLASS,
} from "./AppPageHeader";
import {
  TRUSTED_EMBED_EDITOR_SANDBOX,
  isTrustedInteractiveViewerUrl,
} from "./editor-sandbox-origin";

// site_id="agent" 的条目是纯聊天 skill；其余站的条目是有能力的功能区 agent。
const SKILL_APP_ID = "agent";
// 「＋ 新建」首卡的哨兵 id（agent / organization / workflow 三个可创建分区共用）。
const NEW_CARD_ID = "__new__";

// #region workspace-embed-trust
// UC-3：docs/architecture/oceanleo-untrusted-content-isolation.md §8.3
// （契约 oceanleo.sandbox-origin.v1 §3 第三档「第一方内嵌」）
//
// 子站工作台内嵌 frame（Playground / WorkspaceDetail / WorkspaceShell 三处）的 src
// **不是**写死字面量：origin 取自消费端注入的 siteOrigin 映射，key 取自后端
// /v1/agents(/mine) 返回的 site_id。两个输入都不由本包控制，因此「第一方」这件事
// 必须在渲染前逐个 URL 证明，而不能靠域名后缀或「这里历来只嵌自家站」的惯例。
//
// 证明方式：先按固定形状拼出 URL，再用 isTrustedInteractiveViewerUrl 判定
//（https、无端口、无凭据、host 为 oceanleo.com 及其第一方子域，且显式排除
// oceanleo.app 与预览/UGC 主机），并额外要求 path 恰为 /workspace。
// 不通过 → 返回 ""，三处渲染面据此**完全不渲染 frame**（fail closed），
// 所以 allow-same-origin 永远不可能落到用户内容或 oceanleo.app 沙箱域上。
// 通过 → 与协议编辑器同档的第一方沙箱（见 WORKSPACE_EMBED_SANDBOX）。
//
// 这两件事必须绑定成对：只锁 sandbox 字符串会被「保留 sandbox、改掉来源」绕过，
// 只锁来源会被「保留来源、松开 sandbox」绕过。回归断言见
// tests/untrusted-content-sandbox-origin.test.mjs 的 W24 用例。
export const WORKSPACE_EMBED_PATH = "/workspace";

/**
 * 第一方子站工作台内嵌 frame 的 sandbox。刻意复用协议编辑器那一档
 * （W8 的 TRUSTED_EMBED_EDITOR_SANDBOX，单一事实源）：同样是第一方页面、
 * 同样需要同源才能读会话与 localStorage。它不含 allow-top-navigation*，
 * 也不含 allow-popups-to-escape-sandbox——子站不得把宿主标签页导航走，
 * 弹窗也不得脱离沙箱。
 */
export const WORKSPACE_EMBED_SANDBOX = TRUSTED_EMBED_EDITOR_SANDBOX;

export interface WorkspaceEmbedAgent {
  agent_id: string;
  site_id?: string;
  fn_id?: string;
}

/** URL 是否为可信的第一方子站工作台地址（host 判定 + path 必须是 /workspace）。 */
export function isTrustedWorkspaceEmbedUrl(value: string): boolean {
  if (!isTrustedInteractiveViewerUrl(value)) return false;
  try {
    return new URL(value).pathname === WORKSPACE_EMBED_PATH;
  } catch {
    return false;
  }
}

/**
 * 拼子站工作台内嵌地址。任何无法证明为第一方的结果一律返回 ""（不渲染 frame）。
 * hasOwnProperty 这道闸门挡的是 site_id 命中 Object.prototype 上的继承属性
 *（"constructor"、"toString" 之类）后拼出一个相对地址落回宿主 origin。
 */
export function workspaceEmbedSrc(
  siteOrigin: Record<string, string>,
  agent: WorkspaceEmbedAgent | null,
): string {
  if (!agent) return "";
  const siteId = agent.site_id || "";
  if (!siteId || !Object.prototype.hasOwnProperty.call(siteOrigin, siteId)) {
    return "";
  }
  const origin = siteOrigin[siteId];
  if (typeof origin !== "string" || !origin) return "";
  const fn = agent.fn_id ? `&fn=${encodeURIComponent(agent.fn_id)}` : "";
  const src = `${origin.replace(/\/+$/, "")}${WORKSPACE_EMBED_PATH}?embed=1&solo=1${fn}&agent=${encodeURIComponent(
    agent.agent_id,
  )}`;
  return isTrustedWorkspaceEmbedUrl(src) ? src : "";
}
// #endregion workspace-embed-trust

// 侧栏子栏：doctrine v7 起 playground 的选择全部搬到右侧主区，侧栏不再列东西。
export function PlaygroundSubNav() {
  const tt = useUI();
  return (
    <p className="px-3 py-4 text-[12px] leading-relaxed text-neutral-400">
      {tt("在右侧选择 app 或 agent 直接试玩，无需加入工作台。")}
    </p>
  );
}

function useAgents(refreshKey = 0): { agents: AgentDef[]; loading: boolean } {
  const [agents, setAgents] = useState<AgentDef[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await listAgents();
      if (!alive) return;
      setAgents(r.ok && r.data ? r.data.items : []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [refreshKey]);
  return { agents, loading };
}

type MarketController = {
  items: MarketApp[];
  total: number;
  scenes: { scene: string; count: number }[];
  siteIds: string[];
  loading: boolean;
  error: string | null;
  query: string;
  scene: string;
  siteId: string;
  setQuery: (query: string) => void;
  setScene: (scene: string) => void;
  setSiteId: (siteId: string) => void;
  setInstalled: (appId: string, installed: boolean) => void;
  retry: () => void;
};

/** app 市场与旧 useAgents 平行：公开列表不依赖登录，输入约 250ms 后才请求网关。 */
function useMarketApps(): MarketController {
  const [items, setItems] = useState<MarketApp[]>([]);
  const [total, setTotal] = useState(0);
  const [scenes, setScenes] = useState<{ scene: string; count: number }[]>([]);
  const [siteIds, setSiteIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [scene, setScene] = useState("");
  const [siteId, setSiteId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let alive = true;
    void listMarketScenes()
      .then((nextScenes) => {
        if (alive) setScenes(nextScenes);
      })
      .catch(() => {
        // 场景轴是增强项；列表仍可搜索、按站点看，不能因它单独失败而藏掉市场。
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    void listMarketApps({
      q: debouncedQuery || undefined,
      scene: scene || undefined,
      siteId: siteId || undefined,
      limit: 200,
      offset: 0,
    })
      .then((result) => {
        if (!alive) return;
        setItems(result.items);
        setTotal(result.total);
        setSiteIds((known) =>
          [...new Set([...known, ...result.items.map((app) => app.site_id).filter(Boolean)])]
            .sort((a, b) => a.localeCompare(b)),
        );
      })
      .catch(() => {
        if (alive) setError("应用市场暂时没加载出来，请稍后再试。");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [debouncedQuery, scene, siteId, refreshKey]);

  const setInstalled = useCallback((appId: string, installed: boolean) => {
    setItems((current) =>
      current.map((app) => (app.app_id === appId ? { ...app, installed } : app)),
    );
  }, []);

  const retry = useCallback(() => setRefreshKey((key) => key + 1), []);

  return {
    items,
    total,
    scenes,
    siteIds,
    loading,
    error,
    query,
    scene,
    siteId,
    setQuery,
    setScene,
    setSiteId,
    setInstalled,
    retry,
  };
}

// doctrine v8（2026-06-24）：playground 在 app / agent 之外新增两个「编排」分区——
//   organization：可视化搭 agent 团队 / 公司架构图（节点=agent，边=关系如「汇报」）。
//   workflow    ：流程编排图（可导入 organization、可直接导入单个 agent）。
// 这两块的重型画布（React Flow grid-snap）由消费端（oceanleo 主站）通过 renderBoard
// 注入——这样 @xyflow/react 依赖只落在主站，不强加给全部 @oceanleo/ui 消费站。
// doctrine v10（2026-06-26）：原 /all-sites 的「网站」分区（全家桶站卡片）
//   并入 playground，成为第一个 tab。站点清单 + 推荐网关是消费端 lib/sites 的事，所以
//   由消费端通过 renderSites 注入（与 renderBoard 同一范式），不把 SITES 耦合进本包。
// doctrine v12（2026-06-30）「客户端 app」一级 tab：已于 2026-09-05 删除，失真设备框预览不再提供。
// 2026-07-02（操作员）：新增「prompt」专区 tab——全家桶 prompt 卡片库（分类 + 搜索 +
//   「创建 prompt」首卡 + 每张卡片右上角预览/编辑/保存）。用户自建 prompt 持久化
//   （localStorage，与子站首页「工作内容」卡片同一套 PromptCardModal / 存取助手）。
type Tab = "site" | "app" | "skill" | "prompt";

export type PlaygroundBoardKind = "organization" | "workflow";

/** renderBoard 的注入选项：消费端的画布通过 onEditingChange 告诉外壳「现在是否在
 *  编辑器里」——编辑器（打开了某个具体 organization/workflow）时外壳隐藏标题+tab，
 *  和打开 app/agent 时一致（操作员 2026-06-24）。 */
export interface PlaygroundBoardCtx {
  kind: PlaygroundBoardKind;
  onEditingChange: (editing: boolean) => void;
  /**
   * doctrine v10（2026-06-26）：工作台只展示用户已加入的——传 true 时 board 目录页
   * 只列「我的」organization/workflow（隐藏预设模板）。playground 不传（= 全部含预设）。
   */
  mineOnly?: boolean;
}

export function PlaygroundDetail({
  siteOrigin,
  accent = "#0ea5e9",
  renderBoard: _renderBoard,
  renderSites,
  onRequestLogin,
  favoritesOnly = false,
  onFavoritesOnlyChange,
}: {
  /** site_id → 子站 origin（拼 iframe src 用）。 */
  siteOrigin: Record<string, string>;
  accent?: string;
  /**
   * 渲染 organization / workflow 编排画布。保留 prop 以免炸消费端，本页不再渲染。
   */
  renderBoard?: (ctx: PlaygroundBoardCtx) => ReactNode;
  /**
   * 渲染「网站」分区（全家桶站卡片 + 加入工作台）。由消费端注入
   * （持有 lib/sites 站点清单）。不传 → 不显示「网站」分区。
   * 外壳把标题|搜索行交给注入面：消费端把 toolbarLeading / belowToolbar 传给
   * 第一份 AppDirectory，这样网站分区与 app/agent 同一套页头。
   */
  renderSites?: (chrome: {
    toolbarLeading?: ReactNode;
    belowToolbar?: ReactNode;
    viewOptions?: CollectionViewOption[];
  }) => ReactNode;
  /** 市场里未登录用户点「加入工作台」时打开消费端自己的登录入口。 */
  onRequestLogin?: () => void;
  /** 仅看已加入 / 已收藏。`?pile=mine` 经 WorkspaceDesk 传入。 */
  favoritesOnly?: boolean;
  onFavoritesOnlyChange?: (value: boolean) => void;
}) {
  void _renderBoard;
  const tt = useUI();
  const [localFav, setLocalFav] = useState(false);
  const onlyFav = onFavoritesOnlyChange ? Boolean(favoritesOnly) : localFav;
  function toggleFav() {
    const next = !onlyFav;
    if (onFavoritesOnlyChange) onFavoritesOnlyChange(next);
    else setLocalFav(next);
  }
  const [refreshKey, setRefreshKey] = useState(0);
  const { agents, loading } = useAgents(refreshKey);
  const market = useMarketApps();
  // 有「网站」分区时默认落在它（它是第一个分区）；否则落 app。
  const [tab, setTab] = useState<Tab>(renderSites ? "site" : "app");
  const [activeId, setActiveId] = useState<string>("");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  // doctrine v11：点卡片先弹详情弹窗（WorkBuddy 式），点「召唤」才进内嵌功能区。
  const [detailId, setDetailId] = useState<string>("");
  // 2026-07-02：卡片右上角「查看/编辑 prompt」→ SkillPromptPanel（modal 形态）。
  const [promptOf, setPromptOf] = useState<AgentDef | null>(null);

  // app 分区 = 各产品站功能区 agent（site_id≠"agent"）；agent 分区 = LeoAgent 套壳。
  // 宗旨 v13（2026-07-02）：用户自建（owner_id 非空）与已收藏（saved）的条目**优先显示**
  // ——自建在最前，其次已收藏，最后官方市场，各组内保持原序。
  const mineFirst = useCallback((arr: AgentDef[]) => {
    const rankOf = (a: AgentDef) => (a.owner_id ? 0 : a.saved ? 1 : 2);
    return [...arr].sort((x, y) => rankOf(x) - rankOf(y));
  }, []);
  const appAgents = useMemo(
    () => mineFirst(agents.filter((a) => (a.site_id || "") !== SKILL_APP_ID)),
    [agents, mineFirst],
  );
  const skillAgents = useMemo(
    () => mineFirst(agents.filter((a) => (a.site_id || "") === SKILL_APP_ID)),
    [agents, mineFirst],
  );
  const favorited = (a: AgentDef) => Boolean(a.saved || a.owner_id);
  const list = useMemo(() => {
    const raw = tab === "app" ? appAgents : skillAgents;
    return onlyFav ? raw.filter(favorited) : raw;
  }, [tab, appAgents, skillAgents, onlyFav]);
  const marketItems = useMemo(
    () => (onlyFav ? market.items.filter((app) => app.installed) : market.items),
    [onlyFav, market.items],
  );

  const items: DirectoryItem[] = useMemo(() => {
    // 宗旨 v13（2026-07-02）：不再让每张卡强制取分区色，改为按 agent_id 稳定生成
    // 品牌色，让 playground 上五花八门的图标各有色（去蓝紫同底）。
    // app 分区（功能站 agent，a.site_id 是真实站 id 如 image/ppt/word）：优先用主站
    // 移植来的彩色几何站点图标 + 站点品牌色，替代 agent 自带 emoji（操作员截图投诉）。
    // agent 分区（tab==="skill"）保持 agent 自己的图标 / 稳定品牌色，不动。
    const base = list.map<DirectoryItem>((a) => ({
      id: a.agent_id,
      name: a.name,
      tagline: a.tagline,
      capabilities: a.capabilities,
      icon: tab === "app" ? siteIconFor(a.site_id) ?? a.icon : a.icon,
      logoColor:
        tab === "app"
          ? siteBrandColorFor(a.site_id) ?? brandColorFor(a.agent_id)
          : brandColorFor(a.agent_id),
      site_id: a.site_id,
      category: a.category,
      added: favorited(a),
    }));
    return base;
  }, [list, tab]);

  const detailAgent = useMemo(
    () => agents.find((a) => a.agent_id === detailId) || null,
    [agents, detailId],
  );

  // agent 分区：第一张卡固定「＋ 新建」（创建自己的 agent，与别处一致）。leadingCards
  // 永远渲染在最前、不受分类/筛选影响。
  const agentLeadingCards: DirectoryItem[] = useMemo(
    () =>
      tab === "skill"
        ? [
            {
              id: NEW_CARD_ID,
              name: tt("新建 agent"),
              tagline: tt("创建一个属于你自己的 agent（人格预设 + 工具）"),
              icon: "＋",
              accent,
              category: tt("新建"),
            },
          ]
        : [],
    [tab, accent, tt],
  );

  const active = useMemo(
    () => agents.find((a) => a.agent_id === activeId) || null,
    [agents, activeId],
  );

  // UC-3：src 只能来自 workspaceEmbedSrc 的第一方判定，见本文件 workspace-embed-trust。
  const embedSrc = useMemo(
    () => workspaceEmbedSrc(siteOrigin, active),
    [active, siteOrigin],
  );

  const pageTitle = (
    <h1 className={APP_PAGE_TITLE_CLASS}>{tt("工作台")}</h1>
  );
  const favoriteViewOptions: CollectionViewOption[] = [
    {
      id: "favorites",
      label: tt("仅看收藏"),
      checked: onlyFav,
      onSelect: toggleFav,
    },
  ];
  // 分区的值是名词，按键上只写当前分区（「应用 ⌄」）。叫法与工作台别处一致：网站 / 应用 / agent / 提示词。
  const sectionOptions = [
    ...(renderSites ? [{ value: "site", label: tt("网站") }] : []),
    { value: "app", label: tt("应用") },
    { value: "skill", label: tt("agent") },
    { value: "prompt", label: tt("提示词") },
  ];
  const tabsBar = (
    <CollectionFilterSelect
      label={tt("分区")}
      name="section"
      value={tab}
      defaultValue={renderSites ? "site" : "app"}
      options={sectionOptions}
      onChange={(value) => {
        if (value) setTab(value as Tab);
      }}
      accent={accent}
    />
  );
  const listChrome = {
    toolbarLeading: pageTitle,
    belowToolbar: tabsBar,
    viewOptions: favoriteViewOptions,
  };

  async function addToWorkspace() {
    if (!active || saving) return;
    setSaving(true);
    const r = await saveAgent(active.agent_id);
    setSaving(false);
    if (r.ok) setSavedMsg(tt("已放入工作台 ✓"));
    else if (r.status === 401) setSavedMsg(tt("请先登录"));
    else setSavedMsg(tt("操作失败"));
    setTimeout(() => setSavedMsg(null), 2600);
  }

  // ── 选中某条目：整页换成它的内嵌功能区 ──
  //   顶部一行（操作员 2026-06-24）：左 = 返回 + 放入工作台 + app 名；右 = 模型选择
  //   （收成一个按键，点开才弹出各模态 chip 面板）。保证最上方永远只有一行。
  if (active) {
    return (
      <div key={active.agent_id} className="v-fade-up flex h-[calc(100dvh-1px)] flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-100 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <BackButton onClick={() => setActiveId("")} />
            <button
              type="button"
              onClick={addToWorkspace}
              disabled={saving}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-medium text-white shadow-sm transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: accent }}
              title={tt("把这个 app 加入「我的 app」，之后在工作台直接用")}
            >
              {tt("＋ 加入工作台")}
            </button>
            {savedMsg ? (
              <span className="truncate text-[12px] text-emerald-600">{savedMsg}</span>
            ) : (
              <span className="min-w-0 truncate text-[13px] font-medium text-stone-600">
                {active.icon ? `${active.icon} ` : ""}
                {active.name}
              </span>
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 p-1.5">
          {embedSrc ? (
            <iframe
              key={active.agent_id}
              src={embedSrc}
              title={active.name}
              className="h-full w-full rounded-2xl border border-stone-200 bg-white/60"
              // UC-3 §8.3：embedSrc 已被证明是第一方子站工作台地址，才配这一档沙箱。
              sandbox={WORKSPACE_EMBED_SANDBOX}
              allow="clipboard-write; clipboard-read; fullscreen"
              allowFullScreen
            />
          ) : (
            <div className="grid h-full place-items-center rounded-2xl border border-dashed border-stone-300 bg-white/40 p-8 text-center text-[13px] text-neutral-400">
              {tt("该 app 所属站点暂未接入内嵌功能区。")}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── 网站分区（doctrine v10）：全家桶站卡片，由消费端 renderSites 注入。
  //   与 app/agent 目录同一套外层版式（APP_PAGE_FRAME_CLASS + 标题 + tab）。
  if (tab === "site" && renderSites) {
    return (
      <div className={APP_PAGE_FRAME_CLASS}>
        {renderSites(listChrome)}
      </div>
    );
  }

  // ── prompt 专区（2026-07-02）：全家桶 prompt 卡片库 + 「创建 prompt」+ 卡片
  //   右上角预览/编辑/保存。与其余分区同一套外层版式。
  if (tab === "prompt") {
    return (
      <div className={APP_PAGE_FRAME_CLASS}>
        <PromptZone
          accent={accent}
          toolbarLeading={pageTitle}
          belowToolbar={tabsBar}
          viewOptions={favoriteViewOptions}
        />
      </div>
    );
  }

  // ── app 市场：跨站成品 app，不再把三十几个功能站 agent 当成 app 清单。 ──
  if (tab === "app") {
    return (
      <div className={APP_PAGE_FRAME_CLASS}>
        <AppMarket
          toolbarLeading={pageTitle}
          belowToolbar={tabsBar}
          viewOptions={favoriteViewOptions}
          items={marketItems}
          total={market.total}
          scenes={market.scenes}
          siteIds={market.siteIds}
          loading={market.loading}
          error={market.error}
          query={market.query}
          scene={market.scene}
          siteId={market.siteId}
          accent={accent}
          onQueryChange={market.setQuery}
          onSceneChange={market.setScene}
          onSiteChange={market.setSiteId}
          onInstalledChange={market.setInstalled}
          onRetry={market.retry}
          onRequestLogin={onRequestLogin}
        />
      </div>
    );
  }

  // ── 目录页：app / agent 二选一 + 统一目录 ──
  return (
    <div className={APP_PAGE_FRAME_CLASS}>
      <AppDirectory
        toolbarLeading={pageTitle}
        belowToolbar={tabsBar}
        viewOptions={favoriteViewOptions}
        favoritesOnly={onlyFav}
        items={items}
        leadingCards={onlyFav ? [] : agentLeadingCards}
        accent={accent}
        loading={loading}
        openLabel={tt("试玩")}
        emptyText={tt("暂无可试玩的 agent。")}
        onAdd={(it) => {
          const a = agents.find((x) => x.agent_id === it.id);
          if (!a) return;
          void (async () => {
            const r = a.saved ? await unsaveAgent(a.agent_id) : await saveAgent(a.agent_id);
            if (!a.saved && r.status === 401) onRequestLogin?.();
            setRefreshKey((k) => k + 1);
          })();
        }}
        onOpen={(it) => {
          if (it.id === NEW_CARD_ID) setShowCreateAgent(true);
          else setDetailId(it.id); // 先弹详情弹窗，点「召唤」才进入内嵌功能区
        }}
        // 2026-07-02：app / agent 卡片右上角「查看/编辑/保存 prompt」。
        onPrompt={(it) => {
          const a = agents.find((x) => x.agent_id === it.id);
          if (a) setPromptOf(a);
        }}
        // agent 默认按其原生分类（技术工程 / 内容创作…18 类）分桶，保留细粒度分类。
        nativeFirst={tab === "skill"}
        nativeLabel={tt("按分类")}
      />

      {/* 卡片右上角「prompt」→ 复用共享 SkillPromptPanel（modal 形态，可预览/编辑/
          保存为我的 agent）。 */}
      {promptOf && (
        <SkillPromptPanel
          variant="modal"
          open
          onClose={() => setPromptOf(null)}
          agentId={promptOf.agent_id}
          name={promptOf.name}
          tagline={promptOf.tagline}
          icon={promptOf.icon}
          category={promptOf.category}
          accent={accent}
          onSavedAsSkill={() => {
            setPromptOf(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {/* doctrine v11：卡片详情弹窗（WorkBuddy 式）。点「召唤」→ 进入内嵌功能区。 */}
      {detailAgent && (
        <ItemDetailModal
          open
          onClose={() => setDetailId("")}
          name={detailAgent.name}
          icon={detailAgent.icon}
          tagline={detailAgent.tagline}
          capabilities={detailAgent.capabilities || detailAgent.tagline}
          tags={["agent", detailAgent.category || ""].filter(Boolean)}
          strengths={(detailAgent.capabilities || "")
            .split(/[、,，;；]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 4)}
          launchLabel={tt("召唤")}
          accent={accent}
          onLaunch={() => {
            const id = detailAgent.agent_id;
            setDetailId("");
            setActiveId(id);
          }}
        />
      )}

      {showCreateAgent && (
        <CreateSkillModal
          accent={accent}
          title={tt("创建 agent")}
          submitLabel={tt("创建 agent")}
          onClose={() => setShowCreateAgent(false)}
          onCreated={() => {
            setShowCreateAgent(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// prompt 专区（2026-07-02，操作员）：全家桶 prompt 卡片库。
//   - 内容 = home-cards 的 PROMPT_LIBRARY（全部站的内置卡去重）+ 用户自建
//     （localStorage key "playground"，跨会话保留）。
//   - 第一张 = 「创建 prompt」板块；每张卡片右上角预览 / 编辑 / 保存。
//   - 点卡片 = 打开预览弹窗（复用 PromptCardModal），「复制使用」把 prompt
//     复制进剪贴板（playground 没有输入框可填）。
// ---------------------------------------------------------------------------
const PLAYGROUND_PROMPT_SCOPE = "playground";

function PromptZone({
  accent,
  toolbarLeading,
  belowToolbar,
  viewOptions,
}: {
  accent: string;
  toolbarLeading?: ReactNode;
  belowToolbar?: ReactNode;
  viewOptions?: CollectionViewOption[];
}) {
  const tt = useUI();
  const [view, setView] = useState<CollectionView>("grid");
  // playground 自己 scope 的自建卡（可编辑/删除）。
  const [custom, setCustom] = useState<PromptCard[]>([]);
  // 宗旨 v12（2026-07-04）：并入【当前 origin 下所有站首页】新建的自建卡（只读展示），
  // 让「用户在某站新建的 prompt」在 playground 也看得到。
  const [otherCustom, setOtherCustom] = useState<PromptCard[]>([]);
  const [cat, setCat] = useState("__all__");
  const [filter, setFilter] = useState("");
  const [modal, setModal] = useState<{ card: PromptCard; isNew: boolean } | null>(null);
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState(false);

  function reloadCustom() {
    const mine = loadCustomPromptCards(PLAYGROUND_PROMPT_SCOPE);
    setCustom(mine);
    // 其它站的自建卡 = 全部自建卡 - playground scope 自己的（按 id 去重）。
    const mineIds = new Set(mine.map((c) => c.id));
    setOtherCustom(loadAllCustomPromptCards().filter((c) => !mineIds.has(c.id)));
  }

  useEffect(() => {
    reloadCustom();
  }, []);

  // 内置库：全部站的 prompt 卡片（按标题去重，通用集在前）。
  const builtin = useMemo(() => {
    const seen = new Set<string>();
    const out: PromptCard[] = [];
    for (const c of [...GENERIC_PROMPTS, ...Object.values(PROMPT_LIBRARY).flat()]) {
      const key = c.title + "|" + c.category;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    return out;
  }, []);

  const all = useMemo(
    () => [...custom, ...otherCustom, ...builtin],
    [custom, otherCustom, builtin],
  );

  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const c of all) if (c.category && !seen.includes(c.category)) seen.push(c.category);
    return seen;
  }, [all]);

  const norm = filter.trim().toLowerCase();
  const shown = useMemo(
    () =>
      all.filter((c) => {
        if (cat !== "__all__" && c.category !== cat) return false;
        if (!norm) return true;
        return (
          c.title.toLowerCase().includes(norm) ||
          (c.desc || "").toLowerCase().includes(norm) ||
          c.prompt.toLowerCase().includes(norm)
        );
      }),
    [all, cat, norm],
  );

  function persist(next: PromptCard[]) {
    saveCustomPromptCards(PLAYGROUND_PROMPT_SCOPE, next);
    reloadCustom();
  }

  // 「添加 prompt」（预制库选择 or 新建）或编辑现有卡 → 存进 playground scope。
  function saveCard(card: PromptCard) {
    const mineNow = loadCustomPromptCards(PLAYGROUND_PROMPT_SCOPE);
    if (!card.custom || !card.id.startsWith("custom-") || !mineNow.some((c) => c.id === card.id)) {
      const mine: PromptCard = {
        ...card,
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        custom: true,
        category: card.category || tt("我的"),
      };
      persist([mine, ...mineNow]);
    } else {
      persist(mineNow.map((c) => (c.id === card.id ? { ...card, custom: true } : c)));
    }
  }

  async function copyUse(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }

  // playground scope 自己的自建卡 id 集合（用于判断某卡在此处能否编辑/删除）。
  const mineIds = useMemo(() => new Set(custom.map((c) => c.id)), [custom]);

  return (
    <section>
      <CollectionPageToolbar
        title={toolbarLeading ?? ""}
        search={filter}
        onSearch={setFilter}
        searchPlaceholder={tt("按名称筛选…")}
        view={view}
        onViewChange={setView}
        viewOptions={viewOptions ?? []}
      />
      <CollectionFilterRow>
        {belowToolbar}
        {categories.length > 0 ? (
          <CollectionFilterSelect
            label={tt("类型")}
            name="category"
            value={cat === "__all__" ? "" : cat}
            options={categories.map((item) => ({ value: item, label: item }))}
            onChange={(next) => setCat(next || "__all__")}
            allLabel={tt("全部类型")}
            searchable={categories.length > 8}
          />
        ) : null}
      </CollectionFilterRow>

      {copied && (
        <p className="mb-3 text-[12px] text-emerald-600">{tt("已复制到剪贴板 ✓")}</p>
      )}

      {(() => {
        const PromptShelf = view === "list" ? CollectionItemList : CollectionCardGrid;
        const Item = view === "list" ? CollectionItemRow : CollectionItemCard;
        return <PromptShelf className="mt-5">
          <Item title={tt("添加 prompt")} onOpen={() => setAdding(true)}
            containerProps={{ className: view === "grid" ? "border-dashed" : undefined }}
            cover={<span className="grid h-full w-full place-items-center text-3xl text-stone-400">＋</span>} />
          {shown.map((c) => {
            const cColor = brandColorFor(c.id || c.title);
            const edit = <button type="button" title={tt("查看 / 编辑")} aria-label={tt("查看 / 编辑")}
              onClick={() => setModal({ card: c, isNew: false })}
              className="grid h-7 w-7 place-items-center rounded-lg border border-stone-200 bg-white/90 text-stone-400 shadow-sm hover:text-stone-600">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>;
            return <Item key={c.id} title={c.title} metadata={<>{c.category}{c.custom ? ` · ${tt("我的")}` : ""}{c.desc || c.prompt ? ` · ${c.desc || c.prompt}` : ""}</>}
              onOpen={() => setModal({ card: c, isNew: false })}
              cover={<span className="grid h-full w-full place-items-center text-3xl" style={{ background: tintOf(cColor, 0.14), color: cColor }}>{c.icon}</span>}
              actions={view === "list" ? edit : undefined}
              floatingActions={view === "grid" ? <div className="absolute right-2 top-2">{edit}</div> : undefined} />;
          })}
        </PromptShelf>;
      })()}

      {shown.length === 0 && (
        <p className="py-12 text-center text-sm text-stone-400">{tt("没有匹配的 prompt。")}</p>
      )}

      {adding && (
        <AddPromptModal
          accent={accent}
          presets={builtin}
          existing={all}
          categories={categories}
          onAdd={(card) => {
            saveCard(card);
            setAdding(false);
          }}
          onClose={() => setAdding(false)}
        />
      )}

      {modal && (
        <PromptCardModal
          card={modal.card}
          isNew={modal.isNew}
          accent={accent}
          categories={categories}
          useLabel={tt("复制使用")}
          onUse={(text) => {
            void copyUse(text);
            setModal(null);
          }}
          onSave={(card) => {
            saveCard(card);
            setModal(null);
          }}
          onDelete={
            mineIds.has(modal.card.id) && !modal.isNew
              ? () => {
                  persist(custom.filter((c) => c.id !== modal.card.id));
                  setModal(null);
                }
              : undefined
          }
          onClose={() => setModal(null)}
        />
      )}
    </section>
  );
}

export function BackButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const tt = useUI();
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[13px] font-medium text-stone-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] hover:bg-stone-50 active:scale-95"
      title={tt("返回选择页")}
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label ?? tt("返回")}
    </button>
  );
}
