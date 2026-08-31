"use client";

// ============================================================================
// @oceanleo/ui — 插件 AI 客户端（插件唯一该碰的入口）
// ----------------------------------------------------------------------------
// transport 只管「怎么把一次请求送出去」，剩下那些**每条通道都要做、旧实现里
// 每条通道都做得不一样**的事，收在这里做一次：
//   1. 取消：调用方给的 signal 和上游的 AbortController 接起来，并在断开时尽力
//      通知上游撤单。旧实现有的根本没有 signal，有的 abort 了却不告诉上游，
//      于是「点了停止」= 界面不转了、钱照扣。
//   2. 进度：单调化（不许从 0.8 跳回 0.3）、结算后不再回调、回调自己抛错不许
//      污染这次运行——插件写错一个 setState 不该让生成结果丢掉。
//   3. 错误：任何东西进来，出去一定是 PluginAiError，且 disposition 只有四种。
//      界面因此可以按 disposition 分支，而不是对 message 做正则。
//   4. 回执：runId / provider / model / 计费统一补齐，上游不给就如实写「不知道」。
//
// 插件侧只需要 `await client.run({ capability, input, signal, onProgress })`。
// ============================================================================

import type { AiTransport, AiTransportContext } from "./transport";
import {
  AI_CAPABILITIES,
  PluginAiError,
  isPluginAiError,
  type AiBilling,
  type AiCapability,
  type AiCapabilityAvailability,
  type AiProgress,
  type AiReceipt,
  type PluginAiRequest,
  type PluginAiResult,
} from "./types";

export interface PluginAiClientOptions {
  /** 计费与配额按站分账；单次请求可用 `PluginAiRequest.siteId` 覆盖。 */
  siteId?: string;
  /** 默认模型；单次请求可用 `PluginAiRequest.model` 覆盖。 */
  model?: string;
  /** 测试缝：让 runId 可预测。 */
  makeId?: (prefix: string) => string;
  /** 测试缝：让回执时间戳可预测。 */
  now?: () => string;
}

export interface PluginAiClient {
  readonly transportId: string;
  /**
   * 这条能力现在能不能用。界面**应当**先问它再决定按钮灰不灰——让用户点下去
   * 才被告知「没接」，是旧实现最招骂的一种。
   */
  availability(capability: AiCapability): AiCapabilityAvailability;
  run<K extends AiCapability>(
    request: PluginAiRequest<K>,
  ): Promise<PluginAiResult<K>>;
}

/** 上游没给计费信息时的回执：金额写 null（不知道），并标成估算，不拿 0 冒充免费。 */
const UNKNOWN_BILLING: AiBilling = Object.freeze({
  charged: false,
  amount: null,
  currency: "OCEANLEO_CREDITS",
  estimated: true,
});

function defaultId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, "");
  return `${prefix}_${
    random ||
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  }`;
}

function isAbortError(caught: unknown): boolean {
  return (
    (caught instanceof DOMException && caught.name === "AbortError") ||
    (Boolean(caught) &&
      typeof caught === "object" &&
      (caught as { name?: unknown }).name === "AbortError")
  );
}

function cancelledError(
  capability: AiCapability,
  runId: string,
): PluginAiError {
  return new PluginAiError("cancelled", "这次 AI 运行已被取消。", {
    capability,
    code: "ai-cancelled",
    runId,
  });
}

/**
 * 出口只有 PluginAiError 一种。已经是的就放行；被取消的一律归到 cancelled
 * （界面不该为用户自己按的停止弹一个红色错误）；其余都是 failed。
 */
function toPluginAiError(
  caught: unknown,
  context: { capability: AiCapability; runId: string; aborted: boolean },
): PluginAiError {
  if (isPluginAiError(caught)) {
    // 取消发生时上游常常先抛一个网络层的失败；那不是失败，是用户按了停止。
    if (context.aborted && caught.disposition === "failed") {
      return cancelledError(context.capability, context.runId);
    }
    return caught;
  }
  if (context.aborted || isAbortError(caught)) {
    return cancelledError(context.capability, context.runId);
  }
  const message =
    (caught instanceof Error ? caught.message.trim() : "") || "AI 运行失败。";
  return new PluginAiError("failed", message, {
    capability: context.capability,
    code: "ai-run-failed",
    retryable: true,
    runId: context.runId,
    cause: caught,
  });
}

