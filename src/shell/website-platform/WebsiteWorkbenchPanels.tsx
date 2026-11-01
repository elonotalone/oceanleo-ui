"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  websitePlatformApi,
  websiteFileText,
  websitePreviewFrameUrl,
  type WebsiteCommit,
  type WebsiteDatabaseTable,
  type WebsiteDeployment,
  type WebsiteDomain,
  type WebsitePlatformApi,
} from "../../lib/website-platform-api";
import { useUI } from "../../i18n/ui/useUI";

type Panel =
  | "preview"
  | "code"
  | "history"
  | "dashboard"
  | "database"
  | "storage"
  | "settings"
  | "publish";

export interface WebsiteWorkbenchPanelsProps {
  projectId: string;
  stack?: string;
  commit?: string;
  api?: WebsitePlatformApi;
  panel?: Panel;
  hideTabs?: boolean;
  /** Called with the new git commit after the code panel saves. */
  onCommit?: (commit: string) => void;
}

const tabs: Array<[Panel, string]> = [
  ["preview", "预览"],
  ["code", "代码"],
  ["history", "历史"],
  ["dashboard", "仪表盘"],
  ["database", "数据库"],
  ["storage", "文件存储"],
  ["settings", "设置"],
  ["publish", "发布"],
];

const errText = (error: unknown) =>
  error instanceof Error ? error.message : "暂时无法读取网站平台数据。";

function useLoad<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
) {
  const [state, setState] = useState<{
    value?: T;
    error?: string;
    loading: boolean;
  }>({ loading: true });

  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true });
    load(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setState({ value, loading: false });
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setState({ error: errText(error), loading: false });
        }
      });
    return () => controller.abort();
    // The caller owns the stable dependency list for this small data hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

function State({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error?: string;
  children: ReactNode;
}) {
  const tt = useUI();
  if (loading) return <p role="status">{tt("正在读取网站数据…")}</p>;
  if (error)
    return (
      <p role="alert" className="text-red-600">
        {error}
      </p>
    );
  return <>{children}</>;
}

export function WebsiteWorkbenchPanels({
  projectId,
  stack = "static",
  commit,
  api = websitePlatformApi,
  panel: controlledPanel,
  hideTabs = false,
  onCommit,
}: WebsiteWorkbenchPanelsProps) {
  const tt = useUI();
  const [internalPanel, setInternalPanel] = useState<Panel>("preview");
  const panel = controlledPanel || internalPanel;

  return (
    <section
      className="border-t border-[var(--awb-border)] bg-[var(--awb-chrome-bg)]"
      data-testid="website-platform-panels"
    >
      {!hideTabs ? (
        <nav
          className="flex gap-1 overflow-x-auto px-3 py-2"
          aria-label={tt("网站工作台")}
        >
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              data-testid={`website-panel-${id}`}
              aria-selected={panel === id}
              className={`rounded px-2.5 py-1 text-xs ${
                panel === id
                  ? "bg-[var(--awb-accent-soft)] text-[var(--awb-accent)]"
                  : "hover:bg-[var(--awb-hover)]"
              }`}
              onClick={() => setInternalPanel(id)}
            >
              {tt(label)}
            </button>
          ))}
        </nav>
      ) : null}
      <div className={`${hideTabs ? "h-full" : "max-h-[42vh] min-h-[180px]"} overflow-auto ${hideTabs ? "" : "border-t border-[var(--awb-border)]"} p-3 text-sm`}>
        {panel === "preview" ? (
          <PreviewPanel projectId={projectId} stack={stack} commit={commit} api={api} />
        ) : null}
        {panel === "code" ? (
          <CodePanel projectId={projectId} commit={commit} api={api} onCommit={onCommit} />
        ) : null}
        {panel === "history" ? (
          <HistoryPanel projectId={projectId} commit={commit} api={api} />
        ) : null}
        {panel === "dashboard" ? <DashboardPanel projectId={projectId} api={api} /> : null}
        {panel === "database" ? <DatabasePanel projectId={projectId} api={api} /> : null}
        {panel === "storage" ? <StoragePanel projectId={projectId} api={api} /> : null}
        {panel === "settings" ? <SettingsPanel projectId={projectId} api={api} /> : null}
        {panel === "publish" ? (
          <PublishPanel projectId={projectId} api={api} />
        ) : null}
      </div>
    </section>
  );
}

