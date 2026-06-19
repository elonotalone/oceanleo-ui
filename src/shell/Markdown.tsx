"use client";

// ============================================================================
// @oceanleo/ui — 极简 Markdown 渲染（零依赖，单一事实源）
// ----------------------------------------------------------------------------
// agent 推导流 + 右栏 doc/markdown 结果都用它渲染。刻意零依赖（不引 react-markdown
// / marked），避免给 25 个站的 Vercel 构建增加体积与版本风险。支持常见子集：
// 标题 / 粗斜体 / 行内代码 / 代码块 / 列表 / 引用 / 链接 / 图片 / 分隔线 / 段落。
// 需要更强的可编辑富文本时，右栏可由各站替换为专用编辑器（map/canvas/ppt…）。
// ============================================================================

import { type ReactNode } from "react";

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // tokenises: image, link, bold, italic, inline-code
  const re =
    /(!\[[^\]]*\]\([^)]+\))|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(`[^`]+`)|(\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith("![")) {
      const mm = /!\[([^\]]*)\]\(([^)]+)\)/.exec(tok);
      if (mm)
        out.push(
          // eslint-disable-next-line @next/next/no-img-element
          <img key={k} src={mm[2]} alt={mm[1]} className="my-2 max-h-[420px] max-w-full rounded-lg" />,
        );
    } else if (tok.startsWith("[")) {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok);
      if (mm)
        out.push(
          <a key={k} href={mm[2]} target="_blank" rel="noreferrer" className="text-indigo-600 underline">
            {mm[1]}
          </a>,
        );
    } else if (tok.startsWith("**")) {
      out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("`")) {
      out.push(
        <code key={k} className="rounded bg-stone-100 px-1 py-0.5 text-[0.85em] text-stone-800">
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith("*")) {
      out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ children, className = "" }: { children: string; className?: string }) {
  const src = children || "";
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // code fence
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; // skip closing fence
      blocks.push(
        <pre
          key={key++}
          className="my-2 overflow-x-auto rounded-lg bg-stone-900 px-3 py-2.5 text-[12px] leading-relaxed text-stone-100"
        >
          <code>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const lvl = h[1].length;
      const cls =
        lvl === 1
          ? "mt-3 mb-1.5 text-[18px] font-semibold"
          : lvl === 2
            ? "mt-3 mb-1.5 text-[16px] font-semibold"
            : "mt-2 mb-1 text-[14px] font-semibold";
      blocks.push(
        <div key={key++} className={`${cls} text-stone-900`}>
          {inline(h[2], `h${key}`)}
        </div>,
      );
      i++;
      continue;
    }

    // hr
    if (/^(\*\*\*|---|___)\s*$/.test(line)) {
      blocks.push(<hr key={key++} className="my-3 border-stone-200" />);
      i++;
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(
        <blockquote key={key++} className="my-2 border-l-2 border-stone-300 pl-3 text-stone-600">
          {inline(buf.join(" "), `bq${key}`)}
        </blockquote>,
      );
      continue;
    }

    // list (ordered / unordered)
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items: ReactNode[] = [];
      const ordered = /^\s*\d+\.\s+/.test(line);
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const content = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "");
        items.push(<li key={items.length}>{inline(content, `li${key}-${items.length}`)}</li>);
        i++;
      }
      blocks.push(
        ordered ? (
          <ol key={key++} className="my-2 list-decimal space-y-0.5 pl-5 text-stone-700">
            {items}
          </ol>
        ) : (
          <ul key={key++} className="my-2 list-disc space-y-0.5 pl-5 text-stone-700">
            {items}
          </ul>
        ),
      );
      continue;
    }

    // blank
    if (line.trim() === "") {
      i++;
      continue;
    }

    // paragraph (gather consecutive non-empty, non-special lines)
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6}\s|```|>\s?|\s*([-*]|\d+\.)\s+|(\*\*\*|---|___)\s*$)/.test(lines[i])
    ) {
      buf.push(lines[i++]);
    }
    blocks.push(
      <p key={key++} className="my-1.5 leading-relaxed text-stone-700">
        {inline(buf.join(" "), `p${key}`)}
      </p>,
    );
  }

  return <div className={`text-[13px] ${className}`}>{blocks}</div>;
}
