"use client";

// 「我的」→「我发布的」里的课程一段：我的课与套餐、卖出的订单、待处理的退款。本文件归 V3 单元；组件名与 props 是合同，不许改。
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  deleteBayLesson,
  deleteBayLessonBundle,
  listMyBayLessonBundles,
  listMyBayLessons,
  listSoldBayLessonOrders,
  publishBayLesson,
  publishBayLessonBundle,
  unpublishBayLesson,
  unpublishBayLessonBundle,
  type BayLessonBundleMine,
  type BayLessonMine,
  type BayLessonPurchase,
} from "../../../lib/bay/lessons";
import { BayApiError } from "../../../lib/bay/http";
import { ConfirmDialog } from "../../../ui";
import { DANGER_BUTTON, PRIMARY_BUTTON, SECONDARY_BUTTON, SellerNotice } from "../seller/seller-ui";
import { DEFAULT_CURRENCY, moneyText } from "../seller/editor-model";
import { BaySignInPrompt } from "../shell/BayMine";
import { openBay, useBaySignedIn, type BayLayout } from "../shell/bay-state";
import { lessonStatusLabel } from "./lesson-editor-model";
import { SoldOrders } from "./SoldOrders";

export interface MyLessonsPaneProps {
  layout: BayLayout;
  siteKey: string;
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof BayApiError && error.message ? error.message : fallback;
}

