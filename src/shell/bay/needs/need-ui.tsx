"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useUI, type UITranslate } from "../../../i18n/ui/useUI";
import { BayApiError } from "../../../lib/bay/http";
import type { BayCategory, BayWorkRef } from "../../../lib/bay/types";
import { requireBayLogin, type BayTarget } from "../shell/bay-state";
import { categoryName } from "./need-categories";
import { siteLabel } from "./need-format";
import { handlingHref, workPreviewHref } from "./need-links";

const MOTION = "transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]";

export const BTN_PRIMARY = `inline-flex items-center justify-center gap-1.5 rounded-xl bg-stone-900 px-3.5 py-2 text-[13px] font-semibold text-white ${MOTION} hover:bg-stone-800 disabled:opacity-50`;
export const BTN_SECONDARY = `inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] font-medium text-stone-700 ${MOTION} hover:bg-stone-50 disabled:opacity-50`;
export const BTN_QUIET = `inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-stone-500 ${MOTION} hover:bg-stone-100 hover:text-stone-700 disabled:opacity-50`;
export const INPUT = `w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] text-stone-700 outline-none ${MOTION} focus:border-stone-400`;
export const CHIP = `rounded-lg border px-2.5 py-1 text-[12px] ${MOTION}`;

/** 后端的中文 `detail.message` 原样过 tt()；没有就用兜底句。 */
export function errorText(tt: UITranslate, error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : "";
  return message ? tt(message) : fallback;
}

export function errorStatus(error: unknown): number {
  return error instanceof BayApiError ? error.status : 0;
}

/** 后端说还没有卖家资料时，把人带到设置里去建。 */
export function isSellerProfileError(error: unknown): boolean {
  const code = error instanceof BayApiError ? String(error.code || "") : "";
  const message = error instanceof Error ? error.message : "";
  return /profile/i.test(code) || /卖家资料/.test(message);
}

/**
 * 窗格正文。返回栏、标题与滚动归 Bay 外壳（契约 §4.4），这里只给内边距；
 * `footer` 贴在外壳滚动容器的底边（sticky），不另起滚动。
 */
export function PaneBody({ children, footer, pane }: { children: ReactNode; footer?: ReactNode; pane: string }) {
  return (
    <section className="flex min-h-full flex-col" data-bay-pane={pane}>
      <div className="flex-1 space-y-4 px-4 py-4">{children}</div>
      {footer ? (
        <footer className="sticky bottom-0 border-t border-stone-100 bg-white px-4 py-3 dark:border-white/10 dark:bg-neutral-900">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}

export function PaneNotice({
  tone = "muted",
  children,
  action,
}: {
  tone?: "muted" | "warn" | "error" | "ok";
  children: ReactNode;
  action?: ReactNode;
}) {
  const palette =
    tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : tone === "error"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : tone === "ok"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-stone-200 bg-stone-50 text-stone-600";
  return (
    <div className={`rounded-xl border px-3 py-2.5 text-[12px] leading-5 ${palette}`}>
      <div>{children}</div>
      {action ? <div className="mt-2 flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

export function PaneLoading() {
  const tt = useUI();
  return (
    <div className="space-y-2" aria-busy="true" aria-label={tt("加载中…")}>
      <div className="h-5 w-2/3 animate-pulse rounded bg-stone-100" />
      <div className="h-16 animate-pulse rounded-xl bg-stone-100" />
      <div className="h-10 animate-pulse rounded-xl bg-stone-100" />
    </div>
  );
}

export function LoginPrompt({ message }: { message: string }) {
  const tt = useUI();
  return (
    <PaneNotice
      action={
        <button type="button" className={BTN_PRIMARY} onClick={() => requireBayLogin()}>
          {tt("登录")}
        </button>
      }
    >
      {message}
    </PaneNotice>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[13px] font-medium text-stone-700">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] leading-4 text-stone-400">{hint}</span> : null}
    </label>
  );
}

export function CategoryChooser({
  categories,
  value,
  onChange,
  loading,
}: {
  categories: BayCategory[];
  value: string;
  onChange: (slug: string) => void;
  loading: boolean;
}) {
  const tt = useUI();
  if (loading && categories.length === 0) {
    return <div className="h-9 animate-pulse rounded-xl bg-stone-100" />;
  }
  if (categories.length === 0) {
    return <p className="text-[12px] text-amber-700">{tt("类目暂时读不出来，请稍后再试。")}</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={tt("类目")}>
      {categories.map((row) => {
        const active = row.slug === value;
        return (
          <button
            key={row.slug}
            type="button"
            role="radio"
            aria-checked={active}
            data-bay-category={row.slug}
            onClick={() => onChange(row.slug)}
            className={`${CHIP} ${active ? "border-stone-800 bg-stone-800 text-white" : "border-stone-200 text-stone-600 hover:bg-stone-50"}`}
          >
            {categoryName(tt, row)}
          </button>
        );
      })}
    </div>
  );
}

/** 附带作品：标题 + 只读预览（在作品所在站打开）；拿不到预览地址就说签约后在哪个站打开。 */
export function AttachedWorkBlock({ work }: { work: BayWorkRef | null | undefined }) {
  const tt = useUI();
  if (!work) return null;
  const site = siteLabel(tt, work.site_key);
  const href = workPreviewHref(work);
  return (
    <div className="rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2.5" data-bay-attached-work>
      <p className="text-[11px] font-medium uppercase tracking-wide text-sky-700">{tt("附带作品")}</p>
      <p className="mt-0.5 truncate text-[13px] font-medium text-stone-800">{work.title || tt("一个作品")}</p>
      <p className="mt-0.5 text-[12px] text-stone-500">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-sky-700 underline underline-offset-2">
            {tt("在 {site} 只读预览", { site })}
          </a>
        ) : (
          tt("签约后可在 {site} 打开", { site })
        )}
      </p>
    </div>
  );
}

/** 「去 LeoXX 处理」：当前就在那个站时不显示。 */
export function HandleOnSiteLink({
  currentSite,
  handlingSite,
  target,
}: {
  currentSite: string;
  handlingSite: string | null | undefined;
  target: BayTarget;
}) {
  const tt = useUI();
  const href = handlingHref(currentSite, handlingSite, target);
  if (!href) return null;
  return (
    <a href={href} className={BTN_SECONDARY} data-bay-handle-on-site={handlingSite || ""}>
      {tt("去 {site} 处理", { site: siteLabel(tt, handlingSite) })}
    </a>
  );
}

export function useNeedLoader<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
): { data: T | null; error: unknown; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    loadRef.current().then(
      (next) => {
        if (!alive) return;
        setData(next);
        setLoading(false);
      },
      (reason: unknown) => {
        if (!alive) return;
        setError(reason);
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { data, error, loading, reload };
}
