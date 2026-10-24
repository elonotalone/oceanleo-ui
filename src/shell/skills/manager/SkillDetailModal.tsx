"use client";

// W09B · P3 — Manus-style skill detail (contract §3.4, D4; UI-DESIGN "技能详情").
// Overview: title, author | updated, "+ Add to my skills" (or "✓ Added"), "View details";
// tilted 3:4 cover on the right; description; recommended connectors / tools; licence.
// "View details" → left file tree / right file content (`FolderTreeViewer`).
// Top right: share (official only: copies the public page link), download, close.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale } from "next-intl";

import { useUI } from "../../../i18n/ui/useUI";
import { useToast } from "../../../ui";
import {
  CONFIG_PRIMARY_BUTTON_CLASS,
  CONFIG_TOOLBAR_BUTTON_CLASS,
  ConfigDialogShell,
  ConfigToggle,
  FolderTreeViewer,
  KitIconAlert,
  KitIconCheck,
  KitIconChevronLeft,
  KitIconDownload,
  KitIconFileText,
  KitIconPlus,
  KitIconShare,
  SkillCover,
  addOfficialSkill,
  downloadFromGateway,
  folderDownloadUrl,
  gatewayAbsoluteUrl,
  getFolder,
  getFolderFile,
  getOfficialSkill,
  getOfficialSkillFile,
  officialSkillDownloadUrl,
  officialSkillShareUrl,
  updateFolder,
  type FileContent,
  type Folder,
  type OfficialSkill,
  type TreeEntry,
} from "../kit";
import { notifyFoldersChanged } from "./folder-events";
import {
  FOLDER_SOURCE_LABEL_ZH,
  findAddedFolder,
  folderDescription,
  folderDisplayTitle,
  folderSkillName,
  formatLongDate,
  isUnreviewedSource,
  officialDescription,
  officialDisplayTitle,
  type FolderSource,
} from "./logic";
import { IconAuthor, IconScale } from "./manager-icons";
import { SourceBadge } from "./badges";
import type { SkillDetailModalProps } from "./types";
import { useScopeFolders } from "./use-scope-folders";

type Loaded =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; official: OfficialSkill | null; folder: Folder | null; tree: TreeEntry[] };

const HEADER_ICON_CLASS =
  "inline-flex h-11 w-11 items-center justify-center rounded-full text-neutral-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-200/70 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100";

export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}

