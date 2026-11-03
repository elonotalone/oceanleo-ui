"use client";

import { useEffect, useRef, useState } from "react";
import {
  websiteConnectorsApi, type WebsiteConnectorChange, type WebsiteConnectorDetails,
  type WebsiteConnectorMutation, type WebsiteConnectorOption, type WebsiteConnectorSlot,
  type WebsiteConnectorsApi, type WebsiteConnectorsSnapshot,
} from "../../api/website-connectors";
import { SiteVaultPanel } from "./SiteVaultPanel";
import { useWebsiteLanguage, useWebsiteUI } from "./website-preview-i18n";

const PROVIDERS = { ours: "OceanLeo 提供", on_behalf: "代你购买", own_account: "你自己的账户" } as const;
const CONNECTION_STATES = { not_connected: "未连接", connected: "已连接", error: "连接错误" } as const;
const TASK_STATES: Record<string, string> = {
  pending: "等待处理", queued: "已排队", running: "执行中", completed: "已完成", failed: "失败",
  cancelled: "已取消", review: "等待审核", awaiting_approval: "等待批准", needs_approval: "等待批准",
  unavailable: "状态暂不可用", missing: "任务不存在",
};
const TASK_ERRORS: Record<string, string> = {
  agent_task_creation_failed: "无法创建配置任务，请重试。",
  task_dispatch_failed: "无法创建配置任务，请重试。",
  task_state_unavailable: "暂时无法读取任务状态，请稍后重试。",
  task_not_found: "配置任务不存在，请重试。",
  agent_task_failed: "配置任务执行失败，请打开任务查看原因。",
  agent_task_cancelled: "配置任务已取消。",
};
const SLOT_LABELS: Record<string, string> = {
  dev_runtime: "开发与运行服务", code: "代码仓库", database: "数据库", auth: "登录与认证",
  storage: "文件存储", hosting: "网站托管", domain: "域名", analytics: "访问统计", scheduler: "定时任务",
};

function useConnectorText() {
  const tt = useWebsiteUI();
  const locale = useWebsiteLanguage();
  return (text: string, chinese?: string) => tt(locale.startsWith("zh") && chinese ? chinese : text);
}

function ConnectorFacts({ connector }: { connector: WebsiteConnectorDetails }) {
  const tt = useWebsiteUI();
  const text = useConnectorText();
  const chinese = useWebsiteLanguage().startsWith("zh");
  const limits = chinese && connector.limits_zh?.length ? connector.limits_zh : connector.limits;
  return <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
    <dt className="opacity-65">{tt("提供方式")}</dt><dd>{tt(PROVIDERS[connector.provider_kind])}</dd>
    <dt className="opacity-65">{tt("费用依据")}</dt><dd className="whitespace-pre-wrap break-words">{text(connector.cost_basis, connector.cost_basis_zh) || tt("尚无费用依据")}</dd>
    <dt className="opacity-65">{tt("费率来源")}</dt><dd className="break-words">{text(connector.rate_source, connector.rate_source_zh) || tt("尚无费率来源")}</dd>
    <dt className="opacity-65">{tt("限制")}</dt><dd>{limits.length
      ? <ul className="list-inside list-disc space-y-1">{limits.map((limit, index) => <li key={index}>{tt(limit)}</li>)}</ul>
      : tt("未声明额外限制")}</dd>
    <dt className="opacity-65">{tt("标准接口")}</dt><dd className="break-words">{connector.standard_interface.length
      ? connector.standard_interface.map((name, index) => <code key={index} className="mr-2 inline-block">{name}</code>)
      : tt("尚未声明接口")}</dd>
  </dl>;
}

