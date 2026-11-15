"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AgentMessage } from "../../lib/agent";
import { useUI } from "../../i18n/ui/useUI";
import { ConnectorIcon } from "../../pages/plugins/connector-icons";
import { AppFrame } from "./AppFrame";
import { createMcpAppsHost, type AppResource, type McpAppsHost } from "./host";
import { isUiResourceUri, recordValue } from "./protocol";

export interface McpAppConversation {
  taskId: string;
  /** Only the owning cloud-task composer may expose interactive connector tools. */
  isOwner: boolean;
  /** Stage and send through the task composer's ordinary reliable send path. Reject on failure. */
  onMessage: (text: string) => void | Promise<void>;
  /** A host/cache scoped to the current account and task; injectable in tests. */
  host?: McpAppsHost;
}

const Conversation = createContext<McpAppConversation | null>(null);

export function McpAppConversationProvider({ value, children }: { value: McpAppConversation; children: ReactNode }) {
  const host = useMemo(() => value.host ?? createMcpAppsHost({ taskId: value.taskId }), [value.taskId, value.host]);
  return <Conversation.Provider key={value.taskId} value={{ ...value, host }}>{children}</Conversation.Provider>;
}

export interface TranscriptAppCall {
  connectorId: string;
  name: string;
  resourceUri: string;
  connectorName: string;
  connectorIcon?: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
}

/** I2 is carried by the stored tool row, so reopening never repeats tools/call. */
export function transcriptAppCall(message: AgentMessage): TranscriptAppCall | null {
  if (message.role !== "assistant" || message.kind !== "step" || message.meta?.native === true) return null;
  const app = recordValue(message.meta?.mcp_app);
  if (!app || typeof app.connector_id !== "string" || !app.connector_id || app.connector_id.length > 200 ||
    typeof app.tool !== "string" || !app.tool || app.tool.length > 200 || !isUiResourceUri(app.resource_uri)) return null;
  const label = typeof app.connector_name === "string" && app.connector_name.trim()
    ? app.connector_name : app.connector_id.replace(/(^|[-_])([a-z])/g, (_, gap: string, letter: string) => `${gap ? " " : ""}${letter.toUpperCase()}`);
  return {
    connectorId: app.connector_id, name: app.tool, resourceUri: app.resource_uri,
    connectorName: label,
    connectorIcon: typeof app.connector_icon === "string" ? app.connector_icon : undefined,
    arguments: recordValue(app.arguments ?? message.meta?.arguments) ?? undefined,
    result: app.result ?? message.meta?.result,
  };
}

/** A stable call slot: chunk updates and expansion never move or remount its frame. */
export function TranscriptApp({ call, fallback }: { call: TranscriptAppCall; fallback: ReactNode }) {
  const conversation = useContext(Conversation);
  if (!conversation?.isOwner || !conversation.taskId || !conversation.host) return <>{fallback}</>;
  return <OwnedTranscriptApp key={`${call.connectorId}\n${call.resourceUri}`} call={call} fallback={fallback} conversation={conversation} host={conversation.host} />;
}

function OwnedTranscriptApp({ call, fallback, conversation, host }: {
  call: TranscriptAppCall; fallback: ReactNode; conversation: McpAppConversation; host: McpAppsHost;
}) {
  const tt = useUI();
  const slot = useRef<HTMLDivElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const [near, setNear] = useState(false);
  const [resource, setResource] = useState<AppResource | null>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const element = slot.current;
    if (!element || near) return;
    // Older hosts still get native lazy iframes; supported hosts defer even resources/read.
    if (typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setNear(true); observer.disconnect(); }
    }, { rootMargin: "320px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);
  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    void host.readAppResource({ connectorId: call.connectorId, ui: { resourceUri: call.resourceUri } }).then(
      (value) => { if (!cancelled) setResource(value); },
      () => { if (!cancelled) setResource(null); },
    );
    return () => { cancelled = true; };
  }, [near, host, call.connectorId, call.resourceUri]);
  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setExpanded(false); expandButton.current?.focus(); }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);
  const ready = resource && host.renderModeFor(resource) === "frame";
  return (
    <div ref={slot} data-transcript-mcp-app={call.connectorId} className="my-2 min-w-0 max-w-full" style={{ minWidth: 0, maxWidth: "100%" }}>
      <section
        data-mcp-app-expanded={expanded ? "true" : "false"}
        aria-label={call.connectorName}
        className={expanded ? "fixed inset-2 z-50 overflow-auto rounded-xl border border-stone-200 bg-white p-3 shadow-xl sm:inset-8" : "min-w-0 max-w-full"}
        style={expanded ? { position: "fixed", inset: "max(8px, 2vw)", zIndex: 50, overflow: "auto" } : { minWidth: 0, maxWidth: "100%" }}
      >
        {ready && <header className="mb-1 flex min-w-0 items-center gap-2 text-[12px] text-stone-500">
          <ConnectorIcon id={call.connectorId} icon={call.connectorIcon} label={call.connectorName} size="sm" />
          <span className="min-w-0 flex-1 truncate">{call.connectorName}</span>
          <button ref={expandButton} type="button" aria-expanded={expanded} data-mcp-app-expand="" onClick={() => setExpanded(!expanded)}
            className="min-h-11 shrink-0 rounded-lg px-2 hover:bg-stone-100">
            {expanded ? tt("收起连接器界面") : tt("展开连接器界面")}
          </button>
        </header>}
        {ready ? <AppFrame resourceUri={call.resourceUri} html={resource.html} csp={resource.csp}
          toolInput={call.arguments} toolResult={call.result} title={call.connectorName} fallback={fallback}
          sandboxOrigin={host.sandboxOrigin()}
          onToolCall={(name, args) => host.callAppTool(call.connectorId, name, args)}
          onMessage={(text) => conversation.onMessage(text)} /> : fallback}
      </section>
    </div>
  );
}
