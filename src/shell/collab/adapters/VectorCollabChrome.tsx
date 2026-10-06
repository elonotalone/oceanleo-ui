"use client";

/**
 * 矢量图（嵌入式画布）的两块宿主外壳（work-chat 第二轮 F08）。不新增任何 postMessage 动词，不改 iframe 的 sandbox。
 *
 *   VectorFrameGuard      —— 只读时给画布外面包一层 `inert`：画布里的编辑器拿不到键盘和鼠标的编辑输入
 *                            （焦点在 iframe 里时，按键也进不去），看图和宿主栏的缩放（宿主发给画布的指令）照旧。
 *                            包的是一个**固定存在**的外层 div（矢量图这条路径上始终有它，只切 inert 属性），
 *                            所以只读 / 可写切换不会让画布重新挂载。
 *   VectorNewVersionBar   —— 本地有没保存的改动、外面又来了新版本时的提示条：「保存我的」「看新版本」。
 *                            画布不会重新挂载，直到用户选「看新版本」。
 */
import type { ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";

export function VectorFrameGuard({
  enabled,
  readOnly,
  children,
}: {
  /** 只有矢量图为 true；别的嵌入画布原样返回子节点。 */
  enabled: boolean;
  /** 只能看：画布 inert。 */
  readOnly: boolean;
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <div
      className="h-full min-h-0"
      data-vector-frame-guard={readOnly ? "inert" : "open"}
      inert={readOnly ? true : undefined}
    >
      {children}
    </div>
  );
}

export function VectorNewVersionBar({
  onKeepMine,
  onSeeNew,
  saveFailed = false,
  busy = false,
}: {
  onKeepMine: () => void;
  onSeeNew: () => void;
  /** 「保存我的」没成功：提示再试一次（提示条不消失，本地改动还在）。 */
  saveFailed?: boolean;
  busy?: boolean;
}) {
  const tt = useUI();
  const buttonClass =
    "inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-[12px] font-medium focus-visible:outline focus-visible:outline-2 disabled:opacity-50";
  return (
    <div
      role="alert"
      data-vector-new-version="true"
      className="absolute inset-x-2 top-2 z-[30] flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 shadow-sm"
    >
      <p className="min-w-0 flex-1">
        {tt("这张矢量图有了新版本，而你还有没保存的改动。")}
        {saveFailed ? ` ${tt("没能保存你的改动，请再试一次。")}` : ""}
      </p>
      <button
        type="button"
        data-vector-keep-mine="true"
        disabled={busy}
        onClick={onKeepMine}
        className={`${buttonClass} bg-amber-900 text-amber-50`}
      >
        {tt("保存我的")}
      </button>
      <button
        type="button"
        data-vector-see-new="true"
        disabled={busy}
        onClick={onSeeNew}
        className={`${buttonClass} border border-amber-400`}
      >
        {tt("看新版本")}
      </button>
    </div>
  );
}
