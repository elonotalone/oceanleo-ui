"use client";

// 上架 / 编辑一个作品。本文件归 U3 单元；组件名与 props 是合同，不许改。
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { listHostedSites, type HostedSite } from "../../../api/hosted-sites";
import { useUI } from "../../../i18n/ui/useUI";
import type { BayAppEndpoint } from "../../../lib/bay/app-endpoints";
import {
  checkBayAppEmbed,
  createBayApp,
  listMyBayApps,
  publishBayApp,
  updateBayApp,
  type BayAppMine,
} from "../../../lib/bay/apps";
import { BayApiError } from "../../../lib/bay/http";
import { EndpointPicker } from "../appendpoint/EndpointPicker";
import { INPUT_CLASS, PRIMARY_BUTTON, SECONDARY_BUTTON, SellerField, SellerNotice, TEXTAREA_CLASS } from "../seller/seller-ui";
import { useBayCategoryName } from "../shell/BayList";
import { BaySignInPrompt } from "../shell/BayMine";
import { openBay, useBaySignedIn, type BayPaneProps } from "../shell/bay-state";
import { useBayCategories } from "../shell/use-bay-data";
import { draftFromApp, draftProblems, embedNote, liveHostedSites, patchFromDraft, type AppDraft } from "./app-editor-model";
import { AppVerifyPanel } from "./AppVerifyPanel";

function errorText(error: unknown, fallback: string): string {
  return error instanceof BayApiError && error.message ? error.message : fallback;
}

function emptyDraft(): AppDraft {
  return { title: "", summary: "", description: "", coverUrl: "", category: "", embedMode: "embed", url: "", endpointId: "" };
}

