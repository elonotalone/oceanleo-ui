// 订单取数与短缓存：项目群里同一张订单卡可能出现多次（消息里一张、置顶条一张），同一单只取一次。
// 订单页做完动作后调 `invalidateBayOrder(id)`，订单卡跟着刷新。模块加载时不碰 window。

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { BayApiError } from "../../../lib/bay/http";
import { getBayOrder, type BayOrder, type BayOrderPaymentsGate } from "../../../lib/bay/orders";
import { fetchBayPaymentConfig } from "../../../lib/bay/payments";

const TTL_MS = 30_000;

interface Entry {
  order: BayOrder | null;
  error: BayApiError | null;
  at: number;
  pending: Promise<BayOrder> | null;
}

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let version = 0;

function emit(): void {
  version += 1;
  for (const listener of Array.from(listeners)) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function asApiError(error: unknown): BayApiError {
  if (error instanceof BayApiError) return error;
  return new BayApiError(error instanceof Error && error.message ? error.message : "请求失败，请稍后再试。", 0);
}

/** 取一单；30 秒内重复取用缓存，`force` 跳过缓存。并发的同一单只发一次请求。 */
export function loadBayOrder(contractId: string, opts: { force?: boolean } = {}): Promise<BayOrder> {
  const current = entries.get(contractId);
  if (current?.pending) return current.pending;
  if (!opts.force && current && Date.now() - current.at < TTL_MS) {
    if (current.order) return Promise.resolve(current.order);
    if (current.error) return Promise.reject(current.error);
  }
  const pending = getBayOrder(contractId).then(
    (order) => {
      entries.set(contractId, { order, error: null, at: Date.now(), pending: null });
      emit();
      return order;
    },
    (error: unknown) => {
      const apiError = asApiError(error);
      entries.set(contractId, { order: null, error: apiError, at: Date.now(), pending: null });
      emit();
      throw apiError;
    },
  );
  entries.set(contractId, { order: current?.order ?? null, error: null, at: current?.at ?? 0, pending });
  return pending;
}

/** 动作成功后把后端返回的新订单直接放进缓存（返回里没有就作废，下次重取）。 */
export function storeBayOrder(order: BayOrder | null | undefined, contractId?: string): void {
  const id = order?.id || contractId;
  if (!id) return;
  if (order && order.id) {
    const previous = entries.get(id)?.order;
    // 动作接口返回的合同常常不带 my_role / 买卖双方资料：沿用上一版，避免界面闪成「没有权限」。
    const merged: BayOrder = previous
      ? {
          ...previous,
          ...order,
          my_role: order.my_role ?? previous.my_role,
          buyer: order.buyer ?? previous.buyer,
          seller: order.seller ?? previous.seller,
          deliveries: order.deliveries ?? previous.deliveries,
          milestones: order.milestones ?? previous.milestones,
          thread_id: order.thread_id ?? previous.thread_id,
        }
      : order;
    entries.set(id, { order: merged, error: null, at: 0, pending: null });
  } else {
    entries.delete(id);
  }
  emit();
}

export function invalidateBayOrder(contractId: string): void {
  const current = entries.get(contractId);
  if (!current) return;
  entries.set(contractId, { ...current, at: 0 });
  emit();
}

export function peekBayOrder(contractId: string): BayOrder | null {
  return entries.get(contractId)?.order ?? null;
}

/** 测试用：清空缓存。 */
export function resetBayOrderStore(): void {
  entries.clear();
  gatePromise = null;
  gateValue = null;
  emit();
}

export interface BayOrderState {
  order: BayOrder | null;
  error: BayApiError | null;
  loading: boolean;
  reload: () => void;
}

/** 订单卡与订单页共用：挂载时取一次；缓存被作废时自动重取。 */
export function useBayOrder(contractId: string | null | undefined): BayOrderState {
  const tick = useSyncExternalStore(subscribe, () => version, () => 0);
  const [, setLocal] = useState(0);
  const id = contractId || "";
  const entry = id ? entries.get(id) : undefined;

  useEffect(() => {
    if (!id) return;
    const current = entries.get(id);
    const fresh = current && !current.pending && Date.now() - current.at < TTL_MS && (current.order || current.error);
    if (fresh || current?.pending) return;
    loadBayOrder(id).catch(() => setLocal((n) => n + 1));
  }, [id, tick]);

  const reload = useCallback(() => {
    if (!id) return;
    loadBayOrder(id, { force: true }).catch(() => setLocal((n) => n + 1));
  }, [id]);

  return {
    order: entry?.order ?? null,
    error: entry?.error ?? null,
    loading: Boolean(id) && (!entry || Boolean(entry.pending)) && !entry?.order,
    reload,
  };
}

// --------------------------------------------------------------------------- //
// 付款就绪（W09 的 payments.ts）：取一次，失败当「未就绪」。
// --------------------------------------------------------------------------- //

const CLOSED_GATE: BayOrderPaymentsGate = { enabled: false, buyer_ready: false };
let gatePromise: Promise<BayOrderPaymentsGate> | null = null;
let gateValue: BayOrderPaymentsGate | null = null;

export function loadBayPaymentsGate(): Promise<BayOrderPaymentsGate> {
  if (gateValue) return Promise.resolve(gateValue);
  if (!gatePromise) {
    gatePromise = fetchBayPaymentConfig().then(
      (config) => {
        gateValue = { enabled: Boolean(config?.enabled), buyer_ready: Boolean(config?.enabled && config?.buyer_ready) };
        emit();
        return gateValue;
      },
      () => {
        gatePromise = null;
        return CLOSED_GATE;
      },
    );
  }
  return gatePromise;
}

export function useBayPaymentsGate(): BayOrderPaymentsGate {
  useSyncExternalStore(subscribe, () => version, () => 0);
  useEffect(() => {
    void loadBayPaymentsGate();
  }, []);
  return gateValue ?? CLOSED_GATE;
}
