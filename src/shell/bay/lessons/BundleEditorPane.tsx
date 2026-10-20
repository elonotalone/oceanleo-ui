"use client";

// 发布 / 编辑一个套餐：选课、套餐价。本文件归 V3 单元；组件名与 props 是合同，不许改。
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  createBayLessonBundle,
  listMyBayLessonBundles,
  listMyBayLessons,
  publishBayLessonBundle,
  setBayLessonBundleLessons,
  updateBayLessonBundle,
  type BayLessonBundleMine,
  type BayLessonMine,
} from "../../../lib/bay/lessons";
import { BayApiError } from "../../../lib/bay/http";
import { INPUT_CLASS, PRIMARY_BUTTON, SECONDARY_BUTTON, SellerNotice } from "../seller/seller-ui";
import { DEFAULT_CURRENCY, moneyText, yuanText } from "../seller/editor-model";
import { BaySignInPrompt } from "../shell/BayMine";
import { openBay, useBaySignedIn, type BayPaneProps } from "../shell/bay-state";
import { BayImageGallery, BayPublishShell, BayRevealForm, BAY_FORM_BAR_CLASS, BAY_FORM_PAGE_CLASS } from "../form";
import { cleanGalleryUrls } from "../form/bay-gallery";
import {
  bundleProblems,
  bundleTotals,
  emptyBundleDraft,
  parseLessonPriceFen,
  type BundleDraft,
} from "./lesson-editor-model";

function errorText(error: unknown, fallback: string): string {
  return error instanceof BayApiError && error.message ? error.message : fallback;
}

function draftFromBundle(bundle: BayLessonBundleMine): BundleDraft {
  return {
    title: bundle.title || "",
    summary: bundle.summary || "",
    coverUrl: bundle.cover_url || "",
    galleryUrls: cleanGalleryUrls(bundle.gallery_urls, bundle.cover_url),
    price: yuanText(bundle.price_fen || 0),
  };
}

