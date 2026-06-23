"use client";

// ============================================================================
// @oceanleo/ui — Playground（doctrine v5，单一事实源）
// ----------------------------------------------------------------------------
// 主站 oceanleo.com/playground：不加入工作台即可试玩任一 app。
//   子栏（侧栏 PlaygroundSubNav）：从上到下列「app」（= 每个产品站 / OceanLeo App）；
//     选一个 app 后列该 app 下的「agent / skill」，点一个 → 主区内嵌它。
//     所有纯聊天的 skill（site_id="agent" 的「OceanLeo App」）收进同一个 app 里，
//     不再把每个套壳 prompt 平铺成一个独立条目。
//   主区（PlaygroundDetail）：右栏顶部一条「全模态 ModelPicker」（作用域仅 playground，
//     独立持久化 key），右上角「放入工作台」按钮（saveAgent）；下方 iframe 内嵌选中
//     条目的子站功能区（与正常使用完全一致）。
//
// 子栏与主区通过 useWorkspaceSelection("playground") 共享选中态。选中值用复合 key
// "<app_id>::<agent_id>"，便于子栏同时记住「当前 app」与「当前条目」。
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { ModelPicker } from "./ModelPicker";
import { useWorkspaceSelection } from "./WorkspaceSelection";
import { listAgents, saveAgent, type AgentDef } from "../lib/agent";

// site_id（= app id）→ 展示名。各站可经 PlaygroundDetail.appNames 覆盖；未提供时
// 回退到这里的内置名，再回退到 site_id 本身。site_id="agent" 是「OceanLeo App」，
// 其条目是纯聊天 skill。
const APP_NAMES: Record<string, string> = {
  agent: "OceanLeo App（聊天 skill）",
  image: "LeoImage",
  video: "LeoVideo",
  music: "LeoMusic",
  resume: "LeoResume",
  ppt: "LeoSlides",
  word: "LeoDoc",
  excel: "LeoSheet",
  logo: "LeoLogo",
  interior: "LeoInterior",
  design: "LeoDesign",
  novel: "LeoNovel",
  script: "LeoScript",
  paper: "LeoPaper",
  law: "LeoLaw",
  money: "LeoMoney",
  search: "LeoSearch",
  meeting: "LeoMeeting",
  study: "LeoStudy",
  threed: "Leo3D",
  aihuman: "LeoHuman",
  ecommerce: "LeoStudio",
  make: "LeoMake",
  converter: "LeoConvert",
  website: "Website",
  trade: "Trade",
};

// site_id="agent" 的条目是纯聊天 skill；其余站的条目是有能力的功能区 agent。
const SKILL_APP_ID = "agent";

// playground 模型选择作用域：用独立 siteId，使其与各站正常工作台选择互不干扰。
const PLAYGROUND_MODEL_SITE = "__playground__";

function appLabel(siteId: string, override?: Record<string, string>): string {
  return override?.[siteId] || APP_NAMES[siteId] || siteId || "其他 app";
}

/** 复合选中值：`<app_id>::<agent_id>`。空 agent 表示只选了 app。 */
function packSel(appId: string, agentId: string): string {
  return `${appId}::${agentId}`;
}
function unpackSel(v: string | null): { appId: string; agentId: string } {
  if (!v) return { appId: "", agentId: "" };
  const i = v.indexOf("::");
  if (i < 0) return { appId: v, agentId: "" };
  return { appId: v.slice(0, i), agentId: v.slice(i + 2) };
}

// 共享 agent 列表（子栏与主区各自拉一次成本低，但用一个 hook 收敛逻辑）。
function useAgents(): { agents: AgentDef[]; loading: boolean } {
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
  }, []);
  return { agents, loading };
}