function ConnectorRow({ slot, catalog, pending, available, retryable, onSelect }: {
  slot: WebsiteConnectorSlot; catalog: WebsiteConnectorOption[]; pending: boolean; available: boolean; retryable: boolean;
  onSelect: (slot: string, connectorId: string) => void;
}) {
  const tt = useWebsiteUI();
  const text = useConnectorText();
  const [draft, setDraft] = useState(slot.connector_id);
  useEffect(() => { setDraft(slot.connector_id); }, [slot.connector_id]);
  const options = catalog.filter(connector => connector.slots.includes(slot.slot));
  const selected = catalog.find(connector => connector.connector_id === slot.connector_id);
  const draftOption = options.find(connector => connector.connector_id === draft);
  const label = tt(SLOT_LABELS[slot.slot] || slot.label);
  return <section className="rounded border border-[var(--awb-border)] p-3" data-testid={`website-connector-${slot.slot}`}>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">{label}</h3>
      <span className="rounded bg-[var(--awb-hover)] px-2 py-1 text-xs" data-connection-status={slot.status}>{tt(CONNECTION_STATES[slot.status])}</span>
    </div>
    <p className="text-xs"><span className="opacity-65">{tt(slot.selection_source === "default" ? "默认选择" : "已保存选择")}: </span>{text(selected?.label || slot.connector_id, selected?.label_zh)}</p>
    {slot.status_detail && <p className={`mt-1 break-words text-xs ${slot.status === "error" ? "text-red-600" : "opacity-65"}`}>{text(slot.status_detail, slot.status_detail_zh)}</p>}
    <div className="my-3 flex items-center gap-2">
      <select aria-label={tt("{slot}连接器", { slot: label })} className="min-w-0 flex-1 rounded border bg-[var(--awb-chrome-bg)] p-2 text-xs"
        value={draft} onChange={event => setDraft(event.target.value)}>
        {!options.some(option => option.connector_id === slot.connector_id) && <option value={slot.connector_id}>{text(selected?.label || slot.connector_id, selected?.label_zh)}</option>}
        {options.map(option => <option key={option.connector_id} value={option.connector_id} disabled={option.available === false}>
          {text(option.label, option.label_zh)} · {tt(PROVIDERS[option.provider_kind])}{option.available === false ? " · " + tt("暂不可用") : ""}
        </option>)}
      </select>
      <button type="button" disabled={pending || !available || !draftOption || draftOption.available === false || (draft === slot.connector_id && slot.selection_source === "saved" && !retryable)}
        className="shrink-0 rounded border px-3 py-2 text-xs disabled:opacity-50" onClick={() => onSelect(slot.slot, draft)}>{tt(retryable && draft === slot.connector_id ? "重试" : "应用")}</button>
    </div>
    <ConnectorFacts connector={slot} />
    {slot.task_id && <p className="mt-3 text-xs"><a className="underline" href={"/tasks/" + encodeURIComponent(slot.task_id)}>{tt("打开 agent 任务")}</a></p>}
    <details className="mt-3 border-t border-[var(--awb-border)] pt-2 text-xs">
      <summary className="cursor-pointer">{tt("可用连接器（{count}）", { count: options.length })}</summary>
      <div className="mt-3 space-y-4">{options.map(option => <div key={option.connector_id}>
        <h4 className="mb-2 font-semibold">{text(option.label, option.label_zh)}</h4>
        {option.available === false && <p className="mb-2 text-red-600" data-availability-code={option.availability_code}>{tt("此连接器暂不可用，请选择其他服务。")}</p>}
        <ConnectorFacts connector={option} />
      </div>)}</div>
    </details>
  </section>;
}

function ConnectorChange({ change, catalog }: { change: WebsiteConnectorChange; catalog: WebsiteConnectorOption[] }) {
  const tt = useWebsiteUI();
  const text = useConnectorText();
  return <li className="rounded border border-[var(--awb-border)] p-3 text-xs" data-testid="website-connector-change" data-change-status={change.status}>
    <p className="font-medium">{tt(change.kind === "preset" ? "方案变更" : "连接器变更")} · {tt(TASK_STATES[change.status] || change.status)}</p>
    <p className="mt-1 break-words opacity-65">{Object.entries(change.selections).map(([slot, id]) => {
      const connector = catalog.find(item => item.connector_id === id);
      return `${tt(SLOT_LABELS[slot] || slot)}: ${text(connector?.label || id, connector?.label_zh)}`;
    }).join(" · ")}</p>
    {change.task_status && <p className="mt-1">{tt("任务状态：{state}", { state: tt(TASK_STATES[change.task_status] || change.task_status) })}</p>}
    {change.error_code && <p role="alert" className="mt-1 break-words text-red-600" data-task-error={change.error_code}>{tt(TASK_ERRORS[change.error_code] || change.error_code)}</p>}
    {change.task_id && <a className="mt-2 inline-block underline" href={"/tasks/" + encodeURIComponent(change.task_id)}>{tt("打开 agent 任务")}</a>}
  </li>;
}

