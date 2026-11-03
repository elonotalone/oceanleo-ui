"use client";

import { useEffect, useRef, useState } from "react";
import {
  websiteConnectorsApi, type WebsiteConnectorChange, type WebsiteConnectorDetails,
  type WebsiteConnectorMutation, type WebsiteConnectorOption, type WebsiteConnectorSlot,
  type WebsiteConnectorsApi, type WebsiteConnectorsSnapshot, type WebsiteConnectorEnvironment,
} from "../../api/website-connectors";
import { WebsiteRequestError } from "../../api/website-runtime";
import {
  websiteExportsApi, websiteDatabaseExportConnection, saveWebsiteExport, WebsiteExportError,
  type WebsiteExportsApi, type WebsiteExportKind,
} from "../../api/website-exports";
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
  connector_change_preparation_failed: "暂时无法准备配置变更，请重试。",
  agent_task_dispatch_unconfirmed: "任务提交结果尚未确认，请在“我的任务”查看，勿重复提交。",
  connector_response_unavailable: "配置变更已提交，暂时无法读取结果，请稍后查看。",
  connector_task_link_unconfirmed: "任务已创建，关联结果尚未确认，请稍后查看。",
  connector_change_settlement_unconfirmed: "配置变更状态尚未确认，请稍后检查。",
  connector_action_unconfirmed: "服务操作结果尚未确认，请检查连接状态，勿重复提交。",
  connector_action_link_unconfirmed: "服务操作已执行，暂时无法关联结果，请稍后检查，勿重复提交。",
  connector_task_creation_failed: "无法创建配置任务，请重试。",
  connector_change_update_unconfirmed: "配置变更状态尚未确认，请稍后检查。",
  connector_change_cancelled: "配置变更已取消。",
  invalid_connector_request: "配置请求无效，请刷新后重新选择。",
  connector_environment_mismatch: "此服务不支持该环境，请检查环境选择。",
  unknown_connector_slot: "此配置项暂不可用，请刷新后重试。",
  selected_connector_unavailable: "此连接器暂不可用，请选择其他服务。",
  connector_not_available_for_slot: "此连接器不支持该配置项，请选择其他服务。",
  adapter_module_unavailable: "此连接器暂不可用，请选择其他服务。",
  connector_migration_required: "配置存储尚未就绪，暂时无法保存。",
  connector_rate_or_quota_exceeded: "配置请求过于频繁或已达额度，请稍后重试。",
  connector_owner_mismatch: "你没有修改此网站配置的权限。",
  connector_persistence_unavailable: "配置存储暂不可用，请先刷新状态，勿重复提交。",
  connector_project_read_unavailable: "暂时无法读取此网站的配置，请稍后重试。",
};
const hasTaskError = (code: string) => Object.prototype.hasOwnProperty.call(TASK_ERRORS, code);
const taskStateLabel = (state: string) => Object.prototype.hasOwnProperty.call(TASK_STATES, state) ? TASK_STATES[state] : "状态暂不可用";
const ENVIRONMENTS = { preview: "预览环境", production: "生产环境" } as const;
const FIXED_ENVIRONMENTS: Partial<Record<string, WebsiteConnectorEnvironment>> = {
  dev_runtime: "preview", hosting: "production", domain: "production",
};
const NO_WRITE_CODES = new Set([
  "invalid_connector_request", "connector_environment_mismatch", "unknown_connector_slot", "selected_connector_unavailable", "connector_not_available_for_slot",
  "adapter_module_unavailable", "connector_migration_required", "connector_rate_or_quota_exceeded", "connector_owner_mismatch",
]);
const UNCONFIRMED_CODES = new Set([
  "agent_task_dispatch_unconfirmed", "connector_response_unavailable", "connector_task_link_unconfirmed",
  "connector_change_settlement_unconfirmed", "connector_change_update_unconfirmed",
  "connector_action_unconfirmed", "connector_action_link_unconfirmed", "task_state_unavailable",
]);
const isUnconfirmed = (change: WebsiteConnectorChange) => change.status === "pending" ||
  (change.status !== "completed" && (change.task_status === "unavailable" || Boolean(change.error_code &&
    (UNCONFIRMED_CODES.has(change.error_code) || !hasTaskError(change.error_code)))));
const matchesEnvironment = (snapshot: WebsiteConnectorsSnapshot, environment: WebsiteConnectorEnvironment) =>
  snapshot.environment === environment && snapshot.slots.every(slot => slot.environment === (FIXED_ENVIRONMENTS[slot.slot] || environment));