export function AppEditorPane(props: BayPaneProps): ReactElement | null {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const categoriesView = useBayCategories();
  const categoryName = useBayCategoryName();
  const routeId = props.target.kind === "app-editor" ? props.target.appId || "" : "";
  const [app, setApp] = useState<BayAppMine | null>(null);
  const [draft, setDraft] = useState<AppDraft>(emptyDraft);
  const [hosted, setHosted] = useState<HostedSite[]>([]);
  const [mine, setMine] = useState<BayAppMine[]>([]);
  const [load, setLoad] = useState<{ loading: boolean; error: string }>({ loading: true, error: "" });
  const [urlDraft, setUrlDraft] = useState("");
  const [urlError, setUrlError] = useState("");
  const [computerPick, setComputerPick] = useState<BayAppEndpoint | null>(null);
  const [computerError, setComputerError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState<"save" | "publish" | "create" | "embed" | "">("");

  const applyApp = useCallback((row: BayAppMine) => {
    setApp(row);
    setDraft(draftFromApp(row));
  }, []);

  useEffect(() => {
    if (!signedIn || props.target.kind !== "app-editor") return;
    let alive = true;
    setLoad({ loading: true, error: "" });
    setActionError("");
    void (async () => {
      try {
        if (routeId) {
          const body = await listMyBayApps();
          if (!alive) return;
          const row = (body.items || []).find((item) => item.id === routeId);
          if (!row) {
            setApp(null);
            setLoad({ loading: false, error: tt("这个作品不存在") });
            return;
          }
          applyApp(row);
          setLoad({ loading: false, error: "" });
          return;
        }
        const [sitesBody, mineBody] = await Promise.all([
          listHostedSites(),
          listMyBayApps().catch(() => ({ items: [] as BayAppMine[] })),
        ]);
        if (!alive) return;
        setMine(mineBody.items || []);
        setHosted(sitesBody.ok ? sitesBody.data?.items || [] : []);
        setLoad({ loading: false, error: "" });
        if (!sitesBody.ok) setActionError(tt("已发布的网站列表没读出来，请稍后再试。"));
      } catch (error) {
        if (alive) setLoad({ loading: false, error: errorText(error, tt("作品没读出来，请稍后再试。")) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [signedIn, routeId, props.target.kind, applyApp, tt]);

  if (props.target.kind !== "app-editor") return null;
  if (!signedIn) return <BaySignInPrompt text={tt("登录后才能上架作品")} />;

  const narrow = props.layout === "docked" || props.layout === "mobile";
  const live = liveHostedSites(hosted);

  async function enterEditor(appId: string) {
    openBay({ kind: "app-editor", appId });
  }

  async function pickHosted(site: HostedSite) {
    if (busy) return;
    const existing = mine.find((row) => row.hosted_site_id === site.id);
    if (existing) {
      await enterEditor(existing.id);
      return;
    }
    setBusy("create");
    setActionError("");
    try {
      const body = await createBayApp({
        source_kind: "hosted",
        hosted_site_id: site.id,
        title: site.title,
        posted_site: props.siteKey || null,
      });
      await enterEditor(body.app.id);
    } catch (error) {
      if (error instanceof BayApiError && error.status === 409) {
        try {
          const body = await listMyBayApps();
          const found = (body.items || []).find((row) => row.hosted_site_id === site.id);
          if (found) {
            await enterEditor(found.id);
            return;
          }
        } catch {
          /* 下面用网关那句 */
        }
      }
      setActionError(errorText(error, tt("草稿没建好，请稍后再试。")));
    } finally {
      setBusy("");
    }
  }

  async function pickExternal() {
    if (busy) return;
    setBusy("create");
    setUrlError("");
    setActionError("");
    try {
      const body = await createBayApp({
        source_kind: "external",
        url: urlDraft.trim(),
        posted_site: props.siteKey || null,
      });
      await enterEditor(body.app.id);
    } catch (error) {
      setUrlError(errorText(error, tt("草稿没建好，请稍后再试。")));
    } finally {
      setBusy("");
    }
  }

  async function pickComputer() {
    if (busy || !computerPick) return;
    setBusy("create");
    setComputerError("");
    setActionError("");
    try {
      const body = await createBayApp({
        source_kind: "computer",
        endpoint_id: computerPick.id,
        embed_mode: "link",
        posted_site: props.siteKey || null,
      });
      await enterEditor(body.app.id);
    } catch (error) {
      setComputerError(errorText(error, tt("草稿没建好，请稍后再试。")));
    } finally {
      setBusy("");
    }
  }

  function patch(next: Partial<AppDraft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  async function persistDraft(): Promise<BayAppMine | null> {
    if (!app) return null;
    const next = patchFromDraft(draft, app);
    if (Object.keys(next).length === 0) return app;
    const body = await updateBayApp(app.id, next);
    applyApp(body.app);
    return body.app;
  }

  async function saveDraft() {
    if (!app || busy) return;
    setBusy("save");
    setActionError("");
    try {
      await persistDraft();
    } catch (error) {
      setActionError(errorText(error, tt("保存失败，请稍后再试。")));
    } finally {
      setBusy("");
    }
  }

  async function publish() {
    if (!app || busy) return;
    setBusy("publish");
    setActionError("");
    try {
      const saved = await persistDraft();
      if (!saved) return;
      const body = await publishBayApp(saved.id);
      applyApp(body.app);
      openBay({ kind: "app", id: body.app.id });
    } catch (error) {
      setActionError(errorText(error, tt("上架没有通过，请按提示改完再试。")));
    } finally {
      setBusy("");
    }
  }

  async function recheckEmbed() {
    if (!app || busy) return;
    setBusy("embed");
    setActionError("");
    try {
      const result = await checkBayAppEmbed(app.id);
      applyApp(result.app);
    } catch (error) {
      setActionError(errorText(error, tt("探测没有完成，请稍后再试。")));
    } finally {
      setBusy("");
    }
  }

  if (load.loading) {
    return (
      <section data-bay-pane="app-editor" className="p-4 text-[13px] text-stone-500">
        {tt("正在打开…")}
      </section>
    );
  }
  if (load.error && !app) {
    return (
      <section data-bay-pane="app-editor" className="space-y-3 p-4">
        <SellerNotice tone="error">{load.error}</SellerNotice>
      </section>
    );
  }

  if (!app) {
    return (
      <section data-bay-pane="app-editor" className={`space-y-6 p-5 sm:p-8 ${narrow ? "" : "mx-auto w-full max-w-4xl"}`}>
        <div>
          <h3 className="text-[17px] font-semibold tracking-tight text-stone-900">{tt("选一个来源")}</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="text-[15px] font-semibold text-stone-900">{tt("我发布的网站")}</p>
            {live.length === 0 ? (
              <p className="mt-2 text-[13px] leading-5 text-stone-500">{tt('你还没有发布过网站。让 agent 做一个网站，然后说"发布"。')}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {live.map((site) => (
                  <li key={site.id}>
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => void pickHosted(site)}
                      className="block w-full rounded-xl border border-stone-200 px-3 py-2 text-left hover:bg-stone-50 disabled:opacity-40"
                    >
                      <span className="block text-[13px] font-medium text-stone-900">{site.title || site.slug}</span>
                      <span className="mt-0.5 block truncate text-[12px] text-stone-500">{site.url}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="text-[15px] font-semibold text-stone-900">{tt("我自己的网站")}</p>
            <div className="mt-3 space-y-2">
              <input
                className={INPUT_CLASS}
                value={urlDraft}
                placeholder={tt("网站地址")}
                onChange={(event) => {
                  setUrlDraft(event.target.value);
                  setUrlError("");
                }}
              />
              {urlError ? <p className="text-[12.5px] text-rose-600">{urlError}</p> : null}
              <button type="button" disabled={Boolean(busy) || !urlDraft.trim()} className={PRIMARY_BUTTON} onClick={() => void pickExternal()}>
                {tt("下一步")}
              </button>
            </div>
          </div>
          <div data-bay-app-source="computer" className="rounded-xl border border-stone-200 bg-white p-4 sm:col-span-2">
            <p className="text-[15px] font-semibold text-stone-900">{tt("我的云电脑上的应用")}</p>
            <div className="mt-3 space-y-3">
              <EndpointPicker
                selectedId={computerPick?.id || null}
                onSelect={setComputerPick}
                disabled={Boolean(busy)}
              />
              {!computerPick ? <p className="text-[12.5px] text-stone-500">{tt("请先选定一个公开网址")}</p> : null}
              {computerError ? <p className="text-[12.5px] text-rose-600">{computerError}</p> : null}
              <button
                type="button"
                data-bay-endpoint-next
                disabled={Boolean(busy) || !computerPick}
                className={PRIMARY_BUTTON}
                onClick={() => void pickComputer()}
              >
                {busy === "create" ? tt("正在打开…") : tt("下一步")}
              </button>
            </div>
          </div>
        </div>
        {actionError ? <SellerNotice tone="error">{actionError}</SellerNotice> : null}
      </section>
    );
  }

  const urlDirty = app.source_kind === "external" && draft.url !== (app.url || "");
  const verifyApp = urlDirty ? { ...app, verified_at: null, verified: false } : app;
  const localProblems = draftProblems(draft);
  const coverPreview = draft.coverUrl.startsWith("https://") ? draft.coverUrl : "";
  const knownSlugs = new Set(categoriesView.categories.map((row) => row.slug));

  return (
    <section data-bay-pane="app-editor" className={`space-y-4 p-4 sm:p-6 ${narrow ? "" : "mx-auto w-full max-w-3xl"}`}>
      {app.source_kind === "external" ? <AppVerifyPanel app={verifyApp} onChanged={applyApp} /> : null}

      <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 sm:p-5">
        {app.source_kind === "external" ? (
          <SellerField label={tt("网站地址")}>
            <input className={INPUT_CLASS} value={draft.url} onChange={(event) => patch({ url: event.target.value })} />
          </SellerField>
        ) : null}

        {app.source_kind === "computer" ? (
          <div data-bay-app-computer-url className="space-y-3">
            <SellerField label={tt("当前公开网址")}>
              <p className="break-all text-[13px] text-stone-800">{app.url}</p>
            </SellerField>
            <EndpointPicker
              selectedId={draft.endpointId || app.endpoint_id}
              keepAppId={app.id}
              onSelect={(row) => patch({ endpointId: row.id })}
              disabled={Boolean(busy)}
            />
          </div>
        ) : null}

        <SellerField label={tt("名称")} hint={`${draft.title.length}/80`}>
          <input className={INPUT_CLASS} maxLength={80} value={draft.title} onChange={(event) => patch({ title: event.target.value })} />
        </SellerField>
        <SellerField label={tt("一句话简介")} hint={`${draft.summary.length}/200`}>
          <input className={INPUT_CLASS} maxLength={200} value={draft.summary} onChange={(event) => patch({ summary: event.target.value })} />
        </SellerField>
        <SellerField label={tt("详细介绍")} hint={`${draft.description.length}/4000`}>
          <textarea className={TEXTAREA_CLASS} rows={5} maxLength={4000} value={draft.description} onChange={(event) => patch({ description: event.target.value })} />
        </SellerField>
        <SellerField label={tt("封面图地址")}>
          <div className="flex items-start gap-3">
            <input className={INPUT_CLASS} value={draft.coverUrl} onChange={(event) => patch({ coverUrl: event.target.value })} />
            {coverPreview ? (
              <img src={coverPreview} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
            ) : null}
          </div>
        </SellerField>
        <SellerField label={tt("类目")}>
          <select className={INPUT_CLASS} value={draft.category} onChange={(event) => patch({ category: event.target.value })}>
            <option value="">{tt("请选择类目")}</option>
            {draft.category && !knownSlugs.has(draft.category) ? <option value={draft.category}>{draft.category}</option> : null}
            {categoriesView.categories.map((row) => (
              <option key={row.slug} value={row.slug}>
                {categoryName(row)}
              </option>
            ))}
          </select>
        </SellerField>
        <SellerField label={tt("打开方式")}>
          <div className="space-y-2" role="radiogroup">
            {(
              [
                { value: "embed" as const, title: "在 Bay 页内的窗口里打开", detail: "访客不用离开 Bay，就能在页内窗口里用这个网站。" },
                { value: "link" as const, title: "只跳转到我的网站", detail: "点了就跳到你的网站，不在 Bay 里打开窗口。" },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-left ${
                  draft.embedMode === option.value ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 bg-white"
                }`}
              >
                <input type="radio" name="bay-app-embed" className="mt-1" checked={draft.embedMode === option.value} onChange={() => patch({ embedMode: option.value })} />
                <span>
                  <span className="block text-[13px] font-semibold text-neutral-900">{tt(option.title)}</span>
                  <span className="mt-0.5 block text-[12px] leading-5 text-neutral-500">{tt(option.detail)}</span>
                </span>
              </label>
            ))}
          </div>
        </SellerField>
        {app.source_kind === "computer" ? (
          <p data-bay-app-computer-embed-hint className="text-[12.5px] leading-5 text-stone-500">
            {tt("云电脑上的应用通常需要登录，页内窗口里登录不了")}
          </p>
        ) : null}
        {draft.embedMode === "embed" ? (
          <p className="flex flex-wrap items-center gap-2 text-[13px] text-stone-600">
            <span>{tt(embedNote(app))}</span>
            <button type="button" disabled={Boolean(busy)} className={SECONDARY_BUTTON} onClick={() => void recheckEmbed()}>
              {busy === "embed" ? tt("正在检测…") : tt("重新检测")}
            </button>
          </p>
        ) : null}
      </div>

      {localProblems.length ? (
        <p className="text-[12.5px] text-stone-500">{localProblems.map((item) => tt(item)).join("、")}</p>
      ) : null}
      {actionError ? <SellerNotice tone="error">{actionError}</SellerNotice> : null}

      <footer className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-neutral-200/70 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <button type="button" disabled={Boolean(busy)} className={SECONDARY_BUTTON} onClick={() => void saveDraft()}>
          {busy === "save" ? tt("正在保存…") : tt("存草稿")}
        </button>
        <button type="button" disabled={Boolean(busy)} className={PRIMARY_BUTTON} onClick={() => void publish()}>
          {busy === "publish" ? tt("正在上架…") : tt("上架")}
        </button>
      </footer>
    </section>
  );
}