// ----------------------------------------------------------------------------
// 侧栏子栏：app（site_id）→ 该 app 下的 agent / skill
// ----------------------------------------------------------------------------
export function PlaygroundSubNav({
  accent = "#0ea5e9",
  appNames,
}: {
  accent?: string;
  /** site_id → app 展示名（覆盖内置 APP_NAMES）。 */
  appNames?: Record<string, string>;
}) {
  const { agents, loading } = useAgents();
  const [sel, setSel] = useWorkspaceSelection("playground");
  const { appId, agentId } = unpackSel(sel);

  // 按 app（site_id）聚合。site_id 缺失时归到 "other"。
  const apps = useMemo(() => {
    const seen = new Map<string, number>();
    for (const a of agents) {
      const s = a.site_id || "other";
      seen.set(s, (seen.get(s) || 0) + 1);
    }
    // OceanLeo App（纯 skill）排最前，其余按条目数降序。
    return Array.from(seen.entries())
      .map(([id, n]) => ({ id, n }))
      .sort((x, y) =>
        x.id === SKILL_APP_ID ? -1 : y.id === SKILL_APP_ID ? 1 : y.n - x.n,
      );
  }, [agents]);

  const inApp = useMemo(
    () => agents.filter((a) => (a.site_id || "other") === appId),
    [agents, appId],
  );
  const isSkillApp = appId === SKILL_APP_ID;

  if (loading) {
    return <p className="px-3 py-4 text-[12px] text-neutral-400">加载 app…</p>;
  }

  return (
    <div className="space-y-2">
      <div className="px-3 pt-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
        选择 app
      </div>
      <div className="space-y-0.5">
        {apps.map((c) => {
          const on = c.id === appId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setSel(packSel(c.id, ""))}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition ${
                on ? "font-medium text-neutral-900" : "text-neutral-600 hover:bg-neutral-200/50"
              }`}
              style={on ? { background: "rgba(0,0,0,0.04)", boxShadow: `inset 3px 0 0 ${accent}` } : undefined}
            >
              <span className="truncate">{appLabel(c.id, appNames)}</span>
              <span className="ml-2 shrink-0 text-[11px] text-neutral-400">{c.n}</span>
            </button>
          );
        })}
      </div>

      {appId && (
        <>
          <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            {appLabel(appId, appNames)} · {isSkillApp ? "skill" : "agent"}
          </div>
          <div className="space-y-0.5">
            {inApp.map((a) => {
              const on = a.agent_id === agentId;
              return (
                <button
                  key={a.agent_id}
                  type="button"
                  onClick={() => setSel(packSel(appId, a.agent_id))}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition ${
                    on ? "text-white" : "text-neutral-700 hover:bg-neutral-200/50"
                  }`}
                  style={on ? { background: accent } : undefined}
                  title={a.tagline}
                >
                  <span className="shrink-0 text-base leading-none">{a.icon || "✦"}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
                </button>
              );
            })}
            {inApp.length === 0 && (
              <p className="px-3 py-2 text-[12px] text-neutral-400">
                该 app 暂无{isSkillApp ? " skill" : " agent"}。
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// 主区详情：右栏顶部全模态 ModelPicker + 右上角「放入工作台」+ iframe 功能区
// ----------------------------------------------------------------------------
export function PlaygroundDetail({
  siteOrigin,
  accent = "#0ea5e9",
}: {
  /** site_id → 子站 origin（拼 iframe src 用）。 */
  siteOrigin: Record<string, string>;
  accent?: string;
}) {
  const { agents } = useAgents();
  const [sel] = useWorkspaceSelection("playground");
  const { agentId } = unpackSel(sel);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const active = useMemo(
    () => agents.find((a) => a.agent_id === agentId) || null,
    [agents, agentId],
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

  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col">
      {/* 顶部一条：左 = 全模态模型选择（作用域仅 playground）；右 = 放入工作台 */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-100 px-3 py-2">
        <div className="min-w-0">
          <ModelPicker
            categories={["text", "image", "video", "threed", "audio"]}
            siteId={PLAYGROUND_MODEL_SITE}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {savedMsg && <span className="text-[12px] text-emerald-600">{savedMsg}</span>}
          <button
            type="button"
            onClick={addToWorkspace}
            disabled={!active || saving}
            className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[13px] font-medium text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: accent }}
            title="把这个 app 加入「我的 app」，之后在工作台直接用"
          >
            ＋ 放入工作台
          </button>
        </div>
      </div>

      {/* 主体：选中 agent → iframe 内嵌其功能区（与正常使用完全一致） */}
      <div className="min-h-0 flex-1 p-1.5">
        {active && embedSrc ? (
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
            {active
              ? "该 app 所属站点暂未接入内嵌功能区。"
              : "在左侧选择一个场景，再选一个 app 即可在此直接试玩，无需加入工作台。"}
          </div>
        )}
      </div>
    </div>
  );
}
