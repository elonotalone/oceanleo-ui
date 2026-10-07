"use client";

// 服务向导的各步界面（移植自 talent `ServiceWizardFields.tsx`，外壳不搬）。只吃 props；用户内容一律纯文本。

import type { ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
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
import {
  MIN_DESCRIPTION,
  SUMMARY_MAX,
  TITLE_MAX,
  safeHttpUrl,
  toFen,
  yuanText,
  type DraftAddon,
  type DraftFaq,
  type DraftMedia,
  type DraftTier,
  type PublishCheck,
} from "./editor-model";
import { INPUT_CLASS, SECONDARY_BUTTON, SellerCard, SellerEmpty, SellerField, SellerNotice, TEXTAREA_CLASS } from "./seller-ui";

const OPTION_CLASS = "flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-left";
const OPTION_ON = "border-stone-900 bg-stone-50";
const OPTION_OFF = "border-stone-200 bg-white";

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
            ? tt("「{term}」是执业称谓，没有对应执业资质不能这样写，改成事实性的身份描述。", { term: hint.term })
            : tt("「{term}」需要单独许可才能经营，平台不承接，这项服务会被退回。", { term: hint.term })}
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
}) {
  const tt = useUI();
  return (
    <SellerCard title={tt("选领域")} hint={tt("领域决定买家怎么提问、哪些话不能说。")}>
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
      {domain ? (
        <SellerField label={tt("这个领域下的类目")}>
          <CategorySelect categories={categories} value={category} onChange={onCategory} />
          {categories.length === 0 ? <p className="mt-1 text-[12px] text-amber-700">{tt("这个领域下还没有可选的类目，换一个领域试试。")}</p> : null}
        </SellerField>
      ) : null}
    </SellerCard>
  );
}

export function CategorySelect({ categories, value, onChange }: { categories: BaySellerCategory[]; value: string; onChange: (slug: string) => void }) {
  const tt = useUI();
  return (
    <select className={INPUT_CLASS} value={value} onChange={(event) => onChange(event.target.value)} data-bay-category-select>
      <option value="">{tt("请选择类目")}</option>
      {categories.map((item) => (
        <option key={item.slug} value={item.slug}>
          {tt(item.name_zh)}
        </option>
      ))}
    </select>
  );
}

/** 平台按领域给定的提问方式与声明：只读，卖家不能改写。 */
export function PromptsStep({ domainName, prompts, loading, error, onReload }: { domainName: string; prompts: BayDomainPrompts | null; loading: boolean; error: string; onReload: () => void }) {
  const tt = useUI();
  return (
    <SellerCard title={tt("提问方式")} hint={tt("「{domain}」里买家会被这样引导提问；这些内容由平台统一给定，不能改写。", { domain: domainName })}>
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
    </SellerCard>
  );
}

