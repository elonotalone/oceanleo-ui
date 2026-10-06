"use client";

// supply 各窗格共用的小部件：加载/出错、收藏、举报、卖家卡、交付记录、评价列表。
// 用户内容一律纯文本；图片只认 http(s)。

import { useState, type ReactNode } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import type { UITranslate } from "../../../i18n/ui/useUI";
import { profileDisplayName, type BayPublicProfile, type BayReview } from "../../../lib/bay/directory";
import { isBayFavorite, toggleBayFavorite, type BayFavoriteKind } from "../../../lib/bay/favorites";
import { getBayReputation, practiceTitleFor, reputationHighlights, selfDescribedRoleOf, verifiedPracticeTitles } from "../../../lib/bay/reputation";
import { BAY_REPORT_REASONS, type BayReportReason } from "../../../lib/bay/services";
import { openBay, requireBayLogin } from "../shell/bay-state";
import { initialOf, ratingShort, responseTimeText, safeHttpUrl } from "./format";
import { errorText, useBayResource } from "./use-bay-resource";

export function PaneLoading() {
  return (
    <div data-bay-loading className="space-y-3 p-4" aria-busy="true">
      <div className="h-40 animate-pulse rounded-xl bg-neutral-100" />
      <div className="h-5 w-2/3 animate-pulse rounded bg-neutral-100" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-neutral-100" />
    </div>
  );
}

export function PaneMessage({ text, onRetry }: { text: string; onRetry?: () => void }) {
  const tt = useUI();
  return (
    <div data-bay-pane-message className="px-4 py-12 text-center">
      <p className="text-[14px] font-medium text-neutral-800">{text}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-4 rounded-lg border border-neutral-200 px-3 py-1.5 text-[13px] text-neutral-700 hover:bg-neutral-50">
          {tt("重试")}
        </button>
      ) : null}
    </div>
  );
}

export function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="mt-5">
      <h3 className="text-[14px] font-semibold text-neutral-900">{title}</h3>
      {hint ? <p className="mt-0.5 text-[12px] text-neutral-500">{hint}</p> : null}
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function Avatar({ url, name, size = "md" }: { url: string | null | undefined; name: string; size?: "sm" | "md" | "lg" }) {
  const safe = safeHttpUrl(url);
  const box = size === "lg" ? "h-16 w-16 text-xl" : size === "sm" ? "h-6 w-6 text-[11px]" : "h-10 w-10 text-[14px]";
  return safe ? (
    <img src={safe} alt="" className={`${box} shrink-0 rounded-full object-cover`} />
  ) : (
    <span className={`${box} grid shrink-0 place-items-center rounded-full bg-neutral-100 font-semibold text-neutral-500`}>{initialOf(name)}</span>
  );
}

