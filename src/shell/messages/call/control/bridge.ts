// 桌面桥（合同 §3.10，W10 在桌面客户端里挂到 window 上；网页只调用、不实现）。
// 没有这个对象 = 普通浏览器 → 被控方只提示「请在 OceanLeo 桌面客户端里同意」并允许拒绝。
// 网页永远拿不到设备凭据（INV-2）：批准与本机拒绝都由桌面原生侧自己用设备凭据调网关。

export type CallControlOfferDecision = "approved" | "declined" | "timeout" | "unsupported";

export interface CallControlOfferRequest {
  sessionId: string;
  callId: string;
  controllerName: string;
  gatewayOrigin: string;
  shareSurface: { width: number; height: number; displaySurface: string };
}

export interface CallControlOfferResult {
  decision: CallControlOfferDecision;
  reason?: string;
}

export interface CallControlBridgeState {
  sessionId: string;
  state: "active" | "ended";
  reason?: string;
}

export interface OceanLeoCallControlBridge {
  version: 1;
  offer(req: CallControlOfferRequest): Promise<CallControlOfferResult>;
  stop(sessionId: string): Promise<void>;
  onState(listener: (s: CallControlBridgeState) => void): () => void;
}

declare global {
  interface Window {
    __oceanleoCallControl?: OceanLeoCallControlBridge;
  }
}

/** 形状不对（版本、方法缺失）就当没有：宁可退回「请在桌面客户端里同意」，也不调一个半成品。 */
export function readCallControlBridge(win: unknown): OceanLeoCallControlBridge | null {
  if (!win || typeof win !== "object") return null;
  let candidate: unknown;
  try {
    candidate = (win as { __oceanleoCallControl?: unknown }).__oceanleoCallControl;
  } catch {
    return null;
  }
  if (!candidate || typeof candidate !== "object") return null;
  const bridge = candidate as Record<string, unknown>;
  if (bridge.version !== 1) return null;
  if (typeof bridge.offer !== "function" || typeof bridge.stop !== "function" || typeof bridge.onState !== "function") {
    return null;
  }
  return candidate as OceanLeoCallControlBridge;
}

/** 桥返回的结果先过一遍：认不出的决定按 unsupported（不当成同意）。 */
export function normalizeOfferResult(raw: unknown): { decision: CallControlOfferDecision; reason: string | null } {
  const r = raw && typeof raw === "object" ? (raw as { decision?: unknown; reason?: unknown }) : {};
  const d = r.decision;
  const decision: CallControlOfferDecision =
    d === "approved" || d === "declined" || d === "timeout" || d === "unsupported" ? d : "unsupported";
  return { decision, reason: typeof r.reason === "string" && r.reason ? r.reason.slice(0, 200) : null };
}
