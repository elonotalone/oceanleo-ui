"use client";

// model3d 的回放画法（work-chat W14，契约 §8.4）：场景节点树 + 现有缩略图（有就用）。
// 这一步动过的节点用作者颜色标出。不加载模型、不跑 three.js。
import { useUI } from "../../../../i18n/ui/useUI";
import {
  model3dDiff,
  model3dFromRevisionJson,
  model3dFromYDoc,
  model3dSceneRows,
  model3dToArtifactJson,
  type Model3DCollabSnapshot,
} from "../../../collab/adapters/model3d";
import type { ReplayFrameProps, ReplayFrameRenderer } from "../frame-types";
import { joinNotes, plainChangeTranslate, type ChangeTranslate } from "./notes";

const KIND_LABEL: Record<string, string> = {
  transform: "变换",
  material: "材质",
  texture: "贴图",
  camera: "相机",
  light: "灯光",
  presence: "增删节点",
  visibility: "显示/隐藏",
};

/** 缩略图只认 https 或站内相对地址，指向上传得到的存储地址。 */
function safeImageUrl(value: unknown): string {
  const url = typeof value === "string" ? value.trim() : "";
  return /^https:\/\//i.test(url) || /^\/(?!\/)/.test(url) ? url : "";
}

function Model3DFrame({ snapshot, prev, width, height, authorColor = "#4f46e5" }: ReplayFrameProps) {
  const tt = useUI();
  const state = snapshot as Model3DCollabSnapshot;
  const rows = model3dSceneRows(state);
  const touched = new Set(prev ? model3dDiff(prev as Model3DCollabSnapshot, state).touchedNodes : []);
  const poster = safeImageUrl(state.posterUrl);
  const annotations = state.view?.annotations ?? [];
  const thumb = poster ? Math.min(Math.floor(width * 0.4), height - 8) : 0;
  return (
    <div
      data-replay-frame="model3d"
      style={{ width, height }}
      className="flex overflow-hidden rounded border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-1 text-[11px] text-[var(--foreground,#292524)]"
    >
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" width={thumb} height={thumb} className="mr-2 shrink-0 rounded object-cover" style={{ width: thumb, height: thumb }} />
      ) : null}
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="mb-1 font-semibold">{tt("场景节点")}</p>
        {rows.length === 0 && annotations.length === 0 ? (
          <p className="text-[var(--muted-foreground,#57534e)]">{tt("场景里还没有改动")}</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {rows.map((row) => {
              const mark = touched.has(row.target);
              return (
                <li
                  key={row.target}
                  data-node={row.target}
                  data-changed={mark ? "true" : undefined}
                  className="flex items-center gap-1 truncate py-0.5"
                  style={mark ? { borderLeft: `3px solid ${authorColor}`, paddingLeft: 4, background: `${authorColor}18` } : { paddingLeft: 7 }}
                >
                  <span className={row.removed ? "truncate line-through opacity-60" : "truncate"}>{row.target}</span>
                  <span className="shrink-0 opacity-60">{row.kinds.map((kind) => tt(KIND_LABEL[kind] ?? kind)).join(" · ")}</span>
                  {row.added ? <span className="shrink-0">{tt("新增")}</span> : null}
                  {row.hidden ? <span className="shrink-0 opacity-60">{tt("已隐藏")}</span> : null}
                </li>
              );
            })}
            {annotations.length ? <li className="py-0.5 opacity-70">{tt("{n} 条批注", { n: annotations.length })}</li> : null}
          </ul>
        )}
      </div>
    </div>
  );
}

/** 这一步改了什么（场景节点、批注）。 */
export function describeModel3dChange(prev: unknown, next: unknown, tt?: ChangeTranslate): string | null {
  if (!isRecord(next) || !Array.isArray(next.operations)) return null;
  const before = isRecord(prev) && Array.isArray(prev.operations) ? (prev as unknown as Model3DCollabSnapshot) : null;
  const diff = model3dDiff(before, next as unknown as Model3DCollabSnapshot);
  const t = tt ?? plainChangeTranslate;
  const parts: string[] = [];
  if (diff.touchedNodes.length) parts.push(t("动了 {n} 个场景节点", { n: diff.touchedNodes.length }));
  if (diff.annotationsAdded) parts.push(t("加了 {n} 条批注", { n: diff.annotationsAdded }));
  if (diff.annotationsChanged) parts.push(t("改了 {n} 条批注", { n: diff.annotationsChanged }));
  return joinNotes(tt, parts);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const renderer: ReplayFrameRenderer = {
  kind: "model3d",
  fromY: model3dFromYDoc,
  fromRevision: model3dFromRevisionJson,
  Frame: Model3DFrame,
  describeChange: describeModel3dChange,
  toArtifactJson: model3dToArtifactJson,
};

export default renderer;
