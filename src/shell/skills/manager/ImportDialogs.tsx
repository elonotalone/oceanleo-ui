"use client";

// W09B — the manager's sub-flows: GitHub import, write a skill, import from my
// skills (project scope), copy to a project (personal scope), confirm delete.

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useLocale } from "next-intl";

import { useUI } from "../../../i18n/ui/useUI";
import {
  CONFIG_PRIMARY_BUTTON_CLASS,
  CONFIG_TOOLBAR_BUTTON_CLASS,
  KitIconSearch,
  type Folder,
} from "../kit";
import {
  folderDescription,
  folderDisplayTitle,
  folderMatchesQuery,
  folderSkillName,
  isSupportedGithubUrl,
  slugifySkillName,
  validateCreateSkill,
  type CreateSkillProblem,
} from "./logic";
import { ManagerDialog } from "./ManagerDialog";
import { listCopyTargetProjects, type CopyTargetProject } from "./projects-client";
import { useScopeFolders } from "./use-scope-folders";

export const MANAGER_INPUT_CLASS =
  "w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-[14px] text-neutral-900 outline-none transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] placeholder:text-neutral-400 focus:border-neutral-400 focus-visible:ring-2 focus-visible:ring-sky-100 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-500";

function Field({ label, hint, error, htmlFor, children }: { label: string; hint?: string; error?: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-neutral-800 dark:text-neutral-200">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-[12.5px] text-rose-600 dark:text-rose-400" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-neutral-500 dark:text-neutral-400">{hint}</p>
      ) : null}
    </div>
  );
}

function Spinner() {
  return <span className="v-spinner text-[10px]" aria-hidden="true" />;
}

// ── GitHub ────────────────────────────────────────────────────────────────

export function GithubImportDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  /** Resolves to an error message (already translated) or null on success. */
  onSubmit: (url: string) => Promise<string | null>;
}) {
  const tt = useUI();
  const inputId = useId();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setUrl("");
      setError("");
      setBusy(false);
    }
  }, [open]);

  const submit = async () => {
    if (!isSupportedGithubUrl(url)) {
      setError(tt("请粘贴 github.com 上公开仓库的地址"));
      return;
    }
    setBusy(true);
    const problem = await onSubmit(url.trim());
    setBusy(false);
    if (problem) setError(problem);
    else onClose();
  };

  return (
    <ManagerDialog
      open={open}
      onClose={onClose}
      testId="skills-github-dialog"
      title={tt("从 GitHub 导入")}
      description={tt("只支持公开仓库。可以是仓库地址、某个目录，或某个 SKILL.md 的地址。导入的技能默认关闭，确认内容后再启用。")}
      footer={
        <>
          <button type="button" className={CONFIG_TOOLBAR_BUTTON_CLASS} onClick={onClose}>
            {tt("取消")}
          </button>
          <button type="button" className={CONFIG_PRIMARY_BUTTON_CLASS} disabled={busy || !url.trim()} onClick={() => void submit()}>
            {busy ? <Spinner /> : null}
            {tt("导入")}
          </button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field label={tt("仓库链接")} htmlFor={inputId} error={error} hint={tt("例如 https://github.com/owner/repo/tree/main/skills/my-skill")}>
          <input
            id={inputId}
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            placeholder="https://github.com/…"
            onChange={(event) => {
              setUrl(event.target.value);
              setError("");
            }}
            className={MANAGER_INPUT_CLASS}
          />
        </Field>
      </form>
    </ManagerDialog>
  );
}

// ── Write a skill ─────────────────────────────────────────────────────────

const BODY_PLACEHOLDER_ZH = "# 技能名称\n\n## 什么时候用\n- …\n\n## 步骤\n1. …\n\n## 产出要求\n- …";

