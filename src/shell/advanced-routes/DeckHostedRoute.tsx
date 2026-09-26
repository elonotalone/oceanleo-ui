"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import {
  useModeSwitchFailure,
  useModeSwitchHandoff,
  useModeSwitchReady,
} from "./mode-switch-gate";
import {
  ENTER_PRO_NOT_READY,
  handoffItemKey,
  hostedSaveTimeoutMs,
  libraryItemFromProSave,
  materializeHandoffJson,
  openHostedSaveGate,
  reportProSaved,
  useEditorHandoffSource,
} from "./editor-handoff";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import {
  deckDocumentToPptist,
  PPTIST_CARRIER_FORMAT,
  pptistToDeckDocument,
} from "../doc-editors/deck-pptist-carrier";
import { normalizeDeckDocument } from "../doc-editors/deck-schema";
import { importPptxDeck } from "../doc-editors/pptx-deck-import";
import {
  EDITOR_PROTOCOL,
  acceptEditorFrameMessage,
  asHostToEditorMessage,
  buildEditorEmbedUrl,
  isValidEditorTargetOrigin,
} from "../editor-protocol";
import {
  embedEditorFrameSandbox,
  isTrustedEmbedEditorBase,
} from "../editor-sandbox-origin";
import {
  DEFAULT_EDITOR_MODE,
  buildHideChromeMessage,
  buildReviewDecisionMessage,
  buildSetModeMessage,
  type EditorMode,
  type EditorReviewProposal,
} from "../hosted-editor/index";
import { HOSTED_EDITOR_ORIGINS } from "../hosted-editor-origins";
import { editorToolLabel } from "../workbench-routes";

/**
 * 双核 `next` 分支：幻灯片托管在 `slides.oceanleo.app`。
 *
 * origin 白名单（`hosted-editor-origins.ts`，W01 的面）已经把这一件放进去了，
 * 所以这里挂的是真 iframe，不是说明面。沙箱档次由 `embedEditorFrameSandbox()`
 * 决定 —— 六件 Hosted 拿的是**不可信档**（有脚本、无同源），不在本文件里另议。
 *
 * iframe 内零凭据：文档随 `init` 进去、保存走 `recovery-snapshot` 回宿主落库。
 * agent 的改动不直接落地，编辑器先发 `review-proposal`，用户在本页点了才回
 * `review-decision: accept`（契约 v2 §3.3）。
 *
 * 本路由今天不发 `selection-command`。哪天接 L1 点击，必须在信封顶层盖
 * `origin: "user"`（或 human/l1/l2）。编辑器侧缺章一律送审，不能假定裸 id
 * 就是人点的（V3-red-7）。盖章位置见 `signals/W07-request.md` R5。
 */

/** 六件里属于幻灯片的那一条。白名单是事实源，这里只做一次全串挑选。 */
export const DECK_HOSTED_EMBED_ORIGIN = "https://slides.oceanleo.app";

export function deckHostedEmbedBase(): string {
  return (
    HOSTED_EDITOR_ORIGINS.find((origin) => origin === DECK_HOSTED_EMBED_ORIGIN) ||
    ""
  );
}

export type DeckHostedEmbedSrcInput = {
  embedBase: string;
  instanceId: string;
  hostOrigin: string;
  assetUrl?: string;
  assetTitle: string;
};

/**
 * 新核 iframe 真正挂上去的地址。抽成可调用的函数，是为了让闸能跑这条计算，
 * 而不是只在源码里搜标签名——`useMemo` 开头 `return ""` 时标签还在、用户已经
 * 看见「无法构造嵌入地址」。
 */
/** iframe 还没 load 到编辑器 origin 时禁止 postMessage，否则目标对不上、宿主自己吃到红字。 */
export function hostedIframeReadyToPost(loaded: boolean): boolean {
  return loaded === true;
}

export function computeDeckHostedEmbedSrc(input: DeckHostedEmbedSrcInput): string {
  if (!input.embedBase || !isTrustedEmbedEditorBase(input.embedBase)) return "";
  try {
    return buildEditorEmbedUrl(input.embedBase, {
      instanceId: input.instanceId,
      hostOrigin: input.hostOrigin,
      assetUrl: input.assetUrl,
      assetTitle: input.assetTitle,
      assetKind: "deck",
    });
  } catch {
    return "";
  }
}

