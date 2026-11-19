"use client";

import { useEffect, useRef, useState } from "react";
import { useAutoRecovery } from "../lib/auto-recovery";
import { resolveAssetDetail } from "./asset-detail/resolve";
import type { AssetActionContext, AssetRef, AssetSurface, ResolvedAssetDetail } from "./asset-detail/types";
import type { WorkspaceLibraryEntry } from "./workspace-library-model";

export interface WorkspaceEntryOpenOptions {
  mode?: "preview" | "edit";
  actionContext?: AssetActionContext;
  bindTask?: boolean;
}
export type TaskWorkspaceOpenEntry = {
  nonce: string;
  mode: "preview" | "edit";
  bindTask?: boolean;
} & ({ entry: WorkspaceLibraryEntry; actionContext?: AssetActionContext } | { ref: AssetRef; surface?: AssetSurface });

/** Temporary failures keep loading; late resolutions cannot replace a newer selection. */
export function useWorkspaceEntryRequest(
  request: TaskWorkspaceOpenEntry | null | undefined,
  onOpen: (detail: { entry: WorkspaceLibraryEntry; actionContext?: AssetActionContext }, mode: "preview" | "edit", bindTask: boolean) => void,
) {
  const [retry, setRetry] = useState(0);
  const [recovering, setRecovering] = useState(false);
  const [status, setStatus] = useState<"loading" | "error" | null>(null);
  const [reason, setReason] = useState("素材暂时无法读取，请重试。");
  const [dismissed, setDismissed] = useState("");
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  const consumed = useRef("");
  useAutoRecovery(Boolean(request && request.nonce !== dismissed && recovering), () => setRetry(value => value + 1), request?.nonce);
  useEffect(() => {
    setRecovering(false);
    if (!request || request.nonce === dismissed) { setStatus(null); return; }
    const key = `${request.nonce}:${retry}`;
    if (consumed.current === key) return;
    const controller = new AbortController();
    if ("entry" in request && (request.mode !== "edit" || !request.actionContext?.rights.canEdit || !request.entry.libraryItem)) {
      consumed.current = key;
      if (request.actionContext && !request.actionContext.rights.canView) {
        setReason("你没有查看这份素材的权限，请先登录或联系作者。"); setStatus("error"); return;
      }
      openRef.current(request, request.mode, Boolean(request.bindTask));
      setStatus(null);
      return;
    }
    setStatus("loading");
    const surface = "entry" in request ? request.actionContext?.surface || "task" : request.surface || "task";
    const resolution = "entry" in request
      ? Promise.resolve({ entry: request.entry, actionContext: request.actionContext! })
      : resolveAssetDetail(request.ref, { surface, signal: controller.signal });
    resolution.then(async (detail: ResolvedAssetDetail) => {
      if (controller.signal.aborted) return;
      if (!detail.actionContext.rights.canView) {
        setReason("你没有查看这份素材的权限，请先登录或联系作者。"); setStatus("error"); return;
      }
      if (request.mode === "edit" && detail.actionContext.rights.canEdit && detail.entry.libraryItem) {
        const { prepareArtifactForAction } = await import("./artifact-client");
        const prepared = await prepareArtifactForAction("edit", detail.entry.libraryItem);
        if (controller.signal.aborted) return;
        if (!prepared.ok || !prepared.data) throw prepared;
        const item = prepared.data;
        const previous = detail.entry.libraryItem;
        detail = item.artifactId && item.revisionId && (item.artifactId !== previous.artifactId || item.revisionId !== previous.revisionId)
          ? await resolveAssetDetail({ kind: "artifact", artifactId: item.artifactId, revisionId: item.revisionId }, { surface, signal: controller.signal })
          : { ...detail, entry: { ...detail.entry, libraryItem: item } };
        if (controller.signal.aborted) return;
      }
      consumed.current = key;
      openRef.current(detail, request.mode, Boolean(request.bindTask));
      setStatus(null);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      const failure = error as { status?: number; kind?: string; code?: string } | null;
      const denied = failure?.kind === "no-access" || failure?.status === 401 || failure?.status === 403 || failure?.code === "unauthorized";
      const missing = failure?.kind === "not-found" || failure?.status === 404 || failure?.status === 410 || failure?.code === "not-found";
      if (denied || missing) {
        setReason(denied ? "你没有查看这份素材的权限，请先登录或联系作者。" : "这份素材已下架或不存在。");
        setStatus("error");
      } else {
        setStatus("loading");
        setRecovering(true);
      }
    });
    return () => controller.abort();
  }, [request?.nonce, retry, dismissed]);
  return { status, reason, dismiss: () => setDismissed(request?.nonce || "") };
}