export function CreateSkillDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { name: string; description: string; body: string }) => Promise<string | null>;
}) {
  const tt = useUI();
  const nameId = useId();
  const descId = useId();
  const bodyId = useId();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [problem, setProblem] = useState<CreateSkillProblem>(null);
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setBody("");
      setProblem(null);
      setServerError("");
      setBusy(false);
    }
  }, [open]);

  const submit = async () => {
    const input = { name: name.trim(), description: description.trim(), body };
    const invalid = validateCreateSkill(input);
    setProblem(invalid);
    if (invalid) return;
    setBusy(true);
    const error = await onSubmit(input);
    setBusy(false);
    if (error) setServerError(error);
    else onClose();
  };

  return (
    <ManagerDialog
      open={open}
      onClose={onClose}
      testId="skills-create-dialog"
      title={tt("自己写一个技能")}
      description={tt("技能会保存为一个带 SKILL.md 的文件夹。任务开始时 agent 会看到名称和描述，需要时再读正文。")}
      footer={
        <>
          {serverError ? (
            <p className="mr-auto self-center text-[12.5px] text-rose-600 dark:text-rose-400" role="alert">
              {serverError}
            </p>
          ) : null}
          <button type="button" className={CONFIG_TOOLBAR_BUTTON_CLASS} onClick={onClose}>
            {tt("取消")}
          </button>
          <button type="button" className={CONFIG_PRIMARY_BUTTON_CLASS} disabled={busy} onClick={() => void submit()}>
            {busy ? <Spinner /> : null}
            {tt("创建技能")}
          </button>
        </>
      }
    >
      <Field
        label={tt("名称")}
        htmlFor={nameId}
        hint={tt("小写英文、数字和连字符，例如 weekly-report。输入框里打 /名称 即可点名使用。")}
        error={problem === "name" ? tt("名称只能用小写英文、数字和连字符，最长 64 个字符") : undefined}
      >
        <input
          id={nameId}
          value={name}
          autoComplete="off"
          spellCheck={false}
          placeholder="weekly-report"
          onChange={(event) => setName(event.target.value.toLowerCase().replace(/\s+/g, "-"))}
          onBlur={() => setName((value) => (value ? slugifySkillName(value) : value))}
          className={`${MANAGER_INPUT_CLASS} font-mono`}
        />
      </Field>
      <Field
        label={tt("描述")}
        htmlFor={descId}
        hint={tt("中文或英文都可以。写清楚做什么、什么时候该用，agent 靠它判断要不要读这个技能。")}
        error={problem === "description" ? tt("请填写描述（不超过 1024 个字符）") : undefined}
      >
        <textarea
          id={descId}
          rows={2}
          value={description}
          maxLength={1024}
          onChange={(event) => setDescription(event.target.value)}
          className={`${MANAGER_INPUT_CLASS} resize-y`}
        />
      </Field>
      <Field
        label={tt("正文（Markdown）")}
        htmlFor={bodyId}
        error={problem === "body" ? tt("请填写正文") : undefined}
      >
        <textarea
          id={bodyId}
          rows={10}
          value={body}
          placeholder={tt(BODY_PLACEHOLDER_ZH)}
          onChange={(event) => setBody(event.target.value)}
          className={`${MANAGER_INPUT_CLASS} resize-y font-mono text-[13px] leading-relaxed`}
        />
      </Field>
    </ManagerDialog>
  );
}

// ── Import from my skills (project scope) ─────────────────────────────────

