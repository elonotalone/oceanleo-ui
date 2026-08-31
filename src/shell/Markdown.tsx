"use client";

import {
  Fragment,
  memo,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { KATEX_OPTIONS, hasMathDelimiters } from "./share/katex-runtime";

type Plugins = NonNullable<ComponentProps<typeof ReactMarkdown>["remarkPlugins"]>;

type MathPlugins = { remark: Plugins; rehype: Plugins };

// ---------------------------------------------------------------------------
// 流式 Markdown 的块级边界
// ---------------------------------------------------------------------------
// 一段回答是逐 token 长出来的。把整段每次都重新解析一遍，代价不只是 CPU：
// 同一段文字在到齐之前会被解析成**不同的东西**（`| a | b |` 先是段落、补上分隔行
// 才是表格；未闭合的 ``` 在 CommonMark 里会把后文一路吞进代码块），于是标题、
// 表格、代码块反复重排、肉眼可见地闪。
//
// 所以这里先把输入切成「已闭合前缀」与「未闭合尾巴」两段：
//   - 已闭合前缀 —— 再来多少 token 都不会改变它的解析结果，可以缓存复用；
//   - 未闭合尾巴 —— 还会变，按纯文本渲染，等它闭合了再并进前缀。
// 判「闭合」一律**保守**：拿不准就算没闭合。多留在尾巴里只是少一点增量收益，
// 判错才会把已经画好的东西推倒重来。

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const LIST_RE = /^ {0,3}(?:[-*+][ \t]|\d{1,9}[.)][ \t])/;
const INDENTED_RE = /^(?: {4}|\t)/;
const REF_DEFINITION_RE = /^ {0,3}\[[^\]]+\]:/;

/**
 * 块的结束行（不含）。返回 `-1` 表示这个块还可能继续长，属于尾巴。
 *
 * `frontier` = 最后一行的下标，也就是「还在被敲出来的那一行」：
 * 没有结尾换行时它是半截的一行，有结尾换行时它是空串、下一行是什么还不知道。
 * 因此**只有下标严格小于 `frontier` 的行才算已知**，终结符必须落在这个范围里。
 * 少了这一条，`"段落\n"` 会被当成已闭合，而下一个 token 可能是 `"==="`——
 * 那会把整段追认成 setext 标题，已经画好的 <p> 当场作废。
 */
function blockEnd(lines: string[], start: number, frontier: number): number {
  const fence = lines[start].match(FENCE_RE);
  if (fence) {
    const marker = fence[1];
    for (let j = start + 1; j < frontier; j += 1) {
      const close = lines[j].match(FENCE_RE);
      if (
        close &&
        close[1][0] === marker[0] &&
        close[1].length >= marker.length &&
        !close[2].trim()
      ) {
        return j + 1;
      }
    }
    return -1;
  }
  if (INDENTED_RE.test(lines[start])) {
    // 缩进代码块把中间的空行也算自己的，只有顶格的非空行才终结它。
    let last = start;
    let j = start;
    while (j < frontier) {
      const line = lines[j];
      if (line.trim() === "") {
        j += 1;
        continue;
      }
      if (!INDENTED_RE.test(line)) break;
      last = j;
      j += 1;
    }
    return j >= frontier ? -1 : last + 1;
  }
  if (LIST_RE.test(lines[start])) {
    // 空行不足以终结列表：后面再来一个列表项，整张列表会从 tight 变 loose，
    // 每个 <li> 都要多包一层 <p>——那正是「已经画好的东西被推倒重来」。
    // 因此列表要等到「空行 + 顶格的非列表行」才算闭合。
    let last = start;
    let j = start;
    let blank = false;
    while (j < frontier) {
      const line = lines[j];
      if (line.trim() === "") {
        blank = true;
        j += 1;
        continue;
      }
      if (blank && !LIST_RE.test(line) && !/^\s/.test(line)) break;
      last = j;
      blank = false;
      j += 1;
    }
    return j >= frontier ? -1 : last + 1;
  }
  // 段落、标题、表格、引用、分隔线：空行即止。表格因此在收齐（出现空行）之前
  // 一直待在尾巴里按纯文本渲染，不会先长出一张列数会跳变的 <table>。
  let last = start;
  let j = start;
  while (j < frontier && lines[j].trim() !== "") {
    last = j;
    j += 1;
  }
  return j >= frontier ? -1 : last + 1;
}

export interface StreamingMarkdown {
  /**
   * 已闭合的块，按出现顺序。`key` 是块序号——块一旦闭合就不再改动、也不会重排，
   * 所以序号是稳定 key，React 凭它认出「这块我已经画过了」。
   */
  blocks: { key: string; source: string }[];
  /** 已闭合部分的原文（= 各块拼回来的那一段）。 */
  closed: string;
  /** 尾部未闭合的部分。 */
  open: string;
}