export function BundleEditorPane(props: BayPaneProps): ReactElement | null {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const currency = DEFAULT_CURRENCY;
  const routeId = props.target.kind === "bundle-editor" ? props.target.bundleId || "" : "";
  const [bundle, setBundle] = useState<BayLessonBundleMine | null>(null);
  const [mine, setMine] = useState<BayLessonMine[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<BundleDraft>(emptyBundleDraft);
  const [load, setLoad] = useState({ loading: true, error: "" });
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState<"save" | "publish" | "">("");
  const [showProblems, setShowProblems] = useState(false);

  const applyBundle = useCallback((row: BayLessonBundleMine) => {
    setBundle(row);
    setDraft(draftFromBundle(row));
    setSelectedIds(row.lesson_ids || (row.lessons || []).map((item) => item.id));
  }, []);

  useEffect(() => {
    if (!signedIn || props.target.kind !== "bundle-editor") return;
    let alive = true;
    setLoad({ loading: true, error: "" });
    setActionError("");
    setShowProblems(false);
    void (async () => {
      try {
        const lessonsBody = await listMyBayLessons();
        if (!alive) return;
        setMine(lessonsBody.items || []);
        if (!routeId) {
          setBundle(null);
          setDraft(emptyBundleDraft());
          setSelectedIds([]);
          setLoad({ loading: false, error: "" });
          return;
        }
        const body = await listMyBayLessonBundles();
        if (!alive) return;
        const row = (body.items || []).find((item) => item.id === routeId);
        if (!row) {
          setBundle(null);
          setLoad({ loading: false, error: "这个套餐不存在" });
          return;
        }
        applyBundle(row);
        setLoad({ loading: false, error: "" });
      } catch (error) {
        if (alive) setLoad({ loading: false, error: errorText(error, "套餐没读出来，请稍后再试。") });
      }
    })();
    return () => {
      alive = false;
    };
  }, [signedIn, routeId, props.target.kind, applyBundle]);

  const listed = useMemo(
    () => mine.filter((row) => row.status === "published" && !row.moderation_hidden),
    [mine],
  );
  const priceFen = parseLessonPriceFen(draft.price) ?? 0;
  const totals = bundleTotals(listed, selectedIds, Number.isFinite(priceFen) ? priceFen : 0);
  const localProblems = bundleProblems(draft, selectedIds, totals);
  const lockedLessons = Boolean(bundle && bundle.sales_count > 0 && bundle.status === "published");

  if (props.target.kind !== "bundle-editor") return null;
  if (!signedIn) return <BaySignInPrompt text={tt("登录后才能发布套餐")} />;

  const narrow = props.layout === "docked" || props.layout === "mobile";
  const locked = Boolean(busy);
  const selectedRows = listed.filter((row) => selectedIds.includes(row.id));

  function patch(next: Partial<BundleDraft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  function toggleLesson(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) {
        if (lockedLessons) return current;
        return current.filter((item) => item !== id);
      }
      if (current.length >= 20) return current;
      return [...current, id];
    });
  }

  function bundleInput() {
    const fen = parseLessonPriceFen(draft.price);
    return {
      title: draft.title,
      summary: draft.summary,
      cover_url: draft.coverUrl.trim() === "" ? null : draft.coverUrl,
      gallery_urls: draft.galleryUrls,
      price_fen: fen ?? 0,
    };
  }

  async function persist(row: BayLessonBundleMine): Promise<BayLessonBundleMine> {
    const current = draftFromBundle(row);
    const dirty =
      draft.title !== current.title ||
      draft.summary !== current.summary ||
      draft.coverUrl !== current.coverUrl ||
      draft.galleryUrls.join("\0") !== current.galleryUrls.join("\0") ||
      draft.price !== current.price;
    let next = row;
    if (dirty) {
      const body = await updateBayLessonBundle(row.id, bundleInput());
      next = body.bundle;
    }
    if (selectedIds.length >= 2) {
      const body = await setBayLessonBundleLessons(next.id, selectedIds);
      next = body.bundle;
    }
    applyBundle(next);
    return next;
  }

  async function saveDraft() {
    if (busy) return;
    setShowProblems(true);
    setBusy("save");
    setActionError("");
    try {
      if (!bundle) {
        const created = await createBayLessonBundle(bundleInput());
        if (selectedIds.length >= 2) {
          await setBayLessonBundleLessons(created.bundle.id, selectedIds);
        }
        openBay({ kind: "bundle-editor", bundleId: created.bundle.id });
        return;
      }
      await persist(bundle);
    } catch (error) {
      setActionError(errorText(error, tt("保存失败，请稍后再试。")));
    } finally {
      setBusy("");
    }
  }

  async function publish() {
    if (busy) return;
    setShowProblems(true);
    if (localProblems.length) return;
    setBusy("publish");
    setActionError("");
    try {
      let row = bundle;
      if (!row) {
        const created = await createBayLessonBundle(bundleInput());
        row = created.bundle;
      } else {
        row = await persist(row);
      }
      if (selectedIds.length >= 2) {
        const body = await setBayLessonBundleLessons(row.id, selectedIds);
        row = body.bundle;
      }
      const published = await publishBayLessonBundle(row.id);
      applyBundle(published.bundle);
      openBay({ kind: "bundle", id: published.bundle.id });
    } catch (error) {
      setActionError(errorText(error, tt("上架没有通过，请按提示改完再试。")));
    } finally {
      setBusy("");
    }
  }

  if (load.loading) {
    return (
      <section data-bay-pane="bundle-editor" className="p-4 text-[13px] text-stone-500">
        {tt("正在打开…")}
      </section>
    );
  }
  if (load.error && !bundle) {
    return (
      <section data-bay-pane="bundle-editor" className="space-y-3 p-4">
        <SellerNotice tone="error">{tt(load.error)}</SellerNotice>
      </section>
    );
  }

  const items = [
    {
      id: "cover",
      label: tt("作品图"),
      done: draft.coverUrl.startsWith("https://") || draft.galleryUrls.length > 0,
      summary: draft.galleryUrls.length || draft.coverUrl.startsWith("https://") ? tt("已填好") : undefined,
      alwaysOpen: true,
      children: (
        <BayImageGallery
          variant="listing"
          urls={draft.galleryUrls.length ? draft.galleryUrls : draft.coverUrl ? [draft.coverUrl] : []}
          onUrls={(urls) => patch({ coverUrl: urls[0] || "", galleryUrls: urls })}
          disabled={locked}
        />
      ),
    },
    {
      id: "title",
      label: tt("标题"),
      done: Boolean(draft.title.trim()),
      summary: draft.title.trim() || undefined,
      children: (
        <input
          className={INPUT_CLASS}
          maxLength={80}
          value={draft.title}
          disabled={locked}
          onChange={(event) => patch({ title: event.target.value })}
        />
      ),
    },
    {
      id: "lessons",
      label: tt("选课"),
      done: selectedIds.length >= 2,
      summary: selectedRows.length ? selectedRows.map((row) => row.title).join("、") : undefined,
      children:
        listed.length < 2 ? (
          <p className="text-[12.5px] leading-5 text-stone-500">{tt("至少要有两门已上架的课程才能做套餐")}</p>
        ) : (
          <ul className="space-y-2">
            {listed.map((row) => (
              <li key={row.id}>
                <label className="flex cursor-pointer items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(row.id)}
                    disabled={locked || (lockedLessons && selectedIds.includes(row.id))}
                    onChange={() => toggleLesson(row.id)}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-stone-800">{row.title}</span>
                  <span className="shrink-0 text-[12px] text-stone-500">
                    {row.price_fen ? moneyText(row.price_fen, currency) : tt("免费")}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ),
    },
    {
      id: "price",
      label: tt("套餐价"),
      done: Boolean(draft.price.trim()) && parseLessonPriceFen(draft.price) !== null,
      summary: draft.price.trim()
        ? parseLessonPriceFen(draft.price) === 0
          ? tt("免费")
          : `${draft.price} ${currency}`
        : undefined,
      children: (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              className={INPUT_CLASS}
              inputMode="decimal"
              value={draft.price}
              disabled={locked}
              onChange={(event) => patch({ price: event.target.value })}
            />
            <span className="shrink-0 text-[13px] text-stone-500">{currency}</span>
          </div>
          <p className={`text-[12.5px] leading-5 ${totals.overpriced ? "text-rose-600" : "text-stone-500"}`}>
            {tt("单买合计 {total}，套餐价 {price}，省 {saving}", {
              total: moneyText(totals.total, currency),
              price: moneyText(Number.isFinite(priceFen) ? priceFen : 0, currency),
              saving: moneyText(Math.max(0, totals.saving), currency),
            })}
          </p>
        </div>
      ),
    },
  ];

  return (
    <BayPublishShell
      kind="lesson"
      snapshot={{
        kind: "lesson",
        title: draft.title,
        summary: draft.summary,
        coverUrl: draft.coverUrl,
        coverUrls: draft.galleryUrls.length ? draft.galleryUrls : draft.coverUrl ? [draft.coverUrl] : [],
        priceFen: parseLessonPriceFen(draft.price) ?? 0,
      }}
      onApply={(next) =>
        patch({
          title: next.title || draft.title,
          summary: next.summary || draft.summary,
          coverUrl: next.coverUrls?.[0] || (next.coverUrl?.startsWith("https://") ? next.coverUrl : draft.coverUrl),
          galleryUrls: next.coverUrls?.length ? next.coverUrls : draft.galleryUrls,
          price: next.priceFen != null ? String(next.priceFen / 100) : draft.price,
        })
      }
    >
    <section data-bay-pane="bundle-editor" className={narrow ? "flex flex-col gap-6 p-4" : BAY_FORM_PAGE_CLASS}>
      <BayRevealForm layout="listing" items={items} />
      {showProblems && localProblems.length ? (
        <p className="text-[12.5px] text-stone-500">{localProblems.map((item) => tt(item)).join("、")}</p>
      ) : null}
      {actionError ? <SellerNotice tone="error">{actionError}</SellerNotice> : null}

      <footer className={`${BAY_FORM_BAR_CLASS} justify-end`}>
        <button type="button" disabled={locked} className={SECONDARY_BUTTON} onClick={() => void saveDraft()}>
          {busy === "save" ? tt("正在保存…") : tt("存草稿")}
        </button>
        <button type="button" disabled={locked} className={PRIMARY_BUTTON} onClick={() => void publish()}>
          {busy === "publish" ? tt("正在上架…") : tt("上架")}
        </button>
      </footer>
    </section>
    </BayPublishShell>
  );
}