function Cover({ url }: { url: string | null }) {
  if (url && url.startsWith("https://")) {
    return <img src={url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />;
  }
  return <span className="h-12 w-12 shrink-0 rounded-xl bg-stone-100" />;
}

export function MyLessonsPane(_props: MyLessonsPaneProps): ReactElement | null {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const currency = DEFAULT_CURRENCY;
  const [lessons, setLessons] = useState<BayLessonMine[]>([]);
  const [bundles, setBundles] = useState<BayLessonBundleMine[]>([]);
  const [sold, setSold] = useState<BayLessonPurchase[]>([]);
  const [load, setLoad] = useState({ loading: true, error: "" });
  const [rowError, setRowError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<null | { kind: "lesson" | "bundle"; id: string; title: string }>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => {
    setNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    setLoad({ loading: true, error: "" });
    void (async () => {
      try {
        const [lessonBody, bundleBody, soldBody] = await Promise.all([
          listMyBayLessons(),
          listMyBayLessonBundles(),
          listSoldBayLessonOrders(),
        ]);
        if (!alive) return;
        setLessons(lessonBody.items || []);
        setBundles(bundleBody.items || []);
        setSold(soldBody.items || []);
        setLoad({ loading: false, error: "" });
      } catch (error) {
        if (alive) setLoad({ loading: false, error: errorText(error, tt("课程列表没读出来，请稍后再试。")) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [signedIn, nonce, tt]);

  if (!signedIn) return <BaySignInPrompt text={tt("登录后管理你发布的课程")} />;

  async function runRow(id: string, work: () => Promise<void>, fallback: string) {
    if (busyId) return;
    setBusyId(id);
    setRowError("");
    try {
      await work();
    } catch (error) {
      setRowError(errorText(error, fallback));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleLesson(row: BayLessonMine) {
    await runRow(
      row.id,
      async () => {
        const body = row.status === "published" ? await unpublishBayLesson(row.id) : await publishBayLesson(row.id);
        setLessons((current) => current.map((item) => (item.id === row.id ? body.lesson : item)));
      },
      row.status === "published" ? tt("下架失败，请稍后再试。") : tt("上架失败，请稍后再试。"),
    );
  }

  async function toggleBundle(row: BayLessonBundleMine) {
    await runRow(
      row.id,
      async () => {
        const body = row.status === "published" ? await unpublishBayLessonBundle(row.id) : await publishBayLessonBundle(row.id);
        setBundles((current) => current.map((item) => (item.id === row.id ? body.bundle : item)));
      },
      row.status === "published" ? tt("下架失败，请稍后再试。") : tt("上架失败，请稍后再试。"),
    );
  }

  async function confirmRemove() {
    const row = pendingDelete;
    if (!row) return;
    setPendingDelete(null);
    await runRow(
      row.id,
      async () => {
        if (row.kind === "lesson") {
          await deleteBayLesson(row.id);
          setLessons((current) => current.filter((item) => item.id !== row.id));
        } else {
          await deleteBayLessonBundle(row.id);
          setBundles((current) => current.filter((item) => item.id !== row.id));
        }
      },
      tt("删除失败，请稍后再试。"),
    );
  }

  if (load.loading) {
    return (
      <section data-bay-pane="mine-lessons" className="p-4 text-[13px] text-stone-500">
        {tt("正在加载…")}
      </section>
    );
  }
  if (load.error) {
    return (
      <section data-bay-pane="mine-lessons" className="space-y-3 p-4">
        <SellerNotice tone="error">{load.error}</SellerNotice>
        <button type="button" className={SECONDARY_BUTTON} onClick={reload}>
          {tt("重试")}
        </button>
      </section>
    );
  }

  return (
    <section data-bay-pane="mine-lessons" className="space-y-6 p-4">
      <div data-bay-section="my-lessons" className="space-y-3">
        <p className="text-[13px] font-semibold text-stone-800">{tt("我的课")}</p>
        {lessons.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center">
            <p className="text-[13px] text-stone-600">{tt("你还没有发布过课程")}</p>
            <button type="button" className={`${PRIMARY_BUTTON} mt-3`} onClick={() => openBay({ kind: "lesson-editor" })}>
              {tt("发布课程")}
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-stone-100">
            {lessons.map((row) => (
              <li key={row.id} className="py-3">
                <div className="flex items-start gap-3">
                  <Cover url={row.cover_url} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-stone-800">{row.title || tt("未命名课程")}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-stone-500">
                      <span className="rounded-md bg-stone-100 px-2 py-0.5 font-medium text-stone-600">{tt(lessonStatusLabel(row))}</span>
                      <span>{row.price_fen ? moneyText(row.price_fen, currency) : tt("免费")}</span>
                      <span>{tt("已售 {n}", { n: row.sales_count })}</span>
                      {row.rating_count > 0 ? <span>{row.rating_avg.toFixed(1)}</span> : null}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" className={SECONDARY_BUTTON} onClick={() => openBay({ kind: "lesson", id: row.id })}>
                        {tt("查看")}
                      </button>
                      <button type="button" className={SECONDARY_BUTTON} onClick={() => openBay({ kind: "lesson-editor", lessonId: row.id })}>
                        {tt("编辑")}
                      </button>
                      <button type="button" disabled={busyId === row.id} className={SECONDARY_BUTTON} onClick={() => void toggleLesson(row)}>
                        {row.status === "published" ? tt("下架") : tt("上架")}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        className={DANGER_BUTTON}
                        onClick={() => setPendingDelete({ kind: "lesson", id: row.id, title: row.title || tt("未命名课程") })}
                      >
                        {tt("删除")}
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {lessons.length ? (
          <div className="flex justify-end">
            <button type="button" className={PRIMARY_BUTTON} onClick={() => openBay({ kind: "lesson-editor" })}>
              {tt("发布课程")}
            </button>
          </div>
        ) : null}
      </div>

      <div data-bay-section="my-bundles" className="space-y-3">
        <p className="text-[13px] font-semibold text-stone-800">{tt("我的套餐")}</p>
        {bundles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center">
            <p className="text-[13px] text-stone-600">{tt("你还没有发布过套餐")}</p>
            <button type="button" className={`${PRIMARY_BUTTON} mt-3`} onClick={() => openBay({ kind: "bundle-editor" })}>
              {tt("发布套餐")}
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-stone-100">
            {bundles.map((row) => (
              <li key={row.id} className="py-3">
                <div className="flex items-start gap-3">
                  <Cover url={row.cover_url} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-stone-800">{row.title || tt("未命名套餐")}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-stone-500">
                      <span className="rounded-md bg-stone-100 px-2 py-0.5 font-medium text-stone-600">{tt(lessonStatusLabel(row))}</span>
                      <span>{row.price_fen ? moneyText(row.price_fen, currency) : tt("免费")}</span>
                      <span>{tt("已售 {n}", { n: row.sales_count })}</span>
                      {row.rating_count > 0 ? <span>{row.rating_avg.toFixed(1)}</span> : null}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" className={SECONDARY_BUTTON} onClick={() => openBay({ kind: "bundle", id: row.id })}>
                        {tt("查看")}
                      </button>
                      <button type="button" className={SECONDARY_BUTTON} onClick={() => openBay({ kind: "bundle-editor", bundleId: row.id })}>
                        {tt("编辑")}
                      </button>
                      <button type="button" disabled={busyId === row.id} className={SECONDARY_BUTTON} onClick={() => void toggleBundle(row)}>
                        {row.status === "published" ? tt("下架") : tt("上架")}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        className={DANGER_BUTTON}
                        onClick={() => setPendingDelete({ kind: "bundle", id: row.id, title: row.title || tt("未命名套餐") })}
                      >
                        {tt("删除")}
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {bundles.length ? (
          <div className="flex justify-end">
            <button type="button" className={PRIMARY_BUTTON} onClick={() => openBay({ kind: "bundle-editor" })}>
              {tt("发布套餐")}
            </button>
          </div>
        ) : null}
      </div>

      <div data-bay-section="sold-orders" className="space-y-3">
        <p className="text-[13px] font-semibold text-stone-800">{tt("卖出的订单")}</p>
        <SoldOrders items={sold} currency={currency} disabled={Boolean(busyId)} onChanged={reload} onError={setRowError} />
      </div>

      {rowError ? <SellerNotice tone="error">{rowError}</SellerNotice> : null}
      {pendingDelete ? (
        <ConfirmDialog
          title={tt("确定删除「{title}」？", { title: pendingDelete.title })}
          danger
          onConfirm={() => void confirmRemove()}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
    </section>
  );
}