export function FavoriteButton({ kind, refId }: { kind: BayFavoriteKind; refId: string }) {
  const tt = useUI();
  const initial = useBayResource(`fav:${kind}:${refId}`, () => isBayFavorite(kind, refId));
  const [local, setLocal] = useState<{ ref: string; value: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const favorite = local && local.ref === refId ? local.value : Boolean(initial.data);

  async function toggle() {
    if (busy || !requireBayLogin()) return;
    setBusy(true);
    setError("");
    try {
      setLocal({ ref: refId, value: await toggleBayFavorite(kind, refId, favorite) });
    } catch (err) {
      setError(errorText(err) || tt("收藏没成功，请稍后再试。"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        data-bay-favorite={favorite ? "on" : "off"}
        aria-pressed={favorite}
        disabled={busy}
        onClick={() => void toggle()}
        className={
          "rounded-lg border px-3 py-1.5 text-[13px] disabled:opacity-60 " +
          (favorite ? "border-rose-200 bg-rose-50 text-rose-700" : "border-neutral-200 text-neutral-700 hover:bg-neutral-50")
        }
      >
        {favorite ? tt("已收藏") : tt("收藏")}
      </button>
      {error ? <span className="mt-1 text-[12px] text-rose-600">{tt(error)}</span> : null}
    </span>
  );
}

function reasonLabel(tt: UITranslate, reason: BayReportReason): string {
  switch (reason) {
    case "fake":
      return tt("虚假信息或夸大宣传");
    case "harassment":
      return tt("骚扰、辱骂或歧视");
    case "offsite":
      return tt("要求站外交易或预付款");
    case "plagiarism":
      return tt("抄袭、盗用他人作品");
    case "fraud":
      return tt("涉嫌欺诈");
    default:
      return tt("其他");
  }
}

/** 举报：选原因、可补充说明、提交。提交要登录。 */
export function ReportBox({ onSubmit, label }: { onSubmit: (reason: BayReportReason, detail: string) => Promise<unknown>; label?: string }) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<BayReportReason>("fake");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  if (done) return <p data-bay-report-done className="text-[12px] text-neutral-500">{tt("我们收到了你的举报")}</p>;
  if (!open) {
    return (
      <button
        type="button"
        data-bay-report
        onClick={() => {
          if (requireBayLogin()) setOpen(true);
        }}
        className="text-[12px] text-neutral-500 hover:text-neutral-800 hover:underline"
      >
        {label || tt("举报")}
      </button>
    );
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(reason, detail.trim());
      setDone(true);
    } catch (err) {
      setError(errorText(err) || tt("举报没提交成功，请稍后再试。"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-bay-report-form className="w-full rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-[13px]">
      <label className="block text-[12px] font-medium text-neutral-700">
        {tt("举报原因")}
        <select value={reason} onChange={(event) => setReason(event.target.value as BayReportReason)} className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-[13px]">
          {BAY_REPORT_REASONS.map((value) => (
            <option key={value} value={value}>
              {reasonLabel(tt, value)}
            </option>
          ))}
        </select>
      </label>
      <textarea
        value={detail}
        maxLength={2000}
        rows={3}
        onChange={(event) => setDetail(event.target.value)}
        placeholder={tt("补充说明（可选）")}
        className="mt-2 w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-[13px]"
      />
      {error ? <p className="mt-1 text-[12px] text-rose-600">{tt(error)}</p> : null}
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={busy} onClick={() => void submit()} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] text-white disabled:opacity-60">
          {tt("提交举报")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-700">
          {tt("取消")}
        </button>
      </div>
    </div>
  );
}

/** 交付记录为主、评分为辅；样本不足显示「样本不足」，不渲染成 0。 */
export function ReputationGrid({ handle }: { handle: string }) {
  const tt = useUI();
  const stats = useBayResource(handle ? `rep:${handle}` : null, () => getBayReputation(handle));
  const rows = reputationHighlights(tt, stats.data);
  return (
    <dl data-bay-reputation className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {rows.map((row) => (
        <div key={row.key} className="rounded-lg bg-neutral-50 px-2.5 py-2">
          <dt className="text-[11px] text-neutral-500">{row.label}</dt>
          <dd className="mt-0.5 text-[13px] font-semibold text-neutral-900">{stats.loading ? "…" : row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 执业称谓只在核验通过时出现；否则只显示自述职业，并标明是自述。 */
export function PracticeLine({ source, domain }: { source: unknown; domain?: string | null }) {
  const tt = useUI();
  const titles = domain ? [practiceTitleFor(tt, source, domain)].filter((title): title is string => Boolean(title)) : verifiedPracticeTitles(tt, source);
  const role = selfDescribedRoleOf(source);
  if (!titles.length && !role) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {titles.map((title) => (
        <span key={title} className="rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">
          {title}
        </span>
      ))}
      {!titles.length && role ? <span className="text-[12px] text-neutral-500">{tt("自述：{role}", { role })}</span> : null}
    </span>
  );
}

export function SellerCard({ seller }: { seller: BayPublicProfile }) {
  const tt = useUI();
  const name = profileDisplayName(seller);
  return (
    <section data-bay-seller-card className="rounded-xl border border-neutral-200 p-3">
      <div className="flex items-start gap-3">
        <Avatar url={seller.avatar_url} name={name} />
        <div className="min-w-0 flex-1">
          {seller.handle ? (
            <button type="button" data-bay-seller onClick={() => openBay({ kind: "profile", handle: seller.handle })} className="truncate text-[14px] font-semibold text-neutral-900 hover:underline">
              {name}
            </button>
          ) : (
            <p className="truncate text-[14px] font-semibold text-neutral-900">{name}</p>
          )}
          <div className="mt-1">
            <PracticeLine source={seller} />
          </div>
        </div>
      </div>
      <p className="mt-2 break-words text-[12.5px] text-neutral-600">{seller.headline || tt("卖家暂未填写简介。")}</p>
      {seller.handle ? (
        <div className="mt-3">
          <ReputationGrid handle={seller.handle} />
        </div>
      ) : null}
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-neutral-500">
        <span>{ratingShort(tt, seller.rating_avg, seller.rating_count)}</span>
        <span>{responseTimeText(tt, seller.response_minutes)}</span>
        {(seller.languages || []).map((language) => (
          <span key={language}>{language}</span>
        ))}
      </p>
    </section>
  );
}

export function ReviewList({ reviews, empty }: { reviews: BayReview[]; empty: string }) {
  const tt = useUI();
  if (!reviews.length) return <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-center text-[12px] text-neutral-500">{empty}</p>;
  return (
    <ul data-bay-reviews className="space-y-2">
      {reviews.map((review) => (
        <li key={review.id} className="rounded-xl border border-neutral-200 p-3">
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className="min-w-0 truncate text-neutral-600">
              {profileDisplayName(review.author) || tt("OceanLeo 用户")}
              {" · "}
              {review.author_role === "buyer" ? tt("买家") : tt("卖家")}
            </span>
            <span className="shrink-0 font-semibold text-neutral-900">★ {Number(review.rating || 0).toFixed(1)}</span>
          </div>
          {review.body ? <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] text-neutral-700">{review.body}</p> : null}
        </li>
      ))}
    </ul>
  );
}
