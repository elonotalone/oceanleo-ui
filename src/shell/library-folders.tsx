"use client";

// ============================================================================
// Library「文件夹」类别（skills-overhaul W17，2026-10-24，合同 §0 D5 / §3.2 / §3.4）
// ----------------------------------------------------------------------------
// 技能就是一个装着文件树的条目。这份文件放文件夹类别的全部界面：卡片、详情
// （左树右文 + 下载 / 删除 / 启用停用 / 复制到项目）、上传 .zip。其余 Library
// 文件只做接线（`ArtifactLibrary.tsx` 在选中「文件夹」类别时挂这里的整页视图）。
//
// 选「独立渲染分支」而不是新增 `LibraryKind`："folder" 一旦进 `LibraryKind`，
// `artifactTypeForLibraryKind`、`WORKSPACE_KIND_LABELS` 等穷举表与 MyLibrary 的
// durable 过滤都要跟着改，而文件夹本来就不是 artifact，也不进编辑器。
//
// 数据只走 W09A 的 `folderApi`（`/v1/folders?scope=mine`）。导入的文件夹内容一律
// 当不可信数据：这里只显示标题与计数，正文交给 `FolderTreeViewer`（Markdown 走
// `skipHtml` 的共享组件）。
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import { accessToken } from "../lib/auth/client";
import { ConfirmDialog, SkeletonCard, Switch, timeAgo } from "../ui";
import { APP_PAGE_TITLE_CLASS } from "./AppPageHeader";
import { LibraryToolbar } from "./LibraryLayout";
import { COLLECTION_ACTION_BTN_PRIMARY, CollectionCardGrid } from "./collection-chrome";
import { CollectionItemCard } from "./collection-items";
import {
  ConfigDialogShell,
  FolderTreeViewer,
  SkillCover,
  folderApi,
  type FileContent,
  type Folder,
  type TreeEntry,
} from "./skills/kit";

type TT = (zh: string, vars?: Record<string, string | number>) => string;

// ---------------------------------------------------------------------------
// 纯逻辑（测试直接调用）
// ---------------------------------------------------------------------------

/** 与网关 zip 上限一致（合同 §3.2：zip ≤ 20 MB）。先在本地挡掉，省一次上传。 */
export const FOLDER_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
export const FOLDER_UPLOAD_ACCEPT = ".zip,.skill,application/zip,application/x-zip-compressed";

export function folderTimestamp(folder: Pick<Folder, "updated_at" | "created_at">): number {
  const updated = Date.parse(folder.updated_at || "");
  if (Number.isFinite(updated)) return updated;
  const created = Date.parse(folder.created_at || "");
  return Number.isFinite(created) ? created : 0;
}

/** 新的在前；同一时间按标题稳定排序，避免列表刷新时卡片来回跳。 */
export function sortFoldersByTime<T extends Pick<Folder, "updated_at" | "created_at" | "title">>(
  folders: readonly T[],
): T[] {
  return [...folders].sort(
    (a, b) => folderTimestamp(b) - folderTimestamp(a) || a.title.localeCompare(b.title),
  );
}

export function filterFolders<T extends Pick<Folder, "title" | "skill" | "official">>(
  folders: readonly T[],
  query: string,
): T[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...folders];
  return folders.filter((folder) =>
    [
      folder.title,
      folder.skill?.name,
      folder.skill?.description,
      folder.official?.title,
      folder.official?.title_zh,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase()
      .includes(needle),
  );
}

/** 只有官方封面才显示封面；用户上传的文件夹一律用文件夹图标（不渲染不可信图片）。 */
export function folderCoverSrc(
  folder: Pick<Folder, "source" | "cover_url" | "official">,
  absolutize: (path: string) => string = folderApi.gatewayAbsoluteUrl,
): string | null {
  const raw = folder.cover_url || folder.official?.cover_url || "";
  if (!raw || !(folder.official || folder.source === "official")) return null;
  return absolutize(raw);
}

/** 来源一行（中文原文 = i18n key）。官方引用要讲清「随官方更新」。 */
export function folderSourceLabel(folder: Pick<Folder, "source">): string {
  switch (folder.source) {
    case "official":
      return "官方 · 随官方更新";
    case "github":
      return "来自 GitHub";
    case "created":
      return "自己创建";
    case "copy":
      return "复制件";
    default:
      return "来自上传";
  }
}

