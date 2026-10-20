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
  /** 必填：标签后面画一个红色「*」。 */
  required?: boolean;
  /** 提交时发现这一项没填：标签变红。 */
  invalid?: boolean;
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

function takeCover(groups: BayRevealGroup[]): { cover: BayRevealItem | null; groups: BayRevealGroup[] } {
  let cover: BayRevealItem | null = null;
  const next = groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.id === "cover" && !cover) {
        cover = item;
        return false;
      }
      return true;
    }),
  }));
  return { cover, groups: next };
}

/**
 * 填写页的一组字段：标签在上，控件一直开着，没有「填写 / 修改」。
 * 间距三档（见 form-ui.ts）：标签到控件 mt-2，项与项 gap-6，组与组 space-y-12。项之间不画线。
 * `layout="listing"`：Etsy 商品页——左边大图+缩略图轨，右边一列字段；打开的下拉盖住下面的输入。
 */
export function BayRevealForm(props: {
  items?: BayRevealItem[];
  groups?: BayRevealGroup[];
  layout?: "stack" | "listing";
  /** listing 时放在右栏最上（卖/买、分类），和大图顶对齐。 */
  lead?: ReactNode;
  onGroupNode?: (id: string, node: HTMLElement | null) => void;
}): ReactElement {
  const tt = useUI();
  const grouped = Boolean(props.groups?.length);
  const source: BayRevealGroup[] = grouped ? props.groups! : [{ id: "", items: props.items ?? [] }];
  const listing = props.layout === "listing";
  const split = listing ? takeCover(source) : { cover: null, groups: source };
  const groups = split.groups;
  const [opened, setOpened] = useState<Record<string, boolean>>({});

  function groupOpen(group: BayRevealGroup): boolean {
    if (!group.collapsedByDefault) return true;
    if (group.highlight) return true;
    return opened[group.id] === true;
  }

  function renderRow(item: BayRevealItem, hideLabel = false): ReactElement {
    const showLabel = Boolean(item.label) && !hideLabel;
    return (
      <div
        key={item.id}
        data-bay-reveal-item={item.id}
        data-bay-reveal-open=""
        data-bay-reveal-pinned={item.alwaysOpen ? "" : undefined}
        data-bay-reveal-invalid={item.invalid ? "" : undefined}
        className="scroll-mt-4"
      >
        {showLabel ? (
          <p data-bay-reveal-label="" className={item.invalid ? "text-[13px] font-medium text-rose-600" : BAY_FORM_LABEL_CLASS}>
            {item.label}
            {item.required ? (
              <span data-bay-required="" role="img" aria-label={tt("必填")} className="ml-0.5 text-rose-600">
                *
              </span>
            ) : null}
          </p>
        ) : item.required ? (
          <span data-bay-required="" role="img" aria-label={tt("必填")} hidden>
            *
          </span>
        ) : null}
        <div className={showLabel ? "mt-2" : undefined}>{item.children}</div>
      </div>
    );
  }

  function renderGroups(list: BayRevealGroup[]): ReactElement {
    return (
      <>
        {list.map((group) => {
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
                className="mb-4 flex w-full items-center justify-between text-left focus-visible:ring-2 focus-visible:ring-neutral-300"
                onClick={() => setOpened((current) => ({ ...current, [group.id]: !open }))}
              >
                <span className="min-w-0 text-left">
                  <span className={`block ${BAY_FORM_SECTION_TITLE_CLASS}`}>{group.label}</span>
                  {!open && group.collapsedSummary ? (
                    <span className="block text-[13px] text-neutral-600">{group.collapsedSummary}</span>
                  ) : null}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-neutral-700">
                  {open ? tt("收起") : tt("展开")}
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`h-4 w-4 ${open ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  >
                    <path d="m4 6 4 4 4-4" />
                  </svg>
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
              {group.items.map((item) => renderRow(item))}
            </div>
          ) : null;
          const extra = group.extra ? (
            <div hidden={!open} data-bay-section-extra="" className={group.items.length ? "mt-6" : undefined}>
              {group.extra}
            </div>
          ) : null;
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
              {titleBar}
              {missing}
              {fields}
              {extra}
            </div>
          );
        })}
      </>
    );
  }

  if (listing && split.cover) {
    return (
      <div data-bay-reveal-form="" data-bay-listing-layout="split">
        <style data-bay-listing-split-css="">{`[data-bay-listing-layout="split"]{display:grid;grid-template-columns:minmax(0,1fr);gap:2rem;align-items:start}@media (min-width:768px){[data-bay-listing-layout="split"]{grid-template-columns:minmax(0,1.55fr) minmax(20rem,0.9fr);gap:2.5rem}}`}</style>
        <aside data-bay-listing-stage="" className="sticky top-4 min-w-0 self-start">
          {renderRow(split.cover, true)}
        </aside>
        <div data-bay-listing-fields="" className="relative min-w-0 space-y-12">
          {props.lead ? <div data-bay-listing-lead="">{props.lead}</div> : null}
          {renderGroups(groups)}
        </div>
      </div>
    );
  }

  if (!grouped) {
    return (
      <div data-bay-reveal-form="" className="flex flex-col gap-6">
        {groups[0]?.items.map((item) => renderRow(item))}
      </div>
    );
  }

  return (
    <div data-bay-reveal-form="" className="space-y-12">
      {renderGroups(groups)}
    </div>
  );
}
