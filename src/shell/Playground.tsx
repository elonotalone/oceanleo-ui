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
//     目录页；顶部一条全模态 ModelPicker（作用域仅 playground）+「放入工作台」。
//   - doctrine v10（2026-06-26）：原 /all-sites 的「网站」分区（站卡片 + AI 智能推荐）
//     并入这里，成为第一个 tab。站点清单由消费端经 renderSites 注入，/all-sites 路由删除。
// ============================================================================

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ModelPicker } from "./ModelPicker";
import { AppDirectory, type DirectoryItem } from "./AppDirectory";
import { AiRecommendBox } from "./AiRecommendBox";
import { ItemDetailModal } from "./ItemDetailModal";
import { CreateSkillModal } from "./CreateSkillModal";
import { SkillPromptPanel } from "./SkillPromptPanel";
import { PromptCardModal } from "./HomeCards";
import {
  GENERIC_PROMPTS,
  PROMPT_LIBRARY,
  loadCustomPromptCards,
  saveCustomPromptCards,
  type PromptCard,
} from "./home-cards";
import { listAgents, saveAgent, type AgentDef } from "../lib/agent";
import type { ItemRecommendation } from "../lib/recommend";
import { useUI } from "../i18n/ui/useUI";

// site_id="agent" 的条目是纯聊天 skill；其余站的条目是有能力的功能区 agent。
const SKILL_APP_ID = "agent";
const PLAYGROUND_MODEL_SITE = "__playground__";
// 「＋ 新建」首卡的哨兵 id（agent / organization / workflow 三个可创建分区共用）。
const NEW_CARD_ID = "__new__";

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