export function createPluginAiClient(
  transport: AiTransport,
  options: PluginAiClientOptions = {},
): PluginAiClient {
  const makeId = options.makeId || defaultId;
  const now = options.now || (() => new Date().toISOString());
  const defaultSiteId = options.siteId?.trim() || "";
  const defaultModel = options.model?.trim() || "";

  return {
    transportId: transport.id,

    availability(capability) {
      if (!AI_CAPABILITIES.includes(capability)) {
        return {
          enabled: false,
          reason: `${String(capability)} 不是本契约认识的能力。`,
        };
      }
      return transport.availability(capability);
    },

    async run<K extends AiCapability>(
      request: PluginAiRequest<K>,
    ): Promise<PluginAiResult<K>> {
      const capability = request.capability;
      const runId = makeId("ai_run");
      const requestId = request.requestId?.trim() || makeId("ai_req");
      const startedAt = now();

      if (!AI_CAPABILITIES.includes(capability)) {
        throw new PluginAiError(
          "unavailable",
          `${String(capability)} 不是本契约认识的能力，这次请求没有发出。`,
          { code: "ai-capability-unknown", runId },
        );
      }
      // 已经取消了就别再走一遍网络：那一趟只会白扣一次钱。
      if (request.signal?.aborted) throw cancelledError(capability, runId);

      const availability = transport.availability(capability);
      if (!availability.enabled) {
        throw new PluginAiError(
          "unavailable",
          availability.reason ||
            `当前宿主没有提供 ${capability} 能力，这次请求没有发出。`,
          { capability, code: "ai-capability-unavailable", runId },
        );
      }

      let highest = 0;
      let settled = false;
      const emit = (progress: AiProgress): void => {
        if (settled) return;
        const raw = Number(progress.progress);
        const bounded = Number.isFinite(raw)
          ? Math.min(1, Math.max(0, raw))
          : highest;
        highest = Math.max(highest, bounded);
        try {
          request.onProgress?.({ ...progress, progress: highest });
        } catch {
          // 插件的进度回调抛错是它自己的 bug，不该把这次生成一起带走。
        }
      };

      const controller = new AbortController();
      let providerRunId: string | undefined;
      const onAbort = (): void => {
        controller.abort();
        emit({ phase: "cancelling", progress: highest });
        // 尽力而为地通知上游撤单：撤不掉也只能这样，但至少不能因此再抛一次错。
        void transport.cancel?.(runId, providerRunId).catch(() => undefined);
      };
      request.signal?.addEventListener("abort", onAbort, { once: true });

      const context: AiTransportContext = {
        capability,
        runId,
        requestId,
        siteId: request.siteId?.trim() || defaultSiteId,
        model: request.model?.trim() || defaultModel,
        signal: controller.signal,
        onProgress: emit,
      };

      try {
        emit({ phase: "validating", progress: 0 });
        const result = await transport.execute(
          capability,
          request.input,
          context,
        );
        providerRunId = result.providerRunId;
        // 上游在取消之后才把结果送回来：这次运行仍然算取消，不许把结果落盘。
        if (controller.signal.aborted) throw cancelledError(capability, runId);
        emit({ phase: "complete", progress: 1 });
        const receipt: AiReceipt = {
          provider: result.provider || transport.id,
          model: result.model || context.model,
          runId,
          ...(result.providerRunId
            ? { providerRunId: result.providerRunId }
            : {}),
          billing: result.billing || UNKNOWN_BILLING,
          startedAt,
          completedAt: now(),
        };
        return { capability, output: result.output, receipt };
      } catch (caught) {
        throw toPluginAiError(caught, {
          capability,
          runId,
          aborted: controller.signal.aborted,
        });
      } finally {
        settled = true;
        request.signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}