export function folderFileCountLabel(tt: TT, folder: Pick<Folder, "file_count">): string {
  return tt("文件夹 · {n} 个文件", { n: Math.max(0, Number(folder.file_count) || 0) });
}

export function checkFolderUpload(
  file: { name: string; size: number } | null | undefined,
): { ok: true } | { ok: false; error: string } {
  if (!file) return { ok: false, error: "请选择一个 .zip 或 .skill 文件" };
  if (!/\.(zip|skill)$/i.test(file.name || "")) {
    return { ok: false, error: "请选择一个 .zip 或 .skill 文件" };
  }
  if (file.size > FOLDER_UPLOAD_MAX_BYTES) {
    return { ok: false, error: "压缩包太大：上限 20 MB，解压后不超过 50 MB、500 个文件" };
  }
  return { ok: true };
}

/** 上传成功后的提示：技能默认关闭（合同 D7），普通文件夹只报成功。 */
export function uploadNotice(folder: Pick<Folder, "skill">): string {
  return folder.skill ? "来自上传的技能默认关闭，确认内容后再启用" : "文件夹已上传";
}

export interface CopyTargetProject {
  id: string;
  name: string;
  icon?: string | null;
  role?: string;
}

/** 只列能写的项目（owner / edit）；`kind='website'` 的行网关本来就不返回。 */
export function copyTargetProjects(rows: readonly unknown[]): CopyTargetProject[] {
  const out: CopyTargetProject[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id : "";
    if (!id) continue;
    const role = typeof rec.role === "string" ? rec.role : "owner";
    if (role !== "owner" && role !== "edit") continue;
    if (rec.kind === "website") continue;
    out.push({
      id,
      name: typeof rec.name === "string" ? rec.name : "",
      icon: typeof rec.icon === "string" ? rec.icon : null,
      role,
    });
  }
  return out;
}

async function listCopyTargetProjects(): Promise<
  { ok: true; data: CopyTargetProject[] } | { ok: false; error: string }
> {
  let token: string | null = null;
  try {
    token = await accessToken();
  } catch {
    token = null;
  }
  if (!token) return { ok: false, error: "请先登录" };
  try {
    const res = await fetch(folderApi.gatewayAbsoluteUrl("/v1/projects"), {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    });
    if (!res.ok) return { ok: false, error: "项目列表不可用。" };
    const body = (await res.json().catch(() => null)) as { items?: unknown[] } | null;
    return { ok: true, data: copyTargetProjects(Array.isArray(body?.items) ? body!.items : []) };
  } catch {
    return { ok: false, error: "网络连接失败，请重试" };
  }
}

// ---------------------------------------------------------------------------
// 图标（线性，stroke 1.75，currentColor）
// ---------------------------------------------------------------------------

