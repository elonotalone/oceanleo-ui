"use client";

// W09B · P1 — skills manager (personal / project scope). Contract §3.4; UI-DESIGN
// "大弹窗 / 卡片网格 / Add ▾". Can live on a page or inside a `ConfigDialogShell`.
//
// - Toolbar: filter (source / category / enabled only) + search (name + description).
// - Add ▾: local .zip/.skill · import from my skills (project only) · official library
//   · GitHub · write one.
// - Cards: toggle = PATCH enabled (optimistic + rollback + toast); footer "source ·
//   updated"; … menu: view · download · copy to project (personal) · delete (confirm).
// - Imported (upload / GitHub) skills carry an "unreviewed source" tag and start off.
// - Read-only project members (`canEdit=false`) see no write affordance at all.

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useLocale } from "next-intl";

import { useUI } from "../../../i18n/ui/useUI";
import { FloatingMenu, FloatingMenuItem, FloatingMenuLabel, FloatingMenuSeparator, useToast } from "../../../ui";
import {
  AddMenu,
  CONFIG_CARD_GRID_CLASS,
  CONFIG_TOOLBAR_ICON_BUTTON_CLASS,
  ConfigEmptyState,
  ConfigItemCard,
  ConfigToolbar,
  KitIconDownload,
  KitIconFilter,
  KitIconMore,
  KitIconPuzzle,
  KitIconShield,
  copyFolderToProject,
  createSkill,
  deleteFolder,
  downloadFromGateway,
  folderDownloadUrl,
  importFolderFromGithub,
  importFolderZip,
  updateFolder,
  type AddMenuItem,
  type Folder,
} from "../kit";
import { notifyFoldersChanged } from "./folder-events";
import {
  CopyToProjectDialog,
  CreateSkillDialog,
  DeleteFolderDialog,
  GithubImportDialog,
  ImportFromMineDialog,
} from "./ImportDialogs";
import {
  EMPTY_FILTER,
  FOLDER_SOURCE_LABEL_ZH,
  SKILL_CATEGORY_LABEL_ZH,
  filterFolders,
  filterIsActive,
  folderDescription,
  folderDisplayTitle,
  folderSkillName,
  formatUpdatedAt,
  isImportableArchive,
  isUnreviewedSource,
  patchFolder,
  presentCategories,
  presentSources,
  sortFolders,
  toggleValue,
  upsertFolder,
  withEnabled,
  type FolderSource,
  type ManagerFilter,
  type SkillCategoryId,
} from "./logic";
import { stopEscapeFromReachingShell } from "./ManagerDialog";
import {
  IconEye,
  IconFolderPlus,
  IconGithub,
  IconPencil,
  IconRefresh,
  IconTrash,
  IconUpload,
  IconUserCircle,
} from "./manager-icons";
import { OfficialSkillLibraryDialog } from "./OfficialSkillLibraryDialog";
import { SkillDetailModal } from "./SkillDetailModal";
import type { SkillDetailTarget, SkillsManagerProps } from "./types";
import { useScopeFolders } from "./use-scope-folders";
import { SourceBadge } from "./badges";

const MENU_Z = "z-[1010]";

type SubDialog =
  | null
  | { kind: "github" }
  | { kind: "create" }
  | { kind: "mine" }
  | { kind: "copy"; folder: Folder }
  | { kind: "delete"; folder: Folder };

/** Who may write in this scope. Project scope follows `canEdit`; each folder also carries `can_edit`. */
export function scopeCanEdit(scope: SkillsManagerProps["scope"]): boolean {
  return scope.kind === "personal" ? true : scope.canEdit;
}