type OutcomeReceipt = { change_id?: string; task_id?: string };
type ExportJob = { kind: WebsiteExportKind; environment: WebsiteConnectorEnvironment; database: string; controller: AbortController };
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
  return <section className="rounded border border-[var(--awb-border)] p-3" data-testid={`website-connector-${slot.slot}`}
    data-connector-environment={slot.environment} data-connector-fixed-environment={FIXED_ENVIRONMENTS[slot.slot]}>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">{label}</h3>
      <span className="rounded bg-[var(--awb-hover)] px-2 py-1 text-xs" data-connection-status={slot.status}>{tt(CONNECTION_STATES[slot.status])}</span>
    </div>
    <p className="mb-2 text-xs opacity-65">{FIXED_ENVIRONMENTS[slot.slot]
      ? tt("固定环境：{environment}", { environment: tt(ENVIRONMENTS[slot.environment]) })
      : tt("连接状态环境：{environment}", { environment: tt(ENVIRONMENTS[slot.environment]) })}</p>
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
    <p className="font-medium">{tt(change.kind === "preset" ? "方案变更" : "连接器变更")} · {tt(taskStateLabel(change.status))}</p>
    <p className="mt-1 break-words opacity-65">{Object.entries(change.selections).map(([slot, id]) => {
      const connector = catalog.find(item => item.connector_id === id);
      return `${tt(SLOT_LABELS[slot] || slot)}: ${text(connector?.label || id, connector?.label_zh)}`;
    }).join(" · ")}</p>
    {change.task_status && <p className="mt-1">{tt("任务状态：{state}", { state: tt(taskStateLabel(change.task_status)) })}</p>}
    {change.error_code && <p role="alert" className="mt-1 break-words text-red-600" data-task-error={hasTaskError(change.error_code) ? change.error_code : undefined}>{tt(hasTaskError(change.error_code) ? TASK_ERRORS[change.error_code] : "配置任务结果尚未确认，请查看任务或刷新状态。")}</p>}
    {change.task_id && <a className="mt-2 inline-block underline" href={"/tasks/" + encodeURIComponent(change.task_id)}>{tt("打开 agent 任务")}</a>}
  </li>;
}

type WebsiteConfigurationProps = {
  projectId: string; api?: WebsiteConnectorsApi; exportsApi?: WebsiteExportsApi; onTaskCreated: (taskId: string) => void;
};

export function WebsiteConfiguration(props: WebsiteConfigurationProps) {
  return <ProjectConfiguration key={props.projectId} {...props} />;
}

