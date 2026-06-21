"use client";

// ============================================================================
// @oceanleo/ui — 单页「操作台」+ 顶部功能按键（OceanLeo 强制版式宗旨，2026-06-18）
// ----------------------------------------------------------------------------
// 这是 OceanLeo 全家桶（除 oceanleo/crm/ui/aitools/chat 5 站）所有产品站「业务
// 功能页」的统一范本。宗旨：每个站只有一个功能性路由；该站全部功能用「操作台
// 顶部一排功能按键」在页面内切换（翻页），不再用多个业务路由页。
// 设计文档：docs/architecture/oceanleo-single-page-operator-console.md（oceandino repo）。
//
//   ┌──────────┬────────────────────────────────┬────────────────────────┐
//   │ 侧边栏    │ [功能A][功能B][功能C]…(整条顶栏，跨中+右两栏)              │
//   │(AppShell) │ ┌──────────────┬───────────────────────────────────────┐│
//   │ 站级导航  │ │ 操作台         │ 结果 / 素材查看区                       ││
//   │           │ │  ① 步骤一 …    │ (ResultCanvas)                        ││
//   │           │ └──────────────┴───────────────────────────────────────┘│
//   └──────────┴────────────────────────────────┴────────────────────────┘
//
// 与 <Studio> 的关系：OperatorConsole = 顶部功能按键条（在「操作台/结果」两栏标题
// 之上，整条横跨）+ 下方 <Studio>（中列操作流 + 右列 canvas）。单功能站也可直接
// 用 <Studio>；多功能站用本组件统一翻页。
// 操作员 2026-06-21：功能按键条从「操作台」栏内部上移到整个 Studio 之上 —— 即在
// 「操作台」标题栏上面，作为整页顶栏，而不是塞在「操作台」栏体里。
//
// 框架无关：不 import next/navigation。深链同步交给消费端——传 `value`/`onChange`
// 即可受控；想同步到 URL `?fn=`，在消费端用自己的 router 监听 onChange。
// ============================================================================

import { useId, useState, type ReactNode } from "react";
import { Studio } from "./Studio";

// 顶部功能按键条 + 上方可选 header 占用的竖向高度（px）。Studio 用它从可视
// 高度里扣除，保证三栏整体不溢出一屏。按键条约 56px（pill 高 + 上下 padding），
// 留一点呼吸空间；带 header 时再加一截。
const TABS_BAR_HEIGHT = 60;

export interface ConsoleFunction {
  /** 功能唯一 id（用于受控选中 / 深链 ?fn=<id>）。 */
  id: string;
  /** 功能按键上的文字。 */
  label: string;
  /** 可选：按键左侧的小图标 / emoji。 */
  icon?: ReactNode;
  /** 可选：「热」「新」之类的小角标。 */
  badge?: string;
  /**
   * doctrine v3：本功能区绑定的 agent id（"<site_id>.<fn_id>"）。给了它，功能按键
   * 上会显示「✦ agent」标记，表示这个功能区有专属 agent 可一边聊一边生成。
   */
  agentId?: string;
  /**
   * 该功能的中列操作流（通常是若干 <StudioSection> + 底部主按钮）。
   * 用函数形式以便消费端按需惰性渲染。
   */
  ops: ReactNode;
  /**
   * 该功能的右列内容（通常是 <ResultCanvas>）。省略则沿用 OperatorConsole 的
   * 顶层 `canvas`（多个功能共用一个右栏时方便）。
   */
  canvas?: ReactNode;
}

export interface OperatorConsoleProps {
  /** 全部功能（= 顶部功能按键，从左到右）。 */
  functions: ConsoleFunction[];
  /** 受控：当前功能 id。不传则组件内部自管（非受控）。 */
  value?: string;
  /** 默认功能 id（非受控时的初始值）。默认第一个。 */
  defaultValue?: string;
  /** 切换功能时回调（受控必接；也可用于同步到 URL `?fn=`）。 */
  onChange?: (id: string) => void;
  /** 所有功能共用的右栏内容（当某功能未自带 canvas 时回退到它）。 */
  canvas?: ReactNode;
  /** 强调色（功能按键选中态 / 序号徽章），默认 #4f46e5（indigo-600）。 */
  accent?: string;
  /** 中列操作区初始宽度（px），默认 380。透传给 <Studio>（折算成初始比例）。 */
  opsWidth?: number;
  /** 左栏初始占比（0–1）。给了它就忽略 opsWidth。透传给 <Studio>。 */
  defaultRatio?: number;
  /** 分栏比例记忆 key（按站区分）。透传给 <Studio>；不传则不持久化。 */
  storageKey?: string;
  /** 左栏（操作台）标题，默认「操作台」。透传给 <Studio>。 */
  opsLabel?: ReactNode;
  /** 右栏（结果）标题，默认「结果」。透传给 <Studio>。 */
  canvasLabel?: ReactNode;
  /** 顶部 header 高度（px），默认 56（= AppShell header）。透传给 <Studio>。 */
  headerHeight?: number;
  /** 功能按键条上方可选标题区（如功能描述 / 提示）。 */
  header?: ReactNode;
  /**
   * 隐藏顶部功能区按键条，只渲染当前选中的那一个功能区（含其操作台/agent + 结果）。
   * 主站工作台 iframe 内嵌子站时用 `?solo=1` 触发——主站那条「我的 Agents」行已经
   * 是功能区选择器，子站不该再带出整站的功能区按键。
   */
  hideTabs?: boolean;
  className?: string;
}