// doctrine v8（2026-06-24）：playground 在 app / agent 之外新增两个「编排」分区——
//   organization：可视化搭 agent 团队 / 公司架构图（节点=agent，边=关系如「汇报」）。
//   workflow    ：流程编排图（可导入 organization、可直接导入单个 agent）。
// 这两块的重型画布（React Flow grid-snap）由消费端（oceanleo 主站）通过 renderBoard
// 注入——这样 @xyflow/react 依赖只落在主站，不强加给全部 @oceanleo/ui 消费站。
// doctrine v10（2026-06-26）：原 /all-sites 的「网站」分区（全家桶站卡片 + AI 智能推荐）
//   并入 playground，成为第一个 tab。站点清单 + 推荐网关是消费端 lib/sites 的事，所以
//   由消费端通过 renderSites 注入（与 renderBoard 同一范式），不把 SITES 耦合进本包。
// doctrine v12（2026-06-30）：新增「客户端app」一级 tab（与网站/app/agent/organization/
//   workflow 并列），原右下角「原生骨架预览」浮层升级而来。点进去先选客户端（哪个
//   网站对应的 app），再看它有哪些 app。客户端清单 + 原生骨架预览是消费端的事，所以
//   同样由消费端经 renderClientApps 注入（与 renderSites/renderBoard 同一范式）。
// 2026-07-02（操作员）：新增「prompt」专区 tab——全家桶 prompt 卡片库（分类 + 搜索 +
//   「创建 prompt」首卡 + 每张卡片右上角预览/编辑/保存）。用户自建 prompt 持久化
//   （localStorage，与子站首页「工作内容」卡片同一套 PromptCardModal / 存取助手）。
type Tab = "site" | "app" | "skill" | "prompt" | "clientapp" | "organization" | "workflow";

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
  renderBoard,
  renderSites,
  renderClientApps,
}: {
  /** site_id → 子站 origin（拼 iframe src 用）。 */
  siteOrigin: Record<string, string>;
  accent?: string;
  /**
   * 渲染 organization / workflow 编排画布。由消费端注入（持有 React Flow 依赖）。
   * 不传 → 这两个分区显示「即将开放」占位。
   */
  renderBoard?: (ctx: PlaygroundBoardCtx) => ReactNode;
  /**
   * 渲染「网站」分区（全家桶站卡片 + AI 智能推荐 + 加入工作台）。由消费端注入
   * （持有 lib/sites 站点清单 + /v1/recommend 网关）。不传 → 不显示「网站」tab。
   */
  renderSites?: () => ReactNode;
  /**
   * doctrine v12（2026-06-30）：渲染「客户端app」分区（选客户端 → 看它的 app +
   * 原生骨架预览）。由消费端注入（持有客户端 app 注册表 + 5 系统骨架预览）。
   * 不传 → 不显示「客户端app」tab。
   */
  renderClientApps?: () => ReactNode;
}) {
  const tt = useUI();
  const [refreshKey, setRefreshKey] = useState(0);
  const { agents, loading } = useAgents(refreshKey);
  // 有「网站」分区时默认落在它（它是第一个 tab）；否则落 app。
  const [tab, setTab] = useState<Tab>(renderSites ? "site" : "app");
  const [activeId, setActiveId] = useState<string>("");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  // organization/workflow 画布是否进了编辑器（进了就隐藏标题+tab，全屏编辑）。
  const [boardEditing, setBoardEditing] = useState(false);
  // doctrine v11：点卡片先弹详情弹窗（WorkBuddy 式），点「召唤」才进内嵌功能区。
  const [detailId, setDetailId] = useState<string>("");
  // doctrine v11：AI 推荐命中的 id 顺序（置顶高亮）；空 = 未推荐，显示全部。
  const [recIds, setRecIds] = useState<string[] | null>(null);
  // 2026-07-02：卡片右上角「查看/编辑 prompt」→ SkillPromptPanel（modal 形态）。
  const [promptOf, setPromptOf] = useState<AgentDef | null>(null);

  // app 分区 = 各产品站功能区 agent（site_id≠"agent"）；agent 分区 = LeoAgent 套壳。
  const appAgents = useMemo(() => agents.filter((a) => (a.site_id || "") !== SKILL_APP_ID), [agents]);
  const skillAgents = useMemo(() => agents.filter((a) => (a.site_id || "") === SKILL_APP_ID), [agents]);
  const list = tab === "app" ? appAgents : skillAgents;

  const items: DirectoryItem[] = useMemo(() => {
    const base = list.map<DirectoryItem>((a) => ({
      id: a.agent_id,
      name: a.name,
      tagline: a.tagline,
      capabilities: a.capabilities,
      icon: a.icon,
      accent,
      site_id: a.site_id,
      category: a.category,
    }));
    // AI 推荐命中时，把命中项按匹配度置顶（其余保持原序）。
    if (recIds && recIds.length) {
      const rank = new Map(recIds.map((id, i) => [id, i]));
      return [...base].sort((x, y) => {
        const rx = rank.has(x.id) ? rank.get(x.id)! : Number.MAX_SAFE_INTEGER;
        const ry = rank.has(y.id) ? rank.get(y.id)! : Number.MAX_SAFE_INTEGER;
        return rx - ry;
      });
    }
    return base;
  }, [list, accent, recIds]);

  // 切 tab 时清掉推荐高亮（不同分区候选集不同）。
  useEffect(() => {
    setRecIds(null);
  }, [tab]);

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

  const embedSrc = useMemo(() => {
    if (!active) return "";
    const origin = siteOrigin[active.site_id];
    if (!origin) return "";
    const fn = active.fn_id ? `&fn=${encodeURIComponent(active.fn_id)}` : "";
    return `${origin}/workspace?embed=1&solo=1${fn}&agent=${encodeURIComponent(active.agent_id)}`;
  }, [active, siteOrigin]);

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
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-medium text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: accent }}
              title={tt("把这个 app 加入「我的 app」，之后在工作台直接用")}
            >
              {tt("＋ 放入工作台")}
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
          <div className="shrink-0">
            <ModelPicker
              categories={["text", "image", "video", "threed", "audio"]}
              siteId={PLAYGROUND_MODEL_SITE}
              variant="popover"
              align="right"
            />
          </div>
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
            <div className="grid h-full place-items-center rounded-2xl border border-dashed border-stone-300 bg-white/40 p-8 text-center text-[13px] text-neutral-400">
              {tt("该 app 所属站点暂未接入内嵌功能区。")}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── 网站分区（doctrine v10）：全家桶站卡片 + AI 智能推荐，由消费端 renderSites 注入。
  //   与 app/agent 目录同一套外层版式（mx-auto max-w-6xl + 标题 + tab）。
  if (tab === "site" && renderSites) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="mb-5">
          <PlaygroundHeader />
        </div>
        <div className="mb-6">
          <PlaygroundTabs
            tab={tab}
            setTab={setTab}
            hasSites={!!renderSites}
            hasBoard={!!renderBoard}
            hasClientApps={!!renderClientApps}
          />
        </div>
        {renderSites()}
      </div>
    );
  }

  // ── 客户端app 分区（doctrine v12，2026-06-30）：选客户端 → 它的 app + 原生骨架
  //   预览，由消费端 renderClientApps 注入。与其余分区同一套外层版式。
  if (tab === "clientapp" && renderClientApps) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="mb-5">
          <PlaygroundHeader />
        </div>
        <div className="mb-6">
          <PlaygroundTabs
            tab={tab}
            setTab={setTab}
            hasSites={!!renderSites}
            hasBoard={!!renderBoard}
            hasClientApps={!!renderClientApps}
          />
        </div>
        {renderClientApps()}
      </div>
    );
  }

  // ── prompt 专区（2026-07-02）：全家桶 prompt 卡片库 + 「创建 prompt」+ 卡片
  //   右上角预览/编辑/保存。与其余分区同一套外层版式。
  if (tab === "prompt") {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="mb-5">
          <PlaygroundHeader />
        </div>
        <div className="mb-6">
          <PlaygroundTabs
            tab={tab}
            setTab={setTab}
            hasSites={!!renderSites}
            hasBoard={!!renderBoard}
            hasClientApps={!!renderClientApps}
          />
        </div>
        <PromptZone accent={accent} />
      </div>
    );
  }

  // ── organization / workflow 分区 ──
  //   目录页（boardEditing=false）：与 app/agent **完全同一套外层版式**
  //     （mx-auto max-w-6xl px-6 py-8 + 标题 + tab），切 tab 时位置纹丝不动。
  //   编辑器（boardEditing=true）：换成**全宽满高**外层（h-[calc(100dvh-1px)]，无
  //     max-w / padding / 标题 / tab），编辑器铺满 <main> 区。<main> 本身就在侧栏
  //     右侧，所以左侧侧栏始终在。
  //
  //   关键（2026-06-25 修「点卡片闪一下打不开」）：**board 必须挂在同一棵树的同一
  //   位置、同一 key**，否则 boardEditing 翻转时整段 <OrgWorkflowBoard> 会 unmount /
  //   remount——它内部刚 setOpenOrg(card) 的状态被清回 null，于是「打开编辑器 →
  //   立刻被重挂回目录」造成闪烁、永远打不开。之前用两个 early-return 返回**结构
  //   不同**的两棵树（目录页 board 在第 3 个子节点，编辑页 board 在唯一子节点），
  //   React 按位置 diff 判定类型变化 → 强制 remount。现在统一成**一棵树**：外层 div
  //   的 className 随 boardEditing 切换，标题 + tab 仅在非编辑态渲染，board 永远是
  //   最后一个子节点、位置恒定，从而不再 remount。
  if (tab === "organization" || tab === "workflow") {
    if (!renderBoard) {
      return (
        <div className="mx-auto w-full max-w-6xl px-6 py-8">
          <div className="mb-5">
            <PlaygroundHeader />
          </div>
          <div className="mb-6">
            <PlaygroundTabs tab={tab} setTab={setTab} hasSites={!!renderSites} hasBoard={!!renderBoard} hasClientApps={!!renderClientApps} />
          </div>
          <div className="grid place-items-center p-8 text-center text-[13px] text-neutral-400">
            {tab === "organization" ? tt("组织编排") : tt("流程编排")}画布即将开放。
          </div>
        </div>
      );
    }
    return (
      <div
        className={
          boardEditing
            ? "h-[calc(100dvh-1px)] w-full"
            : "mx-auto w-full max-w-6xl px-6 py-8"
        }
      >
        {!boardEditing && (
          <>
            <div className="mb-5">
              <PlaygroundHeader />
            </div>
            <div className="mb-6">
              <PlaygroundTabs tab={tab} setTab={setTab} hasSites={!!renderSites} hasBoard={!!renderBoard} hasClientApps={!!renderClientApps} />
            </div>
          </>
        )}
        {/* board 永远是该 div 的最后一个子节点：boardEditing 翻转时它的相对位置不变，
            React 复用同一实例（不 remount），编辑器内部 openOrg 状态得以保留。 */}
        <div key={`board-${tab}`} className={boardEditing ? "h-full" : ""}>
          {renderBoard({ kind: tab, onEditingChange: setBoardEditing })}
        </div>
      </div>
    );
  }

  // ── 目录页：app / agent 二选一 + 统一目录 ──
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-5">
        <PlaygroundHeader />
      </div>

      <div className="mb-6">
        <PlaygroundTabs tab={tab} setTab={setTab} hasSites={!!renderSites} hasBoard={!!renderBoard} hasClientApps={!!renderClientApps} />
      </div>

      {/* doctrine v11：AI 智能推荐（按分区定制文案，候选 = 当前分区全部条目）。 */}
      <AiRecommendBox
        candidates={items.map((it) => ({
          id: it.id,
          name: it.name,
          tagline: it.tagline,
          capabilities: it.capabilities,
          category: it.category,
        }))}
        kindLabel={tab === "app" ? "app" : "agent"}
        placeholder={
          tab === "app"
            ? tt("说说你想做什么，AI 帮你推荐最合适的 app…  例如：帮我做一份简历")
            : tt("说说你想做什么，AI 帮你推荐最合适的 agent…  例如：帮我分析竞品")
        }
        examples={
          tab === "app"
            ? [tt("帮我做一份求职简历"), tt("给商品做主图和卖点"), tt("把录音整理成纪要")]
            : [tt("帮我写一份商业计划"), tt("做竞品分析"), tt("优化我的小红书文案")]
        }
        accent={accent}
        onRecommend={(recs: ItemRecommendation[]) => setRecIds(recs.map((r) => r.id))}
        onClear={() => setRecIds(null)}
      />

      <AppDirectory
        items={items}
        leadingCards={agentLeadingCards}
        accent={accent}
        loading={loading}
        openLabel={tt("试玩")}
        emptyText={tab === "app" ? tt("暂无可试玩的 app。") : tt("暂无可试玩的 agent。")}
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
        nativeLabel={tt("按技能")}
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
          tags={[tab === "app" ? "app" : "agent", detailAgent.category || ""].filter(Boolean)}
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