function stableUrlPart(value: string): string {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

function stableInlinePart(value: unknown): string {
  try {
    return JSON.stringify(value) || "";
  } catch {
    return "";
  }
}

/** 内容身份不包含签名查询参数，签名刷新不能触发重读或卸载编辑器。 */
export function deckHostedContentIdentity(
  item: Pick<AdvancedContentWorkbenchProps["item"], "id" | "key" | "revisionId" | "meta" | "url">,
  resolved: { status: string; source?: unknown; error?: string } | null,
): string {
  const itemKey = String(item.key || item.id || "");
  const revision = String(
    item.revisionId || item.meta?.revision_id || item.meta?.handoff_revision || "",
  );
  const source = resolved?.source;
  if (source && typeof source === "object" && !Array.isArray(source)) {
    const record = source as Record<string, unknown>;
    if (record.kind === "inline") {
      return `${itemKey}|${revision}|inline|${String(record.revision || "")}|${stableInlinePart(record.json)}`;
    }
    if (record.kind === "url") {
      return `${itemKey}|${revision}|url|${String(record.revision || "")}|${stableUrlPart(String(record.url || ""))}`;
    }
  }
  const fallbackUrl = String(
    item.url || item.meta?.editor_working_head_url || item.meta?.editor_project_url || "",
  );
  if (fallbackUrl) return `${itemKey}|${revision}|url|${stableUrlPart(fallbackUrl)}`;
  return `${itemKey}|${revision}|${resolved?.status || "empty"}`;
}

function deckHostedResolutionIdentity(
  contentIdentity: string,
  resolved: { status: string; source?: unknown } | null,
  loadedIdentity: string,
): string {
  if (loadedIdentity === contentIdentity) return contentIdentity;
  const source = resolved?.source;
  if (source && typeof source === "object" && !Array.isArray(source)) {
    const record = source as Record<string, unknown>;
    if (record.kind === "url") {
      return `${contentIdentity}|${resolved?.status || ""}|${String(record.url || "")}`;
    }
  }
  return `${contentIdentity}|${resolved?.status || "empty"}`;
}

export const DECK_HOSTED_MISSING_EMBED_MESSAGE =
  "专业编辑器暂时打不开，普通编辑仍可继续使用。";

/**
 * 存量 deck IR 与已经是托管格式的工程档都要能打开。
 * 已经是托管格式的原样交出去（R6：存量只读，不静默改写）。
 */
function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => stripUndefined(entry));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined) result[key] = stripUndefined(entry);
    }
    return result;
  }
  return value;
}

function toHostedDocument(source: unknown, title: string): Record<string, unknown> {
  const record =
    source && typeof source === "object" && !Array.isArray(source)
      ? (source as Record<string, unknown>)
      : null;
  if (record && record.format === PPTIST_CARRIER_FORMAT && Array.isArray(record.slides)) {
    return stripUndefined(record) as Record<string, unknown>;
  }
  return stripUndefined(
    deckDocumentToPptist(
      normalizeDeckDocument(source ?? {}, title || "演示文稿"),
    ),
  ) as Record<string, unknown>;
}