/**
 * 把流式到达的 Markdown 切成「已闭合的若干块」+「未闭合的尾巴」。
 *
 * `complete` = 流已经收完，不会再有 token 了。此时没有「还在敲的那一行」，
 * 全部内容都进 `blocks`、`open` 必为空——终态与流式态因此是**同一棵组件树**，
 * 收流的那一下不会把用户正在读的东西整个重建一遍。
 *
 * 三条不变量，测试逐条锁着：
 *   - `blocks.map(b => b.source).join("") + open === source`（逐字，不丢不改）；
 *   - 尾巴继续增长期间，已闭合的块**逐字不变**，只会在末尾追加新块；
 *   - `complete` 时各块分别解析的结果与整段一次性解析**逐字相同**。
 * 前两条是缓存能命中的前提，第三条是分块的正确性前提。
 */
export function splitStreamingMarkdown(
  source: string,
  complete = false,
): StreamingMarkdown {
  if (!source) return { blocks: [], closed: "", open: "" };
  const lines = source.split("\n");
  const offsets: number[] = [];
  let cursor = 0;
  for (const line of lines) {
    offsets.push(cursor);
    cursor += line.length + 1;
  }
  const offsetAt = (line: number) =>
    line >= lines.length ? source.length : offsets[line];

  // 链接引用定义 `[x]: url`（脚注定义 `[^1]:` 同理）是唯一一类**跨块**构造：
  // 定义在这个块里，用它的 `[x]` 可能在另一个块里，甚至在它**前面**——CommonMark
  // 允许前向引用。分块解析看不见别的块，那个链接就会渲染成字面量，与一次性渲染分岔。
  // 所以碰到它就退让，两种退法都保持「已画好的不动」：
  //   - 流式期间把边界钉在定义那一行（前面的块照常缓存，后面不再增长，不塌不闪）；
  //   - 收流时整段当作一个块，与一次性渲染逐字同构。
  const refLine = lines.findIndex((line) => REF_DEFINITION_RE.test(line));
  if (complete && refLine >= 0) {
    return { blocks: [{ key: "0", source }], closed: source, open: "" };
  }

  const lastLine = lines.length - 1;
  const frontier = complete
    ? lines.length
    : refLine >= 0
      ? Math.min(refLine, lastLine)
      : lastLine;
  const cuts: number[] = [];
  let index = 0;
  let closedLine = 0;
  while (index < frontier) {
    if (lines[index].trim() === "") {
      index += 1;
      closedLine = index;
      continue;
    }
    const end = blockEnd(lines, index, frontier);
    if (end < 0) break;
    index = end;
    closedLine = end;
    // 块后面的空行归它自己，这样各块拼起来仍是原文。
    while (index < frontier && lines[index].trim() === "") {
      index += 1;
      closedLine = index;
    }
    cuts.push(offsetAt(closedLine));
  }

  const boundary = offsetAt(closedLine);
  // 只吃到空行、一个块都没闭合时，也要让各块拼回来等于 closed。
  if (boundary > 0 && cuts[cuts.length - 1] !== boundary) cuts.push(boundary);

  const blocks: { key: string; source: string }[] = [];
  let previous = 0;
  for (const cut of cuts) {
    blocks.push({ key: String(blocks.length), source: source.slice(previous, cut) });
    previous = cut;
  }
  // 收完流还剩一截，只可能是始终没闭合的东西（例如模型把 ``` 吐漏了）。
  // 它不会再变了，直接当最后一块，别留在尾巴里按纯文本显示。
  if (complete && boundary < source.length) {
    blocks.push({ key: String(blocks.length), source: source.slice(boundary) });
    return { blocks, closed: source, open: "" };
  }
  return {
    blocks,
    closed: source.slice(0, boundary),
    open: source.slice(boundary),
  };
}

/**
 * 合同 R6：长图与对话正文用**同一个**公式渲染器（KaTeX）。这里按需加载
 * remark-math / rehype-katex —— 不含公式的会话一个字节都不下载，30 多个站的
 * 首屏包因此不变。选项从 `share/katex-runtime` 取，两边逐字一致。
 */
let mathPlugins: Promise<{ remark: Plugins; rehype: Plugins } | null> | null =
  null;

function loadMathPlugins() {
  if (!mathPlugins) {
    mathPlugins = (async () => {
      try {
        const loaded = await Promise.all([
          import("remark-math"),
          import("rehype-katex"),
          import("./share/katex-styles"),
        ]);
        return {
          remark: [loaded[0].default] as Plugins,
          rehype: [[loaded[1].default, KATEX_OPTIONS]] as Plugins,
        };
      } catch {
        return null;
      }
    })();
  }
  return mathPlugins;
}

