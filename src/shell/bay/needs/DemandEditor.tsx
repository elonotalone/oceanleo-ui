"use client";

import { useEffect, useMemo, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  DEMAND_DESCRIPTION_MAX_LENGTH,
  DEMAND_TITLE_MAX_LENGTH,
  createDemand,
  parseMoneyInput,
  updateDemand,
  type BayDemandDetail,
  type DemandInput,
} from "../../../lib/bay/demands";
import type { BayWorkRef } from "../../../lib/bay/types";
import { useToast } from "../../../ui/Toast";
import { ensureBayTerms } from "../settings";
import { requireBayLogin, useBayTaskContext } from "../shell/bay-state";
import { pickLibraryWork, LibraryWorkPickerHost } from "./LibraryWorkPicker";
import { defaultNeedCategory, isNeedCategory, useNeedCategories } from "./need-categories";
import { budgetText, siteLabel } from "./need-format";
import { safeHttpLink } from "./need-links";
import { BTN_PRIMARY, BTN_QUIET, BTN_SECONDARY, CategoryChooser, Field, INPUT, PaneNotice, errorText } from "./need-ui";

const DESCRIPTION_MIN_LENGTH = 20;

function splitValues(input: string): string[] {
  return Array.from(new Set(input.split(/[，,\n]/).map((item) => item.trim()).filter(Boolean)));
}

function dateInput(value: string | null | undefined): string {
  if (!value) return "";
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? "" : at.toISOString().slice(0, 10);
}

function yuanInput(fen: number | null | undefined): string {
  return typeof fen === "number" && Number.isFinite(fen) ? String(fen / 100) : "";
}

export interface DemandEditorProps {
  siteKey: string;
  /** 有值 = 编辑这条需求；没有 = 发新需求。 */
  initial?: BayDemandDetail | null;
  /** 深链 `post-need:<category>` 带来的类目。 */
  presetCategory?: string;
  onDone: (demandId: string) => void;
  onCancel?: () => void;
}

