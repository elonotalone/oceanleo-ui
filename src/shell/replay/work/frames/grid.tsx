// grid 的回放画法（W12；work-chat 契约 §8.4，做法见 tasks/_EDITORS.md 第 8 条）。
// 只用 React 画前 50 行 × 20 列的只读网格：不执行任何用户内容，不用 iframe，不用 dangerouslySetInnerHTML。
import {
  describeGridChange,
  gridFrameModel,
  gridFromRevision,
  gridFromY,
  gridToArtifactJson,
  safePeerColor,
} from "../../../collab/adapters/grid";
import type { ReplayFrameProps, ReplayFrameRenderer } from "../frame-types";

const CELL_W = 64;
const CELL_H = 18;
const HEADER_W = 28;

function columnLabel(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

function hexAlpha(color: string): string {
  // 作者色做底色：`#rrggbb` 加透明度；`hsl()` 用 hsla 写法；别的回落。
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return `${color}44`;
  const hsl = /^hsl\((.+)\)$/.exec(color);
  if (hsl) return `hsla(${hsl[1]}, 0.3)`;
  return "rgba(99,102,241,0.25)";
}

function Frame({ snapshot, prev, width, height, authorColor }: ReplayFrameProps) {
  const model = gridFrameModel(gridFromRevision(snapshot), prev === undefined || prev === null ? undefined : gridFromRevision(prev));
  const fill = hexAlpha(safePeerColor(authorColor));
  const cols = model.rows[0]?.length ?? 1;
  const contentWidth = HEADER_W + cols * CELL_W;
  const contentHeight = CELL_H * (model.rows.length + 2);
  const scale = Math.min(width / contentWidth, height / contentHeight, 1);
  return (
    <div
      data-replay-frame="grid"
      style={{ width, height, overflow: "hidden", background: "#fff", position: "relative" }}
    >
      <div
        style={{
          width: contentWidth,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          fontSize: 10,
          color: "#1c1917",
        }}
      >
        <div style={{ height: CELL_H, lineHeight: `${CELL_H}px`, padding: "0 4px", color: "#57534e" }}>
          {model.sheetName}
          {model.sheetCount > 1 ? ` · ${model.sheetCount}` : ""}
        </div>
        <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: contentWidth }}>
          <thead>
            <tr>
              <th style={{ width: HEADER_W, height: CELL_H, background: "#f5f5f4", border: "1px solid #e7e5e4" }} />
              {Array.from({ length: cols }, (_, c) => (
                <th
                  key={c}
                  style={{ width: CELL_W, height: CELL_H, background: "#f5f5f4", border: "1px solid #e7e5e4", fontWeight: 400, color: "#78716c" }}
                >
                  {columnLabel(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.rows.map((row, r) => (
              <tr key={r}>
                <th style={{ height: CELL_H, background: "#f5f5f4", border: "1px solid #e7e5e4", fontWeight: 400, color: "#78716c" }}>
                  {r + 1}
                </th>
                {row.map((text, c) => {
                  const changed = model.changed.has(`${r}:${c}`);
                  return (
                    <td
                      key={c}
                      data-changed={changed ? "true" : undefined}
                      style={{
                        height: CELL_H,
                        maxWidth: CELL_W,
                        padding: "0 3px",
                        border: "1px solid #e7e5e4",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        background: changed ? fill : undefined,
                      }}
                    >
                      {text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const renderer: ReplayFrameRenderer | null = {
  kind: "grid",
  fromY: (doc) => gridFromY(doc),
  fromRevision: (json) => gridFromRevision(json),
  Frame,
  describeChange: (prev, next) => describeGridChange(prev, next),
  toArtifactJson: (snapshot) => gridToArtifactJson(snapshot),
};

export default renderer;
