"use client";

// ============================================================================
// 我的库 · 容量条（用了多少 / 还剩多少 / 满了怎么办）
// ----------------------------------------------------------------------------
// 在这之前平台有上限、也有读数，但**用户在界面上一个字都看不到**：传到 5 GiB 就
// 被拒，拒之前没有任何预告。这一条就是把那个数字摆到用户眼前，并且在快满时给出路。
//
// 三条判断是刻意的：
//   1. **没登录、读数拿不到，整条不出现**。空的容量条只会让人以为坏了。
//   2. **`source` 如实标注**。后端有快读（数库索引，0.08 秒）与精读（数对象存储，
//      20 秒）两种读数，快读只认登记进库的文件，所以它不是账单。用户想要准数就点
//      「重新核对」跑精读，界面不替后端撒谎。
//   3. **买空间的入口只在快满时出现**（用掉 ≥ 75%）。没满的人不需要看见推销。
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import {
  getStorageUsage,
  changeStoragePacks,
  type StorageUsage,
} from "../lib/database";
import { useUI } from "../i18n/ui/useUI";

const BUY_HINT_RATIO = 0.75;

export interface StorageCapacityStripProps {
  /** 强调色，跟随所在页面。 */
  accent?: string;
}

function ratioOf(usage: StorageUsage): number {
  if (!usage.limit_bytes) return 0;
  return Math.min(1, Math.max(0, usage.used_bytes / usage.limit_bytes));
}

export function StorageCapacityStrip({
  accent = "#4f46e5",
}: StorageCapacityStripProps) {
  const tt = useUI();
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [checking, setChecking] = useState(false);
  const [buying, setBuying] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async (precise?: boolean) => {
    if (precise) setChecking(true);
    const result = await getStorageUsage({ precise });
    setChecking(false);
    if (result.ok && result.data) setUsage(result.data);
    else if (!precise) setUsage(null);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  async function buyOnePack() {
    setBuying(true);
    setNote("");
    const result = await changeStoragePacks(1);
    setBuying(false);
    if (result.ok && result.data?.ok) {
      setNote(tt("已加 100 GB，钱从钱包里扣。"));
      void load();
      return;
    }
    setNote(
      result.data?.message ||
        result.error ||
        tt("这次没买成，钱没有扣。请稍后再试。"),
    );
  }

  if (!usage || usage.unavailable) return null;

  const ratio = ratioOf(usage);
  const nearlyFull = ratio >= BUY_HINT_RATIO;
  const price = usage.pack_price_cny;
  const packs = usage.packs || 0;
  const maxedOut = usage.max_packs !== undefined && packs >= usage.max_packs;
  const canBuy = nearlyFull && Boolean(price) && !maxedOut;

  return (
    <section
      className="rounded-xl border border-stone-200/80 bg-white/70 px-3 py-2.5"
      data-storage-capacity
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[13px] text-stone-700">
          {tt("已用")} <span className="font-medium">{usage.used_text}</span>
          {" / "}
          {usage.limit_text}
          {packs > 0 && (
            <span className="ml-1.5 text-[12px] text-stone-500">
              （{tt("含加量包")} {packs} × 100 GB）
            </span>
          )}
        </p>
        <div className="flex items-center gap-3 text-[12px]">
          <button
            type="button"
            className="text-stone-500 underline underline-offset-2 hover:text-stone-800 disabled:opacity-60"
            data-storage-recheck
            disabled={checking}
            onClick={() => void load(true)}
            title={tt("按对象存储真实字节重新数一遍，比较慢")}
          >
            {checking ? tt("正在核对…") : tt("重新核对")}
          </button>
          {canBuy ? (
            <button
              type="button"
              className="rounded-lg px-2.5 py-1 font-medium text-white transition disabled:opacity-60"
              data-storage-buy-pack
              disabled={buying}
              onClick={() => void buyOnePack()}
              style={{ background: accent }}
            >
              {buying
                ? tt("正在扣款…")
                : `${tt("加 100 GB")}（¥${price}/${tt("月")}）`}
            </button>
          ) : null}
        </div>
      </div>

      <div
        aria-hidden="true"
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-100"
      >
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{
            width: `${Math.round(ratio * 100)}%`,
            background: ratio >= 0.95 ? "#dc2626" : accent,
          }}
        />
      </div>

      <p className="mt-1.5 text-[11px] text-stone-400">
        {usage.source === "object-storage"
          ? tt("这是按对象存储真实字节数出来的。")
          : tt("这是按库里登记的文件数出来的，点「重新核对」可按真实字节再数一遍。")}
        {/* 「满了怎么办」这句由后端出（storage_quota._upgrade_hint）：价格、包多大、
            买到上限、欠费停了四种措辞都在那一处，界面照抄不另拼一份。
            欠费停了要立刻说，不等快满 —— 那时候用户已经在损失可用空间。 */}
        {(nearlyFull || usage.pack_in_grace || usage.pack_state === "lapsed") &&
        usage.upgrade_hint
          ? ` ${usage.upgrade_hint}`
          : ""}
      </p>

      {note && (
        <p className="mt-1.5 text-[12px] text-stone-600" role="status">
          {note}
        </p>
      )}
    </section>
  );
}