export function DemandEditor({ siteKey, initial, presetCategory, onDone, onCancel }: DemandEditorProps) {
  const tt = useUI();
  const toast = useToast();
  const taskContext = useBayTaskContext();
  const { response, categories, loading: categoriesLoading } = useNeedCategories();
  const editing = Boolean(initial?.id);

  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [category, setCategory] = useState(initial?.category || "");
  const [categoryTouched, setCategoryTouched] = useState(Boolean(initial?.category));
  const [skills, setSkills] = useState((initial?.skills || []).join("，"));
  const [budgetMin, setBudgetMin] = useState(yuanInput(initial?.budget_min_fen));
  const [budgetMax, setBudgetMax] = useState(yuanInput(initial?.budget_max_fen));
  const [deadline, setDeadline] = useState(dateInput(initial?.deadline_at));
  const [links, setLinks] = useState((initial?.reference_links || []).join("\n"));
  const [work, setWork] = useState<BayWorkRef | null>(initial?.attached_work ?? null);
  const [workChanged, setWorkChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 类目默认按站预选（门户为空、必须自己选）；用户点过就不再覆盖。
  useEffect(() => {
    if (categoryTouched || !response) return;
    const preset = presetCategory && isNeedCategory(presetCategory, response) ? presetCategory : null;
    setCategory(preset || defaultNeedCategory(siteKey, response) || "");
  }, [categoryTouched, presetCategory, response, siteKey]);

  const minFen = useMemo(() => parseMoneyInput(budgetMin), [budgetMin]);
  const maxFen = useMemo(() => parseMoneyInput(budgetMax), [budgetMax]);
  const budgetError =
    Number.isNaN(minFen) || Number.isNaN(maxFen)
      ? tt("预算要填大于或等于 0 的数字")
      : minFen !== null && maxFen !== null && maxFen < minFen
        ? tt("预算上限不能低于下限")
        : "";

  const validate = (): string => {
    if (!title.trim()) return tt("请先写需求标题");
    if (description.trim().length < DESCRIPTION_MIN_LENGTH) return tt("请把详细说明写到至少 20 个字");
    if (!category || !isNeedCategory(category, response)) return tt("请选择类目");
    if (budgetError) return budgetError;
    const rawLinks = splitValues(links);
    if (rawLinks.some((href) => !safeHttpLink(href))) return tt("参考链接要以 http:// 或 https:// 开头");
    return "";
  };

  const attachWork = (next: BayWorkRef | null) => {
    setWork(next);
    setWorkChanged(true);
  };

  const chooseFromLibrary = async () => {
    const picked = await pickLibraryWork({ title: tt("给需求附一个作品") });
    if (picked) attachWork(picked);
  };

  const submit = async () => {
    if (busy) return;
    const invalid = validate();
    setError(invalid || null);
    if (invalid) return;
    if (!requireBayLogin()) return;
    if (!(await ensureBayTerms("buyer"))) return;
    const input: DemandInput = {
      title: title.trim().slice(0, DEMAND_TITLE_MAX_LENGTH),
      description: description.trim().slice(0, DEMAND_DESCRIPTION_MAX_LENGTH),
      category,
      skills: splitValues(skills),
      budget_min_fen: Number.isNaN(minFen) ? null : minFen,
      budget_max_fen: Number.isNaN(maxFen) ? null : maxFen,
      deadline_at: deadline ? new Date(`${deadline}T23:59:59`).toISOString() : null,
      reference_links: splitValues(links).map((href) => safeHttpLink(href) || "").filter(Boolean),
      status: "open",
    };
    setBusy(true);
    try {
      const ref = work ? { kind: "task" as const, id: work.id } : null;
      const result = editing && initial
        ? await updateDemand(initial.id, input, workChanged ? ref : undefined)
        : await createDemand(input, { postedSite: siteKey, attachedWork: ref });
      toast.success(editing ? tt("需求已更新") : tt("需求已发布"));
      onDone(result.demand?.id || initial?.id || "");
    } catch (reason) {
      setError(errorText(tt, reason, editing ? tt("保存失败，请稍后再试。") : tt("发布失败，请稍后再试。")));
    } finally {
      setBusy(false);
    }
  };

  const currentTaskAttached = Boolean(taskContext && work?.id === taskContext.taskId);

  return (
    <div className="space-y-4" data-bay-demand-editor={editing ? "edit" : "create"}>
      <LibraryWorkPickerHost />
      <Field label={tt("标题")}>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={DEMAND_TITLE_MAX_LENGTH}
          placeholder={tt("例：给新品发布会做一份 15 页的演示稿")}
          className={INPUT}
        />
      </Field>
      <Field label={tt("详细说明")} hint={`${description.length} / ${DEMAND_DESCRIPTION_MAX_LENGTH}`}>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={6}
          maxLength={DEMAND_DESCRIPTION_MAX_LENGTH}
          placeholder={tt("写清交付物、验收标准、已有资料，以及不在范围内的事情")}
          className={`${INPUT} resize-y leading-5`}
        />
      </Field>
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tt("预算下限")}>
          <input value={budgetMin} onChange={(event) => setBudgetMin(event.target.value)} inputMode="decimal" placeholder={tt("面议可留空")} className={INPUT} />
        </Field>
        <Field label={tt("预算上限")}>
          <input value={budgetMax} onChange={(event) => setBudgetMax(event.target.value)} inputMode="decimal" placeholder={tt("面议可留空")} className={INPUT} />
        </Field>
      </div>
      <p className="-mt-2 text-[12px] text-stone-500" data-bay-budget-preview>
        {budgetError || budgetText(tt, Number.isNaN(minFen) ? null : minFen, Number.isNaN(maxFen) ? null : maxFen)}
      </p>
      <Field label={tt("截止日期")} hint={tt("不填就是交期可协商。")}>
        <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} className={INPUT} />
      </Field>
      <Field label={tt("需要的技能")} hint={tt("用逗号分隔，例如：PPT，数据可视化")}>
        <input value={skills} onChange={(event) => setSkills(event.target.value)} className={INPUT} />
      </Field>
      <Field label={tt("参考链接")} hint={tt("每行一个；只有登录的人能看到。")}>
        <textarea value={links} onChange={(event) => setLinks(event.target.value)} rows={2} placeholder="https://" className={`${INPUT} resize-y`} />
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
            <button type="button" className={BTN_QUIET} onClick={() => attachWork(null)}>
              {tt("移除")}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {taskContext ? (
              <button
                type="button"
                className={BTN_SECONDARY}
                data-bay-attach-current-task
                onClick={() => attachWork({ kind: "task", id: taskContext.taskId, site_key: siteKey })}
              >
                {tt("附上当前任务")}
              </button>
            ) : null}
            <button type="button" className={BTN_SECONDARY} onClick={() => void chooseFromLibrary()}>
              {tt("从我的库挑一个")}
            </button>
          </div>
        )}
        <p className="text-[11px] leading-4 text-stone-400">
          {tt("报价的人签约前只能只读预览；签约后可以在作品所在的站一起改。")}
        </p>
      </section>

      {error ? <PaneNotice tone="error">{error}</PaneNotice> : null}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void submit()} data-bay-submit>
          {busy ? tt("正在提交…") : editing ? tt("保存修改") : tt("发布需求")}
        </button>
        {onCancel ? (
          <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={onCancel}>
            {tt("取消")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
