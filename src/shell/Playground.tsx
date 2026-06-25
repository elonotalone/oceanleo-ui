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
// ============================================================================

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ModelPicker } from "./ModelPicker";
import { AppDirectory, type DirectoryItem } from "./AppDirectory";
import { CreateSkillModal } from "./CreateSkillModal";
import { listAgents, saveAgent, type AgentDef } from "../lib/agent";

// site_id="agent" 的条目是纯聊天 skill；其余站的条目是有能力的功能区 agent。
const SKILL_APP_ID = "agent";
const PLAYGROUND_MODEL_SITE = "__playground__";
// 「＋ 新建」首卡的哨兵 id（agent / organization / workflow 三个可创建分区共用）。
const NEW_CARD_ID = "__new__";

// 侧栏子栏：doctrine v7 起 playground 的选择全部搬到右侧主区，侧栏不再列东西。
export function PlaygroundSubNav() {
  return (
    <p className="px-3 py-4 text-[12px] leading-relaxed text-neutral-400">
      在右侧选择 app 或 agent 直接试玩，无需加入工作台。
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
type Tab = "app" | "skill" | "organization" | "workflow";

export type PlaygroundBoardKind = "organization" | "workflow";

/** renderBoard 的注入选项：消费端的画布通过 onEditingChange 告诉外壳「现在是否在
 *  编辑器里」——编辑器（打开了某个具体 organization/workflow）时外壳隐藏标题+tab，
 *  和打开 app/agent 时一致（操作员 2026-06-24）。 */
export interface PlaygroundBoardCtx {
  kind: PlaygroundBoardKind;
  onEditingChange: (editing: boolean) => void;
}

export function PlaygroundDetail({
  siteOrigin,
  accent = "#0ea5e9",
  renderBoard,
}: {
  /** site_id → 子站 origin（拼 iframe src 用）。 */
  siteOrigin: Record<string, string>;
  accent?: string;
  /**
   * 渲染 organization / workflow 编排画布。由消费端注入（持有 React Flow 依赖）。
   * 不传 → 这两个分区显示「即将开放」占位。
   */
  renderBoard?: (ctx: PlaygroundBoardCtx) => ReactNode;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const { agents, loading } = useAgents(refreshKey);
  const [tab, setTab] = useState<Tab>("app");
  const [activeId, setActiveId] = useState<string>("");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  // organization/workflow 画布是否进了编辑器（进了就隐藏标题+tab，全屏编辑）。
  const [boardEditing, setBoardEditing] = useState(false);

  // app 分区 = 各产品站功能区 agent（site_id≠"agent"）；agent 分区 = LeoAgent 套壳。
  const appAgents = useMemo(() => agents.filter((a) => (a.site_id || "") !== SKILL_APP_ID), [agents]);
  const skillAgents = useMemo(() => agents.filter((a) => (a.site_id || "") === SKILL_APP_ID), [agents]);
  const list = tab === "app" ? appAgents : skillAgents;

  const items: DirectoryItem[] = useMemo(
    () =>
      list.map<DirectoryItem>((a) => ({
        id: a.agent_id,
        name: a.name,
        tagline: a.tagline,
        capabilities: a.capabilities,
        icon: a.icon,
        accent,
        site_id: a.site_id,
        category: a.category,
      })),
    [list, accent],
  );

  // agent 分区：第一张卡固定「＋ 新建」（创建自己的 agent，与别处一致）。leadingCards
  // 永远渲染在最前、不受分类/筛选影响。
  const agentLeadingCards: DirectoryItem[] = useMemo(
    () =>
      tab === "skill"
        ? [
            {
              id: NEW_CARD_ID,
              name: "新建 agent",
              tagline: "创建一个属于你自己的 agent（人格预设 + 工具）",
              icon: "＋",
              accent,
              category: "新建",
            },
          ]
        : [],
    [tab, accent],
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
    if (r.ok) setSavedMsg("已放入工作台 ✓");
    else if (r.status === 401) setSavedMsg("请先登录");
    else setSavedMsg("操作失败");
    setTimeout(() => setSavedMsg(null), 2600);
  }

  // ── 选中某条目：整页换成它的内嵌功能区 ──
  //   顶部一行（操作员 2026-06-24）：左 = 返回 + 放入工作台 + app 名；右 = 模型选择
  //   （收成一个按键，点开才弹出各模态 chip 面板）。保证最上方永远只有一行。
  if (active) {
    return (
      <div className="flex h-[calc(100dvh-1px)] flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-100 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <BackButton onClick={() => setActiveId("")} />
            <button
              type="button"
              onClick={addToWorkspace}
              disabled={saving}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-medium text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: accent }}
              title="把这个 app 加入「我的 app」，之后在工作台直接用"
            >
              ＋ 放入工作台
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
              该 app 所属站点暂未接入内嵌功能区。
            </div>
          )}
        </div>
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
            <PlaygroundTabs tab={tab} setTab={setTab} />
          </div>
          <div className="grid place-items-center p-8 text-center text-[13px] text-neutral-400">
            {tab === "organization" ? "组织编排" : "流程编排"}画布即将开放。
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
              <PlaygroundTabs tab={tab} setTab={setTab} />
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
        <PlaygroundTabs tab={tab} setTab={setTab} />
      </div>

      <AppDirectory
        items={items}
        leadingCards={agentLeadingCards}
        accent={accent}
        loading={loading}
        openLabel="试玩"
        emptyText={tab === "app" ? "暂无可试玩的 app。" : "暂无可试玩的 agent。"}
        onOpen={(it) => {
          if (it.id === NEW_CARD_ID) setShowCreateAgent(true);
          else setActiveId(it.id);
        }}
        // agent 默认按其原生分类（技术工程 / 内容创作…18 类）分桶，保留细粒度分类。
        nativeFirst={tab === "skill"}
        nativeLabel="按技能"
      />

      {showCreateAgent && (
        <CreateSkillModal
          accent={accent}
          title="创建 agent"
          submitLabel="创建 agent"
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
  return (
    <>
      <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">Playground</h1>
      <p className="mt-1 text-[13px] text-neutral-500">
        挑一个 <b>app</b>（能填操作台、出产物）或 <b>agent</b>（人格预设 + 可调工具的工作单元）直接试玩；或在 <b>organization</b> / <b>workflow</b> 里可视化搭一支会协作的 agent 团队。
      </p>
    </>
  );
}

function PlaygroundTabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <div className="inline-flex rounded-xl bg-neutral-100 p-1">
      {([
        { id: "app", label: "app" },
        { id: "skill", label: "agent" },
        { id: "organization", label: "organization" },
        { id: "workflow", label: "workflow" },
      ] as const).map((t) => (
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

export function BackButton({ onClick, label = "返回" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[13px] font-medium text-stone-600 transition hover:bg-stone-50 active:scale-95"
      title="返回选择页"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </button>
  );
}
