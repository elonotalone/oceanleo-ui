"use client";

// 条款正文的显示。网关下发的正文是带少量 Markdown 记号的纯文本（只有粗体与编号行），
// 这里只拆成文本节点与 <strong>，不经过任何 HTML 解析（契约 §8）。
import { htmlLang, normalizeLocale, type Locale } from "../../../i18n/config";
import { useUI } from "../../../i18n/ui/useUI";
import type { BayTermsDocument } from "../../../lib/bay/terms";

/** 页面当前语言（读 `<html lang>`）；服务端为简体中文。挂在 body 上的独立弹窗靠它选词典。 */
export function bayUiLocale(): Locale {
  if (typeof document === "undefined") return "zh";
  return normalizeLocale(document.documentElement?.lang);
}

export function formatBayTermsTime(value: string | null | undefined, locale: Locale = bayUiLocale()): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(htmlLang(locale), { dateStyle: "medium", timeStyle: "short" }).format(date);
  } catch {
    return date.toISOString().slice(0, 16).replace("T", " ");
  }
}

export interface BayTermsRun {
  text: string;
  bold: boolean;
}

/** 一行里的 `**粗体**`；落单的 `**` 原样当文字。 */
export function bayTermsRuns(line: string): BayTermsRun[] {
  const parts = line.split("**");
  const paired = parts.length % 2 === 1 ? parts.length : parts.length - 1;
  const runs: BayTermsRun[] = [];
  parts.forEach((text, index) => {
    if (index >= paired) runs.push({ text: `**${text}`, bold: false });
    else if (text) runs.push({ text, bold: index % 2 === 1 });
  });
  return runs;
}

/** 空行分段；段内换行保留。 */
export function bayTermsParagraphs(body: string): string[] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function TermsBody({ text }: { text: string }) {
  return (
    <>
      {bayTermsParagraphs(text).map((paragraph, index) => (
        <p key={index} className="mt-1.5 whitespace-pre-wrap text-[13px] leading-6 text-neutral-700 dark:text-neutral-300">
          {bayTermsRuns(paragraph).map((run, at) =>
            run.bold ? (
              <strong key={at} className="font-semibold text-neutral-900 dark:text-white">
                {run.text}
              </strong>
            ) : (
              <span key={at}>{run.text}</span>
            ),
          )}
        </p>
      ))}
    </>
  );
}

/** 条款各节：标题 + 正文。条款弹窗、条款门、设置里的「规则与条款」共用。 */
export function BayTermsSections({ document: terms }: { document: BayTermsDocument }) {
  const tt = useUI();
  return (
    <div className="space-y-4">
      {terms.sections.map((section) => (
        <section key={section.key} data-bay-terms-section={section.key}>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">{tt(section.title_zh)}</h3>
          <TermsBody text={section.body_md} />
        </section>
      ))}
    </div>
  );
}
