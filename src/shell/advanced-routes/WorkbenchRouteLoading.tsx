"use client";

import type { ChunkErrorProps } from "../../lib/lazy-with-retry";

export function WorkbenchRouteLoading() {
  return (
    <div
      role="status"
      aria-label="正在加载编辑器"
      aria-live="polite"
      data-workbench-route-loading
      className="grid h-full min-h-[18rem] w-full place-items-center bg-[var(--surface,#f5f5f4)]"
    >
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[var(--border,#e7e5e4)] border-t-[var(--awb-accent,#7c3aed)]" />
        <p className="mt-3 text-[12px] text-[var(--muted,#78716c)]">正在加载编辑器…</p>
      </div>
    </div>
  );
}

/**
 * chunk 退避重试耗尽之后的落点。
 *
 * 两件事在这里是硬要求：
 *
 * ① **不能再是 spinner。** 永久转圈正是操作员看到的那个故障
 *    （`ERR_SSL_VERSION_OR_CIPHER_MISMATCH` 之后编辑器一直在转）。
 *    转圈在语义上是「还在进行」，而这时候已经不进行了。
 *
 * ② **两种失败要给两种动作。** 网络失败该重试；chunk 404 意味着部署换版、
 *    旧 chunk 名已经不存在，重试多少次都变不出那个文件，唯一有用的动作是刷新页面。
 *    把两者合成一个「重试」按钮，用户会在一个永远不会成功的按钮上反复点。
 *
 * 这一块**留在编辑器窗格内**（没有 `fixed`、没有 portal）：一条路由的 chunk 挂了，
 * 外壳、编辑栏、素材库都还在，用户能直接切到别的素材。
 */
export function WorkbenchRouteChunkError({
  kind,
  attempts,
  onRetry,
  onReload,
}: ChunkErrorProps) {
  const stale = kind === "stale-version";
  return (
    <div
      role="alert"
      data-workbench-route-error
      data-chunk-failure-kind={kind}
      className="grid h-full min-h-[18rem] w-full place-items-center bg-[var(--surface,#f5f5f4)] p-6 text-[var(--fg,#292524)]"
    >
      <div className="w-full max-w-md text-center">
        <p className="text-[15px] font-semibold">
          {stale ? "版本已更新，请刷新页面" : "编辑器没能载入"}
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-[var(--muted,#78716c)]">
          {stale
            ? "这个页面开着的时候站点发布了新版本，旧的编辑器文件已经不在了。刷新一下就好，你的素材没有被改动。"
            : "看起来是网络问题，编辑器的代码没能下载完整。素材本身没有被修改，可以直接重试。"}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {stale ? (
            <button
              type="button"
              onClick={onReload}
              data-chunk-action="reload"
              className="rounded-xl bg-[var(--fg,#292524)] px-4 py-2 text-[12px] font-semibold text-[var(--card,#fff)]"
            >
              刷新页面
            </button>
          ) : (
            <button
              type="button"
              onClick={onRetry}
              data-chunk-action="retry"
              className="rounded-xl bg-[var(--fg,#292524)] px-4 py-2 text-[12px] font-semibold text-[var(--card,#fff)]"
            >
              重试
            </button>
          )}
        </div>
        {attempts > 1 && (
          <p className="mt-3 text-[11px] text-[var(--muted,#78716c)]">
            已自动重试 {attempts - 1} 次
          </p>
        )}
      </div>
    </div>
  );
}