export function WebsiteConfiguration({ projectId, api = websiteConnectorsApi, onTaskCreated }: {
  projectId: string; api?: WebsiteConnectorsApi; onTaskCreated: (taskId: string) => void;
}) {
  const tt = useWebsiteUI();
  const text = useConnectorText();
  const [snapshot, setSnapshot] = useState<WebsiteConnectorsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [pending, setPending] = useState(false);
  const [preset, setPreset] = useState("");
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  const mutation = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    const epoch = ++generation.current;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setSnapshot(null); setLoading(true); setError(""); setActionError(""); setPreset(""); setPending(false); busy.current = false;
    const poll = async () => {
      const revision = mutation.current;
      try {
        const next = await api.get(projectId, controller.signal);
        if (!controller.signal.aborted && revision === mutation.current) { setSnapshot(next); setError(""); }
      } catch (caught) {
        if (!controller.signal.aborted && revision === mutation.current) setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!controller.signal.aborted) { setLoading(false); timer = setTimeout(poll, 5000); }
      }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); if (generation.current === epoch) generation.current++; };
  }, [projectId, api, refresh]);

  async function apply(action: () => Promise<WebsiteConnectorMutation>) {
    if (busy.current) return;
    busy.current = true;
    const epoch = generation.current;
    mutation.current++;
    setPending(true); setActionError("");
    try {
      const next = await action();
      if (epoch !== generation.current) return;
      mutation.current++;
      setSnapshot(next); setError("");
      if (next.task_id) onTaskCreated(next.task_id);
      else if (next.change.status !== "failed") setActionError(tt("服务未返回 agent 任务，变更尚未确认。"));
    } catch (caught) {
      if (epoch === generation.current) setActionError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (epoch === generation.current) { busy.current = false; setPending(false); }
    }
  }

  const selectedPreset = snapshot?.presets.find(item => item.id === preset);
  const available = snapshot?.persistence.available === true;
  const presetUnavailable = selectedPreset && Object.values(selectedPreset.selections).some(id => {
    const option = snapshot?.catalog.find(item => item.connector_id === id);
    return !option || option.available === false;
  });
  return <section className="h-full overflow-auto p-3 text-sm" data-testid="website-configuration" aria-busy={pending}>
    <h2 className="font-semibold">{tt("网站配置")}</h2>
    <p className="mt-1 text-xs opacity-65">{tt("所有服务均可单独选择。应用选择后，agent 会创建迁移或部署任务。")}</p>
    <p className="mt-1 text-xs opacity-65">{tt("连接状态来自实际服务检查，保存选择不代表已连接。费用按成本计算，不加价。")}</p>
    {loading && <p role="status" className="mt-4">{tt("加载中…")}</p>}
    {error && <p role="alert" className="mt-3 text-xs text-red-600">{error} <button type="button" className="underline" onClick={() => setRefresh(value => value + 1)}>{tt("重试")}</button></p>}
    {actionError && <p role="alert" className="mt-3 text-xs text-red-600">{actionError}</p>}
    {snapshot && <>
      {!available && <p role="status" className="mt-3 rounded border p-3 text-xs">{tt("配置存储尚未就绪，当前显示默认选择，暂时无法保存。")}</p>}
      <div className="my-4 rounded border border-[var(--awb-border)] p-3">
        <h3 className="mb-2 font-semibold">{tt("场景方案")}</h3>
        <p className="mb-3 text-xs opacity-65">{tt("方案会填写各项服务，之后仍可逐项更改。")}</p>
        <div className="flex items-center gap-2">
          <select aria-label={tt("场景方案")} value={preset} onChange={event => setPreset(event.target.value)}
            className="min-w-0 flex-1 rounded border bg-[var(--awb-chrome-bg)] p-2 text-xs">
            <option value="">{tt("选择场景方案")}</option>
            {snapshot.presets.map(item => <option key={item.id} value={item.id}>{text(item.label, item.label_zh)}</option>)}
          </select>
          <button type="button" disabled={pending || !available || !selectedPreset || presetUnavailable} className="shrink-0 rounded border px-3 py-2 text-xs disabled:opacity-50"
            onClick={() => void apply(() => api.preset(projectId, preset))}>{tt("应用方案")}</button>
        </div>
        {presetUnavailable && <p role="status" className="mt-2 text-xs text-red-600">{tt("该方案包含暂不可用的服务，可逐项选择其他连接器。")}</p>}
        {selectedPreset && <p className="mt-2 break-words text-xs opacity-65">{Object.entries(selectedPreset.selections).map(([slot, connector]) =>
          `${tt(SLOT_LABELS[slot] || slot)}: ${text(snapshot.catalog.find(item => item.connector_id === connector)?.label || connector, snapshot.catalog.find(item => item.connector_id === connector)?.label_zh)}`).join(" · ")}</p>}
      </div>
      <div className="space-y-3">{snapshot.slots.map(slot => <ConnectorRow key={slot.slot} slot={slot} catalog={snapshot.catalog} pending={pending} available={available}
        retryable={snapshot.changes.some(change => change.id === slot.change_id && change.status === "failed")}
        onSelect={(name, connectorId) => void apply(() => api.select(projectId, name, connectorId))} />)}</div>
      <h3 className="mb-2 mt-6 font-semibold">{tt("配置任务")}</h3>
      {!snapshot.changes.length && <p className="text-xs opacity-65">{tt("尚无配置变更任务")}</p>}
      <ol className="space-y-2">{snapshot.changes.slice(0, 10).map(change => <ConnectorChange key={change.id} change={change} catalog={snapshot.catalog} />)}</ol>
    </>}
    <div className="mt-6 border-t border-[var(--awb-border)] pt-4"><SiteVaultPanel projectId={projectId} /></div>
  </section>;
}
