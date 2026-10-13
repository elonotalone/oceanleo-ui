"use client";

import { useState, type ReactElement, type ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { BAY_FORM_LABEL_CLASS, BAY_FORM_SECTION_TITLE_CLASS } from "./form-ui";

export type BayRevealItem = {
  id: string;
  label: string;
  done: boolean;
  summary?: string;
  optional?: boolean;
  /** 保留给调用方；字段现在一律常开，随时可改。 */
  alwaysOpen?: boolean;
  children: ReactNode;
};

export type BayRevealGroup = {
  id: string;
  label?: string;
  items: BayRevealItem[];
  extra?: ReactNode;
  highlight?: boolean;
  missing?: string[];
  done?: boolean;
  /** 这一组进页时收着，点标题才展开。缺项高亮时强制打开。 */
  collapsedByDefault?: boolean;
  /** 收着时标题下一行的提示；不传就不画第二行。 */
  collapsedSummary?: string;
};

/**
 * 填写页的一组字段：标签在上，控件一直开着，没有「填写 / 修改」。
 * 间距三档（见 form-ui.ts）：标签到控件 mt-2，项与项 gap-6，组与组 space-y-12。项之间不画线。
 */
export function BayRevealForm(props: {
  items?: BayRevealItem[];
  groups?: BayRevealGroup[];
  onGroupNode?: (id: string, node: HTMLElement | null) => void;
}): ReactElement {
  const tt = useUI();
  const grouped = Boolean(props.groups?.length);
  const groups: BayRevealGroup[] = grouped ? props.groups! : [{ id: "", items: props.items ?? [] }];
  const [opened, setOpened] = useState<Record<string, boolean>>({});

  function groupOpen(group: BayRevealGroup): boolean {
    if (!group.collapsedByDefault) return true;
    if (group.highlight) return true;
    return opened[group.id] === true;
  }

  function renderRow(item: BayRevealItem): ReactElement {
    return (
      <div key={item.id} data-bay-reveal-item={item.id} data-bay-reveal-open="" data-bay-reveal-pinned={item.alwaysOpen ? "" : undefined}>
        {item.label ? (
          <p data-bay-reveal-label="" className={BAY_FORM_LABEL_CLASS}>
            {item.label}
          </p>
        ) : null}
        <div className={item.label ? "mt-2" : undefined}>{item.children}</div>
      </div>
    );
  }

  if (!grouped) {
    return (
      <div data-bay-reveal-form="" className="flex flex-col gap-6">
        {groups[0]?.items.map(renderRow)}
      </div>
    );
  }

  return (
    <div data-bay-reveal-form="" className="space-y-12">
      {groups.map((group) => {
        const sectionDone = group.done ?? (group.items.length > 0 && group.items.every((item) => item.done || item.optional));
        const open = groupOpen(group);
        const collapsible = Boolean(group.collapsedByDefault && group.label);
        const titleBar = group.label ? (
          collapsible ? (
            <button
              type="button"
              data-bay-section-title=""
              data-bay-section-toggle=""
              aria-expanded={open}
              className={
                open
                  ? "mb-4 flex w-full items-center justify-between text-left focus-visible:ring-2 focus-visible:ring-neutral-300"
                  : "mb-4 flex w-full items-center justify-between rounded-3xl bg-neutral-200/80 px-4 py-3 text-left focus-visible:ring-2 focus-visible:ring-neutral-300"
              }
              onClick={() => setOpened((current) => ({ ...current, [group.id]: !open }))}
            >
              <span className="min-w-0 text-left">
                <span className={`block ${BAY_FORM_SECTION_TITLE_CLASS}`}>{group.label}</span>
                {!open && group.collapsedSummary ? (
                  <span className="block text-[13px] text-neutral-600">{group.collapsedSummary}</span>
                ) : null}
              </span>
              <span
                className={
                  open
                    ? "inline-flex shrink-0 items-center rounded-full border border-neutral-900 bg-white px-4 py-2 text-[13px] font-medium text-neutral-900"
                    : "inline-flex h-10 shrink-0 items-center rounded-full bg-neutral-900 px-4 text-[13px] font-medium text-white"
                }
              >
                {open ? tt("收起") : tt("展开")}
              </span>
            </button>
          ) : (
            <h3 data-bay-section-title="" className={`mb-4 ${BAY_FORM_SECTION_TITLE_CLASS}`}>
              {group.label}
            </h3>
          )
        ) : null;
        const missing =
          group.highlight && group.missing?.length ? (
            <p className="-mt-2 mb-4 text-[13px] text-rose-600">{group.missing.join("、")}</p>
          ) : null;
        const fields = group.items.length ? (
          <div hidden={!open} className="flex flex-col gap-6">
            {group.items.map(renderRow)}
          </div>
        ) : null;
        const extra = group.extra ? (
          <div
            hidden={!open}
            data-bay-section-extra=""
            className={group.items.length ? "mt-6" : undefined}
          >
            {group.extra}
          </div>
        ) : null;
        const body = (
          <>
            {titleBar}
            {missing}
            {fields}
            {extra}
          </>
        );
        return (
          <div
            key={group.id}
            ref={(node) => props.onGroupNode?.(group.id, node)}
            data-bay-section={group.id}
            data-bay-reveal=""
            data-bay-section-done={sectionDone ? "true" : "false"}
            data-bay-section-collapsed={open ? undefined : ""}
            className={`scroll-mt-4 ${group.highlight ? "rounded-xl border border-rose-300 p-3" : ""}`}
          >
            {body}
          </div>
        );
      })}
    </div>
  );
}