export function ImportFromMineDialog({
  open,
  onClose,
  projectFolders,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  /** Already in the project — shown as "已在项目中". */
  projectFolders: readonly Folder[];
  onImport: (folders: Folder[]) => Promise<void>;
}) {
  const tt = useUI();
  const locale = useLocale();
  const mine = useScopeFolders(undefined, open);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setQuery("");
      setPicked(new Set());
      setBusy(false);
    }
  }, [open]);

  const inProject = useMemo(
    () => new Set(projectFolders.map((folder) => folderSkillName(folder)).filter(Boolean)),
    [projectFolders],
  );
  const rows = useMemo(
    () => mine.items.filter((folder) => folderMatchesQuery(folder, query)),
    [mine.items, query],
  );

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    const chosen = mine.items.filter((folder) => picked.has(folder.id));
    if (!chosen.length) return;
    setBusy(true);
    await onImport(chosen);
    setBusy(false);
    onClose();
  };

  return (
    <ManagerDialog
      open={open}
      onClose={onClose}
      testId="skills-import-mine-dialog"
      title={tt("从我的技能导入")}
      description={tt("会复制一份到本项目，项目成员都能用；之后改你自己的那份不会影响项目里的副本。")}
      footer={
        <>
          <button type="button" className={CONFIG_TOOLBAR_BUTTON_CLASS} onClick={onClose}>
            {tt("取消")}
          </button>
          <button
            type="button"
            className={CONFIG_PRIMARY_BUTTON_CLASS}
            disabled={busy || picked.size === 0}
            onClick={() => void submit()}
          >
            {busy ? <Spinner /> : null}
            {picked.size > 0 ? tt("导入 {n} 个", { n: picked.size }) : tt("导入")}
          </button>
        </>
      }
    >
      <div className="relative mb-3">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-neutral-400">
          <KitIconSearch className="h-4 w-4" />
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={tt("搜索技能")}
          aria-label={tt("搜索技能")}
          className={`${MANAGER_INPUT_CLASS} pl-9`}
        />
      </div>
      {mine.status === "loading" ? (
        <p className="py-8 text-center text-[13px] text-neutral-500">{tt("加载中…")}</p>
      ) : mine.status === "signed-out" ? (
        <p className="py-8 text-center text-[13px] text-neutral-500">{tt("请先登录")}</p>
      ) : mine.status === "error" ? (
        <p className="py-8 text-center text-[13px] text-rose-600">{tt(mine.error)}</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-neutral-500">
          {mine.items.length === 0 ? tt("你还没有自己的技能") : tt("没有匹配的技能")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5 pb-2" role="list">
          {rows.map((folder) => {
            const already = inProject.has(folderSkillName(folder));
            const checked = picked.has(folder.id);
            return (
              <li key={folder.id}>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
                    already
                      ? "cursor-not-allowed border-neutral-100 bg-neutral-50 opacity-60 dark:border-neutral-800 dark:bg-neutral-900"
                      : checked
                        ? "border-neutral-900 bg-neutral-50 dark:border-neutral-200 dark:bg-neutral-800"
                        : "border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/60"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 accent-neutral-900"
                    checked={checked}
                    disabled={already}
                    onChange={() => toggle(folder.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-medium">{folderDisplayTitle(folder, locale)}</span>
                      {already ? (
                        <span className="shrink-0 text-[12px] text-neutral-500">{tt("已在项目中")}</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 line-clamp-1 block text-[12.5px] text-neutral-500 dark:text-neutral-400">
                      {folderDescription(folder, locale)}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </ManagerDialog>
  );
}

// ── Copy to a project (personal scope) ────────────────────────────────────

export function CopyToProjectDialog({
  open,
  onClose,
  folderTitle,
  onCopy,
}: {
  open: boolean;
  onClose: () => void;
  folderTitle: string;
  onCopy: (project: CopyTargetProject) => Promise<string | null>;
}) {
  const tt = useUI();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [projects, setProjects] = useState<CopyTargetProject[]>([]);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setStatus("loading");
    setError("");
    setBusyId("");
    void listCopyTargetProjects().then((result) => {
      if (!alive) return;
      if (result.ok) {
        setProjects(result.data);
        setStatus("ready");
      } else {
        setStatus("error");
      }
    });
    return () => {
      alive = false;
    };
  }, [open]);

  const pick = async (project: CopyTargetProject) => {
    setBusyId(project.id);
    setError("");
    const problem = await onCopy(project);
    setBusyId("");
    if (problem) setError(problem);
    else onClose();
  };

  return (
    <ManagerDialog
      open={open}
      onClose={onClose}
      testId="skills-copy-project-dialog"
      title={tt("复制到项目")}
      description={tt("把「{name}」复制一份到项目里，项目成员都能使用。", { name: folderTitle })}
    >
      {error ? (
        <p className="mb-3 text-[12.5px] text-rose-600 dark:text-rose-400" role="alert">
          {error}
        </p>
      ) : null}
      {status === "loading" ? (
        <p className="py-8 text-center text-[13px] text-neutral-500">{tt("加载中…")}</p>
      ) : status === "error" ? (
        <p className="py-8 text-center text-[13px] text-rose-600">{tt("项目列表加载失败")}</p>
      ) : projects.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-neutral-500">{tt("没有可以编辑的项目")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5 pb-4" role="list">
          {projects.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => void pick(project)}
                className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 px-3.5 py-3 text-left transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:opacity-60 dark:border-neutral-800 dark:hover:bg-neutral-800/60"
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-[15px] dark:bg-neutral-800"
                >
                  {project.icon && Array.from(project.icon).length <= 2 ? project.icon : Array.from(project.name)[0] || "P"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{project.name}</span>
                {busyId === project.id ? <Spinner /> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </ManagerDialog>
  );
}

// ── Delete ────────────────────────────────────────────────────────────────

export function DeleteFolderDialog({
  open,
  onClose,
  folderTitle,
  projectScope,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  folderTitle: string;
  projectScope: boolean;
  onConfirm: () => void;
}) {
  const tt = useUI();
  return (
    <ManagerDialog
      open={open}
      onClose={onClose}
      size="sm"
      testId="skills-delete-dialog"
      title={tt("删除「{name}」？", { name: folderTitle })}
      description={
        projectScope
          ? tt("删除后项目里的新任务不会再用到这个技能。")
          : tt("删除后你的新任务不会再用到这个技能。官方技能可以随时从官方库重新添加。")
      }
      footer={
        <>
          <button type="button" className={CONFIG_TOOLBAR_BUTTON_CLASS} onClick={onClose}>
            {tt("取消")}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 text-[14px] font-medium text-white transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-rose-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
          >
            {tt("删除")}
          </button>
        </>
      }
    />
  );
}

