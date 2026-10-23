"use client";

// 条款页（门户 /legal/marketplace）上公开展示的 LeoBay 使用规则（网关当前版本）。
// 谁都能读，不用登录；只讲规则本身：版本号、生效日期、各节（每节带锚点），
// 不讲「你同意过第几版」——那是弹窗里让人重新同意时才说的事。
// 条款正文只有中文（网关不发译文），节标题走词条。
// 取数自带，不借 settings 里别的钩子：这一块要在门户上单独挂，不能被设置页的改动牵连。
import { useEffect, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { bayTermsAnchor, fetchBayTermsCurrent, type BayTermsDocument } from "../../../lib/bay/terms";
import { BayTermsSections, bayUiLocale, formatBayTermsDate } from "./terms-text";

export interface BayTermsPublicProps {
  className?: string;
}

type TermsLoad =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; document: BayTermsDocument };

const LOAD_FAILED = "条款加载失败，请稍后重试";

/** 链接带着 `#bay-terms-<节>` 打开页面时，节是取到数据之后才出现的，浏览器自己滚不到，补一次。 */
function scrollToTermsHash(): void {
  if (typeof window === "undefined") return;
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw.startsWith("bay-terms-")) return;
  let id = raw;
  try {
    id = decodeURIComponent(raw);
  } catch {
    // 地址里的转义不完整就按原样找
  }
  document.getElementById(id)?.scrollIntoView?.({ block: "start" });
}

export function BayTermsPublic({ className }: BayTermsPublicProps): ReactElement {
  const tt = useUI();
  const [state, setState] = useState<TermsLoad>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetchBayTermsCurrent().then((result) => {
      if (cancelled) return;
      setState(
        result.current
          ? { phase: "ready", document: result.current }
          : { phase: "error", message: result.error || LOAD_FAILED },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    if (state.phase === "ready") scrollToTermsHash();
  }, [state.phase]);

  if (state.phase === "loading") {
    return (
      <div className={className} data-bay-terms-public="" data-state="loading">
        <p className="text-[13px] text-neutral-500">{tt("正在加载…")}</p>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className={className} data-bay-terms-public="" data-state="error">
        <p role="alert" className="text-[13px] text-rose-600">
          {tt(state.message)}
        </p>
        <button
          type="button"
          onClick={() => {
            setState({ phase: "loading" });
            setAttempt((value) => value + 1);
          }}
          data-bay-terms-retry=""
          className="mt-2 text-[13px] font-medium text-neutral-800 underline underline-offset-2 hover:text-neutral-950"
        >
          {tt("重试")}
        </button>
      </div>
    );
  }

  const terms = state.document;
  const locale = bayUiLocale();
  return (
    <div className={className} data-bay-terms-public="" data-state="ready" data-bay-terms-version={terms.version}>
      <p className="text-[13px] font-medium text-neutral-800" data-bay-terms-meta="">
        {tt("当前版本 {version}", { version: terms.version })}
        {terms.effective_at
          ? ` · ${tt("生效时间：{time}", { time: formatBayTermsDate(terms.effective_at, locale) })}`
          : ""}
      </p>
      <p className="mt-1 text-[12px] text-neutral-500">{tt("条款正文只有中文；节标题会随界面语言变化。")}</p>
      <nav aria-label={tt("使用条款")} data-bay-terms-toc="" className="mt-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          {terms.sections.map((section) => (
            <li key={section.key}>
              <a href={`#${bayTermsAnchor(section.key)}`} className="text-indigo-600 underline">
                {tt(section.title_zh)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-5">
        <BayTermsSections document={terms} tone="paper" anchors />
      </div>
    </div>
  );
}
