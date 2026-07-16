"use client";

// @oceanleo/ui — 统一顶部主 bar（AdvancedTopBar）。
// ---------------------------------------------------------------------------
// 操作员 2026-07-16 拍板：全站 12 个高级功能共用一条顶栏组件，按对象类型数据
// 驱动换按钮（Canva 骨架）。它承载「全局 / 创建」操作，与「选中对象浮动 bar」
// （SelectionToolbar）是两条不同的 bar：
//   顶栏  = 撤销/重做 + 加文字/图片/形状 + 版式/主题/画幅 + 保存/导出/演示。
//   浮动  = 字体/字号/颜色/滤镜… 跟着选中对象走。
//
// 顶栏按钮三种行为（对应操作员原话「有的展开侧栏、有的下拉、有的直接生效」）：
//   kind:"action"   —— 点击直接触发 onRun。
//   kind:"dropdown" —— 点击展开一个选项纵列（选一项 → onSelect(value)）。
//   kind:"panel"    —— 点击打开左侧 overlay 侧栏（宿主据 panelId 渲染内容）。
//   kind:"toggle"   —— 直接切换的开关（active 态）。
//   kind:"custom"   —— 直接塞一个 ReactNode（画幅按钮组等）。
//
// 数据驱动：每个编辑器导出 TopBarModel（groups[]），顶栏只负责渲染 + 溢出。
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CHROME,
  ToolButton,
  ToolDivider,
  ToolGroup,
} from "./editor-chrome";

export interface TopBarOption {
  value: string;
  label: string;
  icon?: string;
}

export type TopBarAction =
  | {
      kind: "action";
      id: string;
      label: string;
      icon?: string;
      iconOnly?: boolean;
      disabled?: boolean;
      danger?: boolean;
      onRun: () => void;
    }
  | {
      kind: "toggle";
      id: string;
      label: string;
      icon?: string;
      iconOnly?: boolean;
      active: boolean;
      disabled?: boolean;
      onRun: () => void;
    }
  | {
      kind: "dropdown";
      id: string;
      label: string;
      icon?: string;
      iconOnly?: boolean;
      disabled?: boolean;
      value?: string;
      options: TopBarOption[];
      onSelect: (value: string) => void;
    }
  | {
      kind: "panel";
      id: string;
      label: string;
      icon?: string;
      iconOnly?: boolean;
      disabled?: boolean;
      /** 面板 id；宿主据此渲染 overlay 侧栏内容，激活态由 activePanelId 决定。 */
      panelId: string;
    }
  | {
      kind: "custom";
      id: string;
      render: ReactNode;
    };

export interface TopBarGroup {
  id: string;
  actions: TopBarAction[];
}

export interface TopBarModel {
  /** 左半区（创建 / 属性入口）。 */
  groups: TopBarGroup[];
  /** 右半区（保存 / 导出 / 演示等收尾操作）。 */
  trailing?: TopBarAction[];
}

function Dropdown({
  action,
  accent,
}: {
  action: Extract<TopBarAction, { kind: "dropdown" }>;
  accent: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const current =
    action.options.find((option) => option.value === action.value)?.label ||
    action.label;
  return (
    <div ref={ref} className="relative shrink-0">
      <ToolButton
        label={current}
        icon={action.icon}
        iconOnly={action.iconOnly}
        disabled={action.disabled}
        accent={accent}
        ariaExpanded={open}
        hasCaret
        onClick={() => setOpen((value) => !value)}
      />
      {open && (
        <div
          className={`absolute left-0 top-full z-[60] mt-2 max-h-[min(60vh,26rem)] w-[max(11rem,100%)] overflow-auto rounded-xl p-1 ${CHROME.bar}`}
        >
          {action.options.map((option) => {
            const selected = option.value === action.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  action.onSelect(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] transition ${
                  selected
                    ? "text-white"
                    : `${CHROME.fg2} ${CHROME.hover} hover:text-[var(--fg,#1c1917)]`
                }`}
                style={selected ? { background: accent } : undefined}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {selected && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-3.5 w-3.5">
                    <path d="m5 12 5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function renderAction(
  action: TopBarAction,
  accent: string,
  activePanelId: string | null,
  onOpenPanel: (panelId: string) => void,
): ReactNode {
  switch (action.kind) {
    case "custom":
      return <div key={action.id} className="shrink-0">{action.render}</div>;
    case "dropdown":
      return <Dropdown key={action.id} action={action} accent={accent} />;
    case "toggle":
      return (
        <ToolButton
          key={action.id}
          label={action.label}
          icon={action.icon}
          iconOnly={action.iconOnly}
          active={action.active}
          disabled={action.disabled}
          accent={accent}
          onClick={action.onRun}
        />
      );
    case "panel":
      return (
        <ToolButton
          key={action.id}
          label={action.label}
          icon={action.icon}
          iconOnly={action.iconOnly}
          active={activePanelId === action.panelId}
          disabled={action.disabled}
          accent={accent}
          ariaExpanded={activePanelId === action.panelId}
          onClick={() => onOpenPanel(action.panelId)}
        />
      );
    case "action":
    default:
      return (
        <ToolButton
          key={action.id}
          label={action.label}
          icon={action.icon}
          iconOnly={action.iconOnly}
          disabled={action.disabled}
          danger={action.danger}
          accent={accent}
          onClick={action.onRun}
        />
      );
  }
}

export function AdvancedTopBar({
  model,
  accent = "#4f46e5",
  activePanelId = null,
  onOpenPanel,
  className = "",
}: {
  model: TopBarModel;
  accent?: string;
  activePanelId?: string | null;
  onOpenPanel: (panelId: string) => void;
  className?: string;
}) {
  const groups = model.groups.filter((group) => group.actions.length > 0);
  const trailing = (model.trailing || []).filter(Boolean);
  return (
    <div
      role="toolbar"
      aria-label="编辑工具"
      className={`flex h-12 w-full items-center gap-1 border-b ${CHROME.border} ${CHROME.surface} px-2 ${className}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {groups.map((group, index) => (
          <div key={group.id} className="flex shrink-0 items-center gap-1">
            {index > 0 && <ToolDivider />}
            <ToolGroup>
              {group.actions.map((action) =>
                renderAction(action, accent, activePanelId, onOpenPanel),
              )}
            </ToolGroup>
          </div>
        ))}
      </div>
      {trailing.length > 0 && (
        <div className="flex shrink-0 items-center gap-1 pl-1">
          {trailing.map((action) =>
            renderAction(action, accent, activePanelId, onOpenPanel),
          )}
        </div>
      )}
    </div>
  );
}