export function SkillsManager({ scope, onOpenOfficialLibrary }: SkillsManagerProps) {
  const tt = useUI();
  const locale = useLocale();
  const toast = useToast();
  const projectId = scope.kind === "project" ? scope.projectId : undefined;
  const canEdit = scopeCanEdit(scope);
  const folders = useScopeFolders(projectId);
  const [filter, setFilter] = useState<ManagerFilter>(EMPTY_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [detail, setDetail] = useState<SkillDetailTarget | null>(null);
  const [sub, setSub] = useState<SubDialog>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  const sorted = useMemo(() => sortFolders(folders.items), [folders.items]);
  const visible = useMemo(() => filterFolders(sorted, filter), [sorted, filter]);
  const sources = useMemo(() => presentSources(folders.items), [folders.items]);
  const categories = useMemo(() => presentCategories(folders.items), [folders.items]);
  const filtering = filterIsActive(filter) || filter.query.trim().length > 0;

  // ── writes ──────────────────────────────────────────────────────────────

  const landed = (folder: Folder) => {
    folders.setItems((items) => upsertFolder(items, folder));
    notifyFoldersChanged();
  };

  const onToggle = async (folder: Folder, enabled: boolean) => {
    folders.setItems((items) => patchFolder(items, folder.id, (f) => withEnabled(f, enabled)));
    const result = await updateFolder(folder.id, { enabled });
    if (!result.ok) {
      folders.setItems((items) => patchFolder(items, folder.id, (f) => withEnabled(f, !enabled)));
      toast.error(tt("没能保存开关"), tt(result.error));
      return;
    }
    folders.setItems((items) => patchFolder(items, folder.id, () => result.data));
    notifyFoldersChanged();
  };

  const onDelete = async (folder: Folder) => {
    const before = folders.items;
    folders.setItems((items) => items.filter((item) => item.id !== folder.id));
    const result = await deleteFolder(folder.id);
    if (!result.ok) {
      folders.setItems(() => before);
      toast.error(tt("删除失败"), tt(result.error));
      return;
    }
    toast.success(tt("已删除"));
    notifyFoldersChanged();
  };

  const onDownload = async (folder: Folder) => {
    const name = folderSkillName(folder) || folder.title || "skill";
    const result = await downloadFromGateway(folderDownloadUrl(folder.id), `${name}.zip`);
    if (!result.ok) toast.error(tt("下载失败"), tt(result.error));
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    if (!isImportableArchive(file.name)) {
      toast.error(tt("只支持 .zip 或 .skill 文件"));
      return;
    }
    const pending = toast.loading(tt("正在导入…"), file.name);
    const result = await importFolderZip(file, projectId);
    if (!result.ok) {
      pending.error(tt("导入失败"), tt(result.error));
      return;
    }
    landed(result.data);
    pending.success(
      tt("已导入「{name}」", { name: folderDisplayTitle(result.data, locale) }),
      result.data.skill && !result.data.skill.enabled ? tt("来自上传的技能默认关闭，确认内容后再打开。") : undefined,
    );
  };

  const onGithub = async (url: string): Promise<string | null> => {
    const result = await importFolderFromGithub(url, projectId);
    if (!result.ok) return tt(result.error);
    landed(result.data);
    toast.success(
      tt("已导入「{name}」", { name: folderDisplayTitle(result.data, locale) }),
      tt("来自 GitHub 的技能默认关闭，确认内容后再打开。"),
    );
    return null;
  };

  const onCreate = async (input: { name: string; description: string; body: string }): Promise<string | null> => {
    const result = await createSkill({ ...input, projectId });
    if (!result.ok) return tt(result.error);
    landed(result.data);
    toast.success(tt("技能已创建"), `/${input.name}`);
    return null;
  };

  const onImportMine = async (chosen: Folder[]) => {
    if (!projectId) return;
    let ok = 0;
    let lastError = "";
    for (const folder of chosen) {
      const result = await copyFolderToProject(folder.id, projectId);
      if (result.ok) {
        ok += 1;
        folders.setItems((items) => upsertFolder(items, result.data));
      } else {
        lastError = result.error;
      }
    }
    if (ok > 0) notifyFoldersChanged();
    if (ok === chosen.length) toast.success(tt("已导入 {n} 个技能", { n: ok }));
    else toast.error(tt("有 {n} 个没能导入", { n: chosen.length - ok }), lastError ? tt(lastError) : undefined);
  };

  const onCopyToProject = async (folder: Folder, project: { id: string; name: string }): Promise<string | null> => {
    const result = await copyFolderToProject(folder.id, project.id);
    if (!result.ok) return tt(result.error);
    notifyFoldersChanged();
    toast.success(tt("已复制到「{name}」", { name: project.name }));
    return null;
  };

  const openLibrary = () => {
    if (onOpenOfficialLibrary) onOpenOfficialLibrary();
    else setLibraryOpen(true);
  };

  // ── menus ───────────────────────────────────────────────────────────────

  const addItems: AddMenuItem[] = [
    {
      id: "upload",
      icon: <IconUpload className="h-5 w-5" />,
      title: tt("从本地文件添加"),
      description: tt("上传 .zip 或 .skill"),
      onSelect: () => fileInputRef.current?.click(),
    },
    ...(scope.kind === "project"
      ? [
          {
            id: "mine",
            icon: <IconUserCircle className="h-5 w-5" />,
            title: tt("从我的技能导入"),
            description: tt("从你的个人技能复制到本项目"),
            onSelect: () => setSub({ kind: "mine" }),
          },
        ]
      : []),
    {
      id: "official",
      icon: <KitIconShield className="h-5 w-5" />,
      title: tt("从官方库添加"),
      description: tt("OceanLeo 维护的开源技能"),
      onSelect: openLibrary,
      separatorBefore: true,
    },
    {
      id: "github",
      icon: <IconGithub className="h-5 w-5" />,
      title: tt("从 GitHub 导入"),
      description: tt("粘贴公开仓库链接"),
      onSelect: () => setSub({ kind: "github" }),
    },
    {
      id: "create",
      icon: <IconPencil className="h-5 w-5" />,
      title: tt("自己写一个"),
      description: tt("填写名称、描述和正文"),
      onSelect: () => setSub({ kind: "create" }),
      separatorBefore: true,
    },
  ];

  const filterMenu = (
    <div onKeyDown={(event) => stopEscapeFromReachingShell(event, () => setFilterOpen(false))}>
      <button
        ref={filterButtonRef}
        type="button"
        aria-label={tt("筛选")}
        aria-haspopup="menu"
        aria-expanded={filterOpen}
        data-skills-filter-button=""
        onClick={() => setFilterOpen((value) => !value)}
        className={`${CONFIG_TOOLBAR_ICON_BUTTON_CLASS} relative`}
      >
        <KitIconFilter className="h-[18px] w-[18px]" />
        {filterIsActive(filter) ? (
          <span aria-hidden="true" className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-blue-600" />
        ) : null}
      </button>
      <FloatingMenu
        open={filterOpen}
        anchorRef={filterButtonRef}
        onClose={() => setFilterOpen(false)}
        align="start"
        width={260}
        zClassName={MENU_Z}
        ariaLabel={tt("筛选")}
        className="max-h-[60vh]"
      >
        <FloatingMenuItem
          label={tt("只看已启用")}
          selected={filter.enabledOnly}
          onSelect={() => setFilter((f) => ({ ...f, enabledOnly: !f.enabledOnly }))}
        />
        {sources.length > 0 ? (
          <>
            <FloatingMenuSeparator />
            <FloatingMenuLabel>{tt("来源")}</FloatingMenuLabel>
            {sources.map((source) => (
              <FloatingMenuItem
                key={source}
                label={tt(FOLDER_SOURCE_LABEL_ZH[source as FolderSource] ?? source)}
                selected={filter.sources.includes(source)}
                onSelect={() => setFilter((f) => ({ ...f, sources: toggleValue(f.sources, source) }))}
              />
            ))}
          </>
        ) : null}
        {categories.length > 0 ? (
          <>
            <FloatingMenuSeparator />
            <FloatingMenuLabel>{tt("分类")}</FloatingMenuLabel>
            {categories.map((category) => (
              <FloatingMenuItem
                key={category}
                label={tt(SKILL_CATEGORY_LABEL_ZH[category as SkillCategoryId] ?? category)}
                selected={filter.categories.includes(category)}
                onSelect={() => setFilter((f) => ({ ...f, categories: toggleValue(f.categories, category) }))}
              />
            ))}
          </>
        ) : null}
        {filterIsActive(filter) ? (
          <>
            <FloatingMenuSeparator />
            <FloatingMenuItem
              label={tt("清除筛选")}
              onSelect={() => setFilter((f) => ({ ...EMPTY_FILTER, query: f.query }))}
            />
          </>
        ) : null}
      </FloatingMenu>
    </div>
  );

  const moreMenu = (
    <div onKeyDown={(event) => stopEscapeFromReachingShell(event, () => setMoreOpen(false))}>
      <button
        ref={moreButtonRef}
        type="button"
        aria-label={tt("更多")}
        aria-haspopup="menu"
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen((value) => !value)}
        className={CONFIG_TOOLBAR_ICON_BUTTON_CLASS}
      >
        <KitIconMore className="h-[18px] w-[18px]" />
      </button>
      <FloatingMenu
        open={moreOpen}
        anchorRef={moreButtonRef}
        onClose={() => setMoreOpen(false)}
        width={240}
        zClassName={MENU_Z}
        ariaLabel={tt("更多")}
      >
        <FloatingMenuItem
          icon={<IconRefresh />}
          label={tt("刷新")}
          onSelect={() => {
            setMoreOpen(false);
            folders.reload();
          }}
        />
        <FloatingMenuItem
          icon={<KitIconShield />}
          label={tt("浏览官方技能库")}
          onSelect={() => {
            setMoreOpen(false);
            openLibrary();
          }}
        />
      </FloatingMenu>
    </div>
  );

  const addMenu = canEdit ? <AddMenu label={tt("添加")} items={addItems} variant="secondary" /> : null;

  // ── body ────────────────────────────────────────────────────────────────

  let body: ReactNode;
  if (folders.status === "loading") {
    body = (
      <div className={CONFIG_CARD_GRID_CLASS} aria-busy="true" data-skills-manager-loading="">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[168px] animate-pulse rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950" />
        ))}
      </div>
    );
  } else if (folders.status === "signed-out") {
    body = (
      <ConfigEmptyState
        icon={<KitIconPuzzle className="h-9 w-9" />}
        title={tt("登录后管理你的技能")}
        description={tt("登录后可以添加官方技能、导入或自己写技能。")}
      />
    );
  } else if (folders.status === "error") {
    body = (
      <ConfigEmptyState
        icon={<KitIconPuzzle className="h-9 w-9" />}
        title={tt("技能列表加载失败")}
        description={tt(folders.error)}
        action={
          <button type="button" onClick={folders.reload} className={`${CONFIG_TOOLBAR_ICON_BUTTON_CLASS} w-auto px-4`}>
            {tt("重试")}
          </button>
        }
      />
    );
  } else if (folders.items.length === 0) {
    body = (
      <ConfigEmptyState
        icon={<KitIconPuzzle className="h-9 w-9" />}
        title={tt("还没有技能")}
        description={
          canEdit
            ? tt("从官方库添加，或导入、自己写一个技能。")
            : tt("项目所有者或可编辑成员可以添加技能。")
        }
        action={canEdit ? <AddMenu label={tt("添加")} items={addItems} variant="primary" /> : undefined}
      />
    );
  } else if (visible.length === 0) {
    body = (
      <ConfigEmptyState
        icon={<KitIconPuzzle className="h-9 w-9" />}
        title={tt("没有匹配的技能")}
        description={tt("换个关键词，或清除筛选。")}
        action={
          filtering ? (
            <button
              type="button"
              onClick={() => setFilter(EMPTY_FILTER)}
              className={`${CONFIG_TOOLBAR_ICON_BUTTON_CLASS} w-auto px-4`}
            >
              {tt("清除筛选")}
            </button>
          ) : undefined
        }
      />
    );
  } else {
    body = (
      <div className={CONFIG_CARD_GRID_CLASS} data-skills-manager-grid="">
        {visible.map((folder) => (
          <SkillFolderCard
            key={folder.id}
            folder={folder}
            locale={locale}
            canEdit={canEdit && folder.can_edit !== false}
            personal={scope.kind === "personal"}
            onOpen={() => setDetail({ kind: "folder", id: folder.id })}
            onToggle={(next) => void onToggle(folder, next)}
            onDownload={() => void onDownload(folder)}
            onCopy={() => setSub({ kind: "copy", folder })}
            onDelete={() => setSub({ kind: "delete", folder })}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-5" data-testid="skills-manager" data-scope={scope.kind}>
      <ConfigToolbar
        filter={filterMenu}
        search={{
          value: filter.query,
          onChange: (value) => setFilter((f) => ({ ...f, query: value })),
          placeholder: tt("搜索技能"),
        }}
        primary={addMenu}
        more={moreMenu}
      />
      {body}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,.skill,application/zip"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        data-skills-file-input=""
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void onPickFile(file);
        }}
      />
      <OfficialSkillLibraryDialog
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        projectId={projectId}
        onAdded={landed}
      />
      {detail ? (
        <SkillDetailModal
          open
          onClose={() => setDetail(null)}
          skill={detail}
          projectId={projectId}
          onAdded={landed}
        />
      ) : null}
      <GithubImportDialog open={sub?.kind === "github"} onClose={() => setSub(null)} onSubmit={onGithub} />
      <CreateSkillDialog open={sub?.kind === "create"} onClose={() => setSub(null)} onSubmit={onCreate} />
      <ImportFromMineDialog
        open={sub?.kind === "mine"}
        onClose={() => setSub(null)}
        projectFolders={folders.items}
        onImport={onImportMine}
      />
      <CopyToProjectDialog
        open={sub?.kind === "copy"}
        onClose={() => setSub(null)}
        folderTitle={sub?.kind === "copy" ? folderDisplayTitle(sub.folder, locale) : ""}
        onCopy={(project) => (sub?.kind === "copy" ? onCopyToProject(sub.folder, project) : Promise.resolve(null))}
      />
      <DeleteFolderDialog
        open={sub?.kind === "delete"}
        onClose={() => setSub(null)}
        folderTitle={sub?.kind === "delete" ? folderDisplayTitle(sub.folder, locale) : ""}
        projectScope={scope.kind === "project"}
        onConfirm={() => {
          if (sub?.kind === "delete") void onDelete(sub.folder);
        }}
      />
    </div>
  );
}

// ── card ──────────────────────────────────────────────────────────────────

function SkillFolderCard({
  folder,
  locale,
  canEdit,
  personal,
  onOpen,
  onToggle,
  onDownload,
  onCopy,
  onDelete,
}: {
  folder: Folder;
  locale: string;
  canEdit: boolean;
  personal: boolean;
  onOpen: () => void;
  onToggle: (next: boolean) => void;
  onDownload: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const tt = useUI();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const title = folderDisplayTitle(folder, locale);
  const updated = formatUpdatedAt(folder.updated_at, locale);
  const enabled = Boolean(folder.skill?.enabled);
  const close = () => setMenuOpen(false);

  const menu = (
    <div onKeyDown={(event) => stopEscapeFromReachingShell(event, close)}>
      <button
        ref={menuButtonRef}
        type="button"
        aria-label={tt("更多操作")}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((value) => !value)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
      >
        <KitIconMore className="h-4 w-4" />
      </button>
      <FloatingMenu
        open={menuOpen}
        anchorRef={menuButtonRef}
        onClose={close}
        width={208}
        zClassName={MENU_Z}
        ariaLabel={tt("更多操作")}
      >
        <FloatingMenuItem
          icon={<IconEye />}
          label={tt("查看")}
          onSelect={() => {
            close();
            onOpen();
          }}
        />
        <FloatingMenuItem
          icon={<KitIconDownload />}
          label={tt("下载")}
          onSelect={() => {
            close();
            onDownload();
          }}
        />
        {personal ? (
          <FloatingMenuItem
            icon={<IconFolderPlus />}
            label={tt("复制到项目")}
            onSelect={() => {
              close();
              onCopy();
            }}
          />
        ) : null}
        {canEdit ? (
          <>
            <FloatingMenuSeparator />
            <FloatingMenuItem
              icon={<IconTrash />}
              label={tt("删除")}
              danger
              onSelect={() => {
                close();
                onDelete();
              }}
            />
          </>
        ) : null}
      </FloatingMenu>
    </div>
  );

  return (
    <div data-skill-card={folderSkillName(folder) || folder.id} data-source={folder.source} className="contents">
      <ConfigItemCard
        title={title}
        description={folderDescription(folder, locale) || undefined}
        toggle={
          canEdit && folder.skill
            ? { checked: enabled, onChange: onToggle, label: tt("启用「{name}」", { name: title }) }
            : undefined
        }
        badge={<SourceBadge folder={folder} />}
        meta={
          <>
            {updated ? tt("更新于 {time}", { time: updated }) : null}
            {!canEdit && folder.skill ? (
              <span className="ml-1.5">· {enabled ? tt("已启用") : tt("未启用")}</span>
            ) : null}
          </>
        }
        menu={menu}
        onOpen={onOpen}
      />
    </div>
  );
}
