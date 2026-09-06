"use client";

// ============================================================================
// @oceanleo/ui — 工作台 master-detail（doctrine v4，单一事实源）
// ----------------------------------------------------------------------------
// 主站 oceanleo.com/workspace：
//   app 分区读 my_apps（与 playground「加入工作台」同一套），点开跳子站对应 app 页。
//   旧「放入工作台」写进 my_agents 的功能区条目，若还没出现在 my_apps 里，仍并进
//   同一张 app 目录，点开同样跳子站，不再 iframe。
//   agent 分区只列 site_id=agent 的聊天体，点开才 iframe。
// WorkspaceSubNav 仍给子站侧栏用，只列聊天 agent，不再把功能区 app 挂进侧栏。
// ============================================================================

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useWorkspaceSelection } from "./WorkspaceSelection";
import type { ModelCategory } from "./ModelPicker";
import { AppDirectory, type DirectoryItem } from "./AppDirectory";
import {
  BackButton,
  WORKSPACE_EMBED_SANDBOX,
  workspaceEmbedSrc,
  type PlaygroundBoardCtx,
} from "./Playground";
import { siteIconFor, siteBrandColorFor } from "./site-icons";
import { listMyAgents, unsaveAgent, type AgentDef } from "../lib/agent";
import {
  listMyApps,
  openMarketApp,
  sortMyApps,
  uninstallApp,
  workspaceAppJumpUrl,
  type MarketApp,
} from "../lib/app-market";
import { capabilityImageKey } from "../lib/app-capability-image";
import { useUI } from "../i18n/ui/useUI";

function isMarketAuthError(error: unknown): boolean {
  return error instanceof Error && error.name === "MarketAuthError";
}

// ----------------------------------------------------------------------------
// 子站工作台子栏：把站点自己的「功能区名称」（ConsoleFunction）列到侧栏。
// 主区用受控 OperatorConsole(hideTabs, value 绑定本选中态) 渲染选中功能区。
// 内置功能区没有「删除」概念（不是收藏的 agent），故不带删除图标。
// ----------------------------------------------------------------------------
export interface ConsoleFnItem {
  id: string;
  label: string;
  icon?: ReactNode;
  /** 有 agentId → 显示「✦」标记，表示该功能区有专属 agent。 */
  agentId?: string;
}