export function OperatorConsole({
  functions,
  value,
  defaultValue,
  onChange,
  canvas,
  accent = "#4f46e5",
  opsWidth = 380,
  defaultRatio,
  storageKey,
  opsLabel,
  canvasLabel,
  headerHeight = 56,
  header,
  hideTabs = false,
  className = "",
}: OperatorConsoleProps) {
  const groupId = useId();
  const first = functions[0]?.id ?? "";
  const [internal, setInternal] = useState(defaultValue ?? first);
  const activeId = value ?? internal;
  const active =
    functions.find((f) => f.id === activeId) ?? functions[0];

  const select = (id: string) => {
    if (value === undefined) setInternal(id);
    onChange?.(id);
  };

  const single = functions.length <= 1 || hideTabs;

  // 顶栏 = 可选 header + 功能按键条。它在「操作台 / 结果」两栏标题之上，整条横跨
  // 中+右两栏（即 Studio 之上），不再塞进「操作台」栏体里。
  // hideTabs（solo 模式）：彻底不渲染功能按键条 + header。
  const showTopBar = (!single && !hideTabs) || (header != null && !hideTabs);
  const topBar = showTopBar ? (
    <div className="shrink-0 space-y-3 px-4 pt-4">
      {header}
      {!single && (
        <FunctionTabs
          functions={functions}
          activeId={active?.id ?? ""}
          accent={accent}
          groupId={groupId}
          onSelect={select}
        />
      )}
    </div>
  ) : null;

  // 中列 = 当前功能的操作流（功能按键条已上移到顶栏）。
  // key 用 active.id：切功能时重置该功能操作流内部状态。
  const ops = <div key={active?.id}>{active?.ops}</div>;

  // Studio 自己用 height: calc(100dvh - headerHeight) 定高（视口相对，稳）。顶栏
  // 占了一截竖向空间，所以把它的高度叠加进 Studio 的 headerHeight 里扣除，三栏
  // 整体仍恰好一屏、不溢出。无需依赖 h-full 的高度链路。
  const studioHeaderHeight = headerHeight + (showTopBar ? TABS_BAR_HEIGHT : 0);

  return (
    <div className={className}>
      {topBar}
      <Studio
        ops={ops}
        canvas={active?.canvas ?? canvas ?? null}
        opsWidth={opsWidth}
        defaultRatio={defaultRatio}
        storageKey={storageKey}
        opsLabel={opsLabel}
        canvasLabel={canvasLabel}
        accent={accent}
        headerHeight={studioHeaderHeight}
      />
    </div>
  );
}

// 顶部功能按键条：横排可换行的 pill 按钮，选中态用 accent 着色。
function FunctionTabs({
  functions,
  activeId,
  accent,
  groupId,
  onSelect,
}: {
  functions: ConsoleFunction[];
  activeId: string;
  accent: string;
  groupId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="功能选择"
      className="flex flex-wrap gap-1.5 rounded-2xl border border-stone-200/80 bg-white/80 p-1.5 shadow-sm"
    >
      {functions.map((f) => {
        const on = f.id === activeId;
        return (
          <button
            key={f.id}
            id={`${groupId}-tab-${f.id}`}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onSelect(f.id)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              on
                ? "text-white shadow-sm"
                : "text-stone-600 hover:bg-stone-100"
            }`}
            style={on ? { background: accent } : undefined}
          >
            {f.icon != null && <span className="shrink-0">{f.icon}</span>}
            <span>{f.label}</span>
            {f.agentId && (
              <span
                title="此功能区有专属 agent"
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none ${
                  on ? "bg-white/25 text-white" : "bg-indigo-100 text-indigo-700"
                }`}
              >
                ✦ agent
              </span>
            )}
            {f.badge && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none ${
                  on ? "bg-white/25 text-white" : "bg-rose-500 text-white"
                }`}
              >
                {f.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