function ReadOnlyBlock({ label, warn, children }: { label: string; warn?: boolean; children: ReactNode }) {
  const tt = useUI();
  return (
    <section className={`rounded-xl border p-3 ${warn ? "border-rose-200 bg-rose-50" : "border-stone-200 bg-stone-50"}`}>
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
        <input className={INPUT_CLASS} data-bay-field="title" value={title} maxLength={TITLE_MAX} onChange={(event) => onTitle(event.target.value)} placeholder={consult ? tt("例如：讲清个税汇算里常见的三类问题") : tt("例如：为你的产品设计一套可开发的核心界面")} />
        <OverreachHintList text={title} />
      </SellerField>
      {consult ? null : (
        <SellerField label={tt("类目")} hint={tt("类目决定后面要填哪些交付约定")}>
          <CategorySelect categories={categories} value={category} onChange={onCategory} />
        </SellerField>
      )}
      <SellerField label={tt("一句话介绍")} hint={`${summary.length}/${SUMMARY_MAX}`}>
        <textarea className={TEXTAREA_CLASS} data-bay-field="summary" rows={3} maxLength={SUMMARY_MAX} value={summary} onChange={(event) => onSummary(event.target.value)} placeholder={tt("适合谁、解决什么问题、最后拿到什么。")} />
        <OverreachHintList text={summary} />
      </SellerField>
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

export function ModelStep({ models, loading, error, onReload, selected, onSelect }: { models: BayPricingModel[]; loading: boolean; error: string; onReload: () => void; selected: string; onSelect: (key: string) => void }) {
  const tt = useUI();
  return (
    <SellerCard title={tt("计费方式")} hint={tt("从平台给定的几种里选一种，它决定怎么结算、几天自动验收。本平台不抽佣。")}>
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
        <div className="space-y-2" role="radiogroup">
          {models.map((model) => (
            <label key={model.key} className={`${OPTION_CLASS} ${selected === model.key ? OPTION_ON : OPTION_OFF}`}>
              <input type="radio" name="bay-pricing-model" data-bay-model={model.key} className="mt-1" checked={selected === model.key} onChange={() => onSelect(model.key)} />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-stone-900">{tt(model.name_zh)}</span>
                <span className="mt-0.5 block text-[12px] leading-5 text-stone-600">{tt(model.settlement_rule_zh)}</span>
                <span className="mt-0.5 block text-[11.5px] text-stone-500">
                  {model.auto_accept_days_default ? tt("交付后 {n} 天自动验收", { n: model.auto_accept_days_default }) : tt("不自动验收")}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
    </SellerCard>
  );
}

// ---- 交付约定 ---------------------------------------------------------------------

export function FieldsStep({ specs, values, onChange, categoryName }: { specs: BayFieldSpec[]; values: BayFieldValues; onChange: (key: string, value: BayFieldValue) => void; categoryName: string }) {
  const tt = useUI();
  return (
    <SellerCard title={tt("交付约定")} hint={tt("「{category}」要写清这几项；它们会展示给买家，也是有争议时核对的依据。", { category: categoryName || tt("这个类目") })}>
      {specs.length === 0 ? (
        <SellerEmpty>{tt("这个类目没有必填的交付约定，可以直接继续。")}</SellerEmpty>
      ) : (
        <div className="space-y-3">
          {specs.map((spec) => (
            <RequiredField key={spec.key} spec={spec} value={values[spec.key]} onChange={(value) => onChange(spec.key, value)} />
          ))}
        </div>
      )}
    </SellerCard>
  );
}

function RequiredField({ spec, value, onChange }: { spec: BayFieldSpec; value: BayFieldValue | undefined; onChange: (value: BayFieldValue) => void }) {
  const tt = useUI();
  const label = tt(spec.label_zh);
  if (spec.type === "bool") {
    return (
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-stone-200 px-3 py-2.5 text-[13px] text-stone-800">
        <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
        <span>{label}</span>
      </label>
    );
  }
  if (spec.type === "enum") {
    return (
      <SellerField label={label}>
        <select className={INPUT_CLASS} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)}>
          <option value="">{tt("请选择")}</option>
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

const TIER_LABEL: Record<DraftTier["tier"], string> = { basic: "基础档", standard: "标准档", premium: "高级档" };

export function TiersStep({ tiers, onChange, onBasicOnly, free, currency }: { tiers: DraftTier[]; onChange: (index: number, patch: Partial<DraftTier>) => void; onBasicOnly: () => void; free: boolean; currency: string }) {
  const tt = useUI();
  return (
    <SellerCard title={tt("价格与交期")} hint={free ? tt("免费协作：每档价格都是 0。") : tt("最多三档。价格、交付天数、修改次数和包含的内容都会直接展示给买家。")}>
      <div className="flex justify-end">
        <button type="button" onClick={onBasicOnly} className="rounded-lg border border-stone-200 px-3 py-1.5 text-[12px] font-medium text-stone-700">
          {tt("只用一档")}
        </button>
      </div>
      <div className="space-y-3">
        {tiers.map((tier, index) => (
          <article key={tier.tier} data-bay-tier={tier.tier} className={`space-y-3 rounded-xl border p-3 ${tier.enabled ? "border-stone-300 bg-white" : "border-stone-200 bg-stone-50 opacity-70"}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-stone-900">{tt(TIER_LABEL[tier.tier])}</p>
              <label className="flex items-center gap-2 text-[12px] text-stone-600">
                <input type="checkbox" checked={tier.enabled} disabled={index === 0} onChange={(event) => onChange(index, { enabled: event.target.checked })} />
                {tt("启用")}
              </label>
            </div>
            {tier.enabled ? (
              <>
                <SellerField label={tt("档位名")}>
                  <input className={INPUT_CLASS} value={tier.title} maxLength={60} onChange={(event) => onChange(index, { title: event.target.value })} />
                </SellerField>
                <SellerField label={tt("简短说明")}>
                  <input className={INPUT_CLASS} value={tier.description} maxLength={200} onChange={(event) => onChange(index, { description: event.target.value })} />
                </SellerField>
                <div className="flex flex-wrap gap-3">
                  <div className="min-w-[7rem] flex-1">
                    <SellerField label={tt("价格（{currency}）", { currency })}>
                      <input className={INPUT_CLASS} inputMode="decimal" disabled={free} value={yuanText(tier.price_fen)} onChange={(event) => onChange(index, { price_fen: toFen(event.target.value) })} />
                    </SellerField>
                  </div>
                  <div className="min-w-[7rem] flex-1">
                    <SellerField label={tt("交付天数")}>
                      <input className={INPUT_CLASS} inputMode="numeric" value={tier.delivery_days == null ? "" : String(tier.delivery_days)} onChange={(event) => onChange(index, { delivery_days: intOrNull(event.target.value, 1, 365) })} />
                    </SellerField>
                  </div>
                  <div className="min-w-[7rem] flex-1">
                    <SellerField label={tt("修改次数")} hint={tt("-1 表示不限")}>
                      <input className={INPUT_CLASS} inputMode="numeric" value={String(tier.revisions)} onChange={(event) => onChange(index, { revisions: intOrNull(event.target.value, -1, 100) ?? 0 })} />
                    </SellerField>
                  </div>
                </div>
                <SellerField label={tt("包含内容")} hint={tt("每行一项")}>
                  <textarea className={TEXTAREA_CLASS} rows={3} value={tier.features.join("\n")} onChange={(event) => onChange(index, { features: event.target.value.split("\n").slice(0, 20) })} />
                </SellerField>
              </>
            ) : null}
          </article>
        ))}
      </div>
    </SellerCard>
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
}) {
  const tt = useUI();
  return (
    <SellerCard title={tt("价格")} hint={tt("答疑只有两种计价：按次、按小时。本平台不抽佣。")}>
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
        <input className={INPUT_CLASS} data-bay-field="consult-price" inputMode="decimal" value={yuanText(priceFen)} onChange={(event) => onPriceFen(toFen(event.target.value))} />
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
      <SellerField label={tt("多久内回复")} hint={tt("例如：24 小时内")}>
        <input className={INPUT_CLASS} value={responseWindow} maxLength={60} onChange={(event) => onResponseWindow(event.target.value)} />
      </SellerField>
    </SellerCard>
  );
}

// ---- 加购、详情、常见问题、作品图 ------------------------------------------------------

export function AddonsStep({ addons, onChange, onAdd, onRemove, currency }: { addons: DraftAddon[]; onChange: (key: string, patch: Partial<DraftAddon>) => void; onAdd: () => void; onRemove: (key: string) => void; currency: string }) {
  const tt = useUI();
  return (
    <SellerCard title={tt("加购项")} hint={tt("把加急、源文件、多一个版本写成可选项，买家不用反复问价。")}>
      {addons.length === 0 ? <SellerEmpty>{tt("还没有加购项；价格档已经包含全部内容的话可以直接继续。")}</SellerEmpty> : null}
      {addons.map((addon) => (
        <article key={addon.key} className="space-y-3 rounded-xl border border-stone-200 p-3">
          <SellerField label={tt("名称")}>
            <input className={INPUT_CLASS} value={addon.title} maxLength={80} onChange={(event) => onChange(addon.key, { title: event.target.value })} />
          </SellerField>
          <SellerField label={tt("说明")}>
            <input className={INPUT_CLASS} value={addon.description} maxLength={200} onChange={(event) => onChange(addon.key, { description: event.target.value })} />
          </SellerField>
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[7rem] flex-1">
              <SellerField label={tt("加价（{currency}）", { currency })}>
                <input className={INPUT_CLASS} inputMode="decimal" value={yuanText(addon.price_fen)} onChange={(event) => onChange(addon.key, { price_fen: toFen(event.target.value) })} />
              </SellerField>
            </div>
            <div className="min-w-[7rem] flex-1">
              <SellerField label={tt("多加几天")}>
                <input className={INPUT_CLASS} inputMode="numeric" value={String(addon.extra_days)} onChange={(event) => onChange(addon.key, { extra_days: intOrNull(event.target.value, 0, 365) ?? 0 })} />
              </SellerField>
            </div>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={() => onRemove(addon.key)} className="text-[12px] font-medium text-rose-600">
              {tt("移除")}
            </button>
          </div>
        </article>
      ))}
      <button type="button" onClick={onAdd} className={SECONDARY_BUTTON}>
        {tt("添加加购项")}
      </button>
    </SellerCard>
  );
}

export function DetailsStep({ description, onDescription, buyerInputs, onBuyerInputs }: { description: string; onDescription: (value: string) => void; buyerInputs: string; onBuyerInputs: (value: string) => void }) {
  const tt = useUI();
  const length = description.trim().length;
  return (
    <SellerCard title={tt("详情")} hint={tt("写清交付边界、合作方式、不包含什么。上架至少需要 30 个字。")}>
      <SellerField label={tt("服务详情")} hint={<span className={length >= MIN_DESCRIPTION ? "text-emerald-700" : "text-amber-700"}>{tt("{n} 字 / 至少 30 字", { n: length })}</span>}>
        <textarea className={TEXTAREA_CLASS} rows={8} maxLength={20000} value={description} onChange={(event) => onDescription(event.target.value)} />
      </SellerField>
      <SellerField label={tt("开始前需要买家提供什么")} hint={tt("会作为常见问题第一条展示给买家")}>
        <textarea className={TEXTAREA_CLASS} rows={3} maxLength={2000} value={buyerInputs} onChange={(event) => onBuyerInputs(event.target.value)} placeholder={tt("例如：品牌名称与标志、参考案例、使用场景")} />
      </SellerField>
    </SellerCard>
  );
}

export function FaqStep({ items, onChange, onAdd, onRemove }: { items: DraftFaq[]; onChange: (key: string, patch: Partial<DraftFaq>) => void; onAdd: () => void; onRemove: (key: string) => void }) {
  const tt = useUI();
  return (
    <SellerCard title={tt("常见问题")} hint={tt("提前回答交付格式、修改范围、开始条件，少一些下单前的来回。")}>
      {items.length === 0 ? <SellerEmpty>{tt("还没有常见问题，没有要补充的也可以直接继续。")}</SellerEmpty> : null}
      {items.map((item, index) => (
        <article key={item.key} className="space-y-3 rounded-xl border border-stone-200 p-3">
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
    </SellerCard>
  );
}

const MEDIA_KINDS: BayServiceMediaKind[] = ["image", "video", "audio", "file"];
const MEDIA_KIND_LABEL: Record<BayServiceMediaKind, string> = { image: "图片", video: "视频", audio: "音频", file: "文件" };

export function MediaStep({
  items,
  coverUrl,
  onChange,
  onCover,
  onAdd,
  onRemove,
  onMove,
}: {
  items: DraftMedia[];
  coverUrl: string;
  onChange: (key: string, patch: Partial<DraftMedia>) => void;
  onCover: (url: string) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
  onMove: (index: number, direction: -1 | 1) => void;
}) {
  const tt = useUI();
  return (
    <SellerCard title={tt("作品图")} hint={tt("粘贴公开可访问的 https 地址，排好顺序，选一张作为列表里的封面。")}>
      {items.length === 0 ? <SellerEmpty>{tt("还没有作品图。上架前至少放一张。")}</SellerEmpty> : null}
      {items.map((item, index) => {
        const safe = safeHttpUrl(item.url);
        return (
          <article key={item.key} className="space-y-3 rounded-xl border border-stone-200 p-3" data-bay-media={item.kind}>
            <div className="flex h-28 items-center justify-center overflow-hidden rounded-lg bg-stone-100 text-[12px] text-stone-400">
              {item.kind === "image" && safe ? <img src={safe} alt="" className="h-full w-full object-cover" loading="lazy" /> : <span>{safe ? tt(MEDIA_KIND_LABEL[item.kind]) : tt("填好地址后这里会显示预览")}</span>}
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="w-28">
                <SellerField label={tt("类型")}>
                  <select className={INPUT_CLASS} value={item.kind} onChange={(event) => onChange(item.key, { kind: event.target.value as BayServiceMediaKind })}>
                    {MEDIA_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {tt(MEDIA_KIND_LABEL[kind])}
                      </option>
                    ))}
                  </select>
                </SellerField>
              </div>
              <div className="min-w-[10rem] flex-1">
                <SellerField label={tt("地址")}>
                  <input className={INPUT_CLASS} value={item.url} maxLength={1024} placeholder="https://" onChange={(event) => onChange(item.key, { url: event.target.value })} />
                </SellerField>
              </div>
            </div>
            {item.url.trim() && !safe ? <p className="text-[12px] text-rose-600">{tt("地址要以 https:// 开头")}</p> : null}
            <SellerField label={tt("说明")}>
              <input className={INPUT_CLASS} value={item.caption} maxLength={200} onChange={(event) => onChange(item.key, { caption: event.target.value })} />
            </SellerField>
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <label className="flex items-center gap-2 rounded-lg border border-stone-200 px-2.5 py-1.5">
                <input type="radio" name="bay-service-cover" disabled={!safe} checked={Boolean(safe) && coverUrl === item.url} onChange={() => onCover(item.url)} />
                {tt("设为封面")}
              </label>
              <button type="button" disabled={index === 0} onClick={() => onMove(index, -1)} className="rounded-lg border border-stone-200 px-2.5 py-1.5 disabled:opacity-40">
                {tt("上移")}
              </button>
              <button type="button" disabled={index === items.length - 1} onClick={() => onMove(index, 1)} className="rounded-lg border border-stone-200 px-2.5 py-1.5 disabled:opacity-40">
                {tt("下移")}
              </button>
              <button type="button" onClick={() => onRemove(item.key)} className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-rose-600">
                {tt("移除")}
              </button>
            </div>
          </article>
        );
      })}
      <button type="button" onClick={onAdd} className={SECONDARY_BUTTON}>
        {tt("添加作品图")}
      </button>
    </SellerCard>
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
