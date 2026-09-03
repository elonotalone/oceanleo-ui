"use client";

import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { editorToolLabel } from "../workbench-routes";

/**
 * 双核 flag 的 `next` 分支：PPT 走 PPTist（`pptist-hosted`，AGPL 独立公开仓）iframe 托管。
 *
 * ## 为什么这里现在只是一块「说明面」而不是真的 iframe
 *
 * 托管这条链缺的**不是我这一寸**，是它上游的两道门（都在 W01 的独占面上，
 * 已写进 `signals/W07-request.md` R1/R2）：
 *
 * 1. `editor-sandbox-origin.ts` 的 `isUntrustedContentHostname()` 把**一切**
 *    `*.oceanleo.app` 判为不可信内容域 ⇒ `slides.oceanleo.app` 今天既拼不出
 *    embed URL，`EmbeddedRoute` 也收不下它的 `ready`。
 * 2. `TRUSTED_EMBED_EDITOR_BASES` 只认 `<subsite>.<家族注册域>` 三条硬编码路由，
 *    没有表达 Hosted 六件那种「挂在独立可注册域上」的形状。
 *
 * 这两处都不在我的边界内（§2 第 1 条：别人的面一个字都不许碰）。
 * **在它们放行之前，这里如实说明「新核已就绪但宿主侧尚未放行」，
 * 而不是渲染一个必然握手失败的空白 iframe** —— 后者会让用户看到一块白板，
 * 让验收看到一条「接好了」的假象。
 *
 * flag 默认 `legacy`（`editor-core-flags.ts`），所以正常用户走不到这里；
 * 只有显式翻 flag 的人会看到这块说明，那正是他需要知道的信息。
 */
export function DeckHostedRoute({
  item,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "deck",
        label: editorToolLabel({ type: "deck" }),
        stage: (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm font-semibold">
              PPTist 新核已就绪，宿主侧尚未放行
            </p>
            <p className="max-w-md text-xs leading-relaxed opacity-70">
              编辑器容器与 postMessage 桥已交付（
              <code>slides.oceanleo.app</code>）。宿主的可信 origin 白名单还没有
              把它加进去，此时嵌入只会握手失败，因此这里先不加载 iframe。
              进度见 <code>signals/W07-request.md</code> R1/R2。
            </p>
            <p className="text-xs opacity-60">
              把该编辑器的双核 flag 切回 <code>legacy</code> 即可继续使用现有编辑器。
            </p>
          </div>
        ),
        available: false,
      }}
      onClose={onClose}
    />
  );
}
