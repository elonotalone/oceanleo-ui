"use client";

// 「叫真人」表单：说明、预算、类目按站预选；任务页逐条勾选当前任务内容并自动带上任务；
// 别处从「我的库」挑一个或什么都不带。提交前先过买家条款。不自带返回栏。

import { useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { HANDOFF_BRIEF_MAX_LENGTH, fenFromYuanInput, formatFen, type HandoffMode } from "../../../api/talent-handoff";
import { useLedgerCurrency } from "../../../lib/money";
import type { BayWorkRef } from "../../../lib/bay/types";
import { createBayHandoff } from "../../../lib/bay/handoffs";
import { useToast } from "../../../ui/Toast";
import { ensureBayTerms } from "../settings";
import { openBay, requireBayLogin, useBaySignedIn, useBayTaskContext, type BayPaneProps } from "../shell/bay-state";
import { LibraryWorkPickerHost, pickLibraryWork } from "./LibraryWorkPicker";
import {
  HandoffContextPicker,
  candidatesFromTaskMessages,
  selectedHandoffRefs,
  toggleHandoffPick,
} from "./handoff-context";
import { defaultNeedCategory, isNeedCategory, useNeedCategories } from "./need-categories";
import { siteLabel } from "./need-format";
import { BTN_PRIMARY, BTN_QUIET, BTN_SECONDARY, CategoryChooser, Field, INPUT, LoginPrompt, PaneBody, PaneNotice, errorText } from "./need-ui";

export function CallHumanPane({ target, siteKey }: BayPaneProps) {
  if (target.kind !== "call-human") return null;
  return <CallHumanBody siteKey={siteKey} presetCategory={target.category} />;
}

function CallHumanBody({ siteKey, presetCategory }: { siteKey: string; presetCategory?: string }) {
  const tt = useUI();
  const ttRef = useRef(tt);
  ttRef.current = tt;
  const toast = useToast();
  const ledger = useLedgerCurrency();
  const signedIn = useBaySignedIn();
  const task = useBayTaskContext();
  const { response, categories, loading: categoriesLoading } = useNeedCategories();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState("");
  const [categoryTouched, setCategoryTouched] = useState(Boolean(presetCategory));
  const [brief, setBrief] = useState("");
  const [budgetYuan, setBudgetYuan] = useState("");
  const [mode, setMode] = useState<HandoffMode>("open");
  const [invitedHandle, setInvitedHandle] = useState("");
  const [work, setWork] = useState<BayWorkRef | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (categoryTouched || !response) return;
    const preset = presetCategory && isNeedCategory(presetCategory, response) ? presetCategory : null;
    setCategory(preset || defaultNeedCategory(siteKey, response) || "");
  }, [categoryTouched, presetCategory, response, siteKey]);

  useEffect(() => {
    if (task?.taskId && !work) {
      setWork({ kind: "task", id: task.taskId, site_key: siteKey, title: ttRef.current("当前任务") });
    }
  }, [siteKey, task?.taskId, work]);

  const candidates = useMemo(() => (task?.messages ? candidatesFromTaskMessages(task.messages) : []), [task]);
  const grant = useMemo(() => selectedHandoffRefs(candidates, selected), [candidates, selected]);
  const budgetFen = fenFromYuanInput(budgetYuan);
  const currentTaskAttached = Boolean(task && work?.id === task.taskId);

  const chooseFromLibrary = async () => {
    const picked = await pickLibraryWork({ title: tt("给求助附一个作品") });
    if (picked) setWork(picked);
  };

  const submit = async () => {
    if (busy) return;
    if (!requireBayLogin()) return;
    if (!brief.trim()) {
      setError(tt("请写一句你卡在哪"));
      return;
    }
    if (!category || !isNeedCategory(category, response)) {
      setError(tt("请选择类目"));
      return;
    }
    if (mode === "invited" && !invitedHandle.trim()) {
      setError(tt("请填写要请的那个人的用户名"));
      return;
    }
    setError(null);
    if (!(await ensureBayTerms("buyer"))) return;
    setBusy(true);
    try {
      const result = await createBayHandoff({
        originKind: task?.taskId ? "conversation" : "manual",
        originRef: task?.taskId || "",
        category,
        brief: brief.trim(),
        budgetFen,
        mode,
        invitedHandle: mode === "invited" ? invitedHandle : null,
        context: grant,
        postedSite: siteKey,
        attachedWork: work ? { kind: "task", id: work.id } : null,
      });
      toast.success(tt("求助已发出"));
      const id = result.handoff?.id;
      if (id) openBay({ kind: "help", id });
    } catch (reason) {
      setError(errorText(tt, reason, tt("发起求助失败，请稍后再试。")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PaneBody pane="call-human">
      <LibraryWorkPickerHost />
      {!signedIn ? <LoginPrompt message={tt("登录后才能叫真人。")} /> : null}
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-800">
        {tt("只有你勾选的内容会给对方看到，之后随时可以撤回。默认一条都不给。")}
      </p>

      {task ? (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[13px] font-medium text-stone-700">{tt("要给对方看的内容")}</h3>
            <span className="text-[12px] text-stone-400">{tt("已选 {n} 条", { n: grant.messages.length + grant.artifacts.length })}</span>
          </div>
          <HandoffContextPicker
            items={candidates}
            selected={selected}
            onToggle={(item) => setSelected((current) => toggleHandoffPick(current, item))}
          />
        </section>
      ) : null}

      <Field
        label={tt("类目")}
        hint={!category && !categoriesLoading ? tt("先选一个类目，合适的人才看得到。") : undefined}
      >
        <CategoryChooser
          categories={categories}
          value={category}
          loading={categoriesLoading}
          onChange={(slug) => {
            setCategory(slug);
            setCategoryTouched(true);
          }}
        />
      </Field>

      <Field label={tt("一句话说清你卡在哪")} hint={`${brief.length} / ${HANDOFF_BRIEF_MAX_LENGTH}`}>
        <textarea
          value={brief}
          onChange={(event) => setBrief(event.target.value.slice(0, HANDOFF_BRIEF_MAX_LENGTH))}
          rows={3}
          placeholder={tt("例：这份方案的落地排期我自己判断不了，想请人过一遍。")}
          className={`${INPUT} resize-none`}
          data-bay-handoff-brief
        />
      </Field>

      <Field label={tt("预算")}>
        <div className="flex items-center gap-2">
          <input
            value={budgetYuan}
            onChange={(event) => setBudgetYuan(event.target.value)}
            inputMode="decimal"
            placeholder={tt("留空 = 先谈")}
            className={INPUT}
            data-bay-handoff-budget
          />
          <span className="shrink-0 text-[12px] text-stone-400">
            {budgetFen > 0 ? tt("即 {amount}", { amount: formatFen(budgetFen, ledger) }) : tt("不填就是面议，接手的人可以跟你谈。")}
          </span>
        </div>
      </Field>

      <section className="space-y-2" data-bay-attach-work>
        <h3 className="text-[13px] font-medium text-stone-700">{tt("附一个作品")}</h3>
        {work ? (
          <div className="flex items-center gap-2 rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-stone-800">
                {currentTaskAttached ? tt("当前任务") : work.title || tt("一个作品")}
              </span>
              {work.site_key ? <span className="block text-[11px] text-stone-500">{siteLabel(tt, work.site_key)}</span> : null}
            </span>
            <button type="button" className={BTN_QUIET} onClick={() => setWork(null)}>
              {tt("移除")}
            </button>
          </div>
        ) : (
          <button type="button" className={BTN_SECONDARY} onClick={() => void chooseFromLibrary()} data-bay-pick-work>
            {tt("从我的库挑一个")}
          </button>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-[13px] font-medium text-stone-700">{tt("找谁")}</h3>
        <div className="flex gap-2">
          {(
            [
              ["open", tt("公开求助")],
              ["invited", tt("指定某个人")],
            ] as [HandoffMode, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              data-bay-handoff-mode={value}
              className={`${BTN_SECONDARY} ${mode === value ? "border-stone-800 bg-stone-800 text-white hover:bg-stone-800" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "invited" ? (
          <input
            value={invitedHandle}
            onChange={(event) => setInvitedHandle(event.target.value)}
            placeholder={tt("对方的用户名（handle）")}
            className={INPUT}
            data-bay-handoff-handle
          />
        ) : null}
      </section>

      {error ? <PaneNotice tone="error">{error}</PaneNotice> : null}

      <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void submit()} data-bay-submit>
        {busy ? tt("正在发起…") : tt("请真人接手")}
      </button>
    </PaneBody>
  );
}