export function SkillDetailModal({ open, onClose, skill, projectId, onAdded }: SkillDetailModalProps) {
  const tt = useUI();
  const locale = useLocale();
  const toast = useToast();
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [view, setView] = useState<"overview" | "files">("overview");
  const [adding, setAdding] = useState(false);
  const [tick, setTick] = useState(0);
  const scopeFolders = useScopeFolders(projectId, open && skill.kind === "official");
  const targetKey = skill.kind === "official" ? `o:${skill.name}` : `f:${skill.id}`;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoaded({ status: "loading" });
    setView("overview");
    const run = async () => {
      if (skill.kind === "official") {
        const result = await getOfficialSkill(skill.name);
        if (!alive) return;
        setLoaded(
          result.ok
            ? { status: "ready", official: result.data.skill, folder: null, tree: result.data.tree }
            : { status: "error", error: result.error },
        );
        return;
      }
      const result = await getFolder(skill.id);
      if (!alive) return;
      setLoaded(
        result.ok
          ? { status: "ready", official: result.data.folder.official, folder: result.data.folder, tree: result.data.tree }
          : { status: "error", error: result.error },
      );
    };
    void run();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- targetKey captures `skill`
  }, [open, targetKey, tick]);

  const ready = loaded.status === "ready" ? loaded : null;
  const official = ready?.official ?? null;
  const folder = ready?.folder ?? null;
  const name = official?.name || (folder ? folderSkillName(folder) : "") || (skill.kind === "official" ? skill.name : "");
  const addedFolder = useMemo(
    () => (skill.kind === "official" ? findAddedFolder(scopeFolders.items, skill.name) : null),
    [scopeFolders.items, skill],
  );

  const title = official
    ? officialDisplayTitle(official, locale)
    : folder
      ? folderDisplayTitle(folder, locale)
      : name;

  const loadFile = useCallback(
    async (path: string): Promise<FileContent | null> => {
      const result =
        skill.kind === "official" ? await getOfficialSkillFile(skill.name, path) : await getFolderFile(skill.id, path);
      return result.ok ? result.data : null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- targetKey captures `skill`
    [targetKey],
  );

  const downloadUrl =
    skill.kind === "official" ? officialSkillDownloadUrl(skill.name) : folderDownloadUrl(skill.id);
  const shareName = official?.name || "";

  const onShare = async () => {
    if (!shareName) return;
    const ok = await copyText(officialSkillShareUrl(shareName));
    if (ok) toast.success(tt("链接已复制"), officialSkillShareUrl(shareName));
    else toast.error(tt("复制失败"), officialSkillShareUrl(shareName));
  };

  const onDownload = async () => {
    const result = await downloadFromGateway(downloadUrl, `${name || "skill"}.zip`);
    if (!result.ok) toast.error(tt("下载失败"), tt(result.error));
  };

  const onAdd = async () => {
    if (skill.kind !== "official") return;
    setAdding(true);
    const result = await addOfficialSkill(skill.name, projectId);
    setAdding(false);
    if (!result.ok) {
      toast.error(tt("添加失败"), tt(result.error));
      return;
    }
    scopeFolders.setItems((items) => [result.data, ...items.filter((f) => f.id !== result.data.id)]);
    notifyFoldersChanged();
    toast.success(projectId ? tt("已添加到本项目") : tt("已添加到我的技能"), `/${skill.name}`);
    onAdded?.(result.data);
  };

  const onToggle = async (next: boolean) => {
    if (!folder?.skill) return;
    const previous = folder;
    setLoaded((l) => (l.status === "ready" && l.folder?.skill ? { ...l, folder: { ...l.folder, skill: { ...l.folder.skill, enabled: next } } } : l));
    const result = await updateFolder(previous.id, { enabled: next });
    if (!result.ok) {
      setLoaded((l) => (l.status === "ready" ? { ...l, folder: previous } : l));
      toast.error(tt("没能保存开关"), tt(result.error));
      return;
    }
    setLoaded((l) => (l.status === "ready" ? { ...l, folder: result.data } : l));
    notifyFoldersChanged();
  };

  const headerActions = (
    <div className="absolute right-[56px] top-3 z-[1] flex items-center sm:right-[68px] sm:top-5" data-skill-detail-actions="">
      {shareName ? (
        <button type="button" aria-label={tt("分享")} title={tt("复制公开页链接")} onClick={() => void onShare()} className={HEADER_ICON_CLASS}>
          <KitIconShare className="h-4 w-4" />
        </button>
      ) : null}
      <button type="button" aria-label={tt("下载")} title={tt("下载 zip")} onClick={() => void onDownload()} className={HEADER_ICON_CLASS}>
        <KitIconDownload className="h-4 w-4" />
      </button>
    </div>
  );

  const dialogTitle: ReactNode =
    view === "files" ? (
      <button
        type="button"
        onClick={() => setView("overview")}
        data-skill-detail-back=""
        className="-ml-1.5 inline-flex min-h-11 items-center gap-1 rounded-lg px-1.5 py-0.5 text-[18px] font-semibold transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-200/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:bg-neutral-800"
      >
        <KitIconChevronLeft className="h-4 w-4" />
        {tt("技能详情")}
      </button>
    ) : (
      <span className="block pr-28 text-[18px] leading-tight">{title || tt("技能详情")}</span>
    );

  return (
    <ConfigDialogShell open={open} onClose={onClose} size="lg" testId="skill-detail-modal" title={dialogTitle}>
      {headerActions}
      {loaded.status === "loading" ? (
        <div className="space-y-3 pt-2" aria-busy="true">
          <div className="h-4 w-56 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-10 w-72 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-24 w-full animate-pulse rounded-xl bg-neutral-200/70 dark:bg-neutral-800" />
        </div>
      ) : loaded.status === "error" ? (
        <div className="flex flex-col items-start gap-3 pt-2">
          <p className="text-[13px] text-rose-600 dark:text-rose-400">{tt(loaded.error)}</p>
          <button type="button" className={CONFIG_TOOLBAR_BUTTON_CLASS} onClick={() => setTick((v) => v + 1)}>
            {tt("重试")}
          </button>
        </div>
      ) : view === "files" ? (
        <div className="h-full min-h-[420px]" data-skill-detail-files="">
          <FolderTreeViewer
            tree={loaded.tree}
            loadFile={loadFile}
            initialPath="SKILL.md"
            downloadUrl={downloadUrl}
            rootLabel={name || title}
          />
        </div>
      ) : (
        <DetailOverview
          locale={locale}
          official={official}
          folder={folder}
          title={title}
          kind={skill.kind}
          projectScoped={Boolean(projectId)}
          added={skill.kind === "official" ? Boolean(addedFolder) : true}
          addedKnown={skill.kind !== "official" || scopeFolders.status !== "loading"}
          adding={adding}
          onAdd={() => void onAdd()}
          onViewFiles={() => setView("files")}
          onToggle={(next) => void onToggle(next)}
        />
      )}
    </ConfigDialogShell>
  );
}

function Chips({ label, values }: { label: string; values: readonly string[] }) {
  if (!values.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[13px] text-neutral-500 dark:text-neutral-400">{label}</span>
      {values.map((value) => (
        <span
          key={value}
          className="rounded-md border border-neutral-200 bg-white px-2 py-0.5 font-mono text-[12px] text-neutral-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300"
        >
          {value}
        </span>
      ))}
    </div>
  );
}