function useMathPlugins(source: string): MathPlugins | null {
  const needsMath = hasMathDelimiters(source);
  const [math, setMath] = useState<MathPlugins | null>(null);
  useEffect(() => {
    if (!needsMath || math) return;
    let alive = true;
    void loadMathPlugins().then((loaded) => {
      if (alive && loaded) setMath(loaded);
    });
    return () => {
      alive = false;
    };
  }, [needsMath, math]);
  return math;
}

function markdownWrapperClass(className: string) {
  const hasSize = /(?:^|\s)text-(\[|xs|sm|base|lg|xl)/.test(className);
  return `${hasSize ? "" : "text-[13px]"} min-w-0 break-words ${className}`;
}

/**
 * 只有正文，没有外层包装。抽出来是为了让「一次性渲染」与「流式渲染」共用
 * **同一份** components 配置——两条路径若各写一份，迟早会长歪。
 */
function MarkdownBody({
  source,
  math,
}: {
  source: string;
  math: MathPlugins | null;
}) {
  return (
    <>
      <ReactMarkdown
        remarkPlugins={math ? [remarkGfm, ...math.remark] : [remarkGfm]}
        rehypePlugins={math ? math.rehype : undefined}
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
        {source || ""}
      </ReactMarkdown>
    </>
  );
}

/**
 * 已闭合块的缓存，本份活的支点。
 *
 * `react-markdown` **每次渲染都重建整棵 DOM**，哪怕喂进去的字符串一模一样
 * （实测：同一段源码连渲两次，`h1` 已经不是同一个节点了）。今天的对话流每 450ms
 * 轮询一次、每次整段重渲，于是每 450ms 把已经读了一半的回答连根拔一遍——
 * 用户划的选区、展开的细节、滚动锚点全在这一下里丢掉。
 *
 * 所以缓存不能只做「少解析一次」，必须让 React **根本不进这棵子树**：
 * 块序号当 key，`source` 逐字不变时 `memo` 直接短路，那块 DOM 原地不动。
 */
const StableMarkdownBody = memo(MarkdownBody);

export function Markdown({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  const math = useMathPlugins(children);
  return (
    <div className={markdownWrapperClass(className)}>
      <MarkdownBody source={children} math={math} />
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
  const math = useMathPlugins(content);
  // 当初 `void active;` 关掉打字机是对的：那时的做法是逐帧把**整段**重切片重解析，
  // 一段文字在到齐之前会被解析成不同的东西，标题/表格/代码块于是反复重排、肉眼可见地闪。
  //
  // 现在能开，是因为重解析的范围变了：`splitStreamingMarkdown` 把输入切成
  // 一串**已闭合的块**加一截未闭合的尾巴。每块单独走 `StableMarkdownBody`，块的
  // `source` 逐字不变 → memo 短路 → React 根本不进那棵子树，已经画好的节点原地不动。
  // 只有那截很小的尾巴在重画，而且按纯文本画，不会先摆出一张列数会跳变的表、
  // 也不会让高亮器为每个字符重跑一遍。
  //
  // 关键是**必须按块喂**：把整个已闭合前缀当一个字符串喂给一个 `ReactMarkdown`
  // 是不够的——前缀每多闭合一块就变一次，memo 当场落空，react-markdown 会把整棵子树
  // 重建（实测：`h1` 的内容一字未改，节点也换了新的）。用户划的选区、滚动锚点
  // 就是在这一下里丢的。块级 key 才是让「没变的东西真的不动」的那一层。
  //
  // 收流时（`active === false`）走 `complete` 切分：内容全部进块、尾巴为空，
  // 组件树与流式态**同构**，所以最后一个 token 落地不会引发整段重建。
  const { blocks, open } = useMemo(
    () => splitStreamingMarkdown(content, !active),
    [active, content],
  );
  // 尾巴只是过渡态的显示，去掉首尾空行免得它顶出一行空白；
  // 纯函数那边的 `closed + open === source` 不受影响。
  const tail = open.replace(/^\n+/, "").replace(/\s+$/, "");
  return (
    <div className={markdownWrapperClass(className)}>
      {blocks.map((block, index) => (
        // 一次性解析时，react-markdown 会在相邻顶层块之间留一个 "\n" 文本节点。
        // 分块渲染时每块各自 trim 掉了，少的正是这些分隔符。补回来，终态才与
        // 一次性渲染**逐字**相同（块内部的分隔符由该块自己的解析器负责）。
        <Fragment key={block.key}>
          {index > 0 ? "\n" : null}
          <StableMarkdownBody source={block.source} math={math} />
        </Fragment>
      ))}
      {tail ? (
        <p className="my-1.5 whitespace-pre-wrap leading-relaxed text-stone-700">
          {tail}
        </p>
      ) : null}
    </div>
  );
}

export type MarkdownContent = ReactNode;