function ProjectConfiguration({ projectId, api = websiteConnectorsApi, exportsApi = websiteExportsApi, onTaskCreated }: WebsiteConfigurationProps) {
  const tt = useWebsiteUI();
  const text = useConnectorText();
  const [environment, setEnvironment] = useState<WebsiteConnectorEnvironment>("preview");
  const [snapshot, setSnapshot] = useState<WebsiteConnectorsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [pending, setPending] = useState(false);
  const [preset, setPreset] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [uncertain, setUncertain] = useState(false);
  const [receipt, setReceipt] = useState<OutcomeReceipt | null>(null);
  const [exportPending, setExportPending] = useState<WebsiteExportKind | null>(null);
  const [exportNotice, setExportNotice] = useState<{ text: string; error: boolean } | null>(null);
  const generation = useRef(0);
  const mutation = useRef(0);
  const busy = useRef(false);
  const mounted = useRef(false);
  const scope = useRef(environment);
  const currentSnapshot = useRef<WebsiteConnectorsSnapshot | null>(null);
  const unresolved = useRef<OutcomeReceipt | null>(null);
  const uncertaintyAlert = useRef<{ receipt: OutcomeReceipt; text: string } | null>(null);
  const notifiedTasks = useRef(new Set<string>());
  const reconciliation = useRef<AbortController | null>(null);
  const activeExport = useRef<ExportJob | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; generation.current++; reconciliation.current?.abort();
      activeExport.current?.controller.abort(); activeExport.current = null;
    };
  }, []);

  function cancelExport(message?: string) {
    activeExport.current?.controller.abort(); activeExport.current = null;
    setExportPending(null); setExportNotice(message ? { text: message, error: false } : null);
  }

  async function downloadExport(kind: WebsiteExportKind) {
    const ownerSnapshot = currentSnapshot.current;
    if (activeExport.current || !ownerSnapshot || ownerSnapshot.environment !== scope.current) return;
    const database = ownerSnapshot.slots.find(slot => slot.slot === "database")?.connector_id || "";
    const connection = websiteDatabaseExportConnection(database);
    if (kind === "database" && !connection) return;
    const job: ExportJob = { kind, environment: scope.current, database, controller: new AbortController() };
    const current = () => mounted.current && activeExport.current === job && scope.current === job.environment && !job.controller.signal.aborted;
    activeExport.current = job;
    setExportPending(kind);
    setExportNotice({ text: tt(kind === "code" ? "正在准备源码文件…" : "正在准备数据库文件…"), error: false });
    try {
      const file = kind === "code" ? await exportsApi.code(projectId, job.controller.signal)
        : await exportsApi.database(projectId, connection!, job.environment, job.controller.signal);
      if (!current()) return;
      if (kind === "database" && currentSnapshot.current?.slots.find(slot => slot.slot === "database")?.connector_id !== database) {
        cancelExport(tt("数据库配置已变更或暂不可确认，请重新下载。")); return;
      }
      saveWebsiteExport(file);
      setExportNotice({ text: tt(kind === "code" ? "已开始下载源码文件。" : "已开始下载数据库文件。"), error: false });
    } catch (caught) {
      if (!current()) return;
      const code = caught instanceof WebsiteExportError ? caught.code : "failed";
      const message = code === "unauthorized" ? "无法下载，请检查登录账号和当前环境的访问权限。"
        : code === "too-large" ? "文件超过当前导出大小限制，无法下载。"
        : code === "busy" ? "导出请求正在处理中或过于频繁，请稍后重试。"
        : code === "invalid-file" ? "收到的文件不完整或格式不正确，未开始下载。"
        : kind === "database" ? "当前环境的数据库暂时无法导出，请检查连接或稍后重试。"
        : "网站源码暂时无法导出，请确认源码已保存后重试。";
      setExportNotice({ text: tt(message), error: true });
    } finally {
      if (activeExport.current === job) { activeExport.current = null; if (mounted.current) setExportPending(null); }
    }
  }

  function showActionError(text: string, receipt?: OutcomeReceipt | null) {
    uncertaintyAlert.current = receipt ? { receipt, text } : null;
    setActionError(text);
  }

  function retainReceipt(next: OutcomeReceipt) {
    if (!next.change_id && !next.task_id) return;
    setReceipt(next);
    if (next.task_id && !notifiedTasks.current.has(next.task_id)) {
      notifiedTasks.current.add(next.task_id);
      onTaskCreated(next.task_id);
    }
  }

  async function readSnapshot(requested: WebsiteConnectorEnvironment, epoch: number, signal?: AbortSignal) {
    const revision = mutation.current;
    const next = await api.get(projectId, requested, signal);
    if (!mounted.current || signal?.aborted || epoch !== generation.current || revision !== mutation.current) return;
    if (!matchesEnvironment(next, requested)) {
      currentSnapshot.current = null; setSnapshot(null);
      setError(tt("暂时无法确认此环境的配置状态，请刷新后重试。"));
      return;
    }
    currentSnapshot.current = next; setSnapshot(next); setError("");
    if (activeExport.current?.kind === "database" && activeExport.current.database !== next.slots.find(slot => slot.slot === "database")?.connector_id) {
      cancelExport(tt("数据库配置已变更或暂不可确认，请重新下载。"));
    }
    const waiting = unresolved.current;
    const known = waiting && next.changes.find(change => waiting.change_id
      ? change.id === waiting.change_id : Boolean(waiting.task_id && change.task_id === waiting.task_id));
    if (known && !isUnconfirmed(known) && (known.status === "failed" || known.status === "completed" || known.task_id)) {
      unresolved.current = null; setUncertain(false);
      const obsolete = uncertaintyAlert.current;
      if (known.status !== "failed" && obsolete && obsolete.receipt === waiting) {
        uncertaintyAlert.current = null;
        setActionError(current => current === obsolete.text ? "" : current);
      }
      if (known.task_id) retainReceipt({ change_id: known.id, task_id: known.task_id });
    }
    return next;
  }

  async function reconcileCurrent() {
    reconciliation.current?.abort();
    const controller = new AbortController();
    reconciliation.current = controller;
    const epoch = generation.current;
    try { await readSnapshot(scope.current, epoch, controller.signal); }
    catch {
      if (mounted.current && !controller.signal.aborted && epoch === generation.current) setError(tt("暂时无法读取配置状态，请刷新后重试。"));
    } finally { if (reconciliation.current === controller) reconciliation.current = null; }
  }

  useEffect(() => {
    const epoch = ++generation.current;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    scope.current = environment;
    currentSnapshot.current = null;
    setSnapshot(null); setLoading(true); setError(""); showActionError(""); setPreset("");
    const poll = async () => {
      try {
        await readSnapshot(environment, epoch, controller.signal);
      } catch {
        if (!controller.signal.aborted && epoch === generation.current) setError(tt("暂时无法读取配置状态，请刷新后重试。"));
      } finally {
        if (!controller.signal.aborted && epoch === generation.current) { setLoading(false); timer = setTimeout(poll, 5000); }
      }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); if (generation.current === epoch) generation.current++; };
  }, [projectId, api, environment, refresh]);

  function changeEnvironment(next: string) {
    if ((next !== "preview" && next !== "production") || next === scope.current) return;
    cancelExport();
    scope.current = next;
    generation.current++; mutation.current++;
    reconciliation.current?.abort();
    currentSnapshot.current = null;
    setSnapshot(null); setLoading(true); setError(""); showActionError(""); setPreset("");
    setEnvironment(next);
  }

  async function apply(action: (environment: WebsiteConnectorEnvironment) => Promise<WebsiteConnectorMutation>) {
    if (busy.current || unresolved.current || !currentSnapshot.current ||
      currentSnapshot.current.environment !== scope.current || currentSnapshot.current.changes.some(isUnconfirmed)) return;
    busy.current = true;
    const epoch = generation.current;
    const requested = scope.current;
    mutation.current++;
    setPending(true); showActionError("");
    try {
      const next = await action(requested);
      if (!mounted.current) return;
      if (next.task_id) retainReceipt({ change_id: next.change.id, task_id: next.task_id });
      mutation.current++;
      if (epoch !== generation.current) { await reconcileCurrent(); return; }
      if (!matchesEnvironment(next, requested) || (!next.task_id && next.change.status !== "failed")) {
        unresolved.current = { change_id: next.change.id, task_id: next.task_id || undefined };
        setUncertain(true); showActionError(tt("配置提交结果尚未确认，请先刷新状态，勿重复提交。"), unresolved.current);
        await reconcileCurrent();
        return;
      }
      currentSnapshot.current = next; setSnapshot(next); setError("");
    } catch (caught) {
      if (!mounted.current) return;
      const failure = caught instanceof WebsiteRequestError ? caught : null;
      const knownReceipt = { change_id: failure?.change_id, task_id: failure?.task_id };
      retainReceipt(knownReceipt);
      if (!failure?.code || !NO_WRITE_CODES.has(failure.code)) { unresolved.current = knownReceipt; setUncertain(true); }
      if (epoch === generation.current) showActionError(tt(failure?.code && TASK_ERRORS[failure.code]
        ? TASK_ERRORS[failure.code] : "配置提交结果尚未确认，请先刷新状态，勿重复提交。"),
        !failure?.code || UNCONFIRMED_CODES.has(failure.code) ? unresolved.current : null);
      mutation.current++;
      await reconcileCurrent();
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }

  const selectedPreset = snapshot?.presets.find(item => item.id === preset);
  const available = snapshot?.persistence.available === true;
  const databaseExportSupported = Boolean(websiteDatabaseExportConnection(snapshot?.slots.find(slot => slot.slot === "database")?.connector_id || ""));
  const blocked = pending || uncertain || Boolean(snapshot?.changes.some(isUnconfirmed));
  const presetUnavailable = selectedPreset && Object.values(selectedPreset.selections).some(id => {
    const option = snapshot?.catalog.find(item => item.connector_id === id);
    return !option || option.available === false;
  });
  return <section className="h-full overflow-auto p-3 text-sm" data-testid="website-configuration" data-connector-inspection-environment={environment} aria-busy={pending}>
    <h2 className="font-semibold">{tt("网站配置")}</h2>
    <label className="my-3 flex items-center gap-3 text-xs">
      <span>{tt("连接环境")}</span>
      <select data-testid="website-connector-environment" aria-label={tt("连接环境")} value={environment}
        onChange={event => changeEnvironment(event.target.value)} className="rounded border bg-[var(--awb-chrome-bg)] p-2">
        <option value="preview">{tt("预览环境")}</option><option value="production">{tt("生产环境")}</option>
      </select>
    </label>
    <p className="mt-1 text-xs opacity-65">{tt("所有服务均可单独选择。应用选择后，agent 会创建迁移或部署任务。")}</p>
    <p className="mt-1 text-xs opacity-65">{tt("连接状态来自实际服务检查，保存选择不代表已连接。费用按成本计算，不加价。")}</p>
    <p className="mt-1 text-xs opacity-65">{tt("服务选择对整个网站生效；连接状态和配置任务会注明环境。开发服务固定为预览环境，托管与域名固定为生产环境。")}</p>
    <p className="mt-1 text-xs opacity-65">{tt("保存选择不会授予服务权限、建立连接或发布网站。")}</p>
    {loading && <p role="status" className="mt-4">{tt("加载中…")}</p>}
    {error && <p role="alert" className="mt-3 text-xs text-red-600">{error} <button type="button" className="underline" onClick={() => setRefresh(value => value + 1)}>{tt("重试")}</button></p>}
    {actionError && <p role="alert" className="mt-3 text-xs text-red-600">{actionError}</p>}
    <p data-testid="website-export-status" role={exportNotice?.error ? "alert" : "status"} aria-live="polite" className={`mt-2 text-xs ${exportNotice?.error ? "text-red-600" : "opacity-65"}`}>{exportNotice?.text}</p>
    {(uncertain || snapshot?.changes.some(isUnconfirmed)) && <p role="status" className="mt-3 rounded border p-3 text-xs" data-testid="website-connector-unconfirmed">
      {tt("有配置变更尚未确认。请先刷新状态或查看任务，勿重复提交。")}
      <button type="button" className="ml-2 underline" onClick={() => setRefresh(value => value + 1)}>{tt("刷新配置状态")}</button>
    </p>}
    {receipt?.task_id && <p className="mt-3 text-xs" data-testid="website-connector-receipt" data-change-id={receipt.change_id}>
      {tt("任务已创建")} · <a className="underline" href={"/tasks/" + encodeURIComponent(receipt.task_id)}>{tt("打开 agent 任务")}</a>
    </p>}
    {snapshot && <>
      <section className="my-4 rounded border border-[var(--awb-border)] p-3">
        <h3 className="font-semibold">{tt("下载网站文件")}</h3>
        <div className="my-3 flex flex-wrap gap-2">
          <button type="button" data-testid="website-export-code" disabled={!!exportPending} className="rounded border px-3 py-2 text-xs disabled:opacity-50"
            onClick={() => void downloadExport("code")}>{tt("下载源码 ZIP")}</button>
          <button type="button" data-testid="website-export-database" disabled={!!exportPending || !databaseExportSupported} className="rounded border px-3 py-2 text-xs disabled:opacity-50"
            onClick={() => void downloadExport("database")}>{tt("下载数据库")}</button>
        </div>
        <p className="text-xs opacity-65">{tt("数据库下载仅含 public 应用数据与结构，不含服务商的认证、存储、系统数据、角色或平台设置。")}</p>
        {!databaseExportSupported && <p className="mt-2 text-xs opacity-65">{tt("当前数据库连接器暂不支持下载。")}</p>}
      </section>
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
          <button type="button" disabled={blocked || !available || !selectedPreset || presetUnavailable} className="shrink-0 rounded border px-3 py-2 text-xs disabled:opacity-50"
            onClick={() => void apply(selected => api.preset(projectId, preset, selected))}>{tt("应用方案")}</button>
        </div>
        {presetUnavailable && <p role="status" className="mt-2 text-xs text-red-600">{tt("该方案包含暂不可用的服务，可逐项选择其他连接器。")}</p>}
        {selectedPreset && <p className="mt-2 break-words text-xs opacity-65">{Object.entries(selectedPreset.selections).map(([slot, connector]) =>
          `${tt(SLOT_LABELS[slot] || slot)}: ${text(snapshot.catalog.find(item => item.connector_id === connector)?.label || connector, snapshot.catalog.find(item => item.connector_id === connector)?.label_zh)}`).join(" · ")}</p>}
      </div>
      <div className="space-y-3">{snapshot.slots.map(slot => <ConnectorRow key={environment + ":" + slot.slot} slot={slot} catalog={snapshot.catalog} pending={blocked} available={available}
        retryable={snapshot.changes.some(change => change.id === slot.change_id && change.status === "failed" && !isUnconfirmed(change))}
        onSelect={(name, connectorId) => void apply(selected => api.select(projectId, name, connectorId, selected))} />)}</div>
      <h3 className="mb-2 mt-6 font-semibold">{tt("配置任务")}</h3>
      {!snapshot.changes.length && <p className="text-xs opacity-65">{tt("尚无配置变更任务")}</p>}
      <ol className="space-y-2">{snapshot.changes.slice(0, 10).map(change => <ConnectorChange key={change.id} change={change} catalog={snapshot.catalog} />)}</ol>
    </>}
    <div className="mt-6 border-t border-[var(--awb-border)] pt-4"><SiteVaultPanel projectId={projectId} /></div>
  </section>;
}
