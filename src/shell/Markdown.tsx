"use client";

import { type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  const hasSize = /(?:^|\s)text-(\[|xs|sm|base|lg|xl)/.test(className);
  return (
    <div
      className={`${hasSize ? "" : "text-[13px]"} min-w-0 break-words ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          h1: ({ children: value }) => (
            <h1 className="mb-2 mt-4 text-[18px] font-semibold text-stone-900">
              {value}
            </h1>
          ),
          h2: ({ children: value }) => (
            <h2 className="mb-1.5 mt-4 text-[16px] font-semibold text-stone-900">
              {value}
            </h2>
          ),
          h3: ({ children: value }) => (
            <h3 className="mb-1 mt-3 text-[14px] font-semibold text-stone-900">
              {value}
            </h3>
          ),
          h4: ({ children: value }) => (
            <h4 className="mb-1 mt-3 font-semibold text-stone-900">{value}</h4>
          ),
          p: ({ children: value }) => (
            <p className="my-1.5 whitespace-pre-wrap leading-relaxed text-stone-700">
              {value}
            </p>
          ),
          ul: ({ children: value }) => (
            <ul className="my-2 list-disc space-y-1 pl-5 text-stone-700">
              {value}
            </ul>
          ),
          ol: ({ children: value }) => (
            <ol className="my-2 list-decimal space-y-1 pl-5 text-stone-700">
              {value}
            </ol>
          ),
          li: ({ children: value }) => (
            <li className="leading-relaxed">{value}</li>
          ),
          blockquote: ({ children: value }) => (
            <blockquote className="my-2 border-l-2 border-stone-300 pl-3 text-stone-600">
              {value}
            </blockquote>
          ),
          a: ({ href, children: value }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="break-all text-indigo-600 underline decoration-indigo-300 underline-offset-2"
            >
              {value}
            </a>
          ),
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={typeof src === "string" ? src : ""}
              alt={alt || ""}
              className="my-2 max-h-[420px] max-w-full rounded-xl border border-stone-200 object-contain"
            />
          ),
          hr: () => <hr className="my-4 border-stone-200" />,
          pre: ({ children: value }) => (
            <pre className="my-2 overflow-x-auto rounded-xl bg-stone-950 px-3.5 py-3 text-[12px] leading-relaxed text-stone-100">
              {value}
            </pre>
          ),
          code: ({ className: codeClass, children: value }) =>
            codeClass ? (
              <code className={codeClass}>{value}</code>
            ) : (
              <code className="rounded bg-stone-100 px-1 py-0.5 text-[0.86em] text-stone-800">
                {value}
              </code>
            ),
          table: ({ children: value }) => (
            <div className="my-3 max-w-full overflow-x-auto rounded-xl border border-stone-200">
              <table className="w-full min-w-[520px] border-collapse text-left text-[12px]">
                {value}
              </table>
            </div>
          ),
          thead: ({ children: value }) => (
            <thead className="bg-stone-50 text-stone-700">{value}</thead>
          ),
          th: ({ children: value }) => (
            <th className="border-b border-r border-stone-200 px-3 py-2 font-semibold last:border-r-0">
              {value}
            </th>
          ),
          td: ({ children: value }) => (
            <td className="border-b border-r border-stone-100 px-3 py-2 align-top text-stone-600 last:border-r-0">
              {value}
            </td>
          ),
          del: ({ children: value }) => (
            <del className="text-stone-400">{value}</del>
          ),
          input: (props) => (
            <input
              {...props}
              disabled
              className="mr-1.5 align-middle accent-indigo-600"
            />
          ),
        }}
      >
        {children || ""}
      </ReactMarkdown>
    </div>
  );
}

export function TypewriterMarkdown({
  content,
  active,
  className = "text-[15px] leading-relaxed",
}: {
  content: string;
  active: boolean;
  className?: string;
}) {
  void active;
  // Messages arrive as persisted, complete events rather than real token
  // deltas. Re-slicing and reparsing Markdown every animation frame caused
  // headings, tables and code blocks to repeatedly reflow and visibly flicker.
  return <Markdown className={className}>{content}</Markdown>;
}

export type MarkdownContent = ReactNode;
