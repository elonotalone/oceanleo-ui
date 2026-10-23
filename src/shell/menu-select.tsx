"use client";

// 表单里的下拉（项目页待办编辑、自动化频率、邀请权限等）：一整条选择条，点开是白底圆角清单。
// 2026-10-23 leobay-projects 波：父 agent 先放这个占位实现，定下 props；W01 换成正式实现，不改 props。
import type { ReactElement, ReactNode } from "react";

export interface MenuSelectOption {
  value: string;
  /** 已经过 tt() 的显示文字。 */
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface MenuSelectProps {
  value: string;
  options: readonly MenuSelectOption[];
  onChange: (value: string) => void;
  /** 读屏名字（字段名，已 tt()）。 */
  ariaLabel: string;
  /** 值不在选项里时显示。 */
  placeholder?: string;
  disabled?: boolean;
  /** 写到 data-menu-select，测试用。 */
  name?: string;
  className?: string;
  size?: "md" | "sm";
}

export function MenuSelect(props: MenuSelectProps): ReactElement {
  return (
    <select
      aria-label={props.ariaLabel}
      data-menu-select={props.name}
      value={props.value}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.target.value)}
      className={props.className}
    >
      {props.placeholder && !props.options.some((option) => option.value === props.value) ? (
        <option value={props.value}>{props.placeholder}</option>
      ) : null}
      {props.options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