// Playground 标题 + 一句话介绍。操作员 2026-06-24：打开 organization / workflow 目录
// 时这段文案不能消失，所以抽成共用组件，目录页与 org/workflow 分区都渲染它。
function PlaygroundHeader() {
  const tt = useUI();
  return (
    <>
      <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">Playground</h1>
      <p className="mt-1 text-[13px] text-neutral-500">
        {tt("浏览全家桶")} <b>{tt("网站")}</b>{tt("（或用 AI 智能推荐找站）、挑一个")} <b>app</b>{tt("（能填操作台、出产物）或")} <b>agent</b>{tt("（人格预设 + 可调工具的工作单元）直接试玩；或在")} <b>organization</b> / <b>workflow</b> {tt("里可视化搭一支会协作的 agent 团队。")}
      </p>
    </>
  );
}

function PlaygroundTabs({
  tab,
  setTab,
  hasSites,
  hasBoard,
  hasClientApps,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  hasSites?: boolean;
  hasBoard?: boolean;
  hasClientApps?: boolean;
}) {
  const tt = useUI();
  const tabs = [
    ...(hasSites ? [{ id: "site" as Tab, label: tt("网站") }] : []),
    { id: "app" as Tab, label: "app" },
    { id: "skill" as Tab, label: "agent" },
    { id: "prompt" as Tab, label: "prompt" },
    ...(hasClientApps ? [{ id: "clientapp" as Tab, label: tt("客户端app") }] : []),
    ...(hasBoard
      ? [
          { id: "organization" as Tab, label: "organization" },
          { id: "workflow" as Tab, label: "workflow" },
        ]
      : []),
  ];
  return (
    <div className="inline-flex rounded-xl bg-neutral-100 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTab(t.id)}
          className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition ${
            tab === t.id ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          {t.label}
        </button>
      ))}
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

