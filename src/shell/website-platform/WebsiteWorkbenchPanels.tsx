"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  websitePlatformApi,
  websiteStaticPreviewUrl,
  type WebsiteCommit,
  type WebsiteDatabaseTable,
  type WebsiteDeployment,
  type WebsitePlatformApi,
} from "../../lib/website-platform-api";
import { useUI } from "../../i18n/ui/useUI";

type Panel = "preview" | "code" | "history" | "database" | "publish";

export interface WebsiteWorkbenchPanelsProps {
  projectId: string;
  stack?: string;
  commit?: string;
  api?: WebsitePlatformApi;
}

const tabs: Array<[Panel, string]> = [
  ["preview", "预览"],
  ["code", "代码"],
  ["history", "历史"],
  ["database", "数据库"],
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
}: WebsiteWorkbenchPanelsProps) {
  const tt = useUI();
  const [panel, setPanel] = useState<Panel>("preview");

  return (
    <section
      className="border-t border-[var(--awb-border)] bg-[var(--awb-chrome-bg)]"
      data-testid="website-platform-panels"
    >
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
            onClick={() => setPanel(id)}
          >
            {tt(label)}
          </button>
        ))}
      </nav>
      <div className="max-h-[42vh] min-h-[180px] overflow-auto border-t border-[var(--awb-border)] p-3 text-sm">
        {panel === "preview" ? (
          <PreviewPanel projectId={projectId} stack={stack} commit={commit} api={api} />
        ) : null}
        {panel === "code" ? (
          <CodePanel projectId={projectId} commit={commit} api={api} />
        ) : null}
        {panel === "history" ? (
          <HistoryPanel projectId={projectId} commit={commit} api={api} />
        ) : null}
        {panel === "database" ? <DatabasePanel projectId={projectId} api={api} /> : null}
        {panel === "publish" ? (
          <PublishPanel projectId={projectId} commit={commit} api={api} />
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
  const state = useLoad(
    (signal) => {
      if (stack === "static") {
        return Promise.resolve({
          tier: "static" as const,
          stack,
          ...(commit ? { url: websiteStaticPreviewUrl(projectId, commit) } : {}),
          status: commit ? "ready" : tt("等待保存后的提交"),
          boot_progress: commit ? 100 : 0,
        });
      }
      return api.preview(projectId, commit, signal);
    },
    [api, projectId, stack, commit, tt],
  );
  const data = state.value;

  return (
    <State {...state}>
      {data?.url ? (
        <iframe
          title={tt("网站预览")}
          src={data.url}
          className="h-[300px] w-full rounded border"
          sandbox="allow-forms allow-modals allow-popups allow-presentation allow-scripts"
        />
      ) : (
        <div
          data-testid="website-preview-boot"
          className="rounded border p-6"
          aria-live="polite"
        >
          <strong>
            {data?.tier === "sandbox" || stack !== "static"
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
    </State>
  );
}

function CodePanel({
  projectId,
  commit,
  api,
}: {
  projectId: string;
  commit?: string;
  api: WebsitePlatformApi;
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
        if (!controller.signal.aborted) setContent(file.content || "");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setNotice(errText(error));
      });
    return () => controller.abort();
  }, [api, projectId, selected, baseCommit]);

  const save = async () => {
    if (!selected) return;
    try {
      const result = await api.save(projectId, { [selected]: content }, baseCommit);
      setBaseCommit(result.commit);
      setReload((value) => value + 1);
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
          <textarea
            aria-label={tt("文件内容")}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="min-h-[180px] w-full rounded border bg-transparent p-2 font-mono text-xs"
          />
          <button
            type="button"
            className="mt-2 rounded bg-[var(--awb-accent)] px-3 py-1 text-xs text-white"
            disabled={!selected}
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
    try {
      const tree = await api.files(projectId, selectedId);
      const current = commit ? await api.files(projectId, commit) : { files: [] };
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
        commit,
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
  commit,
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
      const result = await api.publish(projectId, commit);
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
