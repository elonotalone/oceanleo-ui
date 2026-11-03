"use client";

import { useEffect, useRef, useState } from "react";
import { bayPost } from "../../lib/bay/http";
import type { LibraryItem } from "../library-data";
import type { WorkspaceLibraryEntry } from "../workspace-library-model";
import type { AssetActionContext, AssetRef, ResolvedAssetDetail, ResolveAssetDetail } from "./types";

export type AssetActionId = "get" | "buy" | "refresh" | "add" | "use" | "download" | "edit";
export interface AssetToolbarItem {
  id: AssetActionId;
  /** Chinese source key; translate at the rendering boundary. */
  label: string;
  disabled: boolean;
}

export interface AssetActionServices {
  resolve: ResolveAssetDetail;
  /** Returns the server-confirmed Library identity, never an optimistic entitlement. */
  claim: (ref: AssetRef) => Promise<AssetRef | null>;
  addToLibrary: (entry: WorkspaceLibraryEntry, context: AssetActionContext) => Promise<AssetRef>;
  checkout: (listingId: string) => Promise<void> | void;
  download: (item: LibraryItem, context: AssetActionContext) => Promise<void>;
}

/** Denied/refunded commerce overrides old cached permissions. Missing price is never free. */
export function assetToolbarItems(context: AssetActionContext): AssetToolbarItem[] {
  const commerce = context.commerce;
  if (commerce?.purchaseState === "pending") return [{ id: "refresh", label: "刷新购买状态", disabled: false }];
  const owned = context.owned && commerce?.purchaseState !== "refunded";
  if (!owned && !commerce && context.rights.canAddToLibrary) return [{ id: "add", label: "加入我的库", disabled: false }];
  if (!owned && context.surface !== "library") {
    if (!commerce || commerce.priceFen === null || !Number.isSafeInteger(commerce.priceFen) || commerce.priceFen < 0) {
      return [{ id: "refresh", label: "刷新价格", disabled: false }];
    }
    const priceFen = commerce.priceFen;
    if (commerce.free && priceFen === 0) return [{ id: "get", label: "获取", disabled: false }];
    if (!commerce.free && priceFen > 0 && context.ref.kind === "listing" && commerce.listingId === context.ref.id) {
      return [{ id: "buy", label: "购买", disabled: false }];
    }
    return [{ id: "refresh", label: "刷新价格", disabled: false }];
  }
  // A Library surface is not itself proof of ownership.
  if (!owned) return [{ id: "refresh", label: "刷新素材状态", disabled: false }];
  const rights = context.rights;
  return [
    ...(rights.canAddToLibrary ? [{ id: "add" as const, label: "加入我的库", disabled: false }] : []),
    ...(rights.canUseInTask ? [{ id: "use" as const, label: "用于任务", disabled: false }] : []),
    ...(rights.canDownload ? [{ id: "download" as const, label: "下载", disabled: false }] : []),
    ...(rights.canEdit ? [{ id: "edit" as const, label: "编辑", disabled: false }] : []),
  ];
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Accept the explicit Library identity returned by the server, including a stock collection row. */
export function claimedLibraryRef(value: unknown): AssetRef | null {
  const row = record(value);
  const ref = record(row?.libraryIdentity) || record(row?.library_ref);
  if (ref?.kind === "platform" && typeof ref.id === "string" && ref.id.trim()) return { kind: "platform", id: ref.id };
  if (ref?.kind === "artifact" && typeof ref.artifactId === "string" && ref.artifactId.trim()) {
    return { kind: "artifact", artifactId: ref.artifactId, ...(typeof ref.revisionId === "string" && ref.revisionId ? { revisionId: ref.revisionId } : {}) };
  }
  if (typeof row?.artifact_id === "string" && row.artifact_id.trim()) {
    return { kind: "artifact", artifactId: row.artifact_id, ...(typeof row.revision_id === "string" && row.revision_id ? { revisionId: row.revision_id } : {}) };
  }
  return null;
}

const defaultServices: AssetActionServices = {
  resolve: async (ref, options) => {
    const { resolveAssetDetail } = await import("./resolve");
    return resolveAssetDetail(ref, options);
  },
  claim: async (ref) => {
    if (ref.kind === "platform") return claimedLibraryRef(await bayPost<unknown>("/v1/bay/assets/claim", { ref }));
    if (ref.kind === "listing") {
      const { purchaseBayAsset } = await import("../../lib/bay/assets");
      await purchaseBayAsset(ref.id);
      // A seller's artifact in the purchase row is not the buyer's Library copy.
      return null;
    }
    throw new Error("unsupported_claim");
  },
  addToLibrary: async (entry) => {
    if (!entry.libraryItem) throw new Error("missing_library_item");
    const { forkArtifact } = await import("../artifact-client");
    const result = await forkArtifact(entry.libraryItem);
    if (!result.ok || !result.data?.artifactId || !result.data.revisionId) throw new Error("library_copy_failed");
    return { kind: "artifact", artifactId: result.data.artifactId, revisionId: result.data.revisionId };
  },
  // Keep terms, order creation and payment inside the existing checkout.
  checkout: async (listingId) => {
    const { openBay } = await import("../bay/shell/bay-state");
    openBay({ kind: "checkout", serviceId: listingId });
  },
  download: async (item, context) => {
    if (context.ref.kind === "platform" && !item.artifactId) {
      const { bayAssetDownloadHref } = await import("../bay/asset/library-client");
      startDownload(bayAssetDownloadHref(`library:${context.ref.id}`), item.title);
      return;
    }
    const { artifactDownloadEvidence, getArtifactDownload } = await import("../artifact-client");
    const evidence = artifactDownloadEvidence(item);
    if (!evidence.available || ((evidence.purpose === "source" || evidence.mode === "source") && !context.rights.canDownloadSource)) throw new Error("download_not_allowed");
    const result = await getArtifactDownload(item);
    if (!result.ok || !result.data) throw new Error("download_failed");
    if (result.data.artifactId !== item.artifactId || result.data.revisionId !== item.revisionId) throw new Error("identity_mismatch");
    startDownload(result.data.url, result.data.filename, result.data.mediaType);
  },
};

function startDownload(url: string, filename: string, mediaType = "") {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.type = mediaType;
  link.rel = "noopener noreferrer";
  link.referrerPolicy = "no-referrer";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
}

export interface UseAssetActionsOptions extends ResolvedAssetDetail {
  onResolved?: (detail: ResolvedAssetDetail) => void;
  onEdit?: (entry: WorkspaceLibraryEntry) => Promise<void> | void;
  onUseInTask?: (entry: WorkspaceLibraryEntry) => Promise<void> | void;
  onAddToLibrary?: (entry: WorkspaceLibraryEntry) => Promise<void> | void;
  services?: Partial<AssetActionServices>;
}

function identityKey(context: AssetActionContext): string {
  return `${context.surface}:${JSON.stringify(context.ref)}`;
}

/** All rights and ownership changes come from resolve; mutations only request a refresh. */
export function useAssetActions(options: UseAssetActionsOptions) {
  const inputKey = identityKey(options.actionContext);
  const [snapshot, setSnapshot] = useState({ key: inputKey, inputEntry: options.entry, inputContext: options.actionContext, entry: options.entry, actionContext: options.actionContext });
  const [pending, setPending] = useState<AssetActionId | null>(null);
  const [failure, setFailure] = useState("");
  const [retryAction, setRetryAction] = useState<AssetActionId | null>(null);
  const [checkoutStarted, setCheckoutStarted] = useState(false);
  const latest = useRef(options);
  latest.current = options;
  const epoch = useRef(0);
  const active = useRef<{ key: string; epoch: number } | null>(null);
  const keyRef = useRef(inputKey);
  const recoveryRef = useRef<{ key: string; ref: AssetRef } | null>(null);
  if (keyRef.current !== inputKey) {
    keyRef.current = inputKey;
    epoch.current += 1;
  }
  const detail = snapshot.key === inputKey && snapshot.inputEntry === options.entry && snapshot.inputContext === options.actionContext ? snapshot : options;
  const current = useRef(detail);
  current.current = detail;
  useEffect(() => {
    epoch.current += 1;
    active.current = null;
    recoveryRef.current = null;
    setSnapshot({ key: inputKey, inputEntry: options.entry, inputContext: options.actionContext, entry: options.entry, actionContext: options.actionContext });
    setPending(null);
    setFailure("");
    setRetryAction(null);
    setCheckoutStarted(false);
    return () => { epoch.current += 1; };
  }, [inputKey, options.entry, options.actionContext]);

  async function run(id: AssetActionId): Promise<void> {
    const key = keyRef.current;
    const generation = epoch.current;
    if (active.current?.key === key && active.current.epoch === generation) return;
    const context = current.current.actionContext;
    const restartingCheckout = checkoutStarted && id === "buy";
    if (restartingCheckout || (id !== "refresh" && !assetToolbarItems(context).some((item) => item.id === id))) return;
    const operation = { key, epoch: generation };
    active.current = operation;
    setPending(id);
    setFailure("");
    setRetryAction(null);
    const valid = () => keyRef.current === key && epoch.current === generation;
    const services = { ...defaultServices, ...latest.current.services };
    const resolve = async (ref: AssetRef) => {
      const resolved = await services.resolve(ref, { surface: context.surface });
      const item = resolved.entry.libraryItem;
      if (ref.kind !== "artifact" && resolved.actionContext.owned && resolved.actionContext.commerce?.purchaseState !== "refunded" && resolved.actionContext.commerce?.purchaseState !== "pending" && item?.artifactId) {
        const library = await services.resolve({ kind: "artifact", artifactId: item.artifactId, ...(item.revisionId ? { revisionId: item.revisionId } : {}) }, { surface: context.surface });
        // Settled access to a seller root is not ownership of a Library copy.
        if (library.actionContext.owned) return library;
      }
      return resolved;
    };
    const publish = (next: ResolvedAssetDetail) => {
      if (!valid()) return;
      setSnapshot({ key, inputEntry: latest.current.entry, inputContext: latest.current.actionContext, ...next });
      latest.current.onResolved?.(next);
    };
    try {
      if (id === "buy") {
        await services.checkout(context.commerce!.listingId!);
        if (valid()) setCheckoutStarted(true);
      } else if (id === "get" || id === "add") {
        const ref = id === "add" ? await services.addToLibrary(current.current.entry, context) : await services.claim(context.ref);
        if (context.ref.kind === "platform" && ref?.kind === "platform" && ref.id !== context.ref.id) throw new Error("claim_identity_mismatch");
        if (ref && valid()) recoveryRef.current = { key, ref };
        const resolved = await resolve(ref || context.ref);
        // A 200 from claim is not proof that the current user owns a usable Library item.
        if (!resolved.actionContext.owned || resolved.actionContext.commerce?.purchaseState === "refunded" || resolved.actionContext.commerce?.purchaseState === "pending" || !resolved.entry.libraryItem) throw new Error("claim_unconfirmed");
        publish(resolved);
        if (valid()) recoveryRef.current = null;
        if (id === "add" && valid()) await latest.current.onAddToLibrary?.(resolved.entry);
      } else if (id === "refresh") {
        publish(await resolve(recoveryRef.current?.key === key ? recoveryRef.current.ref : context.ref));
        if (valid()) {
          recoveryRef.current = null;
          setCheckoutStarted(false);
        }
      } else {
        const handler = id === "edit" ? latest.current.onEdit : id === "use" ? latest.current.onUseInTask : undefined;
        if (id === "download") {
          if (!current.current.entry.libraryItem) throw new Error("missing_library_item");
          await services.download(current.current.entry.libraryItem, context);
        } else if (handler) {
          if (id === "edit") {
            if (!current.current.entry.libraryItem) throw new Error("missing_library_item");
            const { prepareArtifactForAction } = await import("../artifact-client");
            const prepared = await prepareArtifactForAction("edit", current.current.entry.libraryItem);
            if (!prepared.ok || !prepared.data) throw new Error("edit_unavailable");
            if (valid()) await handler({ ...current.current.entry, libraryItem: prepared.data });
          } else await handler(current.current.entry);
        }
      }
    } catch {
      if (valid()) {
        setFailure(id === "get" || id === "add" ? "未能加入我的库，请重试。" : id === "buy" ? "未能打开购买页面，请重试。" : "操作未完成，请重试。");
        // The mutation may already have succeeded. Retry resolution first to avoid a duplicate order/claim.
        setRetryAction(id === "get" || id === "add" ? "refresh" : id);
      }
    } finally {
      if (active.current === operation) active.current = null;
      if (valid()) setPending(null);
    }
  }

  // Checkout can navigate away; a surviving sidebar rechecks when the user returns.
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    if (!checkoutStarted && detail.actionContext.commerce?.purchaseState !== "pending") return;
    const refresh = () => {
      if (document.visibilityState !== "hidden") void runRef.current("refresh");
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [checkoutStarted, detail.actionContext.commerce?.purchaseState]);

  let items = assetToolbarItems(detail.actionContext);
  if (checkoutStarted && items.some((item) => item.id === "buy")) items = [{ id: "refresh", label: "刷新购买状态", disabled: false }];
  // A failed claim may need to resolve even while the original state still says Get.
  if (failure && retryAction === "refresh" && !items.some((item) => item.id === "refresh")) items = [...items, { id: "refresh", label: "刷新素材状态", disabled: false }];
  return {
    entry: detail.entry,
    actionContext: detail.actionContext,
    items: items.map((item) => ({ ...item, disabled: pending !== null || (item.id === "edit" && !options.onEdit) || (item.id === "use" && !options.onUseInTask) })),
    pending, failure, run,
    retry: retryAction ? () => run(retryAction) : undefined,
  };
}
