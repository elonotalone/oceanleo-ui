"use client";

// 「我的」→「我发布的」里的网站与软件服务一段：我上架的网站或软件、状态、数据、上下架；每行右边标「网站与软件服务」。本文件归 U3 单元；组件名与 props 是合同，不许改。
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  deleteBayApp,
  getBayAppStats,
  listMyBayApps,
  publishBayApp,
  unpublishBayApp,
  type BayAppMine,
  type BayAppStats,
} from "../../../lib/bay/apps";
import { BayApiError } from "../../../lib/bay/http";
import { ConfirmDialog } from "../../../ui";
import { DANGER_BUTTON, PRIMARY_BUTTON, SECONDARY_BUTTON, SellerNotice } from "../seller/seller-ui";
import { BaySignInPrompt } from "../shell/BayMine";
import { openBay, useBaySignedIn, type BayLayout } from "../shell/bay-state";
import { PublishedCategoryTag } from "../mine/PublishedCategoryTag";
import { AppStatsBars } from "./AppStatsBars";
import { statusLabel } from "./app-editor-model";

export interface MyAppsPaneProps {
  layout: BayLayout;
  siteKey: string;
}

const STATS_CONCURRENCY = 4;

function errorText(error: unknown, fallback: string): string {
  return error instanceof BayApiError && error.message ? error.message : fallback;
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 0 }, () => run()));
  return out;
}

export function MyAppsPane(_props: MyAppsPaneProps): ReactElement | null {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const [items, setItems] = useState<BayAppMine[]>([]);
  const [stats, setStats] = useState<Record<string, BayAppStats | "failed">>({});
  const [load, setLoad] = useState<{ loading: boolean; error: string }>({ loading: true, error: "" });
  const [rowError, setRowError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BayAppMine | null>(null);
  const [openStats, setOpenStats] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => {
    setLoad({ loading: true, error: "" });
    setNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    setLoad({ loading: true, error: "" });
    listMyBayApps().then(
      async (body) => {
        if (!alive) return;
        const rows = body.items || [];
        setItems(rows);
        setLoad({ loading: false, error: "" });
        const published = rows.filter((row) => row.status === "published");
        const next: Record<string, BayAppStats | "failed"> = {};
        await mapLimit(published, STATS_CONCURRENCY, async (row) => {
          try {
            next[row.id] = await getBayAppStats(row.id, 30);
          } catch {
            next[row.id] = "failed";
          }
        });
        if (alive) setStats({ ...next });
      },
      (error: unknown) => {
        if (alive) setLoad({ loading: false, error: errorText(error, "列表没读出来，请稍后再试。") });
      },
    );
    return () => {
      alive = false;
    };
  }, [signedIn, nonce]);

  if (!signedIn) return <BaySignInPrompt text={tt("登录后管理你上架的网站或软件")} />;

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

  async function togglePublish(row: BayAppMine) {
    await runRow(
      row.id,
      async () => {
        const body = row.status === "published" ? await unpublishBayApp(row.id) : await publishBayApp(row.id);
        setItems((current) => current.map((item) => (item.id === row.id ? body.app : item)));
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
        await deleteBayApp(row.id);
        setItems((current) => current.filter((item) => item.id !== row.id));
        setStats((current) => {
          const next = { ...current };
          delete next[row.id];
          return next;
        });
      },
      tt("删除失败，请稍后再试。"),
    );
  }

  if (load.loading) {
    return (
      <section data-bay-pane="mine-apps" className="p-4 text-[13px] text-stone-500">
        {tt("正在加载…")}
      </section>
    );
  }
  if (load.error) {
    return (
      <section data-bay-pane="mine-apps" className="space-y-3 p-4">
        <SellerNotice tone="error">{tt(load.error)}</SellerNotice>
        <button type="button" className={SECONDARY_BUTTON} onClick={reload}>
          {tt("重试")}
        </button>
      </section>
    );
  }

  return (
    <section data-bay-pane="mine-apps" className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] text-stone-500">{tt("{n} / 50", { n: items.length })}</p>
      </div>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center">
          <p className="text-[13px] text-stone-600">{tt("你还没有上架过网站或软件")}</p>
          <button type="button" className={`${PRIMARY_BUTTON} mt-3`} onClick={() => openBay({ kind: "app-editor" })}>
            {tt("上架网站或软件")}
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-stone-100">
          {items.map((row) => {
            const rowStats = stats[row.id];
            const totals = rowStats && rowStats !== "failed" ? rowStats.totals : null;
            return (
              <li key={row.id} className="py-3">
                <div className="flex items-start gap-3">
                  {row.cover_url && row.cover_url.startsWith("https://") ? (
                    <img src={row.cover_url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span className="h-12 w-12 shrink-0 rounded-xl bg-stone-100" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-[14px] font-semibold text-stone-800">{row.title || tt("未命名")}</p>
                      <PublishedCategoryTag category="app" />
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-stone-500">
                      <span className="rounded-md bg-stone-100 px-2 py-0.5 font-medium text-stone-600">{tt(statusLabel(row))}</span>
                      {row.status === "published" ? (
                        <span>
                          {rowStats === "failed" || !totals
                            ? "—"
                            : tt("浏览 {views} · 打开 {opens}", { views: totals.views, opens: totals.opens })}
                        </span>
                      ) : null}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" className={SECONDARY_BUTTON} onClick={() => openBay({ kind: "app", id: row.id })}>
                        {tt("查看")}
                      </button>
                      <button type="button" className={SECONDARY_BUTTON} onClick={() => openBay({ kind: "app-editor", appId: row.id })}>
                        {tt("编辑")}
                      </button>
                      <button type="button" data-bay-action="manage" className={SECONDARY_BUTTON} onClick={() => openBay({ kind: "app-manage", appId: row.id })}>
                        {tt("管理")}
                      </button>
                      <button type="button" disabled={busyId === row.id} className={SECONDARY_BUTTON} onClick={() => void togglePublish(row)}>
                        {row.status === "published" ? tt("下架") : tt("上架")}
                      </button>
                      <button type="button" disabled={busyId === row.id} className={DANGER_BUTTON} onClick={() => setPendingDelete(row)}>
                        {tt("删除")}
                      </button>
                      {row.status === "published" && rowStats && rowStats !== "failed" ? (
                        <button
                          type="button"
                          className={SECONDARY_BUTTON}
                          onClick={() => setOpenStats((current) => (current === row.id ? null : row.id))}
                        >
                          {tt("数据")}
                        </button>
                      ) : null}
                    </div>
                    {openStats === row.id && rowStats && rowStats !== "failed" ? (
                      <div className="mt-3">
                        <AppStatsBars days={rowStats.days} />
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {items.length ? (
        <div className="flex justify-end">
          <button type="button" className={PRIMARY_BUTTON} onClick={() => openBay({ kind: "app-editor" })}>
            {tt("上架网站或软件")}
          </button>
        </div>
      ) : null}
      {rowError ? <SellerNotice tone="error">{rowError}</SellerNotice> : null}
      {pendingDelete ? (
        <ConfirmDialog
          title={tt("确定删除「{title}」？删了别人就打不开了。", { title: pendingDelete.title || tt("未命名") })}
          danger
          onConfirm={() => void confirmRemove()}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
    </section>
  );
}
