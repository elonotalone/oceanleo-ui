"use client";

// 主页上的一段文字：平时是普通文字；编辑主页时原地变成同样字号的输入框（点文字直接改）。
// 不用 contentEditable、不碰 innerHTML：内容始终是纯文本。

import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface EditableTextProps {
  value: string;
  editing: boolean;
  onChange?: (value: string) => void;
  /** 排版类名（字号、字重、行高）：显示态与编辑态用同一份，所以切换时文字不跳。 */
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
  maxLength?: number;
  /** 允许换行（正文）；标题类的不允许，回车被吞掉。 */
  multiline?: boolean;
  /** 显示态用哪个标签。 */
  as?: "h1" | "h2" | "h3" | "p" | "span" | "div";
  label: string;
}

const EDIT_CLASS =
  "block w-full resize-none overflow-hidden rounded-lg border border-dashed border-transparent bg-transparent p-0 outline-none transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-current focus:border-current focus-visible:ring-2 focus-visible:ring-neutral-300";

export function EditableText({
  value,
  editing,
  onChange,
  className = "",
  style,
  placeholder,
  maxLength,
  multiline = false,
  as = "p",
  label,
}: EditableTextProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // 输入框跟着内容长高：标题换行、正文加长都不出滚动条。
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || !editing) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, editing]);

  if (!editing) {
    if (!value) return null;
    const Tag = as;
    return (
      <Tag className={`${multiline ? "whitespace-pre-wrap" : ""} break-words ${className}`} style={style}>
        {value}
      </Tag>
    );
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      aria-label={label}
      placeholder={placeholder ?? label}
      maxLength={maxLength}
      data-bay-page-editable
      onChange={(event) => onChange?.(multiline ? event.target.value : event.target.value.replace(/\n/g, " "))}
      onKeyDown={(event) => {
        if (!multiline && event.key === "Enter") event.preventDefault();
      }}
      className={`${EDIT_CLASS} ${className}`}
      style={{ fontFamily: "inherit", textAlign: "inherit", ...style }}
    />
  );
}