function Svg({ children, className = "h-4 w-4" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function FolderGlyph({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.5h7.5A2.5 2.5 0 0 1 21 10v6.5A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
    </Svg>
  );
}

function DownloadGlyph() {
  return (
    <Svg>
      <path d="M12 4v11" />
      <path d="M7.5 10.5 12 15l4.5-4.5" />
      <path d="M5 19h14" />
    </Svg>
  );
}

function TrashGlyph() {
  return (
    <Svg>
      <path d="M4 7h16" />
      <path d="M9.5 7V5h5v2" />
      <path d="M6.5 7l1 12h9l1-12" />
    </Svg>
  );
}

function CopyGlyph() {
  return (
    <Svg>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
    </Svg>
  );
}

function UploadGlyph() {
  return (
    <Svg>
      <path d="M12 16V5" />
      <path d="M7.5 9.5 12 5l4.5 4.5" />
      <path d="M5 19h14" />
    </Svg>
  );
}

function ShieldGlyph() {
  return (
    <Svg className="h-3.5 w-3.5">
      <path d="M12 3.5 5 6v5.5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6z" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// 卡片
// ---------------------------------------------------------------------------

const DETAIL_BTN =
  "inline-flex h-10 items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3.5 text-[13px] text-neutral-800 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:opacity-50";

export function LibraryFolderCover({ folder }: { folder: Folder }) {
  const cover = folderCoverSrc(folder);
  if (cover) {
    return (
      <div
        className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-50 to-neutral-100"
        data-library-folder-cover="official"
      >
        <SkillCover src={cover} title={folder.title} size="sm" />
      </div>
    );
  }
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-neutral-50 to-neutral-100"
      data-library-folder-cover="icon"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-neutral-500 shadow-sm ring-1 ring-neutral-200/70">
        <FolderGlyph />
      </span>
    </div>
  );
}

export function LibraryFolderCard({
  folder,
  onOpen,
  onToggle,
  toggling = false,
}: {
  folder: Folder;
  onOpen: () => void;
  onToggle?: (next: boolean) => void;
  toggling?: boolean;
}) {
  const tt = useUI();
  const skill = folder.skill;
  return (
    <CollectionItemCard
      cover={<LibraryFolderCover folder={folder} />}
      title={folder.title || tt("未命名文件夹")}
      metadata={folderFileCountLabel(tt, folder)}
      onOpen={onOpen}
      openLabel={tt("打开文件夹「{title}」", { title: folder.title })}
      containerProps={{
        "data-library-folder-card": folder.id,
        "data-library-folder-skill": skill ? "true" : "false",
      }}
      floatingActions={
        skill ? (
          <>
            <span
              className="pointer-events-none absolute left-2 top-2 rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-medium text-neutral-700 shadow-sm ring-1 ring-neutral-200/70"
              data-library-folder-badge="skill"
            >
              {tt("技能")}
            </span>
            <div
              className="absolute right-2 top-2 rounded-full bg-white/90 p-1 shadow-sm ring-1 ring-neutral-200/70"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <Switch
                checked={skill.enabled}
                disabled={!folder.can_edit || toggling || !onToggle}
                onChange={(next) => onToggle?.(next)}
                label={skill.enabled ? tt("停用技能") : tt("启用技能")}
              />
            </div>
          </>
        ) : null
      }
    />
  );
}

// ---------------------------------------------------------------------------
// 详情（左树右文 + 操作）
// ---------------------------------------------------------------------------

function CopyToProjectPicker({
  folder,
  onDone,
  onClose,
}: {
  folder: Folder;
  onDone: (message: string, vars?: Record<string, string | number>) => void;
  onClose: () => void;
}) {
  const tt = useUI();
  const [projects, setProjects] = useState<CopyTargetProject[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    let alive = true;
    void listCopyTargetProjects().then((result) => {
      if (!alive) return;
      if (result.ok) setProjects(result.data);
      else {
        setProjects([]);
        setError(result.error);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const copy = async (project: CopyTargetProject) => {
    setBusyId(project.id);
    setError("");
    const result = await folderApi.copyFolderToProject(folder.id, project.id);
    setBusyId("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone("已复制到项目「{name}」", { name: project.name || tt("未命名项目") });
  };

  return (
    <div
      role="dialog"
      aria-label={tt("复制到项目")}
      data-library-folder-copy-picker=""
      className="absolute right-0 top-full z-20 mt-2 w-[min(320px,calc(100vw-48px))] rounded-2xl border border-neutral-200 bg-white p-2 shadow-lg"
    >
      <div className="flex items-center justify-between px-2 py-1.5">
        <p className="text-[13px] font-semibold text-neutral-900">{tt("复制到项目")}</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-1.5 text-[12px] text-neutral-500 hover:bg-neutral-100"
        >
          {tt("取消")}
        </button>
      </div>
      <p className="px-2 pb-2 text-[12px] leading-relaxed text-neutral-500">
        {tt("会复制一份进项目，项目成员都能看到；你在 Library 里的这份不受影响。")}
      </p>
      {projects === null ? (
        <p className="px-2 py-3 text-[12px] text-neutral-400">{tt("加载中…")}</p>
      ) : projects.length === 0 && !error ? (
        <p className="px-2 py-3 text-[12px] text-neutral-400">{tt("还没有可写入的项目")}</p>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              disabled={Boolean(busyId)}
              onClick={() => void copy(project)}
              data-library-folder-copy-target={project.id}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-neutral-100 text-[12px]">
                {project.icon || <FolderGlyph className="h-3.5 w-3.5" />}
              </span>
              <span className="min-w-0 flex-1 truncate">{project.name || tt("未命名项目")}</span>
              {busyId === project.id ? <span className="v-spinner text-[10px]" /> : null}
            </button>
          ))}
        </div>
      )}
      {error ? (
        <p role="alert" className="px-2 pb-1 pt-2 text-[12px] text-rose-600">
          {tt(error)}
        </p>
      ) : null}
    </div>
  );
}

export function LibraryFolderDetail({
  folderId,
  initial,
  onClose,
  onChanged,
  onDeleted,
}: {
  folderId: string;
  initial?: Folder | null;
  onClose: () => void;
  onChanged: (folder: Folder) => void;
  onDeleted: (id: string) => void;
}) {
  const tt = useUI();
  const [folder, setFolder] = useState<Folder | null>(initial || null);
  const [tree, setTree] = useState<TreeEntry[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<{ text: string; vars?: Record<string, string | number>; error?: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState<"" | "download" | "toggle">("");

  useEffect(() => {
    let alive = true;
    setTree(null);
    setLoadError("");
    void folderApi.getFolder(folderId).then((result) => {
      if (!alive) return;
      if (!result.ok) {
        setLoadError(result.error);
        setTree([]);
        return;
      }
      setFolder(result.data.folder);
      setTree(result.data.tree);
    });
    return () => {
      alive = false;
    };
  }, [folderId]);

  const loadFile = useCallback(
    async (path: string): Promise<FileContent | null> => {
      const result = await folderApi.getFolderFile(folderId, path);
      return result.ok ? result.data : null;
    },
    [folderId],
  );

  const initialPath = useMemo(() => {
    if (!tree) return undefined;
    const skillMd = tree.find((entry) => entry.type === "file" && entry.path === "SKILL.md");
    if (skillMd) return skillMd.path;
    return tree.find((entry) => entry.type === "file")?.path;
  }, [tree]);

  const download = async () => {
    if (!folder) return;
    setBusy("download");
    const result = await folderApi.downloadFromGateway(
      folderApi.folderDownloadUrl(folder.id),
      `${folder.title || "folder"}.zip`,
    );
    setBusy("");
    if (!result.ok) setNotice({ text: result.error, error: true });
  };

  const toggle = async (next: boolean) => {
    if (!folder?.skill) return;
    setBusy("toggle");
    const result = await folderApi.updateFolder(folder.id, { enabled: next });
    setBusy("");
    if (!result.ok) {
      setNotice({ text: result.error, error: true });
      return;
    }
    setFolder(result.data);
    onChanged(result.data);
  };

  const remove = async () => {
    if (!folder) return;
    const result = await folderApi.deleteFolder(folder.id);
    setConfirmDelete(false);
    if (!result.ok) {
      setNotice({ text: result.error, error: true });
      return;
    }
    onDeleted(folder.id);
  };

  const title = folder?.title || tt("未命名文件夹");
  const official = folder?.source === "official";
  const subtitle = folder ? (
    <span className="inline-flex flex-wrap items-center gap-x-1.5" data-library-folder-subtitle="">
      {official ? (
        <span className="inline-flex items-center gap-1" data-library-folder-official="">
          <ShieldGlyph />
          {tt("官方 · 随官方更新")}
        </span>
      ) : (
        <span>{tt(folderSourceLabel(folder))}</span>
      )}
      <span aria-hidden="true">·</span>
      <span>{folderFileCountLabel(tt, folder)}</span>
      {folder.updated_at ? (
        <>
          <span aria-hidden="true">·</span>
          <span>{tt("更新于 {time}", { time: timeAgo(folder.updated_at, tt) })}</span>
        </>
      ) : null}
    </span>
  ) : null;

  const toolbar = folder ? (
    <div className="flex flex-wrap items-center gap-2" data-library-folder-actions="">
      {folder.skill ? (
        <label className="mr-1 inline-flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-[13px] text-neutral-800">
          <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-700">
            {tt("技能")}
          </span>
          <span>{folder.skill.enabled ? tt("已启用") : tt("已停用")}</span>
          <Switch
            checked={folder.skill.enabled}
            disabled={!folder.can_edit || busy === "toggle"}
            onChange={(next) => void toggle(next)}
            label={folder.skill.enabled ? tt("停用技能") : tt("启用技能")}
          />
        </label>
      ) : null}
      <button
        type="button"
        className={DETAIL_BTN}
        onClick={() => void download()}
        disabled={busy === "download"}
        data-library-folder-action="download"
      >
        <DownloadGlyph />
        {tt("下载 zip")}
      </button>
      <div className="relative">
        <button
          type="button"
          className={DETAIL_BTN}
          onClick={() => setPickerOpen((value) => !value)}
          aria-expanded={pickerOpen}
          data-library-folder-action="copy"
        >
          <CopyGlyph />
          {tt("复制到项目")}
        </button>
        {pickerOpen ? (
          <CopyToProjectPicker
            folder={folder}
            onClose={() => setPickerOpen(false)}
            onDone={(text, vars) => {
              setPickerOpen(false);
              setNotice({ text, vars });
            }}
          />
        ) : null}
      </div>
      {folder.can_edit ? (
        <button
          type="button"
          className={`${DETAIL_BTN} text-rose-600 hover:bg-rose-50`}
          onClick={() => setConfirmDelete(true)}
          data-library-folder-action="delete"
        >
          <TrashGlyph />
          {tt("删除")}
        </button>
      ) : null}
    </div>
  ) : null;

  return (
    <>
      <ConfigDialogShell
        open
        onClose={onClose}
        title={title}
        subtitle={subtitle}
        toolbar={toolbar}
        size="xl"
        testId="library-folder-detail"
      >
        {notice ? (
          <p
            role={notice.error ? "alert" : "status"}
            className={`mb-3 rounded-xl border px-3 py-2 text-[13px] ${
              notice.error
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-neutral-200 bg-white text-neutral-700"
            }`}
          >
            {tt(notice.text, notice.vars)}
          </p>
        ) : null}
        {loadError ? (
          <p role="alert" className="py-16 text-center text-[13px] text-rose-600">
            {tt(loadError)}
          </p>
        ) : tree === null ? (
          <div className="grid gap-3 py-6">
            <SkeletonCard className="h-10" />
            <SkeletonCard className="h-64" />
          </div>
        ) : (
          <FolderTreeViewer
            key={folderId}
            tree={tree}
            loadFile={loadFile}
            initialPath={initialPath}
            rootLabel={title}
          />
        )}
      </ConfigDialogShell>
      {confirmDelete ? (
        <ConfirmDialog
          title="删除这个文件夹？"
          body={
            folder?.source === "official"
              ? "只会从你的 Library 移除这条引用，官方技能本身不受影响。"
              : "删除后无法恢复，已复制到项目里的副本不受影响。"
          }
          confirmLabel="删除"
          danger
          onConfirm={() => void remove()}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// 整页视图
// ---------------------------------------------------------------------------

export interface LibraryFoldersPageProps {
  /** 页标题（例如「我的库」）。 */
  pageTitle?: ReactNode;
  /** 宿主的类型筛选行（与其它类别同一个菜单，方便切回去）。 */
  filterRow?: ReactNode;
  className?: string;
}

export function LibraryFoldersPage({ pageTitle, filterRow, className = "" }: LibraryFoldersPageProps) {
  const tt = useUI();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ text: string; status: number } | null>(null);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<{ text: string; vars?: Record<string, string | number>; error?: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await folderApi.listFolders({ scope: "mine" });
    setLoading(false);
    if (!result.ok) {
      setError({ text: result.error, status: result.status });
      return;
    }
    setError(null);
    setFolders(result.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => sortFoldersByTime(filterFolders(folders, query)), [folders, query]);
  const replace = useCallback((next: Folder) => {
    setFolders((current) => current.map((item) => (item.id === next.id ? next : item)));
  }, []);

  const toggle = async (folder: Folder, next: boolean) => {
    if (!folder.skill) return;
    setToggling((current) => ({ ...current, [folder.id]: true }));
    replace({ ...folder, skill: { ...folder.skill, enabled: next } });
    const result = await folderApi.updateFolder(folder.id, { enabled: next });
    setToggling((current) => {
      const copy = { ...current };
      delete copy[folder.id];
      return copy;
    });
    if (result.ok) replace(result.data);
    else {
      replace(folder);
      setNotice({ text: result.error, error: true });
    }
  };

  const upload = async (file: File | null | undefined) => {
    const check = checkFolderUpload(file);
    if (!check.ok || !file) {
      setNotice({ text: check.ok ? "请选择一个 .zip 或 .skill 文件" : check.error, error: true });
      return;
    }
    setUploading(true);
    setNotice({ text: "正在上传文件夹…" });
    const result = await folderApi.importFolderZip(file);
    setUploading(false);
    if (!result.ok) {
      setNotice({ text: result.error, error: true });
      return;
    }
    setFolders((current) => [result.data, ...current.filter((item) => item.id !== result.data.id)]);
    setNotice({ text: uploadNotice(result.data) });
  };

  const authRequired = error?.status === 401;
  const uploadButton = (
    <label
      className={`${COLLECTION_ACTION_BTN_PRIMARY} cursor-pointer gap-1.5 ${
        uploading || authRequired ? "pointer-events-none opacity-50" : ""
      }`}
      data-library-folder-upload=""
    >
      <input
        ref={inputRef}
        type="file"
        accept={FOLDER_UPLOAD_ACCEPT}
        className="sr-only"
        disabled={uploading || authRequired}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          void upload(file);
        }}
      />
      <UploadGlyph />
      {tt(uploading ? "上传中…" : "上传文件夹（.zip）")}
    </label>
  );

  const openFolder = openId ? folders.find((item) => item.id === openId) || null : null;

  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`} data-library-folders="">
      <div className="mb-3 shrink-0" data-library-collection-chrome="">
        <LibraryToolbar
          search={query}
          setSearch={setQuery}
          view="grid"
          setView={() => undefined}
          hideView
          actions={<div className="flex shrink-0 flex-wrap items-center gap-2">{uploadButton}</div>}
          placeholder="search"
          tt={tt}
          leading={
            pageTitle ? (
              <h1 className={APP_PAGE_TITLE_CLASS}>
                {typeof pageTitle === "string" ? tt(pageTitle) : pageTitle}
              </h1>
            ) : undefined
          }
        />
        {filterRow}
      </div>
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {notice ? (
          <div
            role={notice.error ? "alert" : "status"}
            aria-live="polite"
            data-library-folder-notice=""
            className={`mb-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[12px] ${
              notice.error
                ? "border-rose-500/25 bg-[var(--card,#fff)] text-rose-700"
                : "border-neutral-200 bg-[var(--card,#fff)] text-neutral-700"
            }`}
          >
            <span>{tt(notice.text, notice.vars)}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label={tt("关闭")}
              className="shrink-0 rounded px-1 text-neutral-400 hover:text-neutral-700"
            >
              ✕
            </button>
          </div>
        ) : null}
        {loading && folders.length === 0 ? (
          <CollectionCardGrid className="mt-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <SkeletonCard key={index} className="h-40" />
            ))}
          </CollectionCardGrid>
        ) : error && folders.length === 0 ? (
          <FoldersEmpty
            title={authRequired ? "登录后查看我的文件夹" : "文件夹暂时无法加载"}
            description={authRequired ? "登录任意 OceanLeo 站点后，你的文件夹与技能会在这里汇总。" : error.text}
            action={
              authRequired ? null : (
                <button type="button" className={DETAIL_BTN} onClick={() => void load()}>
                  {tt("重试")}
                </button>
              )
            }
          />
        ) : visible.length === 0 ? (
          <FoldersEmpty
            title={query.trim() ? "未找到匹配的内容" : "还没有文件夹"}
            description={
              query.trim()
                ? "换个关键词试试，或清除筛选条件。"
                : "上传一个 .zip 就会变成文件夹；带 SKILL.md 的会成为技能。从官方技能库添加的技能也会出现在这里。"
            }
            action={query.trim() ? null : uploadButton}
          />
        ) : (
          <CollectionCardGrid className="mt-2" data-library-folder-grid="">
            {visible.map((folder) => (
              <LibraryFolderCard
                key={folder.id}
                folder={folder}
                onOpen={() => setOpenId(folder.id)}
                onToggle={(next) => void toggle(folder, next)}
                toggling={Boolean(toggling[folder.id])}
              />
            ))}
          </CollectionCardGrid>
        )}
      </div>
      {openId ? (
        <LibraryFolderDetail
          key={openId}
          folderId={openId}
          initial={openFolder}
          onClose={() => setOpenId(null)}
          onChanged={replace}
          onDeleted={(id) => {
            setOpenId(null);
            setFolders((current) => current.filter((item) => item.id !== id));
            setNotice({ text: "文件夹已删除" });
          }}
        />
      ) : null}
    </div>
  );
}

function FoldersEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  const tt = useUI();
  return (
    <div
      className="v-fade-up flex flex-col items-center justify-center px-6 py-16 text-center"
      data-library-folders-empty=""
    >
      <span className="mb-4 text-neutral-300">
        <FolderGlyph className="h-8 w-8" />
      </span>
      <p className="text-[16px] font-semibold text-neutral-800">{tt(title)}</p>
      <p className="mt-1.5 max-w-md text-[14px] leading-relaxed text-neutral-500">{tt(description)}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