export function ConsoleFnSubNav({
  functions,
  accent = "#4f46e5",
  defaultId,
}: {
  functions: ConsoleFnItem[];
  accent?: string;
  defaultId?: string;
}) {
  const tt = useUI();
  const [sel, setSel] = useWorkspaceSelection("workspace");
  useEffect(() => {
    if (!sel && functions.length > 0) setSel(defaultId || functions[0].id);
  }, [sel, functions, defaultId, setSel]);
  return (
    <div className="space-y-0.5">
      {functions.map((f) => {
        const on = f.id === sel;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => setSel(f.id)}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
 on ? "text-white" : "text-neutral-700 hover:bg-neutral-200/50"
 }`}
            style={on ? { background: accent } : undefined}
            title={tt(f.label)}
          >
            {f.icon && <span className="shrink-0 text-base leading-none">{f.icon}</span>}
            <span className="min-w-0 flex-1 truncate font-medium">{tt(f.label)}</span>
            {f.agentId && (
              <span className={`shrink-0 text-[11px] ${on ? "text-white/80" : "text-indigo-400"}`} title={tt("该 app 有专属 agent")}>
                ✦
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// 简单的「我的 Agents」共享拉取 + 本地移除（删除图标用）。
function useMyAgents() {
  const [mine, setMine] = useState<AgentDef[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    const r = await listMyAgents();
    setMine(r.ok && r.data ? r.data.items : []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  const remove = useCallback(async (agentId: string) => {
    setMine((cur) => cur.filter((a) => a.agent_id !== agentId)); // optimistic
    const r = await unsaveAgent(agentId);
    if (!r.ok) void reload(); // rollback by refetch
  }, [reload]);
  return { mine, loading, remove };
}

const SKILL_SITE_ID = "agent";

/** 历史站 key → 今天 SITES 里的 key。没有 origin 就不要猜域名。 */
const SITE_ORIGIN_ALIASES: Record<string, string> = {
  money: "finance",
};

type WorkspaceAppKind = "market" | "agent";

function resolveSiteOrigin(
  siteId: string,
  siteOrigin: Record<string, string>,
): string {
  const aliased = SITE_ORIGIN_ALIASES[siteId] || siteId;
  return siteOrigin[aliased] || siteOrigin[siteId] || "";
}

function leftoverAgentHref(agent: AgentDef, siteOrigin: Record<string, string>): string {
  return workspaceAppJumpUrl({
    site_url: resolveSiteOrigin(agent.site_id || "", siteOrigin),
    open_path: "",
    app_key: agent.fn_id || "",
  });
}

function useWorkspaceApps(siteOrigin: Record<string, string>) {
  const { mine, loading: agentsLoading, remove: removeAgent } = useMyAgents();
  const [marketApps, setMarketApps] = useState<MarketApp[]>([]);
  const [marketLoading, setMarketLoading] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);

  const reloadMarket = useCallback(async () => {
    setMarketLoading(true);
    try {
      const items = await listMyApps();
      setMarketApps(sortMyApps(items));
      setNeedsLogin(false);
    } catch (error) {
      setMarketApps([]);
      setNeedsLogin(isMarketAuthError(error));
    } finally {
      setMarketLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadMarket();
  }, [reloadMarket]);

  const marketIds = useMemo(
    () => new Set(marketApps.map((app) => app.app_id)),
    [marketApps],
  );

  const leftoverAgents = useMemo(
    () =>
      mine.filter((agent) => {
        if ((agent.site_id || "") === SKILL_SITE_ID) return false;
        const mapped = `${agent.site_id}.${agent.fn_id || ""}`;
        return !marketIds.has(mapped) && !marketIds.has(agent.agent_id);
      }),
    [marketIds, mine],
  );

  const apps = useMemo(
    () => [
      ...marketApps.map((app) => ({
        id: app.app_id,
        kind: "market" as WorkspaceAppKind,
        name: app.name,
        tagline: app.tagline,
        site_id: app.site_id,
        app_key: app.app_key,
        site_url: app.site_url,
        open_path: app.open_path,
        category: app.category,
        icon: app.icon,
        href: workspaceAppJumpUrl(app),
        capabilityImage: capabilityImageKey(app.site_id, app.app_key),
      })),
      ...leftoverAgents.map((agent) => ({
        id: agent.agent_id,
        kind: "agent" as WorkspaceAppKind,
        name: agent.name,
        tagline: agent.tagline,
        site_id: agent.site_id,
        app_key: agent.fn_id || "",
        site_url: resolveSiteOrigin(agent.site_id || "", siteOrigin),
        open_path: "",
        category: agent.category,
        icon: agent.icon,
        href: leftoverAgentHref(agent, siteOrigin),
        capabilityImage: capabilityImageKey(agent.site_id, agent.fn_id || ""),
      })),
    ],
    [leftoverAgents, marketApps, siteOrigin],
  );

  const removeApp = useCallback(
    async (id: string, kind: WorkspaceAppKind) => {
      if (kind === "market") {
        setMarketApps((current) => current.filter((app) => app.app_id !== id));
        try {
          await uninstallApp(id);
        } catch {
          void reloadMarket();
        }
        return;
      }
      await removeAgent(id);
    },
    [reloadMarket, removeAgent],
  );

  return {
    apps,
    mine,
    loading: agentsLoading || marketLoading,
    needsLogin,
    removeApp,
  };
}

// ----------------------------------------------------------------------------
// 侧栏子栏：只列聊天 agent。成品 app 在主站工作台 app 分区，不进各站侧栏。
// ----------------------------------------------------------------------------
export function WorkspaceSubNav({
  accent = "#0ea5e9",
  addAgentHref = "/playground",
}: {
  accent?: string;
  addAgentHref?: string;
}) {
  const tt = useUI();
  const { mine, loading, remove } = useMyAgents();
  const [sel, setSel] = useWorkspaceSelection("workspace");
  const chatAgents = useMemo(
    () => mine.filter((agent) => (agent.site_id || "") === SKILL_SITE_ID),
    [mine],
  );

  // 默认选中第一个聊天 agent。功能区条目已并进主站 app 目录，不在侧栏。
  useEffect(() => {
    if (!sel && chatAgents.length > 0) setSel(chatAgents[0].agent_id);
  }, [sel, chatAgents, setSel]);

  return (
    <div className="space-y-0.5">
      {loading && <p className="px-3 py-2 text-[12px] text-neutral-400">{tt("加载 app / agent…")}</p>}
      {!loading && chatAgents.length === 0 && (
        <p className="px-3 py-2 text-[12px] leading-relaxed text-neutral-400">
          {tt("还没有 app 或 agent。点下方「＋ 添加 app / agent」，到「Playground」里挑选 app（能干活）或 agent（纯聊天）。")}
        </p>
      )}
      {chatAgents.map((a) => {
        const on = a.agent_id === sel;
        return (
          <div
            key={a.agent_id}
            className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
 on ? "text-white" : "text-neutral-700 hover:bg-neutral-200/50"
 }`}
            style={on ? { background: accent } : undefined}
          >
            <button
              type="button"
              onClick={() => setSel(a.agent_id)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              title={a.tagline}
            >
              <span className="shrink-0 text-base leading-none">{a.icon || "✦"}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
            </button>
            {/* 删除图标：从我的 Agents 移除 */}
            <button
              type="button"
              onClick={() => {
                void remove(a.agent_id);
                if (on) setSel(null);
              }}
              title={tt("从工作台移除")}
              aria-label={tt("移除")}
              className={`shrink-0 rounded p-0.5 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
 on
 ? "text-white/70 hover:bg-white/20 hover:text-white"
 : "text-neutral-300 opacity-0 hover:text-rose-500 group-hover:opacity-100"
 }`}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m1 0v12a2 2 0 01-2 2H8a2 2 0 01-2-2V7" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        );
      })}

      <a
        href={addAgentHref}
        className="mt-1 flex items-center gap-2 rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-[13px] font-medium text-neutral-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-sky-300 hover:text-sky-600"
      >
        {tt("＋ 添加 app / agent")}
      </a>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 主区详情（doctrine v7）：右侧主区自带「我的 网站 / app / skill」目录页——选择不再
