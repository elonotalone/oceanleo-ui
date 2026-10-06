"use client";

// 通用「改之前 / 改之后」画法：编辑器族没有自己的回放画法（frames/<族>.tsx 默认导出 null）
// 或快照还原不出来时，播放器用它。只画文本节点，不执行任何用户内容。
import type { ReplayFrameProps } from "../frame-types";
import { useUI } from "../../../../i18n/ui/useUI";
import { snapshotChanged, summarizeSnapshot } from "../replay-work-model";

export interface FallbackFrameProps extends ReplayFrameProps {
  /** 作品名（可选）。 */
  title?: string;
  /** 这一步发生了什么（如「保存了一个版本」）。 */
  caption?: string | null;
}

export function FallbackFrame(props: FallbackFrameProps) {
  const tt = useUI();
  const { snapshot, prev, width, height, authorColor, title, caption } = props;
  const before = summarizeSnapshot(prev);
  const after = summarizeSnapshot(snapshot);
  const changed = snapshotChanged(prev, snapshot);
  return (
    <div
      data-replay-fallback
      className="flex h-full w-full flex-col gap-3 overflow-hidden rounded-xl border border-stone-200 bg-white p-4"
      style={{ maxWidth: width, maxHeight: height, borderTopColor: authorColor, borderTopWidth: authorColor ? 3 : undefined }}
    >
      {title ? <p className="truncate text-[14px] font-medium text-neutral-900">{title}</p> : null}
      {caption ? <p className="text-[12px] text-stone-500">{caption}</p> : null}
      {!before && !after ? (
        <p data-replay-fallback-empty className="m-auto text-[13px] text-stone-400">
          {tt("这一步没有可以显示的画面")}
        </p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
          <section className="flex min-h-0 flex-col gap-1">
            <h4 className="text-[12px] font-medium text-stone-500">{tt("改之前")}</h4>
            <pre
              data-replay-before
              className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-stone-50 p-2 text-[12px] leading-relaxed text-stone-700"
            >
              {before || tt("（空）")}
            </pre>
          </section>
          <section className="flex min-h-0 flex-col gap-1">
            <h4 className="text-[12px] font-medium text-stone-500">
              {tt("改之后")}
              {changed ? <span className="ml-1 text-emerald-600">{tt("有改动")}</span> : null}
            </h4>
            <pre
              data-replay-after
              className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-stone-50 p-2 text-[12px] leading-relaxed text-stone-700"
            >
              {after || tt("（空）")}
            </pre>
          </section>
        </div>
      )}
    </div>
  );
}

export default FallbackFrame;
