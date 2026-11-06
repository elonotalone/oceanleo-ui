"use client";

// 正文只走文本节点。行内代码用 <code> 包文本，不解析 HTML。

import { tone } from "../server-page/tone";

export function AgentText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const parts = text.split(/(`[^`\n]+`)/g);
  return (
    <p className={className ?? "whitespace-pre-wrap text-[13px]"}>
      {parts.map((part, index) =>
        part.startsWith("`") && part.endsWith("`") && part.length >= 2 ? (
          <code
            key={index}
            className={`rounded px-1 font-mono text-[12px] ${tone.chip}`}
          >
            {part.slice(1, -1)}
          </code>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </p>
  );
}