function PromptZone({ accent }: { accent: string }) {
  const tt = useUI();
  const [custom, setCustom] = useState<PromptCard[]>([]);
  const [cat, setCat] = useState("__all__");
  const [filter, setFilter] = useState("");
  const [modal, setModal] = useState<{ card: PromptCard; isNew: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCustom(loadCustomPromptCards(PLAYGROUND_PROMPT_SCOPE));
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

  const all = useMemo(() => [...custom, ...builtin], [custom, builtin]);

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
    setCustom(next);
    saveCustomPromptCards(PLAYGROUND_PROMPT_SCOPE, next);
  }

  function handleSave(card: PromptCard, isNew: boolean) {
    if (isNew || !card.custom) {
      const mine: PromptCard = {
        ...card,
        id: `custom-${Date.now()}`,
        custom: true,
        category: card.category || tt("我的"),
      };
      persist([mine, ...custom]);
    } else {
      persist(custom.map((c) => (c.id === card.id ? { ...card, custom: true } : c)));
    }
    setModal(null);
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

  const emptyCard: PromptCard = {
    id: "",
    icon: "✨",
    title: "",
    desc: "",
    prompt: "",
    category: tt("我的"),
    custom: true,
  };

  return (
    <section>
      {/* 工具条：分类 chips + 关键词筛选 */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {["__all__", ...categories].map((c) => {
            const on = cat === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCat(c)}
                className={`rounded-full px-3 py-1.5 text-[13px] transition ${
                  on ? "font-medium text-white shadow-sm" : "bg-stone-100 text-stone-600 hover:bg-stone-200/70"
                }`}
                style={on ? { background: accent } : undefined}
              >
                {c === "__all__" ? tt("全部") : c}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-stone-200/90 bg-white/80 px-3 py-1.5 shadow-sm">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0 text-stone-400">
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
            <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={tt("按名称筛选…")}
            className="w-40 bg-transparent text-[13px] text-stone-800 outline-none placeholder:text-stone-400"
          />
          {filter && (
            <button
              type="button"
              onClick={() => setFilter("")}
              className="shrink-0 rounded-full px-1.5 text-[12px] text-stone-400 hover:bg-stone-100 hover:text-stone-600"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {copied && (
        <p className="mb-3 text-[12px] text-emerald-600">{tt("已复制到剪贴板 ✓")}</p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {/* 「创建 prompt」板块（第一张）。 */}
        <button
          type="button"
          onClick={() => setModal({ card: emptyCard, isNew: true })}
          className="flex min-h-[110px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed bg-white/70 px-4 py-4 text-stone-400 transition hover:border-solid hover:text-stone-600"
          style={{ borderColor: `${accent}80` }}
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          <span className="text-[13px] font-medium">{tt("创建 prompt")}</span>
        </button>

        {shown.map((c) => (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            onClick={() => setModal({ card: c, isNew: false })}
            onKeyDown={(e) => {
              if (e.key === "Enter") setModal({ card: c, isNew: false });
            }}
            className="group relative flex min-h-[110px] cursor-pointer flex-col rounded-2xl border border-stone-200/80 bg-white/85 px-4 py-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md"
          >
            <div className="flex items-center gap-2">
              <span className="text-[16px] leading-none">{c.icon}</span>
              <span className="truncate text-[14px] font-semibold text-stone-900">{c.title}</span>
              {c.custom && (
                <span className="shrink-0 rounded bg-stone-100 px-1 text-[10px] text-stone-400">
                  {tt("我的")}
                </span>
              )}
            </div>
            <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-stone-500">
              {c.desc || c.prompt}
            </p>
            <span className="mt-auto pt-2 text-[11px] text-stone-400">{c.category}</span>
            {/* 右上角：预览 / 编辑 / 保存 */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setModal({ card: c, isNew: false });
              }}
              title={tt("查看 / 编辑")}
              aria-label={tt("查看 / 编辑")}
              className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg border border-stone-200 bg-white/90 text-stone-400 opacity-0 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 hover:text-stone-600 group-hover:opacity-100"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {shown.length === 0 && (
        <p className="py-12 text-center text-sm text-stone-400">{tt("没有匹配的 prompt。")}</p>
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
          onSave={(card) => handleSave(card, modal.isNew)}
          onDelete={
            modal.card.custom && !modal.isNew
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
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[13px] font-medium text-stone-600 transition hover:bg-stone-50 active:scale-95"
      title={tt("返回选择页")}
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label ?? tt("返回")}
    </button>
  );
}
