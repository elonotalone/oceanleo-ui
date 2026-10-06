// richdoc 的回放画法（W12；work-chat 契约 §8.4，做法见 tasks/_EDITORS.md 第 8 条）。
// 只用 React 把快照画成只读段落：不执行任何用户 HTML/JS，不用 iframe，不用 dangerouslySetInnerHTML。
import type { CSSProperties, ReactNode } from "react";
import {
  describeRichDocChange,
  richDocChangedBlocks,
  richDocFromRevision,
  richDocFromY,
  richDocToArtifactJson,
  safeCollabColor,
  safeRichDocImageSrc,
  type RichDocNode,
  type RichDocSnapshot,
} from "../../../collab/adapters/richdoc";
import type { ReplayFrameProps, ReplayFrameRenderer } from "../frame-types";

const PAGE_WIDTH = 640;
const MAX_NODES = 4000;

function span(attrs: unknown, key: string): number | undefined {
  const value = (attrs as Record<string, unknown> | undefined)?.[key];
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value < 50
    ? value
    : undefined;
}

function renderText(node: RichDocNode, key: string): ReactNode {
  let out: ReactNode = node.text ?? "";
  const style: CSSProperties = {};
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold":
        out = <strong>{out}</strong>;
        break;
      case "italic":
        out = <em>{out}</em>;
        break;
      case "underline":
        out = <u>{out}</u>;
        break;
      case "strike":
        out = <s>{out}</s>;
        break;
      case "code":
        out = <code>{out}</code>;
        break;
      case "link":
        // 回放里的链接只画样式，不可点击、不跳转。
        out = <span style={{ textDecoration: "underline", color: "#2563eb" }}>{out}</span>;
        break;
      case "highlight":
        style.background = "#fef08a";
        break;
      case "textStyle": {
        const color = (mark.attrs as Record<string, unknown> | undefined)?.color;
        if (typeof color === "string" && /^(?:#[0-9a-fA-F]{3,8}|hsl\([^)]{1,40}\))$/.test(color)) {
          style.color = color;
        }
        break;
      }
      default:
        break;
    }
  }
  return Object.keys(style).length > 0 ? (
    <span key={key} style={style}>
      {out}
    </span>
  ) : (
    <span key={key}>{out}</span>
  );
}

function renderChildren(nodes: RichDocNode[] | undefined, path: string, budget: { left: number }): ReactNode[] {
  return (nodes ?? []).map((node, index) => renderNode(node, `${path}.${index}`, budget));
}

function renderNode(node: RichDocNode, path: string, budget: { left: number }): ReactNode {
  budget.left -= 1;
  if (budget.left < 0) return null;
  const children = () => renderChildren(node.content, path, budget);
  switch (node.type) {
    case "text":
      return renderText(node, path);
    case "paragraph":
      return (
        <p key={path} style={{ margin: "0 0 6px", minHeight: "1em" }}>
          {children()}
        </p>
      );
    case "heading": {
      const level = Math.min(6, Math.max(1, span(node.attrs, "level") ?? 1));
      const size = [22, 18, 16, 14, 13, 12][level - 1];
      return (
        <div key={path} role="heading" aria-level={level} style={{ fontSize: size, fontWeight: 700, margin: "8px 0 6px" }}>
          {children()}
        </div>
      );
    }
    case "bulletList":
      return (
        <ul key={path} style={{ margin: "0 0 6px", paddingLeft: 20, listStyle: "disc" }}>
          {children()}
        </ul>
      );
    case "orderedList":
      return (
        <ol key={path} style={{ margin: "0 0 6px", paddingLeft: 20, listStyle: "decimal" }}>
          {children()}
        </ol>
      );
    case "listItem":
      return <li key={path}>{children()}</li>;
    case "blockquote":
      return (
        <blockquote key={path} style={{ margin: "0 0 6px", paddingLeft: 10, borderLeft: "3px solid #d6d3d1", color: "#57534e" }}>
          {children()}
        </blockquote>
      );
    case "codeBlock":
      return (
        <pre key={path} style={{ margin: "0 0 6px", padding: 6, background: "#f5f5f4", fontSize: 11, whiteSpace: "pre-wrap" }}>
          {children()}
        </pre>
      );
    case "horizontalRule":
      return <hr key={path} style={{ margin: "8px 0", border: 0, borderTop: "1px solid #d6d3d1" }} />;
    case "hardBreak":
      return <br key={path} />;
    case "image": {
      const src = safeRichDocImageSrc((node.attrs as Record<string, unknown> | undefined)?.src);
      return src ? (
        <img
          key={path}
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          style={{ display: "block", maxWidth: "100%", maxHeight: 160, objectFit: "contain", margin: "4px 0" }}
        />
      ) : (
        <div key={path} style={{ height: 40, background: "#e7e5e4", margin: "4px 0" }} aria-hidden="true" />
      );
    }
    case "table":
      return (
        <table key={path} style={{ borderCollapse: "collapse", width: "100%", margin: "0 0 6px", fontSize: 11 }}>
          <tbody>{children()}</tbody>
        </table>
      );
    case "tableRow":
      return <tr key={path}>{children()}</tr>;
    case "tableCell":
    case "tableHeader": {
      const Cell = node.type === "tableHeader" ? "th" : "td";
      return (
        <Cell
          key={path}
          colSpan={span(node.attrs, "colspan")}
          rowSpan={span(node.attrs, "rowspan")}
          style={{ border: "1px solid #d6d3d1", padding: "2px 4px", verticalAlign: "top", fontWeight: node.type === "tableHeader" ? 700 : 400 }}
        >
          {children()}
        </Cell>
      );
    }
    default:
      // 不认识的节点：只画它里面的字，不丢内容。
      return <div key={path}>{children()}</div>;
  }
}

function Frame({ snapshot, prev, width, height, authorColor }: ReplayFrameProps) {
  const doc: RichDocSnapshot = richDocFromRevision(snapshot);
  const changed = prev === undefined || prev === null ? new Set<number>() : richDocChangedBlocks(prev, doc);
  const color = safeCollabColor(authorColor);
  const budget = { left: MAX_NODES };
  const scale = width > 0 ? width / PAGE_WIDTH : 1;
  return (
    <div
      data-replay-frame="richdoc"
      style={{ width, height, overflow: "hidden", background: "#fff", position: "relative" }}
    >
      <div
        style={{
          width: PAGE_WIDTH,
          padding: "24px 32px",
          boxSizing: "border-box",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          fontSize: 12,
          lineHeight: 1.6,
          color: "#1c1917",
        }}
      >
        {doc.content.map((block, index) => (
          <div
            key={index}
            data-changed={changed.has(index) ? "true" : undefined}
            style={{
              borderLeft: `3px solid ${changed.has(index) ? color : "transparent"}`,
              marginLeft: -10,
              paddingLeft: 7,
            }}
          >
            {renderNode(block, String(index), budget)}
          </div>
        ))}
      </div>
    </div>
  );
}

const renderer: ReplayFrameRenderer | null = {
  kind: "richdoc",
  fromY: (doc) => richDocFromY(doc),
  fromRevision: (json) => richDocFromRevision(json),
  Frame,
  describeChange: (prev, next, tt) => describeRichDocChange(prev, next, tt),
  toArtifactJson: (snapshot) => richDocToArtifactJson(snapshot),
};

export default renderer;
