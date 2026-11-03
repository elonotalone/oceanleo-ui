"use client";

import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { AssetDetail } from "../../asset-detail/AssetDetail";
import { BayAssetActions } from "../../asset-detail/BayAssetActions";
import { resolveAssetDetail } from "../../asset-detail/resolve";
import type { AssetActionServices } from "../../asset-detail/useAssetActions";
import type { AssetRef, ResolvedAssetDetail, ResolveAssetDetail } from "../../asset-detail/types";
import type { WorkspaceLibraryEntry } from "../../workspace-library-model";
import { libraryStandaloneEditorBinding } from "../../library-edit-landing";
import type { BayAsset } from "./library-client";
import type { BayOfficialAsset } from "./catalog/official-catalog";

const MaterialStandaloneEditor = lazy(() => import("../../material-library-standalone").then((m) => ({ default: m.MaterialStandaloneEditor })));
const ROUTE_EVENT = "oceanleo:bay-asset-route";
const HISTORY_KEY = "oceanleoBayAsset";
const DETAIL_KEYS = ["asset", "artifactId", "revisionId", "listingId"];

/** Namespaced identities keep catalog IDs, platform UUIDs and seller roots separate. */
export function bayAssetRefFromSearch(search: string): AssetRef | null {
  const params = new URLSearchParams(search);
  const listing = params.get("listingId")?.trim();
  if (listing) return { kind: "listing", id: listing };
  const artifact = params.get("artifactId")?.trim();
  if (artifact) return { kind: "artifact", artifactId: artifact, ...(params.get("revisionId")?.trim() ? { revisionId: params.get("revisionId")!.trim() } : {}) };
  const id = params.get("asset")?.trim();
  if (!id) return null;
  if (id.startsWith("template-material:")) return { kind: "template", id: id.slice(18) };
  if (id.startsWith("template:")) return { kind: "template", id: id.slice(9) };
  if (id.startsWith("listing:")) return { kind: "listing", id: id.slice(8) };
  if (id.startsWith("artifact:")) {
    const [artifactId, revisionId] = id.slice(9).split(":");
    return { kind: "artifact", artifactId, ...(revisionId ? { revisionId } : {}) };
  }
  return { kind: "platform", id: id.replace(/^(library|platform|platform_assets):/, "") };
}

export function bayAssetRefForCard(asset: BayAsset): AssetRef {
  const official = asset as Partial<BayOfficialAsset>;
  const identities = official.catalogIdentities || (official.catalog ? [official.catalog] : []);
  // A durable current-app/site projection has an exact revision. Catalog-only
  // rows resolve by catalog ID so the server chooses its published revision.
  const item = official.entry?.libraryItem;
  const displayed = item?.artifactId && item.revisionId
    ? identities.find((identity) => identity.artifactId === item.artifactId && identity.revisionId === item.revisionId)
    : undefined;
  const pinned = displayed || identities.find((identity) => identity.revisionId);
  if (pinned) return { kind: "artifact", artifactId: pinned.artifactId, revisionId: pinned.revisionId! };
  const catalog = identities.find((identity) => identity.catalogId);
  if (catalog) return { kind: "template", id: catalog.catalogId! };
  return bayAssetRefFromSearch(`?asset=${encodeURIComponent(asset.id)}`)!;
}

export function bayAssetSearchWithRef(search: string, ref: AssetRef | null): string {
  const params = new URLSearchParams(search);
  DETAIL_KEYS.forEach((key) => params.delete(key));
  if (ref?.kind === "artifact") {
    params.set("artifactId", ref.artifactId);
    if (ref.revisionId) params.set("revisionId", ref.revisionId);
  } else if (ref) params.set("asset", `${ref.kind === "platform" ? "library" : ref.kind}:${ref.id}`);
  const result = params.toString();
  return result ? `?${result}` : "";
}

function locationSearch() { return typeof window === "undefined" ? "" : window.location.search; }
function routeUrl(search: string) { return `${window.location.pathname}${search}${window.location.hash}`; }
function historyState() { return window.history.state && typeof window.history.state === "object" ? window.history.state : {}; }