function PreviewPanel({
  projectId,
  stack,
  commit,
  api,
}: {
  projectId: string;
  stack?: string;
  commit?: string;
  api: WebsitePlatformApi;
}) {
  const tt = useUI();
  // One preview contract for every stack: POST /preview returns the public,
  // immutable capability host on the user-content domain (static) or the
  // sandbox host (Vite/Next). The authenticated API file route is never framed:
  // an iframe cannot send the bearer header.
  const state = useLoad(
    (signal) => api.preview(projectId, commit, signal),
    [api, projectId, commit],
  );
  const data = state.value;
  const openUrl = websitePreviewFrameUrl(data);

  return (
    <State {...state}>
      <div className="flex h-full min-h-0 flex-col gap-2" data-testid="website-preview-pane">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate opacity-70">
            {data?.tier === "sandbox" ? tt("开发预览") : tt("静态预览")}
          </span>
          {openUrl ? (
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="website-preview-open-tab"
              className="shrink-0 text-[var(--awb-accent)] underline-offset-2 hover:underline"
            >
              {tt("在新标签页打开预览")}
            </a>
          ) : null}
        </div>
        {openUrl ? (
          <iframe
            title={tt("网站预览")}
            src={openUrl}
            className="min-h-[300px] w-full flex-1 rounded border"
            sandbox="allow-forms allow-modals allow-popups allow-presentation allow-scripts"
          />
        ) : (
          <div
            data-testid="website-preview-boot"
            className="rounded border p-6"
            aria-live="polite"
          >
            <strong>
              {data?.tier === "sandbox" || (stack && stack !== "static")
                ? tt("正在启动网站预览")
                : tt("正在准备静态预览")}
            </strong>
            <p className="mt-2 text-xs opacity-70">
              {data?.status || tt("预览会在这里显示，不会留白。")}
              {typeof data?.boot_progress === "number"
                ? ` ${data.boot_progress}%`
                : ""}
            </p>
          </div>
        )}
      </div>
    </State>
  );
}

function CodePanel({
  projectId,
  commit,
  api,
  onCommit,
}: {
  projectId: string;
  commit?: string;
  api: WebsitePlatformApi;
  onCommit?: (commit: string) => void;
}) {
  const tt = useUI();
  const [baseCommit, setBaseCommit] = useState(commit);
  const [reload, setReload] = useState(0);
  useEffect(() => setBaseCommit(commit), [commit]);
  const files = useLoad((signal) => api.files(projectId, baseCommit, signal), [
    api,
    projectId,
    baseCommit,
    reload,
  ]);
  const [selected, setSelected] = useState("");
  const [content, setContent] = useState("");
  const [binary, setBinary] = useState(false);
  const [notice, setNotice] = useState("");
  const list = files.value?.files || [];

  useEffect(() => {
    if (!list.some((file) => file.path === selected)) {
      setSelected(list[0]?.path || "");
      setContent("");
    }
  }, [list, selected]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setNotice("");
    api
      .file(projectId, selected, commit, controller.signal)
      .then((file) => {
        if (controller.signal.aborted) return;
        const loaded = websiteFileText(file);
        setBinary(loaded.binary);
        setContent(loaded.text);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setNotice(errText(error));
      });
    return () => controller.abort();
  }, [api, projectId, selected, baseCommit]);

  const save = async () => {
    if (!selected) return;
    try {
      // A save is based on the current git head; without a known commit, the
      // newest commit in the project's history is that head.
      let base = baseCommit;
      if (!base) {
        const history = await api.history(projectId);
        base = history.commits?.[0] ? commitKey(history.commits[0]) : undefined;
      }
      const result = await api.save(projectId, { [selected]: content }, base);
      setBaseCommit(result.commit);
      setReload((value) => value + 1);
      onCommit?.(result.commit);
      setNotice(tt("已保存 {commit}", { commit: result.commit }));
    } catch (error) {
      setNotice(errText(error));
    }
  };

  return (
    <State {...files}>
      <div className="grid gap-3 md:grid-cols-[180px_1fr]">
        <div className="space-y-1">
          {list.map((file) => (
            <button
              key={file.path}
              type="button"
              className={`block w-full truncate rounded px-2 py-1 text-left text-xs ${
                selected === file.path ? "bg-[var(--awb-accent-soft)]" : ""
              }`}
              onClick={() => setSelected(file.path)}
            >
              {file.path}
            </button>
          ))}
        </div>
        <div>
          {binary ? (
            <p className="rounded border p-3 text-xs opacity-70" data-testid="website-code-binary">
              {tt("这是二进制文件（图片、字体等），不能在这里按文本编辑。")}
            </p>
          ) : (
            <textarea
              aria-label={tt("文件内容")}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="min-h-[180px] w-full rounded border bg-transparent p-2 font-mono text-xs"
            />
          )}
          <button
            type="button"
            className="mt-2 rounded bg-[var(--awb-accent)] px-3 py-1 text-xs text-white"
            disabled={!selected || binary}
            onClick={save}
          >
            {tt("保存并提交")}
          </button>
          {notice ? <p className="mt-2 text-xs">{notice}</p> : null}
        </div>
      </div>
    </State>
  );
}

