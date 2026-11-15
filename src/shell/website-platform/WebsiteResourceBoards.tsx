"use client";
import { useEffect, useState, type ReactNode } from "react";
import { type WebsiteDatabaseTable, type WebsiteDeployment, type WebsitePlatformApi } from "../../lib/website-platform-api";
import { useWebsiteUI } from "./website-preview-i18n";
import { currentDomainFamily } from "../../contracts/domain-family";
import { CnHostingPanel } from "./CnHostingPanel";
import { WorkNotWired } from "../works-workbench/WorkNotWired";

const errText = (error: unknown) =>
  error instanceof Error ? error.message : "暂时无法读取作品平台数据。";

function useLoad<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
) {
  const [state, setState] = useState<{
    value?: T;
    error?: string;
    notWired?: boolean;
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
          setState({ error: errText(error), loading: false, notWired: [404, 501].includes(Number((error as { status?: number })?.status)) });
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
  notWired,
  children,
}: {
  loading: boolean;
  notWired?: boolean;
  error?: string;
  children: ReactNode;
}) {
  const tt = useWebsiteUI();
  if (notWired) return <WorkNotWired page="dashboard" />;
  if (loading) return <p role="status">{tt("正在读取作品数据…")}</p>;
  if (error)
    return (
      <p role="alert" className="text-red-600">
        {error}
      </p>
    );
  return <>{children}</>;
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

function StoragePanel({
  projectId,
  api,
}: {
  projectId: string;
  api: WebsitePlatformApi;
}) {
  const tt = useWebsiteUI();
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
  if (!binding.loading && !binding.error && !binding.value) return <WorkNotWired page="dashboard" />;
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

function DatabasePanel({
  projectId,
  api,
}: {
  projectId: string;
  api: WebsitePlatformApi;
}) {
  const tt = useWebsiteUI();
  const usage = useLoad((signal) => api.usage(projectId, signal), [api, projectId]);
  const schema = useLoad((signal) => api.schema(projectId, signal), [api, projectId]);
  const [selectedTable, setSelectedTable] = useState<WebsiteDatabaseTable | null>(null);
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

  const tables = schema.value?.tables || [];
  const rows = tableRows.value?.rows || [];
  const columns = rows.length ? Object.keys(rows[0]) : [];

  return (
    <div className="space-y-3">
      <State {...usage}>
        <p>
          {tt("用量")}：{usage.value?.used_bytes ?? "—"} / {usage.value?.quota_bytes ?? "—"} bytes · {usage.value?.state || usage.value?.status || "—"}
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

    </div>
  );
}

export function WebsitePublishPanel({
  projectId,
  api,
}: {
  projectId: string;
  commit?: string;
  api: WebsitePlatformApi;
}) {
  return currentDomainFamily() === "cn" ? <CnHostingPanel projectId={projectId} api={api} /> : <PlatformPublishPanel projectId={projectId} api={api} />;
}

function PlatformPublishPanel({
  projectId,
  api,
}: {
  projectId: string;
  commit?: string;
  api: WebsitePlatformApi;
}) {
  const tt = useWebsiteUI();
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
      if (!revisionId) throw new Error(tt("作品还没有可发布的版本。"));
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

function UsageBoard({ projectId, api }: { projectId: string; api: WebsitePlatformApi }) {
  const tt = useWebsiteUI();
  const state = useLoad(signal => api.usageSettings(projectId, signal), [projectId, api]);
  const metrics = Object.entries(state.value?.metrics || {}).filter(([, metric]) => metric.status === "actual" && typeof metric.value === "number");
  const ledger = state.value?.cost_ledger;
  return <State {...state}>{!metrics.length && ledger?.status !== "actual" ? <WorkNotWired page="dashboard" /> : <div className="space-y-3 pt-3">
    <dl className="grid gap-2 sm:grid-cols-2">{metrics.map(([name, metric]) => <div key={name}><dt>{name}</dt><dd>{metric.unit === "bytes" ? formatBytes(metric.value) : metric.value} {metric.unit === "bytes" ? "" : metric.unit}</dd></div>)}</dl>
    <div data-testid="website-dashboard-cost-ledger"><h3>{tt("成本记录")}</h3>
      {ledger?.status === "actual" ? <>{Object.entries(ledger.totals || {}).map(([name, total]) => <p key={name}>{name}: {Number(total).toFixed(6)}</p>)}
        {!Object.keys(ledger.totals || {}).length && !ledger.events?.length && <p>{tt("此作品还没有成本记录。")}</p>}
        {!!ledger.unpriced_kinds?.length && <p>{tt("未定价")}: {ledger.unpriced_kinds.join(", ")}</p>}
      </> : <p>{tt("成本记录暂不可用。")}</p>}
    </div>
  </div>}</State>;
}

/** Existing read-only service boards; no source, SQL editor or file mutation UI. */
export function WebsiteResourceBoards({ projectId, api, defaultBoards = [] }: {
  projectId: string; api: WebsitePlatformApi; defaultBoards?: string[];
}) {
  const tt = useWebsiteUI();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const boards = [{ id: "usage", label: "用量与成本", content: <UsageBoard projectId={projectId} api={api} /> }, { id: "database", label: "数据库", content: <DatabasePanel projectId={projectId} api={api} /> },
    { id: "storage", label: "文件存储", content: <StoragePanel projectId={projectId} api={api} /> }];
  const rank = (id: string) => { const index = defaultBoards.indexOf(id); return index < 0 ? defaultBoards.length : index; };
  return <div className="contents" data-testid="website-resource-boards">{boards.map(board =>
    <details key={board.id} id={`work-board-${board.id}`} className="rounded border p-3" style={{ order: rank(board.id) }}
      onToggle={event => setOpen(current => ({ ...current, [board.id]: event.currentTarget.open }))}>
      <summary>{tt(board.label)}</summary>{open[board.id] && board.content}
    </details>)}</div>;
}
