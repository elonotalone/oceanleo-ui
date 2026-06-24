"use client";

// ============================================================================
// @oceanleo/ui — 工作台 master-detail（doctrine v4，单一事实源）
// ----------------------------------------------------------------------------
// 「工作台」侧栏子栏（master）+ 主区详情（detail）：
//   子栏 WorkspaceSubNav：列「我的 Agents」(= 功能区)，每项右侧带「删除」图标
//     （从我的 Agents 移除，调 unsaveAgent）；底部「＋ 添加 agent」跳 /all-sites?tab=agent。
//   主区 WorkspaceDetail：选中 agent → iframe 内嵌该子站功能区
//     (/workspace?embed=1&solo=1&fn=&agent=)；未选 → 兜底对话 AgentChat。
//
// 取代旧 WorkspaceShell 的「顶部功能区按键条」——把它从主区顶栏上提到侧栏子栏。
// 子栏与主区通过 useWorkspaceSelection("workspace") 共享选中态。
// ============================================================================

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useWorkspaceSelection } from "./WorkspaceSelection";
import { ModelPicker, type ModelCategory } from "./ModelPicker";
import { AppDirectory, type DirectoryItem } from "./AppDirectory";
import { BackButton } from "./Playground";
import { listMyAgents, unsaveAgent, type AgentDef } from "../lib/agent";

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
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition ${
              on ? "text-white" : "text-neutral-700 hover:bg-neutral-200/50"
            }`}
            style={on ? { background: accent } : undefined}
            title={f.label}
          >
            {f.icon && <span className="shrink-0 text-base leading-none">{f.icon}</span>}
            <span className="min-w-0 flex-1 truncate font-medium">{f.label}</span>
            {f.agentId && (
              <span className={`shrink-0 text-[11px] ${on ? "text-white/80" : "text-indigo-400"}`} title="该 app 有专属 agent">
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

// ----------------------------------------------------------------------------
// 侧栏子栏：我的 Agents（功能区）+ 删除图标 + ＋添加 agent
// ----------------------------------------------------------------------------
export function WorkspaceSubNav({
  accent = "#0ea5e9",
  addAgentHref = "/all-sites?tab=app",
}: {
  accent?: string;
  addAgentHref?: string;
}) {
  const { mine, loading, remove } = useMyAgents();
  const [sel, setSel] = useWorkspaceSelection("workspace");

  // 默认选中第一个。
  useEffect(() => {
    if (!sel && mine.length > 0) setSel(mine[0].agent_id);
  }, [sel, mine, setSel]);

  return (
    <div className="space-y-0.5">
      {loading && <p className="px-3 py-2 text-[12px] text-neutral-400">加载 app / skill…</p>}
      {!loading && mine.length === 0 && (
        <p className="px-3 py-2 text-[12px] leading-relaxed text-neutral-400">
          还没有 app 或 skill。点下方「＋ 添加 app / skill」，从「全部应用」里挑选
          app（能干活）或 skill（纯聊天）。
        </p>
      )}
      {mine.map((a) => {
        const on = a.agent_id === sel;
        return (
          <div
            key={a.agent_id}
            className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition ${
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
              title="从工作台移除"
              aria-label="移除"
              className={`shrink-0 rounded p-0.5 transition ${
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
        className="mt-1 flex items-center gap-2 rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-[13px] font-medium text-neutral-500 transition hover:border-sky-300 hover:text-sky-600"
      >
        ＋ 添加 app / skill
      </a>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 主区详情（doctrine v7）：右侧主区自带「我的 网站 / app / skill」目录页——选择不再
// 在左侧窄侧栏。点一个 app/skill → 整页换成它的内嵌功能区 + 右上角「← 返回」回到目录；
// 网站 tab 的卡片点击直接新开子站。
// ----------------------------------------------------------------------------
const SKILL_SITE_ID = "agent";

export interface WorkspaceSiteItem {
  /** site_id（= AgentDef.site_id），用于跳子站。 */
  key: string;
  name: string;
  tagline?: string;
  icon?: ReactNode;
  href: string;
}

type WorkspaceTab = "site" | "app" | "skill";

export function WorkspaceDetail({
  siteOrigin,
  accent = "#0ea5e9",
  homeSiteId = "",
  addAgentHref = "/all-sites?tab=app",
  modelCategories = ["text", "image", "video", "threed", "audio"],
  modelSiteId = "oceanleo",
  apiHref = "/api",
  sites = [],
}: {
  siteOrigin: Record<string, string>;
  accent?: string;
  homeSiteId?: string;
  addAgentHref?: string;
  /** 顶部模型选择器要展示的模态。主站给全部 5 个。传 [] 则不显示模型选择条。 */
  modelCategories?: ModelCategory[];
  /** 模型选择「站点 × 用户」持久化标识。 */
  modelSiteId?: string;
  /** 模型选择下拉底部「管理模型」跳转。 */
  apiHref?: string;
  /** 「网站」分区要列的站点（主站传全家桶 SITES）。 */
  sites?: WorkspaceSiteItem[];
}) {
  const { mine, loading } = useMyAgents();
  const [sel, setSel] = useWorkspaceSelection("workspace");
  const [tab, setTab] = useState<WorkspaceTab>("app");

  const myApps = useMemo(() => mine.filter((a) => (a.site_id || "") !== SKILL_SITE_ID), [mine]);
  const mySkills = useMemo(() => mine.filter((a) => (a.site_id || "") === SKILL_SITE_ID), [mine]);

  const active = useMemo(
    () => mine.find((a) => a.agent_id === sel) || null,
    [mine, sel],
  );

  const embedSrc = useMemo(() => {
    if (!active) return "";
    const origin = siteOrigin[active.site_id];
    if (!origin) return "";
    const fn = active.fn_id ? `&fn=${encodeURIComponent(active.fn_id)}` : "";
    return `${origin}/workspace?embed=1&solo=1${fn}&agent=${encodeURIComponent(active.agent_id)}`;
  }, [active, siteOrigin]);

  const showModelBar = modelCategories.length > 0;

  // ── 选中一个 app/skill：整页换成内嵌功能区 + 顶部模型选择 + 返回 ──
  if (active) {
    return (
      <div className="flex h-[calc(100dvh-1px)] flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-neutral-100 px-3 py-2">
          <BackButton onClick={() => setSel(null)} />
          {showModelBar && (
            <div className="min-w-0">
              <ModelPicker categories={modelCategories} siteId={modelSiteId} apiHref={apiHref} />
            </div>
          )}
          <span className="ml-auto truncate text-[13px] font-medium text-stone-600">
            {active.icon ? `${active.icon} ` : ""}
            {active.name}
          </span>
        </div>
        <div className="min-h-0 flex-1 p-1.5">
          {embedSrc ? (
            <iframe
              key={active.agent_id}
              src={embedSrc}
              title={active.name}
              className="h-full w-full rounded-2xl border border-stone-200 bg-white/60"
              allow="clipboard-write; clipboard-read; fullscreen"
              allowFullScreen
            />
          ) : (
            <div className="grid h-full place-items-center rounded-2xl border border-stone-200 bg-white/60 p-8 text-center text-sm text-stone-400">
              该 app 所属站点暂未接入内嵌工作台。
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── 目录页：网站 / app / skill 三分区（同 all-sites），选择全在主区 ──
  const appItems: DirectoryItem[] = myApps.map((a) => ({
    id: a.agent_id, name: a.name, tagline: a.tagline, capabilities: a.capabilities,
    icon: a.icon, accent, site_id: a.site_id, category: a.category, added: true,
  }));
  const skillItems: DirectoryItem[] = mySkills.map((a) => ({
    id: a.agent_id, name: a.name, tagline: a.tagline, capabilities: a.capabilities,
    icon: a.icon, accent, site_id: a.site_id, category: a.category, added: true,
  }));
  const siteItems: DirectoryItem[] = sites.map((s) => ({
    id: s.key, name: s.name, tagline: s.tagline, icon: s.icon, accent, site_id: s.key,
  }));

  const emptyState = (label: string) => (
    <div className="grid place-items-center rounded-2xl border border-dashed border-stone-300 bg-white/40 p-10 text-center">
      <div className="max-w-sm space-y-3">
        <p className="text-sm text-stone-500">
          还没有{label}。从「全部应用」里挑选加入——
          <br />· <b>app</b> = 一整套操作台＋agent，能帮你填表单并生成产物；
          <br />· <b>skill</b> = 纯聊天助手，跟它对话答疑。
        </p>
        <a
          href={addAgentHref}
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-white"
          style={{ background: accent }}
        >
          ＋ 去全部应用挑选
        </a>
      </div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">工作台</h1>
          <p className="mt-1 text-[13px] text-neutral-500">
            你加入的 <b>网站 / app / skill</b>，点开即用。app / skill 在本页直接操作，网站会新开对应站点。
          </p>
        </div>
        <a
          href={addAgentHref}
          className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-neutral-300 px-3.5 py-2 text-[13px] font-medium text-neutral-600 transition hover:border-sky-300 hover:text-sky-600"
        >
          ＋ 添加 app / skill
        </a>
      </div>

      <div className="mb-6 inline-flex rounded-xl bg-neutral-100 p-1">
        {([
          { id: "site", label: "网站" },
          { id: "app", label: "app" },
          { id: "skill", label: "skill" },
        ] as const).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-5 py-1.5 text-[13px] font-medium transition ${
              tab === t.id ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "site" ? (
        <AppDirectory
          items={siteItems}
          accent={accent}
          openLabel="打开"
          emptyText="暂无网站。"
          onOpen={(it) => {
            const s = sites.find((x) => x.key === it.id);
            if (s) window.open(s.href, "_blank", "noopener,noreferrer");
          }}
        />
      ) : tab === "app" ? (
        loading ? (
          <AppDirectory items={[]} loading accent={accent} />
        ) : myApps.length === 0 ? (
          emptyState(" app")
        ) : (
          <AppDirectory
            items={appItems}
            accent={accent}
            openLabel="打开"
            onOpen={(it) => setSel(it.id)}
          />
        )
      ) : loading ? (
        <AppDirectory items={[]} loading accent={accent} />
      ) : mySkills.length === 0 ? (
        emptyState(" skill")
      ) : (
        <AppDirectory
          items={skillItems}
          accent={accent}
          openLabel="打开"
          onOpen={(it) => setSel(it.id)}
        />
      )}

      {/* 兜底：完全没有任何 app/skill 且当前在 app/skill tab 时，AgentChat 入口仍可用 */}
      {!loading && mine.length === 0 && tab !== "site" && homeSiteId === "" && (
        <p className="mt-6 text-center text-[12px] text-stone-400">
          也可以直接到「新建任务」让 OceanLeo agent 帮你做事。
        </p>
      )}
    </div>
  );
}
