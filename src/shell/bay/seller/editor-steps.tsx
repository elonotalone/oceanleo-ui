"use client";

// 服务向导的各步界面（移植自 talent `ServiceWizardFields.tsx`，外壳不搬）。只吃 props；用户内容一律纯文本。

import { useEffect, useState, type ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { stripLeoCategoryPrefix } from "../shell/bay-links";
import {
  overreachHints,
  type BayCatalogKind,
  type BayConsultDomain,
  type BayConsultUnit,
  type BayDeliveryMode,
  type BayDomainPrompts,
  type BayFieldSpec,
  type BayFieldValue,
  type BayFieldValues,
  type BayPricingModel,
  type BaySellerCategory,
  type BayServiceMediaKind,
} from "../../../lib/bay/seller";
import { BayChoice, BayImageGallery, BayMenuSelect, BAY_FORM_HELP_CLASS } from "../form";
import { cleanGalleryUrls } from "../form/bay-gallery";
import { isPriceInputText, parsePriceInput } from "../form/bay-price";
import {
  MIN_DESCRIPTION,
  SUMMARY_MAX,
  TITLE_MAX,
  safeHttpUrl,
  yuanText,
  type DraftFaq,
  type DraftMedia,
  type PublishCheck,
} from "./editor-model";
import { DANGER_BUTTON, INPUT_CLASS, SECONDARY_BUTTON, SellerCard, SellerEmpty, SellerField, SellerNotice, TEXTAREA_CLASS } from "./seller-ui";

// 几选一的一项：白底圆角小块；选中的深色边框，没选的浅边框（与 form/BayChoice 同一长相）。
const OPTION_CLASS = "flex cursor-pointer items-start gap-3 rounded-xl border bg-white px-3.5 py-3 text-left transition-colors";
const OPTION_ON = "border-neutral-900 ring-1 ring-neutral-900";
const OPTION_OFF = "border-neutral-200 hover:border-neutral-300";

function StepFrame({ title, hint, plain, children }: { title: string; hint?: string; plain?: boolean; children: ReactNode }) {
  if (plain) return <div className="space-y-4">{children}</div>;
  return (
    <SellerCard title={title} hint={hint}>
      {children}
    </SellerCard>
  );
}

function intOrNull(value: string, min: number, max: number): number | null {
  const digits = value.replace(/[^\d-]/g, "");
  if (!digits.trim()) return null;
  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function linesOf(value: string, limit: number): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

export function OverreachHintList({ text }: { text: string }) {
  const tt = useUI();
  const hints = overreachHints(text);
  if (!hints.length) return null;
  return (
    <ul className="mt-2 space-y-1.5" data-bay-overreach>
      {hints.map((hint) => (
        <li key={`${hint.kind}-${hint.term}`} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-900">
          {hint.kind === "title"
            ? tt("「{term}」是执业称谓，没有对应执业资质不能这样写，改成事实性的身份描述。", { term: tt(hint.term) })
            : tt("「{term}」需要单独许可才能经营，平台不承接，这项服务会被退回。", { term: tt(hint.term) })}
        </li>
      ))}
    </ul>
  );
}

// ---- 做哪种 -----------------------------------------------------------------------

export function KindStep({ selected, locked, onSelect }: { selected: BayCatalogKind | ""; locked: boolean; onSelect: (kind: BayCatalogKind) => void }) {
  const tt = useUI();
  const options: { kind: BayCatalogKind; title: string; detail: string }[] = [
    { kind: "delivery", title: tt("交付一件成品"), detail: tt("设计稿、代码、文案、剪好的片子……按交付清单验收。") },
    { kind: "consult", title: tt("答疑"), detail: tt("回答问题本身就是交付，按约定的轮次或时长验收。") },
  ];
  return (
    <SellerCard title={tt("做哪种")} hint={tt("两种的验收方式不一样，选定后后面的表单会跟着变。")}>
      <div className="space-y-2" role="radiogroup">
        {options.map((option) => {
          const checked = selected === option.kind;
          const disabled = locked && !checked;
          return (
            <label key={option.kind} data-bay-kind={option.kind} className={`${OPTION_CLASS} ${checked ? OPTION_ON : OPTION_OFF} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}>
              <input type="radio" name="bay-kind" className="mt-1" checked={checked} disabled={disabled} onChange={() => onSelect(option.kind)} />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-stone-900">{option.title}</span>
                <span className="mt-0.5 block text-[12px] leading-5 text-stone-500">{option.detail}</span>
              </span>
            </label>
          );
        })}
      </div>
      {locked ? <SellerNotice>{tt("草稿已经建好，形态不能再换；想做另一种，新建一项即可。")}</SellerNotice> : null}
    </SellerCard>
  );
}

// ---- 答疑：领域与类目 ---------------------------------------------------------------

export function DomainStep({
  domains,
  loading,
  error,
  onReload,
  domain,
  onDomain,
  categories,
  category,
  onCategory,
  plain,
  showCategory = true,
}: {
  domains: BayConsultDomain[];
  loading: boolean;
  error: string;
  onReload: () => void;
  domain: string;
  onDomain: (key: string) => void;
  categories: BaySellerCategory[];
  category: string;
  onCategory: (slug: string) => void;
  plain?: boolean;
  showCategory?: boolean;
}) {
  const tt = useUI();
  return (
    <StepFrame title={tt("选领域")} hint={tt("领域决定买家怎么提问、哪些话不能说。")} plain={plain}>
      {loading ? (
        <p className="text-[12.5px] text-stone-500">{tt("正在加载…")}</p>
      ) : domains.length === 0 ? (
        <SellerNotice tone="warn">
          {error ? tt(error) : tt("领域清单暂时取不到。")}{" "}
          <button type="button" onClick={onReload} className="font-medium underline underline-offset-2">
            {tt("重新加载")}
          </button>
        </SellerNotice>
      ) : (
        <div className="space-y-2" role="radiogroup" data-bay-domains>
          {domains.map((item) => (
            <label key={item.key} data-bay-domain={item.key} className={`${OPTION_CLASS} ${domain === item.key ? OPTION_ON : OPTION_OFF}`}>
              <input type="radio" name="bay-domain" data-bay-domain-input={item.key} className="mt-1" checked={domain === item.key} onChange={() => onDomain(item.key)} />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-stone-900">{tt(item.name_zh)}</span>
                {item.summary ? <span className="mt-0.5 block text-[12px] leading-5 text-stone-500">{tt(item.summary)}</span> : null}
              </span>
            </label>
          ))}
        </div>
      )}
      {domain && showCategory ? (
        <SellerField label={tt("这个领域下的类目")}>
          <CategorySelect categories={categories} value={category} onChange={onCategory} />
          {categories.length === 0 ? <p className="mt-1 text-[12px] text-amber-700">{tt("这个领域下还没有可选的类目，换一个领域试试。")}</p> : null}
        </SellerField>
      ) : null}
    </StepFrame>
  );
}

export function CategorySelect({ categories, value, onChange }: { categories: BaySellerCategory[]; value: string; onChange: (slug: string) => void }) {
  const tt = useUI();
  return (
    <BayMenuSelect
      value={value}
      onChange={onChange}
      selectProps={{ "data-bay-category-select": "" }}
      options={categories.map((item) => ({
        value: item.slug,
        label: stripLeoCategoryPrefix(tt(item.name_zh)),
      }))}
    />
  );
}

/** 平台按领域给定的提问方式与声明：只读，卖家不能改写。 */
export function PromptsStep({
  domainName,
  prompts,
  loading,
  error,
  onReload,
  plain,
}: {
  domainName: string;
  prompts: BayDomainPrompts | null;
  loading: boolean;
  error: string;
  onReload: () => void;
  plain?: boolean;
}) {
  const tt = useUI();
  return (
    <StepFrame title={tt("提问方式")} hint={tt("「{domain}」里买家会被这样引导提问；这些内容由平台统一给定，不能改写。", { domain: domainName })} plain={plain}>
      {loading ? (
        <p className="text-[12.5px] text-stone-500">{tt("正在加载…")}</p>
      ) : !prompts ? (
        <SellerNotice tone="warn">
          {error ? tt(error) : tt("这个领域的提问方式还没有下发，可以先继续填写，稍后再回来看。")}{" "}
          <button type="button" onClick={onReload} className="font-medium underline underline-offset-2">
            {tt("重新加载")}
          </button>
        </SellerNotice>
      ) : (
        <div className="space-y-3">
          <ReadOnlyBlock label={tt("买家会被这样引导提问")}>{prompts.ask_placeholder}</ReadOnlyBlock>
          <ReadOnlyBlock label={tt("这个领域里不能做什么")} warn>
            {prompts.forbidden_hint}
          </ReadOnlyBlock>
          <ReadOnlyBlock label={tt("上架后展示给买家的声明")}>{prompts.answer_disclaimer}</ReadOnlyBlock>
        </div>
      )}
    </StepFrame>
  );
}

function ReadOnlyBlock({ label, warn, children }: { label: string; warn?: boolean; children: ReactNode }) {
  const tt = useUI();
  return (
    <section className={warn ? "rounded-xl border border-rose-200 bg-rose-50 p-3" : "space-y-1"}>
      <p className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] font-semibold text-stone-800">
        <span>{label}</span>
        <span className="text-[11px] font-normal text-stone-500">{tt("平台给定 · 不可编辑")}</span>
      </p>
      <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-6 text-stone-700">{children}</p>
    </section>
  );
}

// ---- 它是什么 ---------------------------------------------------------------------

export function BasicsStep({
  kind,
  title,
  onTitle,
  category,
  onCategory,
  categories,
  summary,
  onSummary,
  deliveryMode,
  onDeliveryMode,
  scopeNote,
  onScopeNote,
}: {
  kind: BayCatalogKind;
  title: string;
  onTitle: (value: string) => void;
  category: string;
  onCategory: (slug: string) => void;
  categories: BaySellerCategory[];
  summary: string;
  onSummary: (value: string) => void;
  deliveryMode: BayDeliveryMode;
  onDeliveryMode: (mode: BayDeliveryMode) => void;
  scopeNote: string;
  onScopeNote: (value: string) => void;
}) {
  const tt = useUI();
  const consult = kind === "consult";
  return (
    <SellerCard title={tt("它是什么")} hint={tt("让买家十秒内看懂你交付什么，再谈价格。")}>
      <SellerField label={consult ? tt("答疑标题") : tt("服务标题")} hint={`${title.length}/${TITLE_MAX}`}>
        <input className={INPUT_CLASS} data-bay-field="title" value={title} maxLength={TITLE_MAX} onChange={(event) => onTitle(event.target.value)} />
        <OverreachHintList text={title} />
      </SellerField>
      {consult ? null : (
        <SellerField label={tt("类目")} hint={tt("类目决定后面要填哪些交付约定")}>
          <CategorySelect categories={categories} value={category} onChange={onCategory} />
        </SellerField>
      )}
      {consult ? (
        <SellerField label={tt("能答范围")} hint={tt("哪些问题能答、哪些不在范围内")}>
          <textarea className={TEXTAREA_CLASS} rows={3} maxLength={1000} value={scopeNote} onChange={(event) => onScopeNote(event.target.value)} />
        </SellerField>
      ) : (
        <SellerField label={tt("交付方式")}>
          <div className="space-y-2" role="radiogroup">
            {(["on_platform", "off_platform"] as BayDeliveryMode[]).map((mode) => (
              <label key={mode} className={`${OPTION_CLASS} ${deliveryMode === mode ? OPTION_ON : OPTION_OFF}`}>
                <input type="radio" name="bay-delivery-mode" className="mt-1" checked={deliveryMode === mode} onChange={() => onDeliveryMode(mode)} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-stone-900">{mode === "on_platform" ? tt("在 OceanLeo 里做") : tt("只交付成果")}</span>
                  <span className="mt-0.5 block text-[12px] leading-5 text-stone-500">
                    {mode === "on_platform" ? tt("在共享项目里推进、交付与留痕，按平台规则验收。") : tt("在平台外制作，先交带水印的预览再放款；争议时以平台里那一份为准。")}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </SellerField>
      )}
    </SellerCard>
  );
}

// ---- 计费方式 ---------------------------------------------------------------------

export function ModelStep({
  models,
  loading,
  error,
  onReload,
  selected,
  onSelect,
  plain,
}: {
  models: BayPricingModel[];
  loading: boolean;
  error: string;
  onReload: () => void;
  selected: string;
  onSelect: (key: string) => void;
  plain?: boolean;
}) {
  const tt = useUI();
  const selectedModel = models.find((model) => model.key === selected);
  return (
    <StepFrame title={tt("计费方式")} plain={plain}>
      {loading ? (
        <p className="text-[12.5px] text-stone-500">{tt("正在加载…")}</p>
      ) : models.length === 0 ? (
        <SellerNotice tone="warn">
          {error ? tt(error) : tt("计费方式暂时取不到。")}{" "}
          <button type="button" onClick={onReload} className="font-medium underline underline-offset-2">
            {tt("重新加载")}
          </button>
        </SellerNotice>
      ) : (
        <div className="space-y-2">
          <BayChoice
            label={tt("计费方式")}
            columns={1}
            collapsible
            value={selected}
            onChange={onSelect}
            optionProps={(key) => ({ "data-bay-model": key })}
            options={models.map((model) => ({
              value: model.key,
              title: tt(model.name_zh),
            }))}
          />
          {selectedModel ? (
            <p data-bay-model-rule={selectedModel.key} className={BAY_FORM_HELP_CLASS}>
              {tt(selectedModel.settlement_rule_zh)}
            </p>
          ) : null}
        </div>
      )}
    </StepFrame>
  );
}

// ---- 交付约定 ---------------------------------------------------------------------

export function FieldsStep({
  specs,
  values,
  onChange,
  categoryName,
  plain,
}: {
  specs: BayFieldSpec[];
  values: BayFieldValues;
  onChange: (key: string, value: BayFieldValue) => void;
  categoryName: string;
  plain?: boolean;
}) {
  const tt = useUI();
  return (
    <StepFrame title={tt("交付约定")} hint={tt("「{category}」要写清这几项；它们会展示给买家，也是有争议时核对的依据。", { category: categoryName || tt("这个类目") })} plain={plain}>
      {specs.length === 0 ? (
        <SellerEmpty>{tt("这个类目没有必填的交付约定，可以直接继续。")}</SellerEmpty>
      ) : (
        <div className="space-y-3">
          {specs.map((spec) => (
            <RequiredField key={spec.key} spec={spec} value={values[spec.key]} onChange={(value) => onChange(spec.key, value)} />
          ))}
        </div>
      )}
    </StepFrame>
  );
}

export function RequiredField({ spec, value, onChange }: { spec: BayFieldSpec; value: BayFieldValue | undefined; onChange: (value: BayFieldValue) => void }) {
  const tt = useUI();
  const label = tt(spec.label_zh);
  if (spec.type === "bool") {
    return (
      <label className="flex cursor-pointer items-center gap-3 py-2 text-[13px] text-stone-800">
        <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
        <span>{label}</span>
      </label>
    );
  }
  if (spec.type === "enum") {
    return (
      <SellerField label={label}>
        <select className={INPUT_CLASS} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)}>
          <option value=""></option>
          {(spec.enum || []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </SellerField>
    );
  }
  if (spec.type === "int") {
    return (
      <SellerField label={label} hint={spec.max != null ? tt("不超过 {n}", { n: spec.max }) : undefined}>
        <input
          className={INPUT_CLASS}
          inputMode="numeric"
          value={typeof value === "number" ? String(value) : ""}
          onChange={(event) => {
            const parsed = intOrNull(event.target.value, 0, spec.max ?? 1_000_000_000);
            onChange(parsed === null ? "" : parsed);
          }}
        />
      </SellerField>
    );
  }
  if (spec.type === "list") {
    const items = Array.isArray(value) ? value : [];
    return (
      <SellerField label={label} hint={tt("每行一项")}>
        <textarea className={TEXTAREA_CLASS} rows={3} value={items.join("\n")} onChange={(event) => onChange(event.target.value.split("\n").slice(0, spec.max_len || 20))} onBlur={(event) => onChange(linesOf(event.target.value, spec.max_len || 20))} />
      </SellerField>
    );
  }
  return (
    <SellerField label={label}>
      <input className={INPUT_CLASS} value={typeof value === "string" ? value : ""} maxLength={spec.max_len || 200} onChange={(event) => onChange(event.target.value)} />
    </SellerField>
  );
}

// ---- 价格与交期 -------------------------------------------------------------------
// 价格只有一个：想卖不同深度的版本，发布多个帖子即可。价格、交付天数、修改次数在
// 发布表单的价格与条款区里填，这里只放咨询价。

/** 金额输入框：本地保存正在敲的文字，打「12.」「0」这类中间态不会被回写成数字吃掉。 */
function PriceTextInput({
  valueFen,
  onChangeFen,
  disabled,
  ...rest
}: {
  valueFen: number;
  onChangeFen: (fen: number) => void;
  disabled?: boolean;
  "data-bay-field"?: string;
}) {
  const [text, setText] = useState(() => yuanText(valueFen));
  useEffect(() => {
    const parsed = parsePriceInput(text);
    if (parsed === "partial") return;
    if ((parsed ?? 0) === valueFen) return;
    setText(yuanText(valueFen));
    // 只跟外部金额：本地正在打小数点或清空时不要被格式化掉。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueFen]);
  return (
    <input
      {...rest}
      className={INPUT_CLASS}
      inputMode="decimal"
      disabled={disabled}
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        if (!isPriceInputText(next)) return;
        setText(next);
        const parsed = parsePriceInput(next);
        if (parsed === "partial") return;
        onChangeFen(parsed ?? 0);
      }}
    />
  );
}

export function ConsultPricingStep({
  unit,
  onUnit,
  priceFen,
  onPriceFen,
  rounds,
  onRounds,
  minutes,
  onMinutes,
  responseWindow,
  onResponseWindow,
  currency,
  plain,
  includeTerms = true,
}: {
  currency: string;
  unit: BayConsultUnit;
  onUnit: (unit: BayConsultUnit) => void;
  priceFen: number;
  onPriceFen: (fen: number) => void;
  rounds: number | null;
  onRounds: (value: number | null) => void;
  minutes: number | null;
  onMinutes: (value: number | null) => void;
  responseWindow: string;
  onResponseWindow: (value: string) => void;
  plain?: boolean;
  includeTerms?: boolean;
}) {
  const tt = useUI();
  return (
    <StepFrame title={tt("价格")} plain={plain}>
      <div className="space-y-2" role="radiogroup">
        {(["session", "hour"] as BayConsultUnit[]).map((value) => (
          <label key={value} className={`${OPTION_CLASS} ${unit === value ? OPTION_ON : OPTION_OFF}`}>
            <input type="radio" name="bay-consult-unit" className="mt-1" checked={unit === value} onChange={() => onUnit(value)} />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-stone-900">{value === "session" ? tt("按次") : tt("按小时")}</span>
              <span className="mt-0.5 block text-[12px] leading-5 text-stone-500">
                {value === "session" ? tt("一次包含约定的问答轮次，用完即完成。") : tt("按记录的时长结算，有争议时按已发生的时长分。")}
              </span>
            </span>
          </label>
        ))}
      </div>
      <SellerField label={unit === "session" ? tt("每次价格（{currency}）", { currency }) : tt("每小时价格（{currency}）", { currency })}>
        <PriceTextInput data-bay-field="consult-price" valueFen={priceFen} onChangeFen={onPriceFen} />
      </SellerField>
      {includeTerms ? (
        <>
          {unit === "session" ? (
            <SellerField label={tt("一次包含几轮问答")}>
              <input className={INPUT_CLASS} data-bay-field="consult-rounds" inputMode="numeric" value={rounds == null ? "" : String(rounds)} onChange={(event) => onRounds(intOrNull(event.target.value, 1, 50))} />
            </SellerField>
          ) : (
            <SellerField label={tt("一小时按多少分钟计")}>
              <input className={INPUT_CLASS} data-bay-field="consult-minutes" inputMode="numeric" value={minutes == null ? "" : String(minutes)} onChange={(event) => onMinutes(intOrNull(event.target.value, 5, 600))} />
            </SellerField>
          )}
          <SellerField label={tt("多久内回复")}>
            <input className={INPUT_CLASS} data-bay-field="consult-window" value={responseWindow} maxLength={60} onChange={(event) => onResponseWindow(event.target.value)} />
          </SellerField>
        </>
      ) : null}
    </StepFrame>
  );
}

export function ConsultTermsFields({
  scopeNote,
  onScopeNote,
  unit,
  rounds,
  onRounds,
  minutes,
  onMinutes,
  responseWindow,
  onResponseWindow,
}: {
  scopeNote: string;
  onScopeNote: (value: string) => void;
  unit: BayConsultUnit;
  rounds: number | null;
  onRounds: (value: number | null) => void;
  minutes: number | null;
  onMinutes: (value: number | null) => void;
  responseWindow: string;
  onResponseWindow: (value: string) => void;
}) {
  const tt = useUI();
  return (
    <div className="space-y-4">
      <SellerField label={tt("能答范围")}>
        <textarea className={TEXTAREA_CLASS} data-bay-field="scope" rows={3} maxLength={1000} value={scopeNote} onChange={(event) => onScopeNote(event.target.value)} />
      </SellerField>
      {unit === "session" ? (
        <SellerField label={tt("一次包含几轮问答")}>
          <input className={INPUT_CLASS} data-bay-field="consult-rounds" inputMode="numeric" value={rounds == null ? "" : String(rounds)} onChange={(event) => onRounds(intOrNull(event.target.value, 1, 50))} />
        </SellerField>
      ) : (
        <SellerField label={tt("一小时按多少分钟计")}>
          <input className={INPUT_CLASS} data-bay-field="consult-minutes" inputMode="numeric" value={minutes == null ? "" : String(minutes)} onChange={(event) => onMinutes(intOrNull(event.target.value, 5, 600))} />
        </SellerField>
      )}
      <SellerField label={tt("最长响应时间")}>
        <input className={INPUT_CLASS} data-bay-field="consult-window" value={responseWindow} maxLength={60} onChange={(event) => onResponseWindow(event.target.value)} />
      </SellerField>
    </div>
  );
}

// ---- 详情、常见问题、作品图 ------------------------------------------------------

export function DetailsStep({
  description,
  onDescription,
  plain,
  minChars = MIN_DESCRIPTION,
}: {
  description: string;
  onDescription: (value: string) => void;
  plain?: boolean;
  minChars?: number;
}) {
  const tt = useUI();
  const length = description.trim().length;
  return (
    <StepFrame title={tt("详细介绍")} hint={minChars > 0 ? tt("写清交付边界、合作方式、不包含什么。上架至少需要 30 个字。") : tt("写清交付边界、合作方式、不包含什么。")} plain={plain}>
      <SellerField
        label={tt("详细介绍")}
        hint={minChars > 0 ? <span className={length >= minChars ? "text-emerald-700" : "text-amber-700"}>{tt("{n} 字 / 至少 30 字", { n: length })}</span> : undefined}
      >
        <textarea className={TEXTAREA_CLASS} data-bay-field="description" rows={8} maxLength={20000} value={description} onChange={(event) => onDescription(event.target.value)} />
      </SellerField>
    </StepFrame>
  );
}

export function FaqStep({
  items,
  onChange,
  onAdd,
  onRemove,
  plain,
}: {
  items: DraftFaq[];
  onChange: (key: string, patch: Partial<DraftFaq>) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
  plain?: boolean;
}) {
  const tt = useUI();
  return (
    <StepFrame title={tt("常见问题")} hint={tt("提前回答交付格式、修改范围、开始条件，少一些下单前的来回。")} plain={plain}>
      {items.length === 0 ? <SellerEmpty>{tt("还没有常见问题，没有要补充的也可以直接继续。")}</SellerEmpty> : null}
      {items.map((item, index) => (
        <article key={item.key} className="space-y-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12.5px] font-semibold text-stone-800">{tt("问题 {n}", { n: index + 1 })}</p>
            <button type="button" onClick={() => onRemove(item.key)} className="text-[12px] font-medium text-rose-600">
              {tt("移除")}
            </button>
          </div>
          <SellerField label={tt("问题")}>
            <input className={INPUT_CLASS} value={item.question} maxLength={200} onChange={(event) => onChange(item.key, { question: event.target.value })} />
          </SellerField>
          <SellerField label={tt("回答")}>
            <textarea className={TEXTAREA_CLASS} rows={3} maxLength={2000} value={item.answer} onChange={(event) => onChange(item.key, { answer: event.target.value })} />
          </SellerField>
        </article>
      ))}
      <button type="button" onClick={onAdd} className={SECONDARY_BUTTON}>
        {tt("添加问题")}
      </button>
    </StepFrame>
  );
}

const MEDIA_KINDS: BayServiceMediaKind[] = ["image", "video", "audio", "file"];
const MEDIA_KIND_LABEL: Record<BayServiceMediaKind, string> = { image: "图片", video: "视频", audio: "音频", file: "文件" };

export function MediaStep({
  items,
  coverUrl,
  onChange,
  onCover,
  onUrls,
  onAdd,
  onRemove,
  onMove,
  plain,
  imagesOnly,
}: {
  items: DraftMedia[];
  coverUrl: string;
  onChange: (key: string, patch: Partial<DraftMedia>) => void;
  onCover: (url: string) => void;
  onUrls?: (urls: string[]) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  plain?: boolean;
  imagesOnly?: boolean;
}) {
  const tt = useUI();
  if (imagesOnly) {
    const urls = cleanGalleryUrls(
      items.filter((item) => item.kind === "image").map((item) => item.url),
      coverUrl,
    );
    return (
      <BayImageGallery
        urls={urls}
        onUrls={(next) => {
          if (onUrls) onUrls(next);
          else onCover(next[0] || "");
        }}
      />
    );
  }
  const kinds = MEDIA_KINDS;
  return (
    <StepFrame title={tt("作品图")} hint={tt("粘贴公开可访问的 https 地址，排好顺序，选一张作为列表里的封面。")} plain={plain}>
      {items.length === 0 ? <SellerEmpty>{tt("还没有作品图。上架前至少放一张。")}</SellerEmpty> : null}
      {items.map((item, index) => {
        const safe = safeHttpUrl(item.url);
        return (
          <article key={item.key} className="space-y-3 py-2" data-bay-media={item.kind}>
            <div className="flex h-28 items-center justify-center overflow-hidden rounded-lg bg-stone-100 text-[12px] text-stone-600">
              {item.kind === "image" && safe ? <img src={safe} alt="" className="h-full w-full object-cover" loading="lazy" /> : <span>{safe ? tt(MEDIA_KIND_LABEL[item.kind]) : tt("填好地址后这里会显示预览")}</span>}
            </div>
            <div className="flex flex-wrap gap-3">
              {imagesOnly ? null : (
                <div className="w-28">
                  <SellerField label={tt("类型")}>
                    <select className={INPUT_CLASS} value={item.kind} onChange={(event) => onChange(item.key, { kind: event.target.value as BayServiceMediaKind })}>
                      {kinds.map((kind) => (
                        <option key={kind} value={kind}>
                          {tt(MEDIA_KIND_LABEL[kind])}
                        </option>
                      ))}
                    </select>
                  </SellerField>
                </div>
              )}
              <div className="min-w-[10rem] flex-1">
                <SellerField label={tt("地址")}>
                  <input className={INPUT_CLASS} value={item.url} maxLength={1024} onChange={(event) => onChange(item.key, { url: event.target.value })} />
                </SellerField>
              </div>
            </div>
            {item.url.trim() && !safe ? <p className="text-[12px] text-rose-600">{tt("地址要以 https:// 开头")}</p> : null}
            <SellerField label={tt("说明")}>
              <input className={INPUT_CLASS} value={item.caption} maxLength={200} onChange={(event) => onChange(item.key, { caption: event.target.value })} />
            </SellerField>
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <label className="flex items-center gap-2 rounded-full border border-neutral-900 bg-white px-4 py-2">
                <input type="radio" name="bay-service-cover" disabled={!safe} checked={Boolean(safe) && coverUrl === item.url} onChange={() => onCover(item.url)} />
                {tt("设为封面")}
              </label>
              <button type="button" disabled={index === 0} onClick={() => onMove(index, -1)} className={SECONDARY_BUTTON}>
                {tt("上移")}
              </button>
              <button type="button" disabled={index === items.length - 1} onClick={() => onMove(index, 1)} className={SECONDARY_BUTTON}>
                {tt("下移")}
              </button>
              <button type="button" onClick={() => onRemove(item.key)} className={DANGER_BUTTON}>
                {tt("移除")}
              </button>
            </div>
          </article>
        );
      })}
      <button type="button" onClick={onAdd} className={SECONDARY_BUTTON}>
        {tt("添加作品图")}
      </button>
    </StepFrame>
  );
}

// ---- 预览与上架 -------------------------------------------------------------------

export function PublishChecklist({ checks }: { checks: PublishCheck[] }) {
  const tt = useUI();
  return (
    <ul className="space-y-1.5" data-bay-checks>
      {checks.map((check) => (
        <li key={check.key} data-bay-check={check.key} data-done={check.done ? "1" : "0"} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px] ${check.done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          <span aria-hidden="true">{check.done ? "✓" : "○"}</span>
          <span>{tt(check.label, check.vars)}</span>
        </li>
      ))}
    </ul>
  );
}
