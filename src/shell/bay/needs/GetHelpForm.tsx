"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { HANDOFF_BRIEF_MAX_LENGTH } from "../../../api/talent-handoff";
import {
  DEMAND_DESCRIPTION_MAX_LENGTH,
  createDemand,
  parseMoneyInput,
} from "../../../lib/bay/demands";
import { createBayHandoff } from "../../../lib/bay/handoffs";
import type { BayWorkRef } from "../../../lib/bay/types";
import { Select } from "../../../ui";
import { useToast } from "../../../ui/Toast";
import { ensureBayTerms } from "../settings";
import { openBay, requireBayLogin, useBaySignedIn, useBayTaskContext } from "../shell/bay-state";
import { LibraryWorkPickerHost, pickLibraryWork } from "./LibraryWorkPicker";
import {
  HandoffContextPicker,
  candidatesFromTaskMessages,
  selectedHandoffRefs,
  toggleHandoffPick,
} from "./handoff-context";
import { defaultNeedCategory, isNeedCategory, useNeedCategories } from "./need-categories";
import { siteLabel } from "./need-format";
import { ATTACHED_WORK_BOX, BTN_PRIMARY, BTN_QUIET, BTN_SECONDARY, Field, INPUT, LoginPrompt, PaneNotice, errorText } from "./need-ui";

export type GetHelpMode = "public" | "open" | "invited";

export interface GetHelpFormProps {
  siteKey: string;
  /** 深链带来的类目 */
  presetCategory?: string;
  /** 默认「找谁」：从「找人帮忙」进来 = "public"；从 AI 任务页进来 = "open" */
  defaultMode: GetHelpMode;
}

function demandTitleFromText(text: string): string {
  const first = text.split("\n")[0] ?? "";
  return first.length > 60 ? `${first.slice(0, 60)}…` : first;
}

const MODES: readonly { value: GetHelpMode; name: string; hint: string }[] = [
  { value: "public", name: "公开征集", hint: "所有人可见，别人报价，你来挑" },
  { value: "open", name: "尽快接手", hint: "只给认证过的人看，谁先接就由谁来做" },
  { value: "invited", name: "指定某人", hint: "只有这个人能看到" },
];