/** One history entry per opened item; the mounted catalog keeps filters/pages/versions. */
export function useBayAssetRoute(root?: RefObject<HTMLElement | null>, enabled = true) {
  const [search, setSearch] = useState(locationSearch);
  const scroll = useRef<{ element: HTMLElement; top: number; left: number }[]>([]);
  const [restore, setRestore] = useState(0);
  const read = useCallback(() => {
    setSearch(locationSearch());
    if (!bayAssetRefFromSearch(locationSearch())) setRestore((value) => value + 1);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    read();
    window.addEventListener("popstate", read);
    window.addEventListener(ROUTE_EVENT, read);
    return () => { window.removeEventListener("popstate", read); window.removeEventListener(ROUTE_EVENT, read); };
  }, [enabled, read]);
  useLayoutEffect(() => {
    if (!enabled || bayAssetRefFromSearch(search)) return;
    const saved = historyState()[HISTORY_KEY]?.scroll;
    // Prefer the current mounted ancestors; history also survives a refresh.
    const elements: HTMLElement[] = [];
    for (let node = root?.current; node; node = node.parentElement) elements.push(node);
    if (document.scrollingElement instanceof HTMLElement && !elements.includes(document.scrollingElement)) elements.push(document.scrollingElement);
    const positions = scroll.current.length ? scroll.current : elements.map((element, index) => ({ element, top: saved?.[index]?.top ?? element.scrollTop, left: saved?.[index]?.left ?? element.scrollLeft }));
    for (const position of positions) { position.element.scrollTop = position.top; position.element.scrollLeft = position.left; }
  }, [enabled, root, search, restore]);
  const open = useCallback((ref: AssetRef) => {
    scroll.current = [];
    for (let element = root?.current; element; element = element.parentElement) scroll.current.push({ element, top: element.scrollTop, left: element.scrollLeft });
    if (document.scrollingElement instanceof HTMLElement && !scroll.current.some((item) => item.element === document.scrollingElement)) {
      scroll.current.push({ element: document.scrollingElement, top: document.scrollingElement.scrollTop, left: document.scrollingElement.scrollLeft });
    }
    const browseSearch = bayAssetSearchWithRef(locationSearch(), null);
    const positions = scroll.current.map(({ top, left }) => ({ top, left }));
    const state = historyState();
    window.history.replaceState({ ...state, [HISTORY_KEY]: { scroll: positions } }, "", routeUrl(locationSearch()));
    window.history.pushState({ ...state, [HISTORY_KEY]: { from: routeUrl(browseSearch), scroll: positions } }, "", routeUrl(bayAssetSearchWithRef(locationSearch(), ref)));
    window.dispatchEvent(new Event(ROUTE_EVENT));
    for (const position of scroll.current) { position.element.scrollTop = 0; position.element.scrollLeft = 0; }
  }, [root]);
  const close = useCallback(() => {
    if (historyState()[HISTORY_KEY]?.from) window.history.back();
    else {
      window.history.replaceState(historyState(), "", routeUrl(bayAssetSearchWithRef(locationSearch(), null)));
      window.dispatchEvent(new Event(ROUTE_EVENT));
    }
  }, []);
  return { search, target: enabled ? bayAssetRefFromSearch(search) : null, open, close };
}

export function BayArtifactDeepLink({ accent, target, onBack, onEdit, onUseInTask, resolve = resolveAssetDetail, services, siteKey = "oceanleo" }: {
  accent?: string;
  target?: AssetRef | null;
  onBack?: () => void;
  onEdit?: (entry: WorkspaceLibraryEntry) => Promise<void> | void;
  onUseInTask?: (entry: WorkspaceLibraryEntry) => Promise<void> | void;
  resolve?: ResolveAssetDetail;
  services?: Partial<AssetActionServices>;
  siteKey?: string;
}) {
  const tt = useUI();
  const route = useBayAssetRoute(undefined, target === undefined);
  const selected = target === undefined ? route.target : target;
  const key = JSON.stringify(selected);
  const back = onBack || route.close;
  const [state, setState] = useState<{ key: string; detail?: ResolvedAssetDetail; error?: boolean }>({ key: "" });
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState<WorkspaceLibraryEntry | null>(null);
  useEffect(() => {
    setEditing(null);
    if (!selected) return;
    const controller = new AbortController();
    setState({ key });
    resolve(selected, { signal: controller.signal, surface: "bay" }).then((detail) => {
      if (!controller.signal.aborted) setState({ key, detail });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ key, error: true });
    });
    return () => controller.abort();
  }, [key, retry, resolve]); // Identity, not a freshly allocated ref object, controls resolution.
  if (!selected) return null;
  const detail = state.key === key ? state.detail : undefined;
  if (editing?.libraryItem && detail) {
    const binding = libraryStandaloneEditorBinding({ hostSiteId: siteKey, itemSiteId: editing.libraryItem.siteId });
    return <div className="h-[70vh] min-h-[32rem]" data-bay-asset-editor>
      <Suspense fallback={<p role="status">{tt("正在打开这份素材…")}</p>}>
        <MaterialStandaloneEditor item={editing.libraryItem} siteId={binding.siteId} appId={binding.appId} accent={accent || "#78716c"}
          onSavedItem={(item) => { setEditing({ ...editing, libraryItem: item }); setState({ key, detail: { ...detail, entry: { ...detail.entry, libraryItem: item } } }); }}
          onClose={() => setEditing(null)} />
      </Suspense>
    </div>;
  }
  return <section className="flex min-h-[32rem] flex-1 flex-col" data-bay-asset-detail data-bay-artifact-link={detail ? "ready" : state.key === key && state.error ? "error" : "loading"}>
    {detail ? <AssetDetail {...detail} accent={accent} plain onBack={back} className="h-[70vh] min-h-[32rem]"
      actions={<BayAssetActions {...detail} services={{ resolve, ...services }} onResolved={(next) => setState({ key, detail: next })}
        onEdit={onEdit || setEditing} onUseInTask={onUseInTask} />} /> : <div className="px-3 py-5">
      <button type="button" onClick={back} className="text-sm underline">{tt("返回列表")}</button>
      <p role="status" className="py-12 text-center text-sm text-stone-500">{tt(state.key === key && state.error ? "素材没读出来，请稍后再试。" : "正在打开这份素材…")}</p>
      {state.key === key && state.error && <button type="button" onClick={() => setRetry((value) => value + 1)} className="text-sm underline">{tt("重试")}</button>}
    </div>}
  </section>;
}
