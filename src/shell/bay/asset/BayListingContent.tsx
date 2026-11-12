"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { getUserId } from "../../../lib/auth/client";
import {
  copyBayPurchase, getBayAssetEntitlement, getBayListing, openBayPurchase,
  publishBayVersion, updateBayPurchase,
  type BayDigitalAsset, type BayEntitlement, type BayLibraryDelivery, type BayListingFacts, type BayListingPreview,
} from "../../../lib/bay/assets";
import { downloadFromGateway, gatewayAbsoluteUrl, isGatewayUrl } from "../../skills/kit/folder-api";
import { dispatchWorkspaceAction } from "../../workspace-actions";
import { BayTypedPreview } from "../form/BayTypedPreview";
import { BayImageStage } from "../form/BayImageGallery";
import { Markdown } from "../../Markdown";
import { BayMergeComposer } from "./BayMergeComposer";

const LibraryFolderDetail = lazy(() => import("../../library-folders").then((m) => ({ default: m.LibraryFolderDetail })));

const BUTTON = "rounded-lg border border-neutral-200 px-3 py-2 text-[13px] disabled:opacity-50";

export function BayFacts({ facts }: { facts: BayListingFacts }) {
  const tt = useUI();
  const fields: [string, string | number | null | undefined][] = [
    ["类型", facts.kind], ["大小（字节）", facts.bytes], ["文件数", facts.fileCount], ["页数", facts.pages],
    ["时长（秒）", facts.durationSeconds], ["宽度", facts.width], ["高度", facts.height],
    ["格式", facts.formats?.join(" · ")], ["授权", facts.license === "commercial" ? tt("可商用") : facts.license === "personal" ? tt("个人使用") : facts.license],
    ["版本", facts.version], ["更新时间", facts.updatedAt],
  ];
  return <section data-bay-facts className="my-4 rounded-xl border border-neutral-200 p-3">
    <p className="text-[13px] font-semibold">{tt("库中信息 · 平台读取")}</p>
    <dl className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
      {fields.filter(([, value]) => value !== null && value !== undefined && value !== "").map(([label, value]) =>
        <div key={label}><dt className="text-neutral-500">{tt(label)}</dt><dd className="break-words">{value}</dd></div>)}
    </dl>
  </section>;
}

/** UC-4: README goes through the existing skipHtml Markdown renderer. No HTML or frame sink. */
export function BayFolderPreview({ preview }: { preview: BayListingPreview }) {
  const tt = useUI();
  const [active, setActive] = useState(0);
  const images = (preview.images || []).map((image) => typeof image === "string" ? image : image.url || "").filter((url) => /^(https:\/\/|\/[^/])/.test(url)).map((url) => gatewayAbsoluteUrl(url));
  return <section data-bay-folder-preview className="space-y-3">
    <p className="text-[13px] font-semibold">{tt("文件夹内容")}</p>
    <ul className="max-h-64 overflow-auto rounded-lg bg-neutral-50 p-3 font-mono text-[12px]">
      {(preview.tree || []).slice(0, 200).map((entry) => <li key={entry.path} className="whitespace-pre-wrap break-words">{entry.type === "dir" ? "▸ " : "  "}{entry.path}</li>)}
    </ul>
    {preview.readme ? <div data-bay-readme><Markdown>{preview.readme.slice(0, 65536)}</Markdown></div> : null}
    {images.length ? <BayImageStage urls={images} active={active} onActive={setActive} /> : null}
  </section>;
}

export function openBayLibraryDelivery(delivery: BayLibraryDelivery) {
  const identity = delivery.libraryIdentity;
  dispatchWorkspaceAction({ nonce: `bay-library-${Date.now()}`, action: {
    version: 1, tab: "mine", itemId: identity.id,
    ...(identity.kind === "folder" ? { category: "folder" } : {}),
  } });
}

