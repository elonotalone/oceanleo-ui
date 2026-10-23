"use client";

// LeoChat 里的「内容处置」：针对本人内容的案件，能提交反通知（版权、商标、肖像类）或申诉（违法、平台规则类）。
// 平时不在任何常驻导航里：内容被隐藏 / 下架时，平台通知的链接（`/leochat?im=cases[:<案件 id>]`）把人带到这里。
// 2026-10-23 leobay-projects 波 W09：从门户「设置 → 内容处置」整页搬进来（旧地址重定向到 `/leochat?im=cases`）。
// 宽度自适应：整页居中一列，小窗 / 停靠宽度下满铺；`caseId` 指名的那一件直接展开并滚到可见处。
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { OwnerCase } from "../../../lib/moderation/case-model";
import { openSettingsModal } from "../../../pages/settings/settings-tabs";
import { ImBackIcon } from "../messages-surface";
import { CaseCard } from "./CaseCard";
import { failureMessage } from "./case-labels";
import { useOwnerCases } from "./use-owner-cases";

export interface MessagesContentCasesProps {
  /** 打开时直接展开这一件；不给则列出全部。 */
  caseId?: string | null;
  /** 窄屏/小窗里的返回。 */
  onBack?: () => void;
}

export function MessagesContentCases({ caseId = null, onBack }: MessagesContentCasesProps): ReactElement {
  const tt = useUI();
  const { phase, cases, failure, reload, apply } = useOwnerCases();
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set(caseId ? [caseId] : []));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrolledTo = useRef<string | null>(null);
  // 列表是为哪个 caseId 取的（挂载时的那个）；之后换了 caseId 而列表里没有，才值得再取一次。
  const loadedFor = useRef<string | null>(caseId);

  // 深链指向另一件（组件没卸载就换了 caseId）：把它也展开。
  useEffect(() => {
    if (!caseId) return;
    setOpened((prev) => (prev.has(caseId) ? prev : new Set(prev).add(caseId)));
  }, [caseId]);

  // 已经开着的时候又点了一条新通知（案件是列表取过之后才产生的）：静默再取一次，别误报「找不到」。
  useEffect(() => {
    if (phase !== "ready" || !caseId || loadedFor.current === caseId) return;
    if (cases.some((row) => row.id === caseId)) return;
    loadedFor.current = caseId;
    void reload({ quiet: true });
  }, [phase, cases, caseId, reload]);

  // 列表到了：把指名的那一件滚到可见处（每个 id 只滚一次，之后重取不抢用户的滚动位置）。
  useEffect(() => {
    if (phase !== "ready" || !caseId || scrolledTo.current === caseId) return;
    const node = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-case-id]") ?? []).find(
      (item) => item.dataset.caseId === caseId,
    );
    if (!node) return;
    scrolledTo.current = caseId;
    node.scrollIntoView?.({ block: "nearest" });
  }, [phase, cases, caseId]);

  const toggle = useCallback((id: string) => {
    setOpened((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const onDone = useCallback(
    async (updated: OwnerCase | null) => {
      apply(updated);
      await reload({ quiet: true });
    },
    [apply, reload],
  );

  const unknownCase = Boolean(caseId) && phase === "ready" && !cases.some((row) => row.id === caseId);

  return (
    <div
      ref={rootRef}
      data-messages-content-cases=""
      data-phase={phase}
      className="flex h-full min-h-0 flex-1 flex-col text-neutral-900"
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-neutral-200/80 px-2 py-2">
        {onBack ? (
          <button type="button" data-im-chrome-btn data-action="back" onClick={onBack} aria-label={tt("返回")}>
            <ImBackIcon />
          </button>
        ) : null}
        <h2 className="min-w-0 flex-1 truncate px-1 text-[13px] font-semibold tracking-tight">{tt("内容处置")}</h2>
        {phase === "ready" ? (
          <button
            type="button"
            data-action="refresh"
            onClick={() => void reload()}
            className="rounded-lg px-2 py-1 text-[12px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
          >
            {tt("刷新")}
          </button>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 py-4">
          <p className="text-[12.5px] leading-5 text-neutral-500">
            {tt("这里只列出针对你内容的案件。通知里不会出现权利人的邮箱、电话或地址。")}
          </p>
          {phase === "loading" ? (
            <p role="status" data-cases-loading className="py-10 text-center text-[13px] text-neutral-500">
              {tt("加载中…")}
            </p>
          ) : null}
          {phase === "signed-out" ? (
            <div data-cases-signed-out className="py-10 text-center">
              <p className="text-[14px] text-neutral-700">{tt("请先登录")}</p>
              <button
                type="button"
                data-action="sign-in"
                onClick={() => openSettingsModal("account")}
                className="mt-3 rounded-lg bg-neutral-900 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-800"
              >
                {tt("去登录")}
              </button>
            </div>
          ) : null}
          {phase === "error" ? (
            <div data-cases-error className="py-10 text-center">
              <p role="alert" className="text-[13px] text-red-600">
                {failureMessage(tt, failure ?? "other", "list")}
              </p>
              <button
                type="button"
                data-action="retry"
                onClick={() => void reload()}
                className="mt-3 rounded-lg border border-neutral-200 px-4 py-1.5 text-[13px] text-neutral-700 hover:bg-neutral-50"
              >
                {tt("重试")}
              </button>
            </div>
          ) : null}
          {phase === "ready" && unknownCase ? (
            <p
              role="status"
              data-cases-unknown
              className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] leading-5 text-amber-900"
            >
              {tt("找不到这一件处置记录。它可能已被撤销，或不属于当前账号。")}
            </p>
          ) : null}
          {phase === "ready" && cases.length === 0 ? (
            <p
              data-cases-empty
              className="mt-4 rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-[13px] text-neutral-500"
            >
              {tt("没有针对你内容的处置记录")}
            </p>
          ) : null}
          {phase === "ready" && cases.length > 0 ? (
            <ul data-cases-list className="mt-4 space-y-3">
              {cases.map((row) => (
                <li key={row.id}>
                  <CaseCard row={row} open={opened.has(row.id)} onToggle={() => toggle(row.id)} onDone={onDone} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
