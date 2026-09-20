"use client";

// ============================================================================
// @oceanleo/ui — 聊天框下沿的「应用」入口（W14，2026-09-20）
// ----------------------------------------------------------------------------
// 操作员要的：「聊天框下面一个按键，点开就是一排功能按钮」。
//
// 数据来自「此人可用的 MCP 工具里带 `_meta.ui.resourceUri` 的那些」
// （`host.listAppTools()`）。**零可用时不渲染**——今天全部用户都在这一支上
// （网关还没有 MCP Apps 端点，`listAppTools()` 恒回 `[]`），输入框那一排与
// 挂本组件之前逐字相同。这是 A6「零可用 App 不渲染」的实现根据，由测试锁死。
//
// 点一个应用：先 `resources/read` 取它的界面；能进沙箱 iframe（有 HTML、承载面
// 在白名单）就出 `AppFrame`，界面自己驱动 `tools/call`；进不了（MIME 不对、
// 网关失败、注入空表）就 **替用户调一次工具**并把结果的纯文本摆出来——降级
// 路径给的是工具的结果，不是一句「不支持」。取不到、调不通都只显示一行说明，
// 不弹窗、不抛错。
// ============================================================================

import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { AppFrame } from "./AppFrame";
import { type AppResource, type McpAppsHost, createMcpAppsHost } from "./host";
import { type AppTool, plainTextOfToolResult } from "./protocol";

let defaultHost: McpAppsHost | null = null;

/** 生产缺省宿主：整页共用一份缓存。 */
export function defaultAppsHost(): McpAppsHost {
  if (!defaultHost) defaultHost = createMcpAppsHost();
  return defaultHost;
}

export interface ComposerAppsBarProps {
  /** 注入宿主（测试 / 站点自定义传输层）；不传用 `defaultAppsHost()`。 */
  host?: McpAppsHost;
  /** 界面 `ui/message`：把一句话交给输入框追加。 */
  onInsertText?: (text: string) => void;
  /** 界面 `ui/update-model-context`。 */
  onContextUpdate?: (context: Record<string, unknown>) => void;
  className?: string;
}

interface ActiveApp {
  tool: AppTool;
  resource: AppResource | null;
  /** 降级路径替用户调一次工具的结果；`undefined` = 还没调 / 走 iframe。 */
  result?: unknown;
  busy: boolean;
  failed: boolean;
}

