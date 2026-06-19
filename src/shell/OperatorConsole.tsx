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
//   │ 侧边栏    │ 中：操作台 OperatorConsole       │ 右：结果 / 素材查看区    │
//   │(AppShell) │  [功能A][功能B][功能C]…(顶部)    │ (ResultCanvas)         │
//   │ 站级导航  │  ① 步骤一 / ② 步骤二 …(下方竖排) │ 生成结果 / 素材库 …     │
//   └──────────┴────────────────────────────────┴────────────────────────┘
//
// 与 <Studio> 的关系：OperatorConsole = 顶部功能按键条 + 下方 <Studio>（中列操作
// 流 + 右列 canvas）。单功能站也可直接用 <Studio>；多功能站用本组件统一翻页。
//
// 框架无关：不 import next/navigation。深链同步交给消费端——传 `value`/`onChange`
// 即可受控；想同步到 URL `?fn=`，在消费端用自己的 router 监听 onChange。
// ============================================================================

import { useId, useState, type ReactNode } from "react";
import { Studio } from "./Studio";

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

  const single = functions.length <= 1;

  // 中列 = 顶部功能按键条（多功能时）+ 当前功能的操作流。
  const ops = (
    <div className="space-y-3">
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
      {/* key 用 active.id：切功能时重置该功能操作流内部状态。 */}
      <div key={active?.id}>{active?.ops}</div>
    </div>
  );

  return (
    <Studio
      ops={ops}
      canvas={active?.canvas ?? canvas ?? null}
      opsWidth={opsWidth}
      defaultRatio={defaultRatio}
      storageKey={storageKey}
      opsLabel={opsLabel}
      canvasLabel={canvasLabel}
      accent={accent}
      headerHeight={headerHeight}
      className={className}
    />
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
