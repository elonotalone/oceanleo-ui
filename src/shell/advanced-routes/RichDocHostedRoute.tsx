"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { useModeSwitchReady } from "./mode-switch-gate";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { submitRawReviewProposal } from "../agent-review";
import { downloadText } from "../doc-editors/doc-io";
import {
  buildRichDocEmbedUrl,
  buildRichDocInitEnvelope,
  RICHDOC_HOSTED_EMBED_ORIGIN,
  richDocHostedEmbedBase,
} from "../doc-editors/rich-doc-hosted-embed";
import {
  convertRichDocToUmo,
  inspectRichDocDocument,
  type ConvertFailure,
  type InspectResult,
  type UmoDocument,
} from "../doc-editors/rich-doc-umo-migration";
import { exportWechatFromTiptap } from "../doc-editors/rich-doc-wechat-export";
import {
  EDITOR_PROTOCOL,
  acceptEditorFrameMessage,
  asHostToEditorMessage,
  isValidEditorTargetOrigin,
} from "../editor-protocol";
import {
  embedEditorFrameSandbox,
  isTrustedEmbedEditorBase,
} from "../editor-sandbox-origin";
import {
  DEFAULT_EDITOR_MODE,
  buildHideChromeMessage,
  buildSetModeMessage,
  type EditorMode,
  type EditorReviewProposal,
} from "../hosted-editor/index";
import { editorToolLabel } from "../workbench-routes";

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
  for (const key of ["tiptap", "project", "umo"] as const) {
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

function emptyDoc(): { type: "doc"; content: { type: "paragraph" }[] } {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export type RichDocHostedEmbedSrcInput = {
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

export function computeRichDocHostedEmbedSrc(
  input: RichDocHostedEmbedSrcInput,
): string {
  if (!input.embedBase || !isTrustedEmbedEditorBase(input.embedBase)) return "";
  try {
    return buildRichDocEmbedUrl({
      instanceId: input.instanceId,
      hostOrigin: input.hostOrigin,
      assetUrl: input.assetUrl,
      assetTitle: input.assetTitle,
      base: input.embedBase,
    });
  } catch {
    return "";
  }
}

/** 宿主收下编辑器 `review-proposal` 的唯一入口。提前 return / 恒 ok 必须当场红。 */
export function ingestRichDocReviewProposal(
  proposal: EditorReviewProposal,
  extras: { liveRevision: number; editorId?: string },
): "ok" | "stale" | "invalid" {
  return submitRawReviewProposal(proposal, {
    liveRevision: extras.liveRevision,
    editorId: extras.editorId ?? "richdoc",
  });
}

/**
 * 双核 `next` 分支：Umo 托管在 `docs.oceanleo.app`。
 *
 * 存量文档先只读打开，用户点「一键转换」才把 Tiptap JSON 变成 Umo 副本。
 * iframe 内零凭据：保存走宿主 `save-request` → 编辑器回 `recovery-snapshot`。
 */
export function RichDocHostedRoute({
  item,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const instanceId = useRef(
    `rd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  ).current;
  const [mode, setMode] = useState<EditorMode>(DEFAULT_EDITOR_MODE);
  // pushInit 读 ref 而不是 state：init 会把正文整份重发，绝不能因为切页签就重跑。
  const modeRef = useRef<EditorMode>(DEFAULT_EDITOR_MODE);
  modeRef.current = mode;
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editRevision, setEditRevision] = useState(0);
  const [status, setStatus] = useState("");
  const [convertError, setConvertError] = useState("");
  const [converted, setConverted] = useState<UmoDocument | null>(null);
  const [snapshot, setSnapshot] = useState<unknown>(null);
  const [inspect, setInspect] = useState<InspectResult | null>(null);
  const [source, setSource] = useState<unknown>(null);
  const [readOnly, setReadOnly] = useState(true);
  const frameLoadedRef = useRef(false);
  const [frameLoaded, setFrameLoaded] = useState(false);
  // 过渡门的 ready 信号（plugin-ui U4）：Umo 的协议 ready 到达即首帧可见。
  useModeSwitchReady(ready);

  useEffect(() => {
    const inline = inlineSourceFromItem(item);
    if (inline) {
      const looked = inspectRichDocDocument(inline);
      setSource(inline);
      setInspect(looked);
      setReadOnly(looked.kind !== "umo" && looked.differences.length > 0);
      return;
    }
    const projectUrl = String(item.meta.editor_project_url || "").trim();
    if (!projectUrl) {
      setSource(emptyDoc());
      setInspect(inspectRichDocDocument(emptyDoc()));
      setReadOnly(false);
      return;
    }
    let cancelled = false;
    fetch(projectUrl, { cache: "no-store", headers: { Accept: "application/json" } })
      .then((response) => {
        if (!response.ok) throw new Error(`工程档读取失败（HTTP ${response.status}）`);
        return response.json() as Promise<unknown>;
      })
      .then((json) => {
        if (cancelled) return;
        const looked = inspectRichDocDocument(json);
        setSource(json);
        setInspect(looked);
        setReadOnly(looked.kind !== "umo" && looked.differences.length > 0);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setStatus(
          caught instanceof Error ? caught.message : "工程档读取失败，已按空白文档打开。",
        );
        setSource(emptyDoc());
        setInspect(inspectRichDocDocument(emptyDoc()));
        setReadOnly(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item]);

  const embedBase = richDocHostedEmbedBase();
  const editorOrigin = RICHDOC_HOSTED_EMBED_ORIGIN;
  const src = useMemo(() => {
    if (typeof window === "undefined") return "";
    return computeRichDocHostedEmbedSrc({
      embedBase,
      instanceId,
      hostOrigin: window.location.origin,
      assetUrl: item.url || undefined,
      assetTitle: item.title,
    });
  }, [embedBase, instanceId, item.title, item.url]);

  useEffect(() => {
    frameLoadedRef.current = false;
    setFrameLoaded(false);
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
    // 顺序有讲究：umo-hosted 收到 `init` 会把自己重置回默认普通模式（工具栏收起）。
    // 之前是「set-mode → hide-chrome → init」，且模式写死 DEFAULT，结果用户在
    // 「Umo」专业页看到的是一个没有顶部工具栏的 Umo（V2-P-tabs 第 5 条 FAIL）。
    // 现在先 init，再按宿主当前页的 mode 发 set-mode / hide-chrome。
    const current = modeRef.current;
    sendToEditor(
      buildRichDocInitEnvelope(instanceId, {
        content: converted?.content || source || emptyDoc(),
        readOnly,
        title: item.title,
        mode: current,
      }),
    );
    sendToEditor(buildSetModeMessage(instanceId, current));
    sendToEditor(
      buildHideChromeMessage(instanceId, {
        toolbar: current === "normal",
        panels: current === "normal",
      }),
    );
  }, [converted, instanceId, item.title, readOnly, sendToEditor, source]);

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
      if (message.type === "dirty") {
        setDirty(message.dirty === true);
        if (message.revision !== undefined) {
          const next =
            typeof message.revision === "number"
              ? message.revision
              : editRevision + 1;
          setEditRevision(next);
        }
        return;
      }
      if (message.type === "recovery-snapshot" && message.ok) {
        // 契约快照是 `{ revision, payload }`；正文在 payload 里。
        setSnapshot(message.snapshot?.payload ?? null);
        setDirty(false);
        return;
      }
      if (message.type === "review-proposal") {
        // 契约 v2 第 3 条的宿主一半：编辑器把 agent 改动挂起来交上来，
        // 这里交给 L4 审阅收件箱（W02 的 `signals/W02-review-api.md`，只读消费，
        // 校验器用 W01 那一份，不另造）。收不下就如实说，**不许静默丢**——
        // 丢掉等于编辑器那边永远挂着一条没人处理的改动。
        const verdict = ingestRichDocReviewProposal(message.proposal, {
          liveRevision: editRevision,
          editorId: "richdoc",
        });
        setStatus(
          verdict === "ok"
            ? "有一处改动等你确认，接受之前不会动文档"
            : verdict === "stale"
              ? "这条改动是针对旧版本提的，已作废，请重新发起"
              : "这条改动的描述不合法，已拒收，文档未改动",
        );
        if (verdict !== "ok") {
          sendToEditor({
            protocol: EDITOR_PROTOCOL,
            type: "review-decision",
            instanceId,
            proposalId: message.proposal.proposalId,
            decision: "reject",
          });
        }
        return;
      }
      if (message.type === "error" && typeof message.message === "string") {
        setStatus(message.message);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [editRevision, editorOrigin, instanceId, pushInit, sendToEditor]);

  // 人在审阅面板上点了接受/拒绝 ⇒ 回一条 `review-decision`。没有这一段，
  // 提案会永远停在「待审」，用户点了也没反应。
  useEffect(() => {
    const onDecision = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { proposalId?: unknown; decision?: unknown; editorId?: unknown }
        | undefined;
      if (!detail) return;
      if (detail.editorId !== undefined && detail.editorId !== "richdoc") return;
      const proposalId = String(detail.proposalId || "");
      const decision = detail.decision === "accept" ? "accept" : "reject";
      if (!proposalId) return;
      sendToEditor({
        protocol: EDITOR_PROTOCOL,
        type: "review-decision",
        instanceId,
        proposalId,
        decision,
      });
    };
    window.addEventListener("oceanleo-review-decision", onDecision);
    return () =>
      window.removeEventListener("oceanleo-review-decision", onDecision);
  }, [instanceId, sendToEditor]);

  useEffect(() => {
    if (!ready) return;
    pushInit();
  }, [converted, pushInit, ready, readOnly, source]);

  const convertNow = useCallback(() => {
    setConvertError("");
    const result = convertRichDocToUmo(source, { title: item.title });
    if (!result.ok) {
      const failure = result as ConvertFailure;
      setConvertError(failure.reason);
      return;
    }
    setConverted(result.document);
    setReadOnly(false);
    setStatus(
      result.document.warnings.length > 0
        ? `已转换。${result.document.warnings[0]}`
        : "已转换成 Umo 文档，可以继续编辑。",
    );
  }, [item.title, source]);

  const exportWechat = useCallback(() => {
    const payload = snapshot || converted || source;
    const result = exportWechatFromTiptap(payload, { title: item.title });
    if (!result.html) {
      setStatus(result.warnings[0] || "没有可导出的正文。");
      return;
    }
    downloadText(
      `${item.title || "document"}.wechat.html`,
      result.html,
      "text/html;charset=utf-8",
    );
    if (result.warnings.length > 0) setStatus(result.warnings[0]);
  }, [converted, item.title, snapshot, source]);

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

  const banner =
    inspect &&
    inspect.kind === "richdoc" &&
    inspect.differences.length > 0 &&
    !converted;
  const frameSandbox = embedEditorFrameSandbox(embedBase);

  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "richdoc",
        label: editorToolLabel({ type: "richdoc" }),
        available: true,
        mode: {
          current: mode,
          setMode: applyMode,
        },
        pages: { proLabel: "Umo" },
        actions: [
          {
            id: "richdoc-wechat-layout",
            label: "转公众号排版",
            group: "download",
            onTrigger: exportWechat,
          },
        ],
        stage: (
          <div className="flex h-full min-h-0 flex-col">
            {banner ? (
              <div className="shrink-0 border-b border-[var(--border,#e7e5e4)] px-4 py-3 text-sm">
                <p className="font-medium">这份文档按只读打开，原文没有改写</p>
                <p className="mt-1 text-xs opacity-70">
                  旧版富文档和 Umo 同源但扩展集不同。转换会列出每一处差异；失败会留下原因。
                </p>
                {inspect.differences.length > 0 ? (
                  <ul className="mt-2 max-h-24 overflow-auto text-xs opacity-80">
                    {inspect.differences.slice(0, 8).map((item) => (
                      <li key={`${item.path}:${item.feature}`}>
                        {item.feature} · {item.reason}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <button
                  type="button"
                  className="mt-2 rounded-md border px-3 py-1 text-xs"
                  onClick={convertNow}
                >
                  一键转换为 Umo
                </button>
                {convertError ? (
                  <p className="mt-2 text-xs text-red-600">{convertError}</p>
                ) : null}
              </div>
            ) : null}
            {src ? (
              <iframe
                ref={iframeRef}
                title="Umo Editor"
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
                <p>
                  无法构造 <code>{RICHDOC_HOSTED_EMBED_ORIGIN}</code> 的嵌入地址。
                  把双核 flag 切回 <code>legacy</code> 可继续用现有编辑器。
                </p>
              </div>
            )}
          </div>
        ),
        status:
          convertError ||
          status ||
          (!src
            ? "托管地址未放行"
            : ready
              ? readOnly
                ? "只读"
                : ""
              : "正在连接文档内核"),
        persistence: {
          dirty,
          editRevision,
          flush,
          recovery: {
            key: advancedRecoveryKey("richdoc", item),
            ready,
            capture: () => snapshot || converted || source,
            restore: () => false,
          },
        },
      }}
      onClose={onClose}
    />
  );
}