export function ComposerAppsBar({
  host,
  onInsertText,
  onContextUpdate,
  className = "",
}: ComposerAppsBarProps) {
  const tt = useUI();
  const [tools, setTools] = useState<AppTool[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<ActiveApp | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<McpAppsHost | null>(null);
  if (!hostRef.current || (host && hostRef.current !== host)) hostRef.current = host ?? defaultAppsHost();
  const appsHost = hostRef.current;

  useEffect(() => {
    let cancelled = false;
    appsHost
      .listAppTools()
      .then((list) => {
        if (!cancelled) setTools(list);
      })
      .catch(() => {
        if (!cancelled) setTools([]);
      });
    return () => {
      cancelled = true;
    };
  }, [appsHost]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const launch = useCallback(
    async (tool: AppTool) => {
      setActive({ tool, resource: null, busy: true, failed: false });
      const resource = await appsHost.readAppResource(tool);
      if (appsHost.renderModeFor(resource) === "frame") {
        setActive({ tool, resource, busy: false, failed: false });
        return;
      }
      // 降级：界面进不了沙箱，就替用户调一次工具，把结果的纯文本摆出来。
      try {
        const result = await appsHost.callAppTool(tool.connectorId, tool.name, {});
        setActive({ tool, resource: null, result, busy: false, failed: false });
      } catch {
        setActive({ tool, resource: null, busy: false, failed: true });
      }
    },
    [appsHost],
  );

  const callTool = useCallback(
    (name: string, args: Record<string, unknown>) => {
      const tool = active?.tool;
      if (!tool) return Promise.reject(new Error("no active app"));
      return appsHost.callAppTool(tool.connectorId, name, args);
    },
    [appsHost, active?.tool],
  );

  // 零可用 = 一个字节都不渲染。
  if (tools.length === 0) return null;

  const label = tt("应用");

  return (
    <div ref={rootRef} className={`relative ${className}`} data-composer-apps-bar="">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (open) setActive(null);
        }}
        aria-label={label}
        title={label}
        aria-expanded={open}
        // 命中区 44px（min-h-11/min-w-11），负外边距让它在 28px 高的工具排里不撑行；圆形视觉在内层 span。
        className="group -m-2 flex min-h-11 min-w-11 items-center justify-center"
      >
        <span
          aria-hidden="true"
          className={`flex h-7 w-7 items-center justify-center rounded-full border transition-all duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] group-active:duration-[var(--leo-dur-1)] group-active:scale-95 ${
            open
              ? "border-neutral-300 bg-neutral-100 text-neutral-800"
              : "border-neutral-200 text-neutral-500 group-hover:border-neutral-300 group-hover:bg-neutral-50 group-hover:text-neutral-700"
          }`}
        >
          <GridGlyph />
        </span>
      </button>

      {open && !active && (
        <div
          className="v-fade-up absolute bottom-9 left-0 z-50 min-w-[220px] rounded-xl border border-neutral-200 bg-white py-1.5 shadow-lg"
          role="menu"
          data-composer-apps-list=""
        >
          {tools.map((tool) => (
            <button
              key={`${tool.connectorId}/${tool.name}`}
              type="button"
              role="menuitem"
              title={tool.description || tool.title || tool.name}
              onClick={() => void launch(tool)}
              data-composer-app={tool.name}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-neutral-700 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-100"
            >
              <span className="shrink-0 text-neutral-500">
                <AppGlyph />
              </span>
              <span className="min-w-0 flex-1 truncate">{tool.title || tool.name}</span>
            </button>
          ))}
        </div>
      )}

      {open && active && (
        <div
          className="v-fade-up absolute bottom-9 left-0 z-50 w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-neutral-200 bg-white p-2 shadow-lg"
          data-composer-app-panel={active.tool.name}
        >
          <div className="mb-1.5 flex items-center justify-between px-1">
            <button
              type="button"
              onClick={() => setActive(null)}
              aria-label={tt("返回应用列表")}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
            >
              ‹ {tt("应用")}
            </button>
            <span className="min-w-0 flex-1 truncate px-2 text-[12px] font-medium text-neutral-700">
              {active.tool.title || active.tool.name}
            </span>
            <button
              type="button"
              onClick={() => {
                setActive(null);
                setOpen(false);
              }}
              aria-label={tt("关闭")}
              className="-m-2 flex min-h-11 min-w-11 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            >
              ×
            </button>
          </div>
          <Body
            active={active}
            onToolCall={callTool}
            onMessage={onInsertText}
            onContextUpdate={onContextUpdate}
            busyText={tt("正在打开…")}
            failedText={tt("这个应用暂时打不开，稍后再试。")}
            emptyText={tt("这个工具没有返回可显示的内容。")}
          />
        </div>
      )}
    </div>
  );
}

function Body({
  active,
  onToolCall,
  onMessage,
  onContextUpdate,
  busyText,
  failedText,
  emptyText,
}: {
  active: ActiveApp;
  onToolCall: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  onMessage?: (text: string) => void;
  onContextUpdate?: (context: Record<string, unknown>) => void;
  busyText: string;
  failedText: string;
  emptyText: string;
}): ReactElement {
  if (active.busy) {
    return (
      <p className="flex items-center gap-2 px-2 py-3 text-[12px] text-neutral-400" data-composer-app-busy="">
        <span className="v-spinner text-[10px]" />
        {busyText}
      </p>
    );
  }
  if (active.failed) {
    return (
      <p className="px-2 py-3 text-[12px] text-neutral-500" data-composer-app-failed="">
        {failedText}
      </p>
    );
  }
  if (active.resource) {
    return (
      <AppFrame
        resourceUri={active.tool.ui.resourceUri}
        html={active.resource.html}
        csp={active.resource.csp ?? active.tool.ui.csp}
        toolInput={{}}
        toolResult={active.result}
        onToolCall={onToolCall}
        onMessage={onMessage}
        onContextUpdate={onContextUpdate}
        title={active.tool.title || active.tool.name}
        emptyFallback={emptyText}
      />
    );
  }
  // 纯文本降级：`AppFrame` 拿 `html=null` 走的就是同一条渲染，这里不另写一份。
  const text = plainTextOfToolResult(active.result);
  return (
    <AppFrame
      resourceUri={active.tool.ui.resourceUri}
      html={null}
      toolResult={text ? active.result : undefined}
      onToolCall={onToolCall}
      title={active.tool.title || active.tool.name}
      emptyFallback={emptyText}
    />
  );
}

function GridGlyph() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </svg>
  );
}

function AppGlyph() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M8 12h8M12 8v8" strokeLinecap="round" />
    </svg>
  );
}

export default ComposerAppsBar;
