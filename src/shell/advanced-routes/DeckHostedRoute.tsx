"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import {
  deckDocumentToPptist,
  PPTIST_CARRIER_FORMAT,
} from "../doc-editors/deck-pptist-carrier";
import { normalizeDeckDocument } from "../doc-editors/deck-schema";
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

function inlineSourceFromItem(item: AdvancedContentWorkbenchProps["item"]): unknown {
  const raw = typeof item.content === "string" ? item.content.trim() : "";
  if (raw) {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  const meta = item.meta || {};
  for (const key of ["deck", "slides", "project"] as const) {
    const value = meta[key];
    if (value && typeof value === "object") return value;
    if (typeof value === "string" && value.trim()) {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        /* next */
      }
    }
  }
  return null;
}

/**
 * 存量 deck IR 与已经是托管格式的工程档都要能打开。
 * 已经是托管格式的原样交出去（R6：存量只读，不静默改写）。
 */
function toHostedDocument(source: unknown, title: string): Record<string, unknown> {
  const record =
    source && typeof source === "object" && !Array.isArray(source)
      ? (source as Record<string, unknown>)
      : null;
  if (record && record.format === PPTIST_CARRIER_FORMAT && Array.isArray(record.slides)) {
    return record;
  }
  return deckDocumentToPptist(
    normalizeDeckDocument(source ?? {}, title || "演示文稿"),
  ) as unknown as Record<string, unknown>;
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
  const [dirty, setDirty] = useState(false);
  const [editRevision, setEditRevision] = useState(0);
  const [status, setStatus] = useState("");
  const [snapshot, setSnapshot] = useState<unknown>(null);
  const [source, setSource] = useState<unknown>(null);
  const [pending, setPending] = useState<EditorReviewProposal | null>(null);

  useEffect(() => {
    const inline = inlineSourceFromItem(item);
    if (inline) {
      setSource(inline);
      return;
    }
    const projectUrl = String(item.meta.editor_project_url || "").trim();
    if (!projectUrl) {
      setSource({});
      return;
    }
    let cancelled = false;
    fetch(projectUrl, { cache: "no-store", headers: { Accept: "application/json" } })
      .then((response) => {
        if (!response.ok) throw new Error(`工程档读取失败（HTTP ${response.status}）`);
        return response.json() as Promise<unknown>;
      })
      .then((json) => {
        if (!cancelled) setSource(json);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setStatus(
          caught instanceof Error ? caught.message : "工程档读取失败，已按空白演示打开。",
        );
        setSource({});
      });
    return () => {
      cancelled = true;
    };
  }, [item]);

  const embedBase = deckHostedEmbedBase();
  const editorOrigin = DECK_HOSTED_EMBED_ORIGIN;
  const src = useMemo(() => {
    if (typeof window === "undefined") return "";
    return computeDeckHostedEmbedSrc({
      embedBase,
      instanceId,
      hostOrigin: window.location.origin,
      assetUrl: item.url || undefined,
      assetTitle: item.title,
    });
  }, [embedBase, instanceId, item.title, item.url]);

  const sendToEditor = useCallback(
    (message: Record<string, unknown>) => {
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
    [editorOrigin, instanceId],
  );

  const pushInit = useCallback(() => {
    sendToEditor(buildSetModeMessage(instanceId, mode));
    sendToEditor(
      buildHideChromeMessage(instanceId, {
        toolbar: mode === "normal",
        panels: mode === "normal",
      }),
    );
    // `init` 先发：编辑器收到它才会报 tools-manifest / selection / history。
    // 只发 open-asset 的话文档进去了，但 agent 的接口面一条都没送上来。
    sendToEditor({
      protocol: EDITOR_PROTOCOL,
      type: "init",
      instanceId,
      mode,
      title: item.title || "演示文稿",
    });
    sendToEditor({
      protocol: EDITOR_PROTOCOL,
      type: "open-asset",
      instanceId,
      asset: {
        id: String(item.id || instanceId),
        kind: "deck",
        title: item.title || "演示文稿",
        meta: { document: toHostedDocument(source, item.title) },
        writable: true,
      },
    });
  }, [instanceId, item.id, item.title, mode, sendToEditor, source]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message = acceptEditorFrameMessage(event, {
        expectedOrigin: editorOrigin,
        frameWindow: iframeRef.current?.contentWindow,
        instanceId,
      });
      if (!message) return;
      if (message.type === "ready") {
        setReady(true);
        pushInit();
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
        setSnapshot(message.snapshot?.payload ?? null);
        setDirty(false);
        return;
      }
      if (message.type === "error" && typeof message.message === "string") {
        setStatus(message.message);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [editRevision, editorOrigin, instanceId, pushInit]);

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
    const saveId = `save-${Date.now().toString(36)}`;
    const sent = sendToEditor({
      protocol: EDITOR_PROTOCOL,
      type: "save-request",
      instanceId,
      saveId,
    });
    sendToEditor({
      protocol: EDITOR_PROTOCOL,
      type: "recovery-capture",
      instanceId,
      recoveryId: saveId,
    });
    if (!sent) {
      return { ok: false as const, error: "编辑器还没握手成功，不能保存。" };
    }
    return { ok: true as const, item };
  }, [instanceId, item, sendToEditor]);

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
            {src ? (
              <iframe
                ref={iframeRef}
                title="OceanLeo Slides"
                src={src}
                sandbox={frameSandbox}
                referrerPolicy="no-referrer"
                className="min-h-0 w-full flex-1 border-0"
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-sm">
                <p>
                  无法构造 <code>{DECK_HOSTED_EMBED_ORIGIN}</code> 的嵌入地址。
                  把双核 flag 切回 <code>legacy</code> 可继续用现有编辑器。
                </p>
              </div>
            )}
          </div>
        ),
        status:
          status ||
          (!src
            ? "托管地址未放行"
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
            ready,
            capture: () => snapshot || source,
            restore: () => false,
          },
        },
      }}
      onClose={onClose}
    />
  );
}
