"use client";

// 条款正文的显示。网关下发的正文是带少量 Markdown 记号的纯文本（只有粗体与编号行），
// 这里只拆成文本节点与 <strong>，不经过任何 HTML 解析（契约 §8）。
import { portalHref } from "../../../contracts/domain-family";
import { htmlLang, normalizeLocale, type Locale } from "../../../i18n/config";
import { useUI } from "../../../i18n/ui/useUI";
import { bayTermsAnchor, bayTermsPagePath, type BayTermsDocument } from "../../../lib/bay/terms";

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

/** 只要日期（生效日）。网关给的是 UTC 零点，按 UTC 取日，免得各时区的人看到差一天。 */
export function formatBayTermsDate(value: string | null | undefined, locale: Locale = bayUiLocale()): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(htmlLang(locale), { dateStyle: "long", timeZone: "UTC" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
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

/**
 * 条款正文的两种底色。
 * `app`：站内弹窗、条款门，跟随深浅主题。
 * `paper`：门户法律页——页面永远是白底（`LegalShell` 写死 `bg-white`），而 `dark:` 由
 * `<html class="dark">` 触发，所以这里一个 `dark:` 都不能带，否则暗色主题下白字落在白底上。
 */
export type BayTermsTone = "app" | "paper";

const TONE_CLASS: Readonly<Record<BayTermsTone, { title: string; body: string; strong: string }>> = {
  app: {
    title: "text-sm font-semibold text-neutral-900 dark:text-white",
    body: "mt-1.5 whitespace-pre-wrap text-[13px] leading-6 text-neutral-700 dark:text-neutral-300",
    strong: "font-semibold text-neutral-900 dark:text-white",
  },
  paper: {
    title: "text-[15px] font-semibold text-neutral-900",
    body: "mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-neutral-700",
    strong: "font-semibold text-neutral-900",
  },
};

function TermsBody({ text, tone }: { text: string; tone: BayTermsTone }) {
  const cls = TONE_CLASS[tone];
  return (
    <>
      {bayTermsParagraphs(text).map((paragraph, index) => (
        <p key={index} className={cls.body}>
          {bayTermsRuns(paragraph).map((run, at) =>
            run.bold ? (
              <strong key={at} className={cls.strong}>
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

/**
 * 条款各节：标题 + 正文。条款弹窗、条款门、门户条款页共用。
 * `anchors`：每一节带 `id`（`bayTermsAnchor(key)`），条款页上可以直接链到某一节。
 */
export function BayTermsSections({
  document: terms,
  tone = "app",
  anchors = false,
}: {
  document: BayTermsDocument;
  tone?: BayTermsTone;
  anchors?: boolean;
}) {
  const tt = useUI();
  return (
    <div className="space-y-4">
      {terms.sections.map((section) => (
        <section
          key={section.key}
          id={anchors ? bayTermsAnchor(section.key) : undefined}
          className={anchors ? "scroll-mt-4" : undefined}
          data-bay-terms-section={section.key}
        >
          <h3 className={TONE_CLASS[tone].title}>{tt(section.title_zh)}</h3>
          <TermsBody text={section.body_md} tone={tone} />
        </section>
      ))}
    </div>
  );
}

/** 「在条款页查看全文」：门户 /legal/marketplace 上的 LeoBay 使用规则，新窗口打开。 */
export function BayTermsFullTextLink({ className }: { className?: string }) {
  const tt = useUI();
  return (
    <a
      href={portalHref(bayTermsPagePath())}
      target="_blank"
      rel="noopener noreferrer"
      data-bay-terms-fulltext=""
      className={className ?? "text-xs font-medium text-neutral-700 underline underline-offset-2 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100"}
    >
      {tt("在条款页查看全文")}
    </a>
  );
}
