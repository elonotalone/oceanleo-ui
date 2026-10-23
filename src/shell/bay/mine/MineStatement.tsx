"use client";

// 「我买到的」某一行下面展开的对账单：按合同号现取（只读，不碰 Stripe），关掉就收起。
// 样子就是设置「钱」里那份单笔对账单（settings/money-ui 的 StatementPanel），金额与日期按页面语言排版。
import { useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { fetchBayStatement, type BayStatement } from "../../../lib/bay/money";
import { StatementPanel, useBayMoneyLocale } from "../settings/money-ui";

type Loaded = { contractId: string; statement: BayStatement | null };

export function MineStatement({ contractId, onClose }: { contractId: string; onClose: () => void }) {
  const tt = useUI();
  const locale = useBayMoneyLocale();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let alive = true;
    setLoaded(null);
    fetchBayStatement(contractId).then(
      (statement) => {
        if (alive) setLoaded({ contractId, statement });
      },
      () => {
        if (alive) setLoaded({ contractId, statement: null });
      },
    );
    return () => {
      alive = false;
    };
  }, [contractId]);

  // 换了合同号的那一拍，上一份结果还在 state 里：不认它。
  const ready = loaded && loaded.contractId === contractId ? loaded : null;
  if (!ready) {
    return (
      <p data-bay-statement-loading="" className="text-[12px] text-stone-500">
        {tt("正在加载…")}
      </p>
    );
  }
  if (!ready.statement) {
    return (
      <div className="flex items-center justify-between gap-3" data-bay-statement-failed="">
        <p role="alert" className="min-w-0 text-[12px] text-rose-700">
          {tt("加载失败，请稍后再试。")}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full border border-neutral-900 px-2.5 py-1 text-[12px] hover:bg-neutral-50"
        >
          {tt("关闭")}
        </button>
      </div>
    );
  }
  return <StatementPanel statement={ready.statement} locale={locale} onClose={onClose} />;
}