export function GetHelpForm(props: GetHelpFormProps) {
  const { siteKey, presetCategory, defaultMode } = props;
  const tt = useUI();
  const ttRef = useRef(tt);
  ttRef.current = tt;
  const toast = useToast();
  const signedIn = useBaySignedIn();
  const task = useBayTaskContext();
  const { response, categories, loading: categoriesLoading } = useNeedCategories();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState("");
  const [categoryTouched, setCategoryTouched] = useState(Boolean(presetCategory));
  const [text, setText] = useState("");
  const [budget, setBudget] = useState("");
  const [mode, setMode] = useState<GetHelpMode>(defaultMode);
  const [handle, setHandle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [more, setMore] = useState(defaultMode === "open" && Boolean(task));
  const [work, setWork] = useState<BayWorkRef | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const limit = mode === "public" ? DEMAND_DESCRIPTION_MAX_LENGTH : HANDOFF_BRIEF_MAX_LENGTH;
  const modeName = tt(MODES.find((row) => row.value === mode)?.name || MODES[0].name);

  useEffect(() => {
    if (categoryTouched || !response) return;
    const preset = presetCategory && isNeedCategory(presetCategory, response) ? presetCategory : null;
    setCategory(preset || defaultNeedCategory(siteKey, response) || "");
  }, [categoryTouched, presetCategory, response, siteKey]);

  useEffect(() => {
    if (defaultMode === "open" && task?.taskId && !work) {
      setWork({ kind: "task", id: task.taskId, site_key: siteKey, title: ttRef.current("当前任务") });
    }
  }, [defaultMode, siteKey, task?.taskId, work]);

  const candidates = useMemo(() => (task?.messages ? candidatesFromTaskMessages(task.messages) : []), [task]);
  const grant = useMemo(() => selectedHandoffRefs(candidates, selected), [candidates, selected]);
  const currentTaskAttached = Boolean(task && work?.id === task.taskId);

  const chooseFromLibrary = async () => {
    const picked = await pickLibraryWork({
      title: mode === "public" ? tt("给需求附一个作品") : tt("给求助附一个作品"),
    });
    if (picked) setWork(picked);
  };

  const submit = async () => {
    if (busy) return;
    if (!requireBayLogin()) return;
    const trimmed = text.trim();
    if (!trimmed) {
      setError(tt("请先写清要做什么"));
      return;
    }
    if (mode === "public" && trimmed.length < 20) {
      setError(tt("公开征集请至少写 20 个字"));
      return;
    }
    if (!category || !isNeedCategory(category, response)) {
      setError(tt("请选择类目"));
      return;
    }
    const fen = parseMoneyInput(budget);
    if (Number.isNaN(fen)) {
      setError(tt("预算要填大于或等于 0 的数字"));
      return;
    }
    if (mode === "invited" && !handle.trim()) {
      setError(tt("请填写要请的那个人的用户名"));
      return;
    }
    setError(null);
    if (!(await ensureBayTerms("buyer"))) return;
    const attachedWork = work ? { kind: "task" as const, id: work.id } : null;
    setBusy(true);
    try {
      if (mode === "public") {
        const result = await createDemand(
          {
            title: demandTitleFromText(trimmed),
            description: trimmed,
            category,
            budget_min_fen: fen,
            budget_max_fen: fen,
            deadline_at: deadline ? new Date(`${deadline}T23:59:59`).toISOString() : null,
            status: "open",
          },
          { postedSite: siteKey, attachedWork },
        );
        toast.success(tt("需求已发布"));
        const id = result.demand?.id;
        if (id) openBay({ kind: "demand", id });
      } else {
        const result = await createBayHandoff({
          originKind: task?.taskId ? "conversation" : "manual",
          originRef: task?.taskId || "",
          category,
          brief: trimmed,
          budgetFen: fen ?? 0,
          mode: mode === "invited" ? "invited" : "open",
          invitedHandle: mode === "invited" ? handle : null,
          context: grant,
          postedSite: siteKey,
          attachedWork,
        });
        toast.success(tt("求助已发出"));
        const id = result.handoff?.id;
        if (id) openBay({ kind: "help", id });
      }
    } catch (reason) {
      setError(errorText(tt, reason, tt("发布失败，请稍后再试。")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-bay-get-help>
      <LibraryWorkPickerHost />
      {!signedIn ? <LoginPrompt message={tt("登录后才能找人帮忙。")} /> : null}

      <Field label={tt("要做什么")} hint={`${text.length} / ${limit}`}>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value.slice(0, limit))}
          rows={4}
          placeholder={tt("例：把这份 15 页的方案做成演示稿，周五前要。")}
          className={`${INPUT} resize-y leading-5`}
          data-bay-help-text
        />
      </Field>

      <Field label={tt("类目")}>
        <div data-bay-help-category>
          {categoriesLoading && categories.length === 0 ? (
            <div className="animate-pulse rounded-xl bg-stone-100 py-5" />
          ) : categories.length === 0 ? (
            <p className="text-[12px] text-amber-700">{tt("类目暂时读不出来，请稍后再试。")}</p>
          ) : (
            <Select
              options={categories.map((row) => ({ id: row.slug, label: row.name_zh || row.slug }))}
              value={category}
              onChange={(slug) => {
                setCategory(slug);
                setCategoryTouched(true);
              }}
            />
          )}
        </div>
      </Field>

      <Field label={tt("预算")}>
        <input
          value={budget}
          onChange={(event) => setBudget(event.target.value)}
          inputMode="decimal"
          placeholder={tt("留空 = 面议")}
          className={INPUT}
          data-bay-help-budget
        />
      </Field>

      <button
        type="button"
        data-bay-help-more
        aria-expanded={more}
        onClick={() => setMore((open) => !open)}
        className="flex w-full items-center justify-between rounded-xl px-1 py-1.5 text-[13px] font-medium text-stone-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:text-stone-900"
      >
        <span>{tt("更多选项")}</span>
        <span className="text-[12px] font-normal text-stone-400">{modeName}</span>
      </button>

      {more ? (
        <div className="space-y-4" data-bay-help-options>
          <div role="radiogroup" className="space-y-1">
            {MODES.map((row) => {
              const checked = mode === row.value;
              return (
                <button
                  key={row.value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  data-bay-help-mode={row.value}
                  onClick={() => setMode(row.value)}
                  className="flex w-full items-start gap-3 rounded-xl px-1 py-1.5 text-left transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-stone-50"
                >
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                      checked ? "border-stone-800" : "border-stone-300"
                    }`}
                  >
                    {checked ? <span className="h-2 w-2 rounded-full bg-stone-800" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-stone-800">{tt(row.name)}</span>
                    <span className="block text-[12px] text-stone-500">{tt(row.hint)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {mode === "invited" ? (
            <input
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              placeholder={tt("对方的用户名（handle）")}
              className={INPUT}
              data-bay-help-handle
            />
          ) : null}
          {mode === "public" ? (
            <Field label={tt("截止日期")} hint={tt("不填就是交期可协商。")}>
              <input
                type="date"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                className={INPUT}
                data-bay-help-deadline
              />
            </Field>
          ) : null}

          <section className="space-y-2" data-bay-attach-work>
            <h3 className="text-[13px] font-medium text-stone-700">{tt("附一个作品")}</h3>
            {work ? (
              <div className={`flex items-center gap-2 ${ATTACHED_WORK_BOX}`}>
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
              <div className="flex flex-wrap gap-2">
                <button type="button" className={BTN_SECONDARY} onClick={() => void chooseFromLibrary()} data-bay-pick-work>
                  {tt("从我的库挑一个")}
                </button>
                {task && !currentTaskAttached ? (
                  <button
                    type="button"
                    className={BTN_SECONDARY}
                    data-bay-attach-current-task
                    onClick={() =>
                      setWork({ kind: "task", id: task.taskId, site_key: siteKey, title: tt("当前任务") })
                    }
                  >
                    {tt("附上当前任务")}
                  </button>
                ) : null}
              </div>
            )}
          </section>

          {task && mode !== "public" ? (
            <section className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[13px] font-medium text-stone-700">{tt("要给对方看的内容")}</h3>
                <span className="text-[12px] text-stone-400">{tt("已选 {n} 条", { n: grant.messages.length + grant.artifacts.length })}</span>
              </div>
              <p className="text-[12px] leading-5 text-stone-500">
                {tt("只有你勾选的内容会给对方看到，之后随时可以撤回。默认一条都不给。")}
              </p>
              <HandoffContextPicker
                items={candidates}
                selected={selected}
                onToggle={(item) => setSelected((current) => toggleHandoffPick(current, item))}
              />
            </section>
          ) : null}
        </div>
      ) : null}

      {error ? <PaneNotice tone="error">{error}</PaneNotice> : null}

      <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void submit()} data-bay-submit>
        {busy ? tt("正在提交…") : tt("发布")}
      </button>
    </div>
  );
}