export function DeckHostedRoute({
  item,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const instanceId = useRef(
    `dk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  ).current;
  const [mode, setMode] = useState<EditorMode>(DEFAULT_EDITOR_MODE);
  const [ready, setReady] = useState(false);
  const [documentOpened, setDocumentOpened] = useState(false);
  const openingIdRef = useRef<string | null>(null);
  const openingSequenceRef = useRef(0);
  const [dirty, setDirty] = useState(false);
  const [editRevision, setEditRevision] = useState(0);
  const [status, setStatus] = useState("");
  const [snapshot, setSnapshot] = useState<unknown>(null);
  const [source, setSource] = useState<unknown>(null);
  const [sourceReady, setSourceReady] = useState(false);
  const snapshotRef = useRef<unknown>(null);
  const sourceRef = useRef<unknown>(null);
  const initializedSourceRef = useRef<unknown>(null);
  snapshotRef.current = snapshot;
  sourceRef.current = source;
  const [pending, setPending] = useState<EditorReviewProposal | null>(null);
  const frameLoadedRef = useRef(false);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const saveGateRef = useRef<ReturnType<typeof openHostedSaveGate> | null>(
    null,
  );
  const gateHandoff = useModeSwitchHandoff();
  const reportModeSwitchFailure = useModeSwitchFailure();
  const resolved = useEditorHandoffSource(item, gateHandoff);
  // Inline sources stringify the whole deck; PPTist messages re-render this
  // route on every edit, so only recompute when the resolution itself changes.
  const contentIdentity = useMemo(
    () => deckHostedContentIdentity(item, resolved),
    [item, resolved],
  );
  const loadedContentIdentityRef = useRef("");
  const [embedAssetUrl, setEmbedAssetUrl] = useState(item.url || "");
  const resolutionIdentity = deckHostedResolutionIdentity(
    contentIdentity,
    resolved,
    loadedContentIdentityRef.current,
  );
  // The core booting is not proof that it opened this draft. Wait for its receipt.
  useModeSwitchReady(documentOpened);

  useEffect(() => {
    let cancelled = false;
    const sameContent = loadedContentIdentityRef.current === contentIdentity;
    if (resolved.status === "loading") {
      if (!sameContent) {
        setSource(null);
        setSourceReady(false);
        setStatus("正在读取演示文稿。");
      }
      return;
    }
    if (sameContent) {
      setStatus(resolved.error || "");
      return;
    }
    if (!sameContent) {
      setSourceReady(false);
      setSource(null);
      setReady(false);
      setDocumentOpened(false);
      openingIdRef.current = null;
      frameLoadedRef.current = false;
      initializedSourceRef.current = null;
      setFrameLoaded(false);
      setEmbedAssetUrl(item.url || "");
    }
    void (async () => {
      const sourceHandoff =
        resolved.source && resolved.source.kind !== "empty"
          ? resolved.source
          : null;
      if (!sourceHandoff) {
        if (!cancelled) {
          setStatus(resolved.error || ENTER_PRO_NOT_READY);
        }
        return;
      }
      const loaded = await materializeHandoffJson(sourceHandoff, {
        title: item.title || "演示文稿",
        fetchBytes: async (url) => {
          const response = await fetch(url, { cache: "no-store" });
          if (!response.ok) {
            throw new Error(`源文件读取失败（HTTP ${response.status}）`);
          }
          return response.arrayBuffer();
        },
        importPptx: async (bytes, title) =>
          deckDocumentToPptist(await importPptxDeck(bytes, title, "pptx")),
      });
      if (cancelled) return;
      if (!loaded.ok) {
        setStatus(loaded.error);
        return;
      }
      setStatus("");
      loadedContentIdentityRef.current = contentIdentity;
      setSource(loaded.json);
      setSourceReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [contentIdentity, resolutionIdentity]);

  const embedBase = deckHostedEmbedBase();
  const editorOrigin = DECK_HOSTED_EMBED_ORIGIN;
  const src = useMemo(() => {
    if (typeof window === "undefined") return "";
    return computeDeckHostedEmbedSrc({
      embedBase,
      instanceId,
      hostOrigin: window.location.origin,
      assetUrl: embedAssetUrl || undefined,
      assetTitle: item.title,
    });
  }, [embedAssetUrl, embedBase, instanceId, item.title]);

  useEffect(() => {
    frameLoadedRef.current = false;
    initializedSourceRef.current = null;
    setFrameLoaded(false);
    setReady(false);
    setDocumentOpened(false);
    openingIdRef.current = null;
  }, [src]);

  const sendToEditor = useCallback(
    (message: Record<string, unknown>) => {
      if (!hostedIframeReadyToPost(frameLoadedRef.current)) return false;
      const frame = iframeRef.current?.contentWindow;
      if (!frame || !isValidEditorTargetOrigin(editorOrigin)) return false;
      const envelope = { ...message, protocol: EDITOR_PROTOCOL, instanceId };
      if (!asHostToEditorMessage(envelope, instanceId)) return false;
      try {
        frame.postMessage(envelope, editorOrigin);
        return true;
      } catch {
        return false;
      }
    },
    [editorOrigin, frameLoaded, instanceId],
  );

  const pushInit = useCallback(() => {
    if (source == null || initializedSourceRef.current === source) return;
    if (!frameLoadedRef.current) return;
    const recoveryId = `open-${instanceId}-${++openingSequenceRef.current}`;
    // Full documents use the existing bounded snapshot channel. Asset metadata
    // is limited to 20 KB and silently rejected even ordinary multi-page decks.
    const restore = {
      protocol: EDITOR_PROTOCOL,
      type: "recovery-restore",
      instanceId,
      recoveryId,
      snapshot: { revision: 0, payload: toHostedDocument(source, item.title) },
    };
    if (!asHostToEditorMessage(restore, instanceId)) {
      initializedSourceRef.current = source;
      const message = "这份演示文稿超出专业编辑器的交接限制，原稿仍保留在普通编辑中。";
      setStatus(message);
      reportModeSwitchFailure(message);
      return;
    }
    // Claim the attempt before init: the iframe replies ready to init as well.
    // A repeated ready must not re-import over the user's live document.
    initializedSourceRef.current = source;
    openingIdRef.current = recoveryId;
    setDocumentOpened(false);
    const modeSent = sendToEditor(buildSetModeMessage(instanceId, mode));
    const chromeSent = sendToEditor(
      buildHideChromeMessage(instanceId, {
        toolbar: mode === "normal",
        panels: mode === "normal",
      }),
    );
    const initSent = sendToEditor({
      protocol: EDITOR_PROTOCOL,
      type: "init",
      instanceId,
      mode,
      title: item.title || "演示文稿",
    });
    const documentSent = sendToEditor(restore);
    if (!modeSent || !chromeSent || !initSent || !documentSent) {
      openingIdRef.current = null;
      setStatus(ENTER_PRO_NOT_READY);
      reportModeSwitchFailure(ENTER_PRO_NOT_READY);
    }
  }, [instanceId, item.title, mode, reportModeSwitchFailure, sendToEditor, source]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message = acceptEditorFrameMessage(event, {
        expectedOrigin: editorOrigin,
        frameWindow: iframeRef.current?.contentWindow,
        instanceId,
      });
      if (!message) return;
      if (message.type === "ready") {
        frameLoadedRef.current = true;
        setFrameLoaded(true);
        setReady(true);
        pushInit();
        return;
      }
      if (
        message.type === "recovery-result" &&
        message.recoveryId === openingIdRef.current
      ) {
        openingIdRef.current = null;
        if (message.ok) {
          setDocumentOpened(true);
          setStatus("");
        } else {
          const failure = message.message || ENTER_PRO_NOT_READY;
          setStatus(failure);
          reportModeSwitchFailure(failure);
        }
        return;
      }
      if (message.type === "dirty") {
        setDirty(message.dirty === true);
        if (message.revision !== undefined) {
          setEditRevision(
            typeof message.revision === "number"
              ? message.revision
              : editRevision + 1,
          );
        }
        return;
      }
      if (message.type === "review-proposal") {
        // 提案到达时文档还没变，`proposal.revision` 是提案前的那个数。
        setPending(message.proposal);
        return;
      }
      if (message.type === "recovery-snapshot" && message.ok) {
        const payload = message.snapshot?.payload ?? null;
        snapshotRef.current = payload;
        setSnapshot(payload);
        setDirty(false);
        const gate = saveGateRef.current;
        const recoveryId = String(message.recoveryId || "");
        if (gate && (!recoveryId || recoveryId === gate.saveId)) {
          gate.acceptSnapshot(payload);
          gate.acceptSaveResult();
        }
        return;
      }
      if (message.type === "error" && typeof message.message === "string") {
        setStatus(message.message);
        reportModeSwitchFailure(message.message);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [editRevision, editorOrigin, instanceId, pushInit, reportModeSwitchFailure]);

  useEffect(() => {
    if (!ready) return;
    pushInit();
  }, [pushInit, ready, source]);

  const decide = useCallback(
    (decision: "accept" | "reject") => {
      if (!pending) return;
      sendToEditor(
        buildReviewDecisionMessage(instanceId, pending.proposalId, decision),
      );
      setPending(null);
      setStatus(
        decision === "accept" ? "已接受这条改动。" : "已拒绝，文档一个字没改。",
      );
    },
    [instanceId, pending, sendToEditor],
  );

  const applyMode = useCallback(
    (next: EditorMode) => {
      setMode(next);
      sendToEditor(buildSetModeMessage(instanceId, next));
      sendToEditor(
        buildHideChromeMessage(instanceId, {
          toolbar: next === "normal",
          panels: next === "normal",
        }),
      );
    },
    [instanceId, sendToEditor],
  );

  const flush = useCallback(async () => {
    if (!sourceReady) {
      return { ok: false as const, error: "文件还没成功载入，不能保存。" };
    }
    const gate = openHostedSaveGate({ timeoutMs: hostedSaveTimeoutMs() });
    saveGateRef.current = gate;
    const sent = sendToEditor({
      protocol: EDITOR_PROTOCOL,
      type: "save-request",
      instanceId,
      saveId: gate.saveId,
    });
    sendToEditor({
      protocol: EDITOR_PROTOCOL,
      type: "recovery-capture",
      instanceId,
      recoveryId: gate.saveId,
    });
    if (!sent) {
      return { ok: false as const, error: "编辑器还没握手成功，不能保存。" };
    }
    const confirmed = await gate.wait();
    if (!confirmed.ok) {
      return { ok: false as const, error: confirmed.error };
    }
    const payload = confirmed.snapshot;
    snapshotRef.current = payload;
    setSnapshot(payload);
    const deck = pptistToDeckDocument(payload, item.title || "演示文稿");
    const revision = `${Date.now().toString(36)}`;
    const savedItem = libraryItemFromProSave(item, { deck, revision });
    sendToEditor({
      protocol: EDITOR_PROTOCOL,
      type: "save-result",
      instanceId,
      ok: true,
      message: "已保存",
      saveId: gate.saveId,
      revision,
    });
    reportProSaved(handoffItemKey(item), savedItem);
    return { ok: true as const, item: savedItem };
  }, [instanceId, item, sendToEditor, sourceReady]);

  const frameSandbox = embedEditorFrameSandbox(embedBase);

  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "deck",
        label: editorToolLabel({ type: "deck" }),
        available: true,
        mode: {
          current: mode,
          setMode: applyMode,
        },
        pages: { proLabel: "PPTist" },
        stage: (
          <div className="flex h-full min-h-0 flex-col">
            {pending ? (
              <div className="shrink-0 border-b border-[var(--border,#e7e5e4)] px-4 py-3 text-sm">
                <p className="font-medium">这条改动还没写进文档，等你点头</p>
                <p className="mt-1 text-xs opacity-70">
                  {pending.summary.before} → {pending.summary.after}
                </p>
                {pending.objects && pending.objects.length > 0 ? (
                  <ul className="mt-2 max-h-24 overflow-auto text-xs opacity-80">
                    {pending.objects.slice(0, 8).map((change) => (
                      <li key={change.id}>
                        {change.label} · {change.op}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="rounded-md border px-3 py-1 text-xs"
                    onClick={() => decide("accept")}
                  >
                    接受
                  </button>
                  <button
                    type="button"
                    className="rounded-md border px-3 py-1 text-xs"
                    onClick={() => decide("reject")}
                  >
                    拒绝
                  </button>
                </div>
              </div>
            ) : null}
            {src && source != null ? (
              <iframe
                key={contentIdentity}
                ref={iframeRef}
                title="OceanLeo Slides"
                src={src}
                sandbox={frameSandbox}
                referrerPolicy="no-referrer"
                className="min-h-0 w-full flex-1 border-0"
                onLoad={() => {
                  frameLoadedRef.current = true;
                  setFrameLoaded(true);
                }}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-sm">
                <p>{!src ? DECK_HOSTED_MISSING_EMBED_MESSAGE : status || "正在读取演示文稿。"}</p>
              </div>
            )}
          </div>
        ),
        status:
          status ||
          (!src
            ? DECK_HOSTED_MISSING_EMBED_MESSAGE
            : pending
              ? "有一条改动待审阅"
              : ready
                ? ""
                : "正在连接幻灯片内核"),
        persistence: {
          dirty,
          editRevision,
          flush,
          recovery: {
            key: advancedRecoveryKey("deck", item),
            ready: ready && sourceReady,
            capture: () => snapshotRef.current || sourceRef.current,
            restore: (payload) => {
              if (!sourceReady || payload == null) return false;
              snapshotRef.current = payload;
              sourceRef.current = payload;
              setSnapshot(payload);
              setSource(payload);
              sendToEditor({
                protocol: EDITOR_PROTOCOL,
                type: "recovery-restore",
                instanceId,
                recoveryId: `restore-${Date.now().toString(36)}`,
                snapshot: { revision: editRevision, payload },
              });
              return true;
            },
          },
        },
      }}
      onClose={onClose}
    />
  );
}
