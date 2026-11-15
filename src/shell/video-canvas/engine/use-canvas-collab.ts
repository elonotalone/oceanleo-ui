"use client";

/**
 * 画布 ↔ 外壳的协同收发（work-chat 第二轮 F06）。
 *
 * 只监听 v1 协议里已有的 `recovery-capture` / `recovery-restore`，回 `recovery-snapshot` / `recovery-result`。
 * 来源校验与画布其余消息完全一样：只收嵌入态下 `window.parent` 发来、origin 等于钉死的宿主 origin、
 * 实例号对得上、不超过 64KB 的消息；回信的 targetOrigin 也是钉死的宿主 origin。不新增指令、不放宽任何校验。
 */
import { useEffect, useRef } from "react";
import {
  LEGACY_CANVAS_EDITOR_PROTOCOL,
  parseCanvasHostMessage,
  type CanvasEmbedConfig,
} from "./canvas-embed-protocol";
import { answerCollabCapture, answerCollabRestore, type CanvasCollabPort } from "./canvas-collab";

export function useCanvasCollabBridge(embed: CanvasEmbedConfig, port: CanvasCollabPort | undefined): void {
  const portRef = useRef(port);
  portRef.current = port;

  useEffect(() => {
    if (!embed.active) return undefined;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== embed.hostOrigin || event.source !== window.parent) return;
      const message = parseCanvasHostMessage(event.data, embed.instanceId);
      if (!message || (message.type !== "recovery-capture" && message.type !== "recovery-restore")) return;
      const current = portRef.current;
      if (!current) return;
      const reply =
        message.type === "recovery-capture"
          ? answerCollabCapture(message.recoveryId, current)
          : answerCollabRestore(message.recoveryId, message.snapshot, current);
      window.parent.postMessage(
        { protocol: LEGACY_CANVAS_EDITOR_PROTOCOL, instanceId: embed.instanceId, ...reply },
        embed.hostOrigin,
      );
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [embed]);
}
