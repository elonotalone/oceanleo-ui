"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type ReactElement, type TextareaHTMLAttributes } from "react";

/** 灰槽多行输入：默认一行高，输入内容后卡片随内容变高；不出滚动条，也不能手动拖拽。 */
const AUTO_TEXTAREA_CLASS =
  "block w-full resize-none overflow-hidden rounded-3xl border-0 bg-neutral-200/80 px-4 py-3 text-[13px] leading-6 text-neutral-900 outline-none placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-neutral-300 disabled:opacity-50";

export function BayAutoTextarea(props: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows">): ReactElement {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const { className, value, ...rest } = props;

  // 框藏在收起的组里（display:none）时 scrollHeight 是 0：不能把高度写成 0，
  // 得等它真正显示出来、宽度确定后再量。
  const fit = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    const next = node.scrollHeight;
    if (next > 0) node.style.height = `${next}px`;
    else node.style.removeProperty("height");
  }, []);

  useLayoutEffect(() => {
    fit();
  }, [value, fit]);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    let width = node.clientWidth;
    const observer = new ResizeObserver(() => {
      if (node.clientWidth === width) return;
      width = node.clientWidth;
      fit();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [fit]);

  return <textarea ref={ref} rows={1} value={value} className={className ? `${AUTO_TEXTAREA_CLASS} ${className}` : AUTO_TEXTAREA_CLASS} {...rest} />;
}