// 在左侧窄侧栏。点一个 app/skill → 整页换成它的内嵌功能区 + 右上角「← 返回」回到目录；
// 网站 tab 的卡片点击直接新开子站。
// ----------------------------------------------------------------------------
export interface WorkspaceSiteItem {
  /** site_id（= AgentDef.site_id），用于跳子站。 */
  key: string;
  name: string;
  tagline?: string;
  icon?: ReactNode;
  href: string;
}

// doctrine v9（2026-06-24）：workspace 也加 organization / workflow（与 playground 同
// 一块编排画布，由消费端 renderBoard 注入，避免 @xyflow/react 进 @oceanleo/ui）。
// 「skill」面向用户的标签正名为「agent」（内部值仍叫 skill，不破坏技术标识层）。
type WorkspaceTab = "site" | "app" | "skill" | "organization" | "workflow";

export function WorkspaceDetail({
  siteOrigin,
  accent = "#0ea5e9",
  homeSiteId = "",
  addAgentHref = "/playground",
  sites = [],
  renderBoard,
  renderSites,
}: {
  siteOrigin: Record<string, string>;
  accent?: string;
  homeSiteId?: string;
  addAgentHref?: string;
  /** @deprecated 模型统一在「AI 模型」页管理。 */
  modelCategories?: ModelCategory[];
  /** @deprecated 顶部模型选择已下线。 */
  modelSiteId?: string;
  /** @deprecated 顶部模型选择已下线。 */
  apiHref?: string;
  /**
   * 「网站」分区要列的站点（已废弃，doctrine v10 改用 renderSites 注入「已加入」站）。
   * 仅在未传 renderSites 时作为回退（列全部）。
   */
  sites?: WorkspaceSiteItem[];
  /** organization / workflow 编排画布（消费端注入；不传 → 这两 tab 隐藏）。 */
  renderBoard?: (ctx: PlaygroundBoardCtx) => ReactNode;
  /**
   * doctrine v10（2026-06-26）：「网站」分区只列**用户已加入**的站。由消费端注入
   * （持有 lib/sites + localStorage 收藏集），传 savedOnly=true 渲染已加入集。
   * 不传 → 回退到 sites（全家桶全列，旧行为）。
   */
  renderSites?: () => ReactNode;
}) {
  const tt = useUI();
  const { apps: workspaceApps, mine, loading, needsLogin, removeApp } = useWorkspaceApps(siteOrigin);
  const [sel, setSel] = useWorkspaceSelection("workspace");
  const [tab, setTab] = useState<WorkspaceTab>("app");
  const [boardEditing, setBoardEditing] = useState(false);

  const mySkills = useMemo(() => mine.filter((a) => (a.site_id || "") === SKILL_SITE_ID), [mine]);

  const active = useMemo(
    () => mine.find((a) => a.agent_id === sel) || null,
    [mine, sel],
  );

  // UC-3：src 只能来自 workspaceEmbedSrc 的第一方判定，见 Playground.tsx 的
  // workspace-embed-trust 区块与 docs/architecture/oceanleo-untrusted-content-isolation.md §8.3。
  const embedSrc = useMemo(
    () => workspaceEmbedSrc(siteOrigin, active),
    [active, siteOrigin],
  );

  // 顶部 tab 条（目录页 + organization/workflow 早返回共用）。「skill」标签正名为「agent」。
  const TABS: { id: WorkspaceTab; label: string }[] = [
    { id: "site", label: tt("网站") },
    { id: "app", label: "app" },
    { id: "skill", label: "agent" },
    ...(renderBoard
      ? ([
          { id: "organization", label: "organization" },
          { id: "workflow", label: "workflow" },
        ] as { id: WorkspaceTab; label: string }[])
      : []),
  ];
  const tabsBar = (
    <div className="inline-flex rounded-xl bg-neutral-100 p-1">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTab(t.id)}
          className={`rounded-lg px-5 py-1.5 text-[13px] font-medium transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
 tab === t.id
 ? "bg-white text-neutral-900 shadow-sm"
 : "text-neutral-500 hover:text-neutral-700"
 }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  // ── 选中一个 agent：整页换成内嵌功能区。成品 app 不再走这条，点开直接跳子站。 ──
  if (active) {
    return (
      <div className="flex h-[calc(100dvh-1px)] flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-100 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <BackButton onClick={() => setSel(null)} />
            <span className="min-w-0 truncate text-[13px] font-medium text-stone-600">
              {active.icon ? `${active.icon} ` : ""}
              {active.name}
            </span>
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
            <div className="grid h-full place-items-center rounded-2xl border border-stone-200 bg-white/60 p-8 text-center text-sm text-stone-400">
              {tt("该 app 所属站点暂未接入内嵌工作台。")}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── organization / workflow 分区：与「网站/app/agent」目录同一套外层版式（不上移）。
  //   编辑器由消费端 EditorInner 以 `fixed inset-0` 全屏覆盖在上层；board 始终挂在
  //   同一树位置（不 remount）。
  if (renderBoard && (tab === "organization" || tab === "workflow")) {
    // 关键修（2026-07-09）：进入 board **编辑器**（boardEditing）时，编辑器以
    // absolute inset-0 铺满内容区，此时这段「工作台 / 你加入的…」标题 + 顶部 tab 条
    // 若仍渲染就会残留在编辑器上方（操作员截图 2b38a316 的 bug）。boardEditing 之前
    // 被 set 了却从不读——现在读它：编辑器打开就隐藏标题+tabs，只留全屏编辑器；回到
    // 目录（boardEditing=false）再显示。
    return (
      <div
        className={
          boardEditing
            ? "relative w-full"
            : "mx-auto w-full max-w-6xl px-6 py-8"
        }
        style={boardEditing ? { height: "calc(100dvh - 1px)" } : undefined}
      >
        {!boardEditing && (
          <>
            <div className="mb-5">
              <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">{tt("工作台")}</h1>
              <p className="mt-1 text-[13px] text-neutral-500">
                {tt("你加入的")} <b>{tt("网站 / app / agent")}</b>{tt("，点开即用；或在")} <b>{tt("organization / workflow")}</b> {tt("里搭一支会协作的 agent 团队。")}
              </p>
            </div>
            <div className="mb-6">{tabsBar}</div>
          </>
        )}
        {/* doctrine v10：工作台只列「我的」organization/workflow（隐藏预设模板）。 */}
        {renderBoard({ kind: tab, onEditingChange: setBoardEditing, mineOnly: true })}
      </div>
    );
  }

  // ── 目录页：网站 / app / agent 三分区（同 all-sites），选择全在主区 ──
  // app / 网站 卡片优先用主站移植来的彩色几何站点图标 + 品牌色（按 site_id / s.key），
  // 替代 emoji/占位符；无对应站点图标的条目走原图标 + DirectoryCard 内置稳定色回退。
  // agent（skill）分区是 LeoAgent 聊天体，保留各自图标，不套站点图标。
  const appItems: DirectoryItem[] = workspaceApps.map((app) => ({
    id: app.id,
    name: app.name,
    tagline: app.tagline,
    icon: siteIconFor(app.site_id) ?? app.icon,
    logoColor: siteBrandColorFor(app.site_id) ?? undefined,
    capabilityImage: app.capabilityImage,
    accent,
    site_id: app.site_id,
    category: app.category,
    added: true,
    deletable: true,
    plainThumb: true,
  }));
  const skillItems: DirectoryItem[] = mySkills.map((a) => ({
    id: a.agent_id, name: a.name, tagline: a.tagline, capabilities: a.capabilities,
    icon: a.icon, accent, site_id: a.site_id, category: a.category, added: true,
  }));
  const siteItems: DirectoryItem[] = sites.map((s) => ({
    id: s.key, name: s.name, tagline: s.tagline,
    icon: siteIconFor(s.key) ?? s.icon,
    logoColor: siteBrandColorFor(s.key) ?? undefined,
    accent, site_id: s.key,
  }));

  const emptyState = (label: string) => (
    <div className="grid place-items-center rounded-2xl border border-dashed border-stone-300 bg-white/40 p-10 text-center">
      <div className="max-w-sm space-y-3">
        <p className="text-sm text-stone-500">
          {tt("还没有{label}。到「Playground」里挑选加入——", { label })}
          <br />· <b>app</b> = {tt("一整套操作台＋agent，能帮你填表单并生成产物；")}
          <br />· <b>agent</b> = {tt("纯聊天助手，跟它对话答疑。")}
        </p>
        <a
          href={addAgentHref}
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-white"
          style={{ background: accent }}
        >
          {tt("＋ 去 Playground 挑选")}
        </a>
      </div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">{tt("工作台")}</h1>
          <p className="mt-1 text-[13px] text-neutral-500">
            {tt("你加入的")} <b>{tt("网站 / app / agent")}</b>{tt("，点开即用；或在")} <b>{tt("organization / workflow")}</b> {tt("里搭一支会协作的 agent 团队。")}
          </p>
        </div>
        <a
          href={addAgentHref}
          className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-neutral-300 px-3.5 py-2 text-[13px] font-medium text-neutral-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-sky-300 hover:text-sky-600"
        >
          {tt("＋ 添加 app / agent")}
        </a>
      </div>

      <div className="mb-6">{tabsBar}</div>

      {tab === "site" ? (
        // doctrine v10：只列用户已加入的站（renderSites savedOnly）。未注入则回退列全部。
        renderSites ? (
          renderSites()
        ) : (
          <AppDirectory
            items={siteItems}
            accent={accent}
            openLabel={tt("打开")}
            emptyText={tt("暂无网站。")}
            onOpen={(it) => {
              const s = sites.find((x) => x.key === it.id);
              if (s) window.open(s.href, "_blank", "noopener,noreferrer");
            }}
          />
        )
      ) : tab === "app" ? (
        loading ? (
          <AppDirectory items={[]} loading accent={accent} />
        ) : needsLogin ? (
          emptyState(" app")
        ) : workspaceApps.length === 0 ? (
          emptyState(" app")
        ) : (
          <AppDirectory
            items={appItems}
            accent={accent}
            openLabel={tt("打开")}
            onOpen={(it) => {
              const app = workspaceApps.find((entry) => entry.id === it.id);
              if (app?.href) openMarketApp(app);
            }}
            onDelete={(it) => {
              const app = workspaceApps.find((entry) => entry.id === it.id);
              if (app) void removeApp(app.id, app.kind);
            }}
          />
        )
      ) : loading ? (
        <AppDirectory items={[]} loading accent={accent} />
      ) : mySkills.length === 0 ? (
        emptyState(" agent")
      ) : (
        <AppDirectory
          items={skillItems}
          accent={accent}
          openLabel={tt("打开")}
          onOpen={(it) => setSel(it.id)}
        />
      )}

      {/* 兜底：完全没有任何 app/skill 且当前在 app/skill tab 时，AgentChat 入口仍可用 */}
      {!loading && mine.length === 0 && tab !== "site" && homeSiteId === "" && (
        <p className="mt-6 text-center text-[12px] text-stone-400">
          {tt("也可以直接到「新建任务」让 OceanLeo agent 帮你做事。")}
        </p>
      )}
    </div>
  );
}
