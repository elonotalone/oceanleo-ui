"use client";

import type { ReactNode, RefObject } from "react";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import type { ResolvedAdvancedLayoutState } from "./advanced-layout-context";
import { EDIT_BAR_BUTTON_CLASS } from "./edit-bar-surface";
import { PLUGIN_AGENT_DRAWER_ID } from "./plugin-chrome/agent-drawer";
import type { SelectionControl } from "./selection-context";
import {
  SELECTION_TOOLBAR_VIEWPORT_MAX,
  type SelectionLiveCapability,
  type SelectionOverflowGroup,
} from "./selection-toolbar-layout";
import { useUI } from "../i18n/ui/useUI";

/**
 * SelectionToolbar 的外围 chrome（X2-b 从 SelectionToolbar.tsx 拆出，行为不变）：
 * 独立 AI 键、「更多」弹层里的分组列表、视口容量探针。SelectionToolbar 本体只留
 * 量宽 / 分区 / 渲染控件那条主线，回到前端拆分上限以内。
 */

/**
 * AI 固定在右段，13 个插件同一个位置。点它把左侧操控台换成 agent 对话，
 * 用户可以一边说一边改右边——所以这里只切抽屉，不抢舞台焦点。
 * 在单行编辑栏（EditBarRow）里由行来画，SelectionToolbar 不再渲染本组件。
 */
export function SelectionToolbarAgentButton({
  layout,
}: {
  layout: ResolvedAdvancedLayoutState;
}) {
  const tt = useUI();
  const active = layout.activeDrawerId === PLUGIN_AGENT_DRAWER_ID;
  return (
    <button
      type="button"
      data-edit-bar-agent
      data-edit-bar-interactive
      aria-pressed={active}
      onClick={() =>
        active ? layout.closeDrawer() : layout.openDrawer(PLUGIN_AGENT_DRAWER_ID)
      }
      className={`${EDIT_BAR_BUTTON_CLASS} ${
        active
          ? "bg-[var(--pchrome-accent,var(--awb-accent,#7c3aed))] text-[var(--pchrome-on-accent,#fff)] hover:bg-[var(--pchrome-accent,var(--awb-accent,#7c3aed))] hover:text-[var(--pchrome-on-accent,#fff)]"
          : ""
      }`}
      aria-label={tt("AI 助手")}
      title={tt("AI 助手：在左侧和 agent 对话，同时继续改右边")}
    >
      <AdvancedEditorIcon name="agent" className="h-[18px] w-[18px]" />
    </button>
  );
}

/** 「更多」弹层内容：能力标题 + 按语义分组的溢出控件。 */
export function SelectionOverflowGroups({
  groups,
  liveCapability,
  morePanelId,
  renderControl,
}: {
  groups: readonly SelectionOverflowGroup[];
  liveCapability: SelectionLiveCapability | null | undefined;
  morePanelId: string;
  renderControl: (control: SelectionControl) => ReactNode;
}) {
  const labelId = (groupId: string, groupIndex: number) =>
    `${morePanelId}-group-${groupIndex}-${groupId.replace(/[^a-z0-9_-]/gi, "-")}`;
  return (
    <>
      {liveCapability && (
        <div
          data-selection-overflow-capability-label
          className="px-2.5 pb-1 text-[11px] font-semibold tracking-wide text-[var(--muted,#78716c)]"
        >
          {liveCapability.label}
        </div>
      )}
      {groups.map((group, groupIndex) => (
        <div
          key={group.id}
          role="group"
          aria-labelledby={labelId(group.id, groupIndex)}
          data-selection-overflow-group={group.id}
          data-selection-overflow-group-label={group.label}
          className={`grid min-w-0 gap-0.5 ${
            groupIndex > 0 ? "border-t border-[var(--divider,#e7e5e4)] pt-1" : ""
          }`}
        >
          <div
            id={labelId(group.id, groupIndex)}
            className="truncate px-2.5 pb-0.5 pt-1 text-[10px] font-semibold tracking-wide text-[var(--muted,#78716c)]"
          >
            {group.label}
          </div>
          {group.controls.map((control) => renderControl(control))}
        </div>
      ))}
    </>
  );
}

/**
 * 视口容量探针：一条 `inlineSize: SELECTION_TOOLBAR_VIEWPORT_MAX` 的隐形线，
 * useSelectionToolbarMeasure 量它得到「100dvw − 2rem」的像素值。
 */
export function SelectionToolbarViewportProbe({
  probeRef,
}: {
  probeRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={probeRef}
      aria-hidden="true"
      inert
      data-selection-toolbar-viewport-capacity
      className="pointer-events-none invisible fixed left-0 top-0 h-px"
      style={{ contain: "strict", inlineSize: SELECTION_TOOLBAR_VIEWPORT_MAX }}
    />
  );
}
