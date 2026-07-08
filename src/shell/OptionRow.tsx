"use client";

// ============================================================================
// @oceanleo/ui — 操作台「选项按键组」OptionRow（单一事实源，宗旨 v18，2026-07-07）
// ----------------------------------------------------------------------------
// 操作员 2026-07-07：操作台里的选项按键（比例 / 画质 / 风格 / 数量档 …）**必须支持
// 「再点一次取消选择」**（截图 904e3cf8）。此前各站的选项按钮是「点了就选中、再点无
// 反应」，无法回到未选态。本组件把这一交互收成单一事实源：
//   - 单选（默认）：点未选项 → 选中；**点已选项 → 取消**（onChange(null)）。
//   - 多选（multiple）：点一项 → 加入/移出选中集合（onChange(next[])）。
//
// 样式与全家桶现有选项按钮一致（选中 = accent 实心白字；未选 = 描边灰字）。各站把
// 「一排 <button> 手写选中态」换成 <OptionRow>，即自动获得「可取消」+ 统一外观。
//
// 用法（单选，可取消）：
//   <OptionRow
//     options={[{value:"16:9",label:"16:9"},{value:"9:16",label:"9:16"}]}
//     value={ratio}
//     onChange={(v) => setRatio(v ?? DEFAULT_RATIO)}  // v=null 表示被取消
//     accent={ACCENT}
//   />
// 若该参数「必须有值」（如视频比例），在 onChange 里把 null 落回默认档即可；若「可无」
// （如风格），把 null 落成空串/未选。
// ============================================================================

import { type ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";

export interface OptionItem {
  /** 选项值（受控 value 比对用）。 */
  value: string;
  /** 按钮文字（会走 i18n tt）。 */
  label: string;
  /** 可选：按钮左侧小图标 / emoji。 */
  icon?: ReactNode;
  /** 可选：按钮下方一行小字说明（如画质档「速度快，日常首选」）。 */
  hint?: string;
  /** 可选：右上角小角标（如「热」「新」）。注意：前端严禁展示「VIP」字样。 */
  badge?: string;
  /** 禁用该项。 */
  disabled?: boolean;
}

interface OptionRowBaseProps {
  options: OptionItem[];
  accent?: string;
  /** 每个按钮的尺寸档：sm（默认，chip）/ md（大格，带 hint）。 */
  size?: "sm" | "md";
  className?: string;
}

export interface OptionRowSingleProps extends OptionRowBaseProps {
  multiple?: false;
  /** 当前选中值（null/"" = 未选）。 */
  value: string | null;
  /** 点未选项 → 传该值；点已选项 → 传 null（取消）。 */
  onChange: (value: string | null) => void;
}

export interface OptionRowMultiProps extends OptionRowBaseProps {
  multiple: true;
  /** 当前选中集合。 */
  value: string[];
  /** 点某项 → 传切换后的完整集合。 */
  onChange: (value: string[]) => void;
}

export type OptionRowProps = OptionRowSingleProps | OptionRowMultiProps;

/**
 * 一排可取消的选项按键（单选点已选=取消；多选点已选=移出）。全家桶操作台选项统一用它。
 */
export function OptionRow(props: OptionRowProps) {
  const tt = useUI();
  const { options, accent = "#4f46e5", size = "sm", className = "" } = props;

  const isOn = (v: string): boolean =>
    props.multiple ? props.value.includes(v) : props.value === v;

  const handle = (v: string) => {
    if (props.multiple) {
      const set = new Set(props.value);
      if (set.has(v)) set.delete(v);
      else set.add(v);
      props.onChange([...set]);
    } else {
      // 单选：点已选 → 取消（null）；点未选 → 选中。
      props.onChange(props.value === v ? null : v);
    }
  };

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {options.map((o) => {
        const on = isOn(o.value);
        return (
          <button
            key={o.value}
            type="button"
            disabled={o.disabled}
            onClick={() => handle(o.value)}
            aria-pressed={on}
            title={on ? tt("已选中，点一下取消") : undefined}
            className={
              size === "md"
                ? `relative flex min-w-[64px] flex-col items-center gap-0.5 rounded-xl border px-3 py-2 text-[13px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    on
                      ? "border-transparent text-white shadow-sm"
                      : "border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50"
                  }`
                : `relative inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    on
                      ? "border-transparent text-white shadow-sm"
                      : "border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50"
                  }`
            }
            style={on ? { background: accent } : undefined}
          >
            <span className="inline-flex items-center gap-1.5">
              {o.icon}
              <span>{tt(o.label)}</span>
            </span>
            {size === "md" && o.hint && (
              <span className={`text-[11px] ${on ? "text-white/80" : "text-stone-400"}`}>
                {tt(o.hint)}
              </span>
            )}
            {o.badge && (
              <span className="absolute -top-2 right-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-700">
                {tt(o.badge)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