function DetailOverview({
  locale,
  official,
  folder,
  title,
  kind,
  projectScoped,
  added,
  addedKnown,
  adding,
  onAdd,
  onViewFiles,
  onToggle,
}: {
  locale: string;
  official: OfficialSkill | null;
  folder: Folder | null;
  title: string;
  kind: "official" | "folder";
  projectScoped: boolean;
  added: boolean;
  addedKnown: boolean;
  adding: boolean;
  onAdd: () => void;
  onViewFiles: () => void;
  onToggle: (next: boolean) => void;
}) {
  const tt = useUI();
  const author = official?.author || (folder ? tt(FOLDER_SOURCE_LABEL_ZH[folder.source as FolderSource] ?? folder.source) : "");
  const updated = formatLongDate(official?.updated_at || folder?.updated_at, locale);
  const cover = official?.cover_url || folder?.cover_url || null;
  const description = official ? officialDescription(official, locale) : folder ? folderDescription(folder, locale) : "";
  const unreviewed = folder ? isUnreviewedSource(folder) : false;
  const canToggle = Boolean(folder?.skill && folder.can_edit);

  return (
    <div data-skill-detail-overview="">
      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-neutral-600 dark:text-neutral-300">
            {official ? (
              <span className="inline-flex items-center gap-1.5">
                <IconAuthor className="h-4 w-4" />
                {author}
              </span>
            ) : folder ? (
              <SourceBadge folder={folder} />
            ) : null}
            {updated ? (
              <>
                <span aria-hidden="true" className="h-3.5 w-px bg-neutral-300 dark:bg-neutral-700" />
                <span className="text-neutral-500 dark:text-neutral-400">{tt("更新于 {time}", { time: updated })}</span>
              </>
            ) : null}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            {kind === "official" ? (
              added ? (
                <span
                  data-skill-added=""
                  className={`${CONFIG_TOOLBAR_BUTTON_CLASS} cursor-default hover:bg-white dark:hover:bg-neutral-900`}
                >
                  <KitIconCheck className="h-4 w-4" />
                  {tt("已加入")}
                </span>
              ) : (
                <button
                  type="button"
                  disabled={adding || !addedKnown}
                  onClick={onAdd}
                  data-skill-add=""
                  className={CONFIG_PRIMARY_BUTTON_CLASS}
                >
                  {adding ? <span className="v-spinner text-[10px]" aria-hidden="true" /> : <KitIconPlus className="h-4 w-4" />}
                  {projectScoped ? tt("添加到本项目") : tt("添加到我的技能")}
                </button>
              )
            ) : null}
            <button type="button" onClick={onViewFiles} data-skill-view-files="" className={CONFIG_TOOLBAR_BUTTON_CLASS}>
              <KitIconFileText className="h-4 w-4" />
              {tt("查看详情")}
            </button>
            {canToggle && folder?.skill ? (
              <span className="ml-1 inline-flex items-center gap-2 text-[13px] text-neutral-600 dark:text-neutral-300">
                <ConfigToggle
                  checked={folder.skill.enabled}
                  onChange={onToggle}
                  label={tt("启用「{name}」", { name: title })}
                />
                {folder.skill.enabled ? tt("已启用") : tt("未启用")}
              </span>
            ) : null}
          </div>
          {folder?.skill ? (
            <p className="mt-4 font-mono text-[13px] text-neutral-500 dark:text-neutral-400">
              {tt("在输入框打 {cmd} 点名使用", { cmd: `/${folder.skill.name}` })}
            </p>
          ) : official ? (
            <p className="mt-4 font-mono text-[13px] text-neutral-500 dark:text-neutral-400">/{official.name}</p>
          ) : null}
        </div>
        <div className="hidden shrink-0 pr-2 pt-1 sm:block" aria-hidden="true">
          <div className="-rotate-[4deg] shadow-[0_14px_30px_rgba(0,0,0,0.18)]">
            <SkillCover src={cover ? gatewayAbsoluteUrl(cover) : null} title={title} size="lg" />
          </div>
        </div>
      </div>
      <div className="mt-8 border-t border-neutral-200 pt-6 dark:border-neutral-800">
        {unreviewed ? (
          <div
            data-unreviewed-warning=""
            className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
          >
            <KitIconAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{tt("这个技能来自上传或 GitHub，没有经过 OceanLeo 审核。打开之前先点「查看详情」看一遍内容。")}</span>
          </div>
        ) : null}
        {description ? (
          <p className="whitespace-pre-line text-[13px] leading-[1.7] text-neutral-800 dark:text-neutral-200" data-skill-description="">
            {description}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-3">
          <Chips label={tt("推荐连接器")} values={official?.connectors ?? []} />
          <Chips label={tt("会用到的能力")} values={official?.tools ?? []} />
          {official ? (
            <p className="inline-flex items-center gap-1.5 text-[13px] text-neutral-500 dark:text-neutral-400">
              <IconScale className="h-4 w-4" />
              {official.license || "Apache-2.0"} · {tt("开源可下载")}
              {official.version ? <span className="ml-1 font-mono">v{official.version}</span> : null}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