function commitKey(commit: WebsiteCommit): string {
  return String(commit.sha || commit.commit || commit.id || "");
}

function HistoryPanel({
  projectId,
  commit,
  api,
}: {
  projectId: string;
  commit?: string;
  api: WebsitePlatformApi;
}) {
  const tt = useUI();
  const state = useLoad((signal) => api.history(projectId, signal), [api, projectId]);
  const [selected, setSelected] = useState<WebsiteCommit | null>(null);
  const [notice, setNotice] = useState("");
  const selectedId = selected ? commitKey(selected) : "";
  const selectedFiles = useLoad(
    (signal) =>
      selectedId
        ? api.files(projectId, selectedId, signal)
        : Promise.resolve({ files: [] }),
    [api, projectId, selectedId],
  );

  const restore = async () => {
    if (!selectedId) return;
    // The restore commit is based on the current head: the caller's commit,
    // else the newest commit in this history list.
    const head = commit || (state.value?.commits?.[0] ? commitKey(state.value.commits[0]) : "");
    try {
      const tree = await api.files(projectId, selectedId);
      const current = head ? await api.files(projectId, head) : { files: [] };
      const entries = await Promise.all(
        tree.files.map(async (file) => {
          const loaded = await api.file(projectId, file.path, selectedId);
          return [file.path, loaded.content ?? null] as const;
        }),
      );
      const changes: Record<string, string | null> = Object.fromEntries(
        entries.filter((entry): entry is readonly [string, string] => entry[1] !== null),
      );
      for (const file of current.files) {
        if (!tree.files.some((target) => target.path === file.path)) {
          changes[file.path] = null;
        }
      }
      const result = await api.save(
        projectId,
        changes,
        head || undefined,
        tt("恢复网站版本 {commit}", { commit: selectedId }),
      );
      setNotice(tt("已创建恢复提交 {commit}", { commit: result.commit }));
    } catch (error) {
      setNotice(errText(error));
    }
  };

  return (
    <State {...state}>
      <div className="space-y-2">
        {(state.value?.commits || []).map((entry, index) => {
          const id = commitKey(entry) || String(index);
          return (
            <button
              key={id}
              type="button"
              className={`block w-full rounded border p-2 text-left ${
                selected === entry ? "bg-[var(--awb-accent-soft)]" : ""
              }`}
              onClick={() => {
                setSelected(entry);
                setNotice("");
              }}
            >
              <strong>{entry.message || id}</strong>
              <span className="ml-2 text-xs opacity-60">
                {entry.created_at || entry.author || ""}
              </span>
            </button>
          );
        })}
        {selected ? (
          <div className="rounded border p-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span>{selectedId}</span>
              <button type="button" className="underline" onClick={restore}>
                {tt("恢复为新提交")}
              </button>
            </div>
            <State {...selectedFiles}>
              <ul className="mt-2 list-inside list-disc opacity-70">
                {(selectedFiles.value?.files || []).map((file) => (
                  <li key={file.path}>{file.path}</li>
                ))}
              </ul>
            </State>
          </div>
        ) : null}
        {notice ? <p className="text-xs">{notice}</p> : null}
      </div>
    </State>
  );
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function formatBytes(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function DashboardPanel({
  projectId,
  api,
}: {
  projectId: string;
  api: WebsitePlatformApi;
}) {
  const tt = useUI();
  const state = useLoad(
    (signal) =>
      Promise.all([
        api.project(projectId, signal),
        api.capabilities(projectId, signal),
        api.analytics(projectId, undefined, undefined, signal),
        api.usageSettings(projectId, signal),
      ]),
    [api, projectId],
  );
  return (
    <State {...state}>
      <div className="space-y-4" data-testid="website-dashboard-panel">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label={tt("网站") } value={state.value?.[0].display_name || state.value?.[0].slug || projectId} />
          <MetricCard label={tt("技术栈")} value={String(state.value?.[0].stack || state.value?.[0].stack_key || "static")} />
          <MetricCard label={tt("访问量") } value={String(state.value?.[2].metrics?.page_views ?? "—")} />
          <MetricCard label={tt("存储用量") } value={formatUsageMetric(state.value?.[3].metrics?.storage)} />
        </div>
        <div className="rounded border p-3" data-testid="website-dashboard-cost">
          <h3 className="font-medium">{tt("用量与成本")}</h3>
          <p className="mt-1 text-xs opacity-70">{tt("以下读数来自网站项目 API；没有返回的计量保持不可用。")}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(state.value?.[3].metrics || {}).map(([key, metric]) => (
              <MetricCard key={key} label={key} value={formatUsageMetric(metric)} />
            ))}
          </div>
          <div className="mt-4" data-testid="website-dashboard-cost-ledger">
            <h4 className="text-xs font-medium">{tt("成本记录")}</h4>
            {state.value?.[3].cost_ledger?.status === "actual" ? (
              <div className="mt-2 space-y-1">
                {Object.entries(state.value[3].cost_ledger.totals || {}).map(([kind, total]) => (
                  <div key={kind} className="flex items-center justify-between gap-2 text-xs">
                    <span>{kind}</span>
                    <span>{Number(total).toFixed(6)}</span>
                  </div>
                ))}
                {(state.value[3].cost_ledger.unpriced_kinds || []).length ? (
                  <p className="text-xs opacity-70">
                    {tt("未定价")}: {state.value[3].cost_ledger.unpriced_kinds?.join(", ")}
                  </p>
                ) : null}
                {(state.value[3].cost_ledger.events || []).length === 0 ? (
                  <p className="text-xs opacity-70">{tt("此网站还没有成本记录。")}</p>
                ) : null}
              </div>
            ) : (
              <p className="mt-1 text-xs opacity-70">
                {state.value?.[3].cost_ledger?.reason || tt("成本记录暂不可用。")}
              </p>
            )}
          </div>
        </div>
        <p className="text-xs opacity-70">
          {tt("权限")}：{String(state.value?.[1].role || state.value?.[0].role || "—")} · {tt("分析状态")}：{String(state.value?.[2].status || "—")}
        </p>
      </div>
    </State>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-3">
      <dt className="text-xs opacity-70">{label}</dt>
      <dd className="mt-1 truncate font-medium" title={value}>{value}</dd>
    </div>
  );
}

function formatUsageMetric(metric: { status?: string; value?: number | null; unit?: string; reason?: string } | undefined): string {
  if (!metric || metric.status !== "actual" || typeof metric.value !== "number") return metric?.reason || "—";
  return `${metric.unit === "bytes" ? formatBytes(metric.value) : metric.value.toLocaleString()} ${metric.unit === "bytes" ? "" : metric.unit || ""}`.trim();
}

function StoragePanel({
  projectId,
  api,
}: {
  projectId: string;
  api: WebsitePlatformApi;
}) {
  const tt = useUI();
  const binding = useLoad((signal) => api.storageBinding(projectId, signal), [api, projectId]);
  const buckets = useLoad((signal) => api.storageBuckets(projectId, signal), [api, projectId]);
  const [bucket, setBucket] = useState("");
  useEffect(() => {
    if (!bucket && buckets.value?.items[0]?.name) setBucket(buckets.value.items[0].name);
  }, [bucket, buckets.value]);
  const objects = useLoad(
    (signal) => (bucket ? api.storageObjects(projectId, bucket, "", "", "", signal) : Promise.resolve({ items: [] })),
    [api, projectId, bucket],
  );
  return (
    <div className="space-y-4" data-testid="website-storage-panel">
      <State {...binding}>
        <p>{tt("文件存储")}: {binding.value?.provider || "—"} · {binding.value?.status || tt("未绑定")}</p>
        <p className="text-xs opacity-70">{formatBytes(binding.value?.used_bytes)} / {formatBytes(binding.value?.quota_bytes)} · {binding.value?.allowed_prefix || ""}</p>
      </State>
      <State {...buckets}>
        <label className="block text-xs">
          <span className="mr-2">{tt("存储桶")}</span>
          <select className="rounded border bg-transparent px-2 py-1" value={bucket} onChange={(event) => setBucket(event.target.value)}>
            {buckets.value?.items.map((entry) => <option key={entry.name} value={entry.name}>{entry.name}</option>)}
          </select>
        </label>
      </State>
      <State {...objects}>
        {objects.value?.items.length ? (
          <ul className="divide-y rounded border" aria-label={tt("存储文件列表")}>
            {objects.value.items.map((entry) => <li key={`${entry.path || entry.name}:${entry.updated_at || ""}`} className="flex items-center justify-between gap-2 px-2 py-2 text-xs"><span className="truncate">{entry.path || entry.name}</span><span className="shrink-0 opacity-60">{formatBytes(entry.size)}</span></li>)}
          </ul>
        ) : <p className="text-xs opacity-70">{tt("此存储桶还没有文件。")}</p>}
      </State>
    </div>
  );
}

function SettingsPanel({
  projectId,
  api,
}: {
  projectId: string;
  api: WebsitePlatformApi;
}) {
  const tt = useUI();
  const project = useLoad((signal) => api.project(projectId, signal), [api, projectId]);
  const capabilities = useLoad((signal) => api.capabilities(projectId, signal), [api, projectId]);
  const domains = useLoad((signal) => api.domains(projectId, signal), [api, projectId]);
  const secrets = useLoad((signal) => api.secrets(projectId, signal), [api, projectId]);
  const [domainDraft, setDomainDraft] = useState("");
  const [notice, setNotice] = useState("");
  const add = async () => {
    if (!domainDraft.trim()) return;
    try {
      await api.addDomain(projectId, domainDraft.trim());
      setDomainDraft("");
      setNotice(tt("域名已添加"));
    } catch (error) {
      setNotice(errText(error));
    }
  };
  return (
    <div className="space-y-4" data-testid="website-settings-panel">
      <State {...project}>
        <dl className="grid gap-2 sm:grid-cols-2">
          <MetricCard label={tt("技术栈")} value={String(project.value?.stack || project.value?.stack_key || "static")} />
          <MetricCard label={tt("环境")} value={String(project.value?.environment || "production")} />
          <MetricCard label={tt("仓库") } value={String(project.value?.git_repo || "—")} />
          <MetricCard label={tt("当前提交")} value={String(project.value?.git_head || "—")} />
        </dl>
        {project.value?.env_refs ? <p className="text-xs opacity-70">{tt("环境变量引用")}：{Object.keys(project.value.env_refs).join(", ") || "—"}</p> : null}
      </State>
      <State {...capabilities}><p className="text-xs">{tt("权限")}: {String(capabilities.value?.role || "—")} · {Object.entries(capabilities.value?.permissions || {}).filter(([, allowed]) => allowed).map(([name]) => name).join(", ") || "—"}</p></State>
      <State {...domains}>
        <div className="space-y-2">
          <h3 className="font-medium">{tt("域名")}</h3>
          {(domains.value?.domains || []).map((domain: WebsiteDomain) => <div key={domain.domain} className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs"><span>{domain.domain}{domain.is_primary ? ` · ${tt("主域名")}` : ""}</span><span className="opacity-60">{domain.status || "—"}</span></div>)}
          <div className="flex gap-2"><input aria-label={tt("域名")} className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1 text-xs" value={domainDraft} onChange={(event) => setDomainDraft(event.target.value)} placeholder="example.com" /><button type="button" className="rounded bg-[var(--awb-accent)] px-2 py-1 text-xs text-white" onClick={() => void add()}>{tt("添加")}</button></div>
        </div>
      </State>
      <State {...secrets}><p className="text-xs">{tt("环境变量引用")}: {(secrets.value?.secrets || []).map((secret) => `${secret.name}${secret.environment ? ` (${secret.environment})` : ""}`).join(", ") || "—"}</p></State>
      {notice ? <p role="status" className="text-xs">{notice}</p> : null}
    </div>
  );
}

function DatabasePanel({
  projectId,
  api,
}: {
  projectId: string;
  api: WebsitePlatformApi;
}) {
  const tt = useUI();
  const usage = useLoad((signal) => api.usage(projectId, signal), [api, projectId]);
  const schema = useLoad((signal) => api.schema(projectId, signal), [api, projectId]);
  const [selectedTable, setSelectedTable] = useState<WebsiteDatabaseTable | null>(null);
  const [sql, setSql] = useState('select * from "public" limit 20');
  const [result, setResult] = useState<{ columns?: string[]; rows?: Record<string, unknown>[] } | null>(null);
  const [error, setError] = useState("");
  const tableRows = useLoad(
    (signal) =>
      selectedTable
        ? api.query(
            projectId,
            `select * from ${quoteIdentifier(selectedTable.schema || "public")}.${quoteIdentifier(selectedTable.name)} limit 20`,
            signal,
          )
        : Promise.resolve({ rows: [] }),
    [api, projectId, selectedTable?.schema, selectedTable?.name],
  );

  const run = async () => {
    try {
      setError("");
      setResult(await api.query(projectId, sql));
    } catch (caught) {
      setError(errText(caught));
    }
  };

  const tables = schema.value?.tables || [];
  const rows = result?.rows || tableRows.value?.rows || [];
  const columns = result?.columns || (rows.length ? Object.keys(rows[0]) : []);

  return (
    <div className="space-y-3">
      <State {...usage}>
        <p>
          {tt("用量")}：{usage.value?.used_bytes ?? 0} / {usage.value?.quota_bytes ?? "∞"} bytes · {usage.value?.state || usage.value?.status || "ok"}
        </p>
      </State>
      <State {...schema}>
        <div className="flex flex-wrap gap-2">
          {tables.map((table) => (
            <button
              key={`${table.schema || "public"}.${table.name}`}
              type="button"
              className={`rounded border px-2 py-1 text-xs ${
                selectedTable === table ? "bg-[var(--awb-accent-soft)]" : ""
              }`}
              onClick={() => {
                setSelectedTable(table);
                setResult(null);
              }}
            >
              {table.name}
            </button>
          ))}
        </div>
      </State>
      {selectedTable ? (
        <State {...tableRows}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr>{columns.map((column) => <th key={column} className="border-b px-2 py-1 font-medium">{column}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    {columns.map((column) => <td key={column} className="border-b px-2 py-1">{String(row[column] ?? "")}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </State>
      ) : null}
      <textarea
        value={sql}
        onChange={(event) => setSql(event.target.value)}
        className="min-h-[90px] w-full rounded border bg-transparent p-2 font-mono text-xs"
        aria-label={tt("SQL 控制台")}
      />
      <button
        type="button"
        onClick={run}
        className="rounded bg-[var(--awb-accent)] px-3 py-1 text-xs text-white"
      >
        {tt("运行 SQL")}
      </button>
      {error ? <p role="alert" className="text-red-600">{error}</p> : null}
      {result ? <pre className="max-h-48 overflow-auto rounded bg-black/5 p-2 text-xs">{JSON.stringify(result.rows || [], null, 2)}</pre> : null}
    </div>
  );
}

function PublishPanel({
  projectId,
  api,
}: {
  projectId: string;
  commit?: string;
  api: WebsitePlatformApi;
}) {
  const tt = useUI();
  const [reload, setReload] = useState(0);
  const state = useLoad((signal) => api.deployments(projectId, signal), [
    api,
    projectId,
    reload,
  ]);
  const [notice, setNotice] = useState("");

  const publish = async () => {
    try {
      // Publishing takes the project's working revision (every save advances
      // it); a git commit is not a revision id.
      const project = await api.project(projectId);
      const revisionId = String(project.working_revision_id || "").trim();
      if (!revisionId) throw new Error(tt("网站还没有可发布的版本。"));
      const result = await api.publish(projectId, revisionId);
      setNotice(result.deployment.url || result.deployment.status || tt("已提交发布"));
      setReload((value) => value + 1);
    } catch (error) {
      setNotice(errText(error));
    }
  };

  const rollback = async (deployment: WebsiteDeployment) => {
    try {
      await api.rollback(projectId, deployment.id, deployment.version);
      setNotice(tt("已创建回滚部署"));
      setReload((value) => value + 1);
    } catch (error) {
      setNotice(errText(error));
    }
  };

  return (
    <State {...state}>
      <button
        type="button"
        onClick={publish}
        className="rounded bg-[var(--awb-accent)] px-3 py-1 text-xs text-white"
      >
        {tt("发布到 .ws.oceanleo.app")}
      </button>
      {notice ? <p className="mt-2 text-xs">{notice}</p> : null}
      <div className="mt-3 space-y-2">
        {(state.value?.deployments || []).map((deployment) => (
          <div key={deployment.id} className="flex items-center justify-between rounded border p-2 text-xs">
            <span>{deployment.status || "unknown"} · {deployment.url || deployment.id}</span>
            <button type="button" onClick={() => rollback(deployment)} className="underline">
              {tt("回滚")}
            </button>
          </div>
        ))}
      </div>
    </State>
  );
}
