"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { deviceErrorCopy } from "../api/device-error-copy";
import {
  isInsideLocalRoot,
  joinLocalPath,
  localActionOutcomeText,
  startLocalAction,
  type LocalTask,
  type LocalTaskResultSummary,
  type StartLocalActionOptions,
} from "./local-task-client";

// 本机文件树（W09，2026-08-20）。
//
// 它只用两个只读动作：展开一层目录走 `fs.list`，看一个文件的结构走 `fs.read_summary`。
// 文件正文没有任何动作能取回来（协议 §5.3 的白名单里就没有承载正文的键），所以这棵树
// 天生只能显示「名字 / 类型 / 大小 / 表格的列名行数」—— 这不是功能缺失，是产品承诺，
// 因此界面上要把它说出来，而不是让用户点半天才发现看不到内容。
//
// 授权范围显示为什么长这样：设备心跳只上报**授权类别**（`granted_kinds`），
// 从不上报授权了哪些目录（`devices_router.py` 的 `/heartbeat`）。所以网页端**无法**
// 画出「你授权了哪些目录」这张图，只能显示「你现在看的这个根 + 类别 + 判定在那台电脑做」。
// 编一棵假的授权目录树出来，比不显示更糟。

export interface LocalFileTreeProps {
  deviceId: string;
  deviceName?: string;
  deviceOnline?: boolean;
  /** 已授权目录的绝对路径。树不会走到它之外。 */
  rootPath: string;
  /** 那台电脑上报的授权类别，用于「你只授权了什么」这一行。 */
  grantedKinds?: readonly string[];
  selectedPaths?: readonly string[];
  onSelectionChange?: (paths: string[]) => void;
  className?: string;
  /** 测试缝；产品调用方一律不传。 */
  runAction?: StartLocalActionOptions;
}

interface DirectoryState {
  status: "idle" | "loading" | "ready" | "error";
  files: NonNullable<LocalTaskResultSummary["files"]>;
  message?: string;
}

const GRANT_KIND_LABELS: Record<string, string> = {
  read: "读取文件清单与结构",
  write: "写入与新建文件",
  python: "用自带 Python 处理这些文件",
  shell: "执行系统命令",
};

export function humanizeGrantedKinds(kinds: readonly string[] | undefined): string {
  const labels = (kinds ?? [])
    .map((kind) => GRANT_KIND_LABELS[String(kind).toLowerCase()])
    .filter((label): label is string => Boolean(label));
  return labels.length > 0 ? labels.join("、") : "还没有任何授权类别";
}

export function formatFileBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function failureMessage(task: LocalTask, deviceName: string): string {
  if (task.status === "denied") {
    return task.denyReason
      ? deviceErrorCopy(task.denyReason, { deviceName })
      : `${deviceName}拒绝了这一步；具体原因在那台电脑的「本地审计」里。`;
  }
  return localActionOutcomeText(task, deviceName);
}