export function BayPurchaseControls({ listingId, title, entitlement, sellerUpdateAvailable, onRefresh }: {
  listingId: string; title: string; entitlement: BayEntitlement | null; sellerUpdateAvailable?: boolean; onRefresh: () => void;
}) {
  const tt = useUI();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  function openDelivery(delivery: BayLibraryDelivery) {
    if (delivery.libraryIdentity.kind === "folder") setFolderId(delivery.libraryIdentity.id);
    else openBayLibraryDelivery(delivery);
  }
  const [mergeCopyId, setMergeCopyId] = useState<string | null>(null);
  async function run(action: () => Promise<unknown>) {
    if (pending) return;
    setPending(true); setError("");
    try { await action(); onRefresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : tt("操作失败，请稍后再试。")); }
    finally { setPending(false); }
  }
  return <div data-bay-purchase-controls className="my-3 space-y-2">
    {entitlement?.entitled ? <>
      <p role="status" className="text-[13px] font-medium">{tt("已在你的库里")}</p>
      <div className="flex flex-wrap gap-2">
        <button className={BUTTON} disabled={pending} onClick={() => void run(async () => openDelivery(await openBayPurchase(listingId)))}>{tt("打开")}</button>
        <button className={BUTTON} disabled={pending} onClick={() => void run(async () => {
          const delivery = await openBayPurchase(listingId);
          const url = delivery.downloadUrl;
          if (!url || !/^(https:\/\/|\/[^/])/.test(url)) throw new Error(tt("下载暂不可用"));
          if (isGatewayUrl(gatewayAbsoluteUrl(url))) {
            const result = await downloadFromGateway(gatewayAbsoluteUrl(url));
            if (!result.ok) throw new Error(result.error);
            return;
          }
          const link = document.createElement("a"); link.href = url; link.download = ""; link.rel = "noopener noreferrer"; link.click();
        })}>{tt("下载")}</button>
        <button className={BUTTON} disabled={pending} onClick={() => void run(async () => openDelivery(await copyBayPurchase(listingId)))}>{tt("另存一份可编辑的")}</button>
        {entitlement.updateAvailable ? <button className={BUTTON} disabled={pending} onClick={() => void run(() => updateBayPurchase(listingId))}>{tt("有新版本 · 更新")}</button> : null}
      </div>
      {entitlement.updateAvailable ? (entitlement.editedCopies || []).map((copy) => <button key={copy.id} className={BUTTON} onClick={() => setMergeCopyId(copy.id)}>{tt("让 agent 合并到我改过的版本")}{copy.title ? ` · ${copy.title}` : ""}</button>) : null}
    </> : null}
    {sellerUpdateAvailable ? <button className={BUTTON} disabled={pending} onClick={() => void run(() => publishBayVersion(listingId))}>{tt("上架新版本")}</button> : null}
    {error ? <p role="alert" className="text-[12px] text-rose-600">{tt(error)}</p> : null}
    {folderId ? <Suspense fallback={null}><LibraryFolderDetail folderId={folderId} onClose={() => setFolderId(null)} onChanged={() => {}} onDeleted={() => { setFolderId(null); onRefresh(); }} /></Suspense> : null}
    {mergeCopyId ? <BayMergeComposer listingId={listingId} title={title} copyId={mergeCopyId} revisionId={entitlement?.latestRevisionId || ""} onClose={() => setMergeCopyId(null)} /> : null}
  </div>;
}

interface ListingContentProps { listingId: string; showPreview?: boolean; purchaseState?: string; showDescription?: boolean }
export function BayListingContent(props: ListingContentProps) {
  return <ListingContent key={props.listingId} {...props} />;
}
function ListingContent({ listingId, showPreview = false, purchaseState, showDescription = true }: ListingContentProps) {
  const tt = useUI();
  const [asset, setAsset] = useState<BayDigitalAsset | null>(null);
  const [entitlement, setEntitlement] = useState<BayEntitlement | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void getBayListing(listingId, controller.signal).then((body) => { if (!controller.signal.aborted) { setAsset(body.asset); setError(""); } })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "加载失败，请稍后再试。"); });
    void getUserId().then(async (id) => {
      if (!id || controller.signal.aborted) return;
      const result = await getBayAssetEntitlement(listingId);
      if (!controller.signal.aborted) setEntitlement(result);
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "加载失败，请稍后再试。"); });
    return () => controller.abort();
  }, [listingId, refresh, purchaseState]);
  if (!asset) return error ? <p role="alert">{tt(error)}</p> : null;
  return <div data-bay-listing-content className="px-3">
    {showDescription && (asset.description || asset.summary) ? <p className="mt-3 whitespace-pre-wrap text-[13px]">{asset.description || asset.summary}</p> : null}
    {asset.facts ? <BayFacts facts={asset.facts} /> : null}
    {asset.preview?.kind === "folder" || asset.preview?.tree ? <BayFolderPreview preview={asset.preview} /> : showPreview && asset.preview?.item ? <BayTypedPreview item={asset.preview.item} imageUrls={(asset.preview.images || []).flatMap((image) => typeof image === "string" ? [image] : image.url ? [gatewayAbsoluteUrl(image.url)] : [])} /> : null}
    <BayPurchaseControls listingId={listingId} title={asset.title} entitlement={entitlement} sellerUpdateAvailable={asset.sellerUpdateAvailable} onRefresh={() => setRefresh((n) => n + 1)} />
    {error ? <p role="alert">{tt(error)}</p> : null}
  </div>;
}
