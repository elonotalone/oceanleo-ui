"use client";

import { BackButton } from "../../../ui/BackButton";
import { useState, type ReactNode, type FormEvent } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { McpConnection, McpConnectorMeta } from "../../../lib/mcp-api";
import { ConnectorIcon } from "../../plugins/connector-icons";
import { connectorConnectMode, safeExternalHref } from "../../plugins/connector-logic";

export function ConnectorDetail({ connector, connection, busy, authorizing, onBack, onConnect,
  onDisconnect, advanced, onAdvanced, manual, status, management,
}: {
  connector: McpConnectorMeta;
  connection?: McpConnection;
  busy: boolean;
  authorizing: boolean;
  onBack: () => void;
  onConnect: (inputs: Record<string, string>) => void;
  onDisconnect: () => void;
  advanced: boolean;
  onAdvanced: () => void;
  manual: ReactNode;
  status?: ReactNode;
  management?: ReactNode;
}) {
  const tt = useUI();
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const mode = connectorConnectMode(connector);
  const ConnectSurface = mode.mode === "unavailable" ? "div" : "form";
  const about = (Array.isArray(connector.about) ? connector.about : (connector.about || "").split(/\n\s*\n/)).filter((p) => p.trim());
  const examples = (connector.examples || []).filter((p) => p.trim());
  const tools = connection?.tools?.length ? connection.tools : connector.tools || [];
  const links = [
    [tt("文档"), connector.links?.docs], [tt("支持"), connector.links?.support], [tt("隐私"), connector.links?.privacy],
  ].map(([label, href]) => ({ label, href: safeExternalHref(href) })).filter((link) => link.href);
  const makerHref = safeExternalHref(connector.made_by?.url);
  const action = "min-h-11 w-full rounded-lg bg-neutral-900 px-5 py-2 text-[13px] font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 sm:w-auto";
  const connectButton = <button type="submit" data-connector-connect disabled={busy || authorizing} className={action}>
    {authorizing ? tt("正在等待对方授权…") : busy ? tt("连接中…") : connection ? tt("重新连接") : tt("连接")}
  </button>;

  return (
    <article data-connector-detail={connector.id} className="min-w-0 space-y-6 pb-6" style={{ overflowWrap: "anywhere" }}>
      <BackButton data-connector-back onClick={onBack} label={tt("返回连接器")} />
      <ConnectSurface onSubmit={(event: FormEvent<HTMLElement>) => { event.preventDefault(); onConnect(inputs); }}>
        <header className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <ConnectorIcon icon={connector.icon} id={connector.id} label={tt(connector.name)} size="lg" />
            <div className="min-w-0">
              <h2 className="text-[22px] font-semibold text-neutral-900 dark:text-neutral-100">{tt(connector.name)}</h2>
              {(connector.tagline || connector.desc) ? <p className="mt-1 text-[13px] text-neutral-500">{tt(connector.tagline || connector.desc)}</p> : null}
              {connection ? <p data-connector-account className="mt-2 text-[12px] text-emerald-600">{tt("已连接")}{(connection.account_label || connection.label) ? ` · ${connection.account_label || connection.label}` : ""}</p> : null}
            </div>
          </div>
          {mode.mode === "oauth" ? connectButton : mode.mode === "input" ? <button type="button" className={action} onClick={() => document.getElementById(`connector-input-${connector.id}-${mode.inputs[0]?.id}`)?.focus()}>{tt("填写连接信息")}</button> : null}
        </header>
        {mode.mode === "input" ? (
          <div data-connector-inputs className="mt-5 max-w-lg space-y-4">
            {mode.inputs.map((input) => (
              <label key={input.id} className="block text-[13px] text-neutral-700 dark:text-neutral-300" htmlFor={`connector-input-${connector.id}-${input.id}`}>
                {tt(input.label)}
                <input id={`connector-input-${connector.id}-${input.id}`} data-connector-input={input.id} required={input.kind !== "secret"} type={input.kind === "secret" ? "password" : input.kind === "url" ? "url" : "text"}
                  value={inputs[input.id] || ""} placeholder={tt(input.placeholder)} autoComplete="off"
                  onChange={(event) => setInputs((prev) => ({ ...prev, [input.id]: event.target.value }))}
                  className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-neutral-200 bg-transparent px-3 dark:border-neutral-700" />
              </label>
            ))}
            {connectButton}
          </div>
        ) : mode.mode === "unavailable" ? <p data-connector-unavailable className="mt-4 text-[13px] text-neutral-500">{tt("{name} 尚未向 OceanLeo 开放一键连接", { name: tt(connector.name) })}</p> : null}
      </ConnectSurface>
      {status}
      {connection ? <div className="flex flex-wrap gap-2">{management}<button type="button" data-connector-disconnect onClick={onDisconnect} className="min-h-11 rounded-lg px-3 text-[13px] text-red-600">{tt("断开连接")}</button></div> : null}
      {about.length ? <section data-connector-section="about" className="space-y-3 text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-300">{about.map((paragraph, i) => <p key={i}>{tt(paragraph)}</p>)}</section> : null}
      {examples.length ? <section data-connector-section="examples"><h3 className="mb-3 text-[14px] font-medium">{tt("示例用法")}</h3><ul className="space-y-2">{examples.map((example, i) => <li key={i} className="rounded-lg bg-neutral-50 p-3 text-[13px] dark:bg-neutral-900">{tt(example)}</li>)}</ul></section> : null}
      {tools.length ? <section data-connector-section="tools"><h3 className="mb-3 text-[14px] font-medium">{tt("工具")}</h3><ul className="divide-y divide-neutral-100 dark:divide-neutral-800">{tools.map((tool) => <li key={tool.name} className="py-3 text-[13px]"><p className="font-medium">{tool.name}</p>{tool.description ? <p className="mt-1 text-neutral-500">{tt(tool.description)}</p> : null}</li>)}</ul></section> : null}
      {(connector.made_by?.name || connector.category || connector.capabilities?.length || connector.sign_in || links.length) ? (
        <dl data-connector-section="metadata" className="grid grid-cols-1 gap-4 border-t border-neutral-100 pt-5 text-[13px] dark:border-neutral-800 sm:grid-cols-2">
          {connector.made_by?.name ? <div><dt className="text-neutral-500">{tt("开发者")}</dt><dd className="mt-1">{makerHref ? <a href={makerHref} target="_blank" rel="noopener noreferrer">{connector.made_by.name}</a> : connector.made_by.name}</dd></div> : null}
          {connector.category ? <div><dt className="text-neutral-500">{tt("分类")}</dt><dd className="mt-1">{tt(connector.category)}</dd></div> : null}
          {connector.capabilities?.includes("in_chat_ui") ? <div><dt className="text-neutral-500">{tt("功能")}</dt><dd className="mt-1">{tt("在对话中打开界面")}</dd></div> : null}
          {connector.sign_in ? <div><dt className="text-neutral-500">{tt("登录")}</dt><dd className="mt-1">{tt(connector.sign_in === "required" ? "需要登录" : "无需登录")}</dd></div> : null}
          {links.length ? <div className="flex flex-wrap gap-4">{links.map((link) => <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className="text-sky-600 underline">{link.label}</a>)}</div> : null}
        </dl>
      ) : null}
      <div className="border-t border-neutral-100 pt-4 dark:border-neutral-800">
        <button type="button" data-connector-advanced aria-expanded={advanced} onClick={onAdvanced} className="min-h-11 text-left text-[12px] text-neutral-500">{tt("高级：我有自己的 MCP 地址")}</button>
        {advanced ? <div data-connector-manual className="mt-3 space-y-4">{manual}</div> : null}
      </div>
    </article>
  );
}