export function LocalFileTree({
  deviceId,
  deviceName = "这台电脑",
  deviceOnline = true,
  rootPath,
  grantedKinds,
  selectedPaths,
  onSelectionChange,
  className,
  runAction,
}: LocalFileTreeProps) {
  const [directories, setDirectories] = useState<Record<string, DirectoryState>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [inspecting, setInspecting] = useState<Record<string, string>>({});
  const [selection, setSelection] = useState<readonly string[]>(selectedPaths ?? []);
  const stopsRef = useRef<(() => void)[]>([]);

  const activeSelection = selectedPaths ?? selection;

  useEffect(
    () => () => {
      for (const stop of stopsRef.current) stop();
      stopsRef.current = [];
    },
    [],
  );

  // 换根（用户改了授权目录）就把整棵树清空：留着上一个根的条目会让用户以为它们还在范围内。
  useEffect(() => {
    setDirectories({});
    setExpanded({});
    setInspecting({});
    setSelection([]);
    onSelectionChange?.([]);
  }, [onSelectionChange, rootPath]);

  const loadDirectory = useCallback(
    async (path: string) => {
      setDirectories((current) => ({
        ...current,
        [path]: { status: "loading", files: current[path]?.files ?? [] },
      }));
      try {
        const started = await startLocalAction(
          deviceId,
          "fs.list",
          { path },
          (task) => {
            if (task.status === "succeeded") {
              setDirectories((current) => ({
                ...current,
                [path]: {
                  status: "ready",
                  files: task.resultSummary?.files ?? [],
                },
              }));
              return;
            }
            if (task.status === "queued" || task.status === "claimed" || task.status === "running") {
              return;
            }
            setDirectories((current) => ({
              ...current,
              [path]: {
                status: "error",
                files: current[path]?.files ?? [],
                message: failureMessage(task, deviceName),
              },
            }));
          },
          runAction,
        );
        stopsRef.current.push(started.stop);
        if (started.offline) {
          setDirectories((current) => ({
            ...current,
            [path]: {
              status: "loading",
              files: current[path]?.files ?? [],
              message: `${deviceName}现在离线，这次列举已排队；它上线后会自动继续。`,
            },
          }));
        }
      } catch (caught) {
        const code =
          caught && typeof caught === "object" && "code" in caught
            ? String((caught as { code: unknown }).code)
            : "network_error";
        setDirectories((current) => ({
          ...current,
          [path]: {
            status: "error",
            files: current[path]?.files ?? [],
            message:
              code === "network_error"
                ? "暂时联系不上服务器，这一层没有列出来；重试不会重复下发。"
                : deviceErrorCopy(code, { deviceName }),
          },
        }));
      }
    },
    [deviceId, deviceName, runAction],
  );

  const toggleDirectory = useCallback(
    (path: string) => {
      const willExpand = !expanded[path];
      setExpanded((current) => ({ ...current, [path]: willExpand }));
      if (willExpand && !directories[path]) void loadDirectory(path);
    },
    [directories, expanded, loadDirectory],
  );

  const inspect = useCallback(
    async (path: string) => {
      setInspecting((current) => ({ ...current, [path]: "正在读结构摘要…" }));
      try {
        const started = await startLocalAction(
          deviceId,
          "fs.read_summary",
          { path },
          (task) => {
            if (task.status === "queued" || task.status === "claimed" || task.status === "running") {
              return;
            }
            setInspecting((current) => ({
              ...current,
              [path]:
                task.status === "succeeded"
                  ? localActionOutcomeText(task, deviceName)
                  : failureMessage(task, deviceName),
            }));
          },
          runAction,
        );
        stopsRef.current.push(started.stop);
      } catch {
        setInspecting((current) => ({
          ...current,
          [path]: "结构摘要没读到，请稍后重试。",
        }));
      }
    },
    [deviceId, deviceName, runAction],
  );

  const toggleSelected = useCallback(
    (path: string) => {
      const next = activeSelection.includes(path)
        ? activeSelection.filter((item) => item !== path)
        : [...activeSelection, path];
      setSelection(next);
      onSelectionChange?.([...next]);
    },
    [activeSelection, onSelectionChange],
  );

  const renderLevel = (path: string, depth: number) => {
    const state = directories[path];
    if (!state) return null;
    if (state.status === "loading" && state.files.length === 0) {
      return (
        <p className="py-2 text-xs text-stone-500" role="status">
          {state.message || `正在向${deviceName}要「${path}」这一层的清单…`}
        </p>
      );
    }
    if (state.status === "error") {
      return (
        <p className="py-2 text-xs text-rose-700" role="alert" data-local-tree-error>
          {state.message}
        </p>
      );
    }
    if (state.files.length === 0) {
      return <p className="py-2 text-xs text-stone-500">这一层是空的。</p>;
    }
    return (
      <ul className="space-y-1" data-local-tree-level={depth}>
        {state.files.map((file) => {
          const childPath = joinLocalPath(path, file.name);
          const outsideRoot = !isInsideLocalRoot(rootPath, childPath);
          const isDirectory = file.kind === "directory";
          const isSelected = activeSelection.includes(childPath);
          return (
            <li key={childPath} data-local-tree-entry={file.kind}>
              <div
                className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-stone-50"
                style={{ paddingLeft: `${depth * 0.75 + 0.5}rem` }}
              >
                {isDirectory ? (
                  <button
                    type="button"
                    onClick={() => toggleDirectory(childPath)}
                    disabled={outsideRoot}
                    aria-expanded={Boolean(expanded[childPath])}
                    className="min-h-10 rounded-md px-1 text-xs font-medium text-stone-700 disabled:opacity-40"
                  >
                    {expanded[childPath] ? "▾" : "▸"} 📁 {file.name}
                  </button>
                ) : (
                  <label className="flex min-h-10 items-center gap-2 text-xs text-stone-800">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={outsideRoot}
                      onChange={() => toggleSelected(childPath)}
                      className="size-4"
                    />
                    <span>📄 {file.name}</span>
                  </label>
                )}
                <span className="text-xs text-stone-500">
                  {isDirectory ? "文件夹" : formatFileBytes(file.bytes)}
                </span>
                {!isDirectory && (
                  <button
                    type="button"
                    onClick={() => void inspect(childPath)}
                    className="min-h-10 rounded-md border border-stone-200 px-2 text-xs text-stone-700 hover:bg-stone-50"
                  >
                    看结构
                  </button>
                )}
                {outsideRoot && (
                  <span className="text-xs text-amber-700" data-local-tree-outside-root>
                    这一项算出来的路径跑到了授权目录之外，已停在这里。
                  </span>
                )}
              </div>
              {inspecting[childPath] && (
                <p
                  className="px-2 pb-1 text-xs text-stone-600"
                  style={{ paddingLeft: `${depth * 0.75 + 2}rem` }}
                  data-local-tree-summary
                >
                  {inspecting[childPath]}
                </p>
              )}
              {isDirectory && expanded[childPath] && renderLevel(childPath, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <section
      className={className}
      data-local-file-tree
      data-local-tree-root={rootPath}
      aria-label="本机文件树"
    >
      <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs leading-relaxed text-stone-600">
        <p data-local-tree-scope>
          授权范围：<code className="font-medium text-stone-800">{rootPath || "（还没填目录）"}</code>
          。这棵树不会走出这个目录。
        </p>
        <p className="mt-1" data-local-tree-granted-kinds>
          {deviceName}上已授权的类别：{humanizeGrantedKinds(grantedKinds)}。
        </p>
        <p className="mt-1">
          能不能读某个路径由{deviceName}自己判定 —— 网页端看不到你在那台电脑上授权了哪些
          目录，所以这里不会替你猜。填了范围之外的路径，它会拒绝而不是照做。
        </p>
        <p className="mt-1">
          树上只有名字、类型、大小；表格文件还能看列名与行数。文件正文一律不上传，
          要看内容请在{deviceName}上打开。
        </p>
      </div>

      {!rootPath ? (
        <p className="mt-3 text-xs text-stone-500">先填一个已授权目录的绝对路径。</p>
      ) : !deviceOnline ? (
        <p className="mt-3 text-xs text-amber-700" role="status">
          {deviceName}现在离线。你仍然可以展开目录，请求会排队，等它上线后自动继续。
        </p>
      ) : null}

      {rootPath && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => toggleDirectory(rootPath)}
              aria-expanded={Boolean(expanded[rootPath])}
              className="min-h-10 rounded-lg border border-stone-200 px-3 text-xs font-medium text-stone-800 hover:bg-stone-50"
              data-local-tree-root-toggle
            >
              {expanded[rootPath] ? "▾" : "▸"} 📁 {rootPath}
            </button>
            <button
              type="button"
              onClick={() => void loadDirectory(rootPath)}
              className="min-h-10 rounded-lg border border-stone-200 px-3 text-xs text-stone-700 hover:bg-stone-50"
            >
              重新列举
            </button>
            {activeSelection.length > 0 && (
              <span className="text-xs text-stone-600" data-local-tree-selection-count>
                已选中 {activeSelection.length} 个文件
              </span>
            )}
          </div>
          {expanded[rootPath] && <div className="mt-2">{renderLevel(rootPath, 1)}</div>}
        </div>
      )}
    </section>
  );
}
