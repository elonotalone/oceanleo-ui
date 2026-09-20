"use client";

// ============================================================================
// @oceanleo/ui — 付费主体选择器：「这次谁付钱」
// ----------------------------------------------------------------------------
// 企业版在**普通用户眼里唯一会多出来的东西**（操作员决定 4，2026-09-20）。
//
// 与 ChatGPT / Kimi / WPS 的差异点就在这里：它们让人「切工作区」——切过去之前
// 发的任务算私人的、切过去之后算公司的，一个人同时给两家干活就得来回切，切错了
// 钱就记错账。OceanLeo 不切：一个人可以同时属于任意多个组织，**只在按下发送键
// 的那一刻选一次谁付钱**，选完就在输入框下沿一直显示着，不改变别的任何东西。
//
// 因此本组件的默认态必须是「不存在」：没进过任何组织的人（今天全部用户）
// `listMyOrgs()` 返回空数组，这里 **return null**，输入框那一排与改动前逐字相同。
// 这是 W12 验收证据里「渲染差异为零」那一条的实现根据。
//
// 选中的主体以固定字段名 `org_id` 随请求交给网关（空串 = 个人钱包），
// 由 `resolve_payer(user_id, requested_org_id=...)` 认领（`_COMMON.md §3.4`）。
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { getOrg, listMyOrgs, type OrgSummary } from "../lib/org-api";
import { formatMinor } from "../lib/money";
import {
  PAYER_LAST_KEY,
  PERSONAL_PAYER,
  persistPayerOrgId,
  persistedPayerOrgId,
} from "../lib/payer";
import { IconChevronDown } from "./icons";
import { useUI } from "../i18n/ui/useUI";
import { useToast } from "../ui/Toast";

export { PAYER_LAST_KEY, PERSONAL_PAYER };

export interface PayerSelectorProps {
  /** 当前付费主体的 `org_id`；空串 = 个人钱包。 */
  value: string;
  /** 用户改选、或组织失效被强制回落时触发。参数即要随请求发出的 `org_id`。 */
  onChange: (orgId: string) => void;
  className?: string;
}

/**
 * 受控组件。只有一个选项（个人）时不渲染任何 DOM。
 *
 * 余额是**附带信息**：读失败就只显示组织名，不显示错误、不挡住选择。
 * 发任务这条路上，「余额查询挂了」绝不能变成「不让发任务」。
 */
export function PayerSelector({ value, onChange, className = "" }: PayerSelectorProps) {
  const tt = useUI();
  const toast = useToast();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [balanceText, setBalanceText] = useState("");
  // 强制回落只提示一次：组织停用后，用户每敲一个字都弹一条 toast 是灾难。
  const warnedRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    listMyOrgs()
      .then((list) => {
        if (cancelled) return;
        setOrgs(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        // 拉不到组织列表 = 当作没有组织，控件不出现，输入框回到今天的样子。
        if (!cancelled) setOrgs([]);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── 记忆与回落 ───────────────────────────────────────────────────────────
  // 两件事在同一个效应里，因为它们判的是同一个东西：`value` 指的那个组织**现在**
  // 还在不在我的活跃组织列表里。`listMyOrgs()` 按契约只返回活跃成员关系
  // （`_COMMON.md §3.3 orgs_of`），所以「组织被停用」与「我被移出组织」在这里
  // 是同一个现象：它不在列表里了。
  useEffect(() => {
    if (!loaded) return; // 列表还没到之前，任何判断都会把合法选择误杀成回落
    const known = new Set(orgs.map((org) => org.id));

    if (value && !known.has(value)) {
      if (warnedRef.current !== value) {
        warnedRef.current = value;
        toast.info(
          tt("已切回个人钱包"),
          tt("之前选的组织已停用，或你已不在该组织里。"),
        );
      }
      persistPayerOrgId(PERSONAL_PAYER);
      onChange(PERSONAL_PAYER);
      return;
    }

    if (!value) {
      const remembered = persistedPayerOrgId();
      if (remembered && known.has(remembered)) onChange(remembered);
      else if (remembered) persistPayerOrgId(PERSONAL_PAYER); // 记的那个已失效，别留着下次再弹
    }
    // `toast` / `tt` 是稳定引用（模块级 store / context），不进依赖表以免每次渲染重跑。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, orgs, value, onChange]);

  // ── 选中组织的余额 ───────────────────────────────────────────────────────
  // 只查当前选中的那一个，不是每个组织都查：这一排是输入框的附属信息，
  // 不值得为它在每次打开首页时打 N 个请求。
  useEffect(() => {
    if (!value) {
      setBalanceText("");
      return;
    }
    let cancelled = false;
    setBalanceText("");
    getOrg(value)
      .then((detail) => {
        if (cancelled || !detail) return;
        setBalanceText(formatMinor(detail.balanceMinor, detail.currency));
      })
      .catch(() => {
        // 契约：余额读失败就不显示余额，且**不显示错误**。
        if (!cancelled) setBalanceText("");
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  const handleChange = useCallback(
    (next: string) => {
      persistPayerOrgId(next);
      onChange(next);
    },
    [onChange],
  );

  // 「只有一个选项」= 只有个人钱包。此人没进过任何组织 → 一个字节都不渲染。
  if (orgs.length === 0) return null;

  const personalLabel = tt("个人钱包");
  const selected = orgs.find((org) => org.id === value) ?? null;

  return (
    <span
      className={`relative inline-flex min-w-0 items-center ${className}`}
      data-payer-selector=""
    >
      <select
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        aria-label={tt("这次谁付钱")}
        title={tt("这次谁付钱")}
        className="max-w-[9.5rem] cursor-pointer appearance-none truncate rounded-lg border border-neutral-200 bg-white py-1 pl-2.5 pr-6 text-[12px] text-neutral-600 transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-700 focus:border-neutral-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300"
      >
        <option value={PERSONAL_PAYER}>{personalLabel}</option>
        {orgs.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-1.5 flex items-center text-neutral-400">
        <IconChevronDown />
      </span>
      {/* 余额跟在控件右边而不是塞进 option 文本里：`<option>` 在各平台上都不让
          排版，塞进去会把组织名挤没；放外面还能在窄屏上单独隐藏（P3）。 */}
      {selected && balanceText && (
        <span className="ml-1.5 hidden shrink-0 text-[11px] tabular-nums text-neutral-400 sm:inline">
          {balanceText}
        </span>
      )}
    </span>
  );
}

export default PayerSelector;
