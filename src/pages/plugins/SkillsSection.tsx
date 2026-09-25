"use client";

import { useEffect, useRef, useState } from "react";

import { currentDomainProfile } from "../../contracts/domain-family";
import { useUI } from "../../i18n/ui/useUI";
import { Switch, useToast } from "../../ui";
import { InTreeDialog } from "./parts";
import { PuzzleIcon } from "../../shell/icons/PuzzleIcon";
import {
  OFFICIAL_SKILLS,
  SKILLS_NOT_CONFIGURED,
  SKILLS_SIGNED_OUT,
  addSkill,
  deleteSkill,
  firstUserPrompt,
  listRecentTasks,
  listSkills,
  setSkillEnabled,
  type RecentTask,
  type Skill,
} from "./skills-api";

/** 只有门户首页在打开时读这个键、把内容回填进输入框；子站首页不读。 */
export const COMPOSER_PROMPT_KEY = "oceanleo_composer_prompt";

function isPortalOrigin(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.origin === currentDomainProfile().portalOrigin;
}

export function SkillsSection({ search }: { search: string }) {
  const tt = useUI();
  const toast = useToast();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addMode, setAddMode] = useState<null | "upload" | "official" | "build">(null);
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillContent, setNewSkillContent] = useState("");
  const [pastTasks, setPastTasks] = useState<RecentTask[]>([]);
  const [deletingSkillId, setDeletingSkillId] = useState<string | null>(null);
  const [busySkillId, setBusySkillId] = useState("");
  const [onPortal, setOnPortal] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setOnPortal(isPortalOrigin());
    void listSkills().then((rows) => {
      if (alive) setSkills(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!addMenuOpen) return;
    function onDown(e: MouseEvent) {
      if (!addMenuRef.current?.contains(e.target as Node)) setAddMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [addMenuOpen]);

  async function reloadSkills() {
    setSkills(await listSkills());
  }

  function reason(err: string): string {
    if (err === SKILLS_NOT_CONFIGURED) return tt("未配置 Supabase");
    if (err === SKILLS_SIGNED_OUT) return tt("请先登录");
    return err;
  }

  async function insertSkill(name: string, content: string): Promise<string | null> {
    const err = await addSkill(name, content);
    if (err) return reason(err);
    await reloadSkills();
    return null;
  }

  async function handleUploadSave() {
    if (!newSkillName.trim() || !newSkillContent.trim()) return;
    const err = await insertSkill(newSkillName, newSkillContent);
    if (err) {
      toast.error(tt("保存失败：") + err);
      return;
    }
    setAddMode(null);
    setNewSkillName("");
    setNewSkillContent("");
  }

  async function handleAddOfficial(s: { name: string; content: string }) {
    const err = await insertSkill(s.name, s.content);
    if (err) toast.error(tt("添加失败：") + err);
    else toast.success(tt("技能已添加"));
  }

  async function openBuild() {
    setAddMode("build");
    setAddMenuOpen(false);
    setPastTasks(await listRecentTasks());
  }

  async function handleBuildFromTask(task: RecentTask) {
    const title = task.title || tt("无标题");
    const prompt = (await firstUserPrompt(task.id)) || title;
    const err = await insertSkill(`基于「${title}」`, prompt);
    if (err) {
      toast.error(tt("创建失败：") + err);
      return;
    }
    setAddMode(null);
  }

  async function handleUseSkill(skill: Skill) {
    if (isPortalOrigin()) {
      window.sessionStorage.setItem(COMPOSER_PROMPT_KEY, skill.content);
      window.location.assign("/");
      return;
    }
    try {
      await navigator.clipboard.writeText(skill.content);
      toast.success(tt("已复制技能内容，粘贴到输入框即可使用"));
    } catch {
      toast.error(tt("复制失败"));
    }
  }

  async function handleToggle(skill: Skill) {
    setBusySkillId(skill.id);
    const err = await setSkillEnabled(skill.id, !skill.enabled);
    setBusySkillId("");
    if (err) {
      toast.error(tt("操作失败"), reason(err));
      return;
    }
    await reloadSkills();
  }

  async function handleDelete(id: string) {
    setDeletingSkillId(null);
    const err = await deleteSkill(id);
    if (err) toast.error(tt("删除失败：") + reason(err));
    else toast.success(tt("技能已删除"));
    await reloadSkills();
  }

  const term = search.trim().toLowerCase();
  const filteredSkills = skills.filter((s) => (s.name || "").toLowerCase().includes(term));

  return (
    <section data-plugins-skills className="mt-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-neutral-900">{tt("技能")}</h2>
        <div ref={addMenuRef} className="relative">
          <button
            type="button"
            data-skill-add-menu
            aria-expanded={addMenuOpen}
            onClick={() => setAddMenuOpen((v) => !v)}
            className="flex items-center gap-1 rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-neutral-800"
          >
            {tt("+ 添加技能")}
          </button>
          {addMenuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={() => void openBuild()}
                className="block w-full px-3 py-2 text-left text-[13px] text-neutral-700 hover:bg-neutral-50"
              >
                {tt("从过往任务创建")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddMode("upload");
                  setAddMenuOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-[13px] text-neutral-700 hover:bg-neutral-50"
              >
                {tt("上传 / 粘贴")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddMode("official");
                  setAddMenuOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-[13px] text-neutral-700 hover:bg-neutral-50"
              >
                {tt("从官方库添加")}
              </button>
            </div>
          )}
        </div>
      </div>
      <p className="mb-4 mt-0.5 text-[12px] text-neutral-500">
        {onPortal
          ? tt("技能是可复用的提示模板。点击「使用」会将内容填入新任务的输入框。")
          : tt("技能是可复用的提示模板。点击「使用」会复制内容，粘贴到任意输入框即可。")}
      </p>

      {filteredSkills.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center">
          <p className="text-[13px] text-neutral-500">{term ? tt("没有匹配的技能") : tt("还没有技能")}</p>
          <button
            type="button"
            onClick={() => setAddMode("official")}
            className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-neutral-800"
          >
            {tt("从官方库添加")}
          </button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filteredSkills.map((skill) => (
            <div
              key={skill.id}
              data-skill-row={skill.id}
              className="relative rounded-xl border border-neutral-200 p-4"
            >
              <div className="absolute right-3 top-3 flex items-center gap-1.5">
                {skill.enabled && (
                  <button
                    type="button"
                    data-skill-use
                    onClick={() => void handleUseSkill(skill)}
                    className="rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-neutral-800"
                  >
                    {tt("使用")}
                  </button>
                )}
                <Switch
                  checked={skill.enabled}
                  disabled={busySkillId === skill.id}
                  onChange={() => void handleToggle(skill)}
                  label={skill.enabled ? tt("已启用") : tt("已停用")}
                />
                <button
                  type="button"
                  onClick={() => setDeletingSkillId(skill.id)}
                  className="rounded-md px-2 py-1 text-[11px] text-neutral-400 hover:bg-neutral-100 hover:text-red-600"
                >
                  {tt("删除")}
                </button>
              </div>
              <div className={`flex gap-3 ${skill.enabled ? "" : "opacity-60"}`}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
                  <PuzzleIcon className="h-4 w-4 text-neutral-500" />
                </div>
                <div className="min-w-0 pr-36">
                  <p className="text-[13px] font-medium text-neutral-900">
                    {skill.name}
                    {!skill.enabled && (
                      <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
                        {tt("已停用")}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-neutral-500">{skill.content}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {deletingSkillId && (
        <InTreeDialog onClose={() => setDeletingSkillId(null)} testId="skill-delete">
          <h3 className="text-[15px] font-semibold text-neutral-900">{tt("删除技能")}</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-neutral-500">
            {tt("删除后将无法在新任务中使用该技能。")}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeletingSkillId(null)}
              className="rounded-lg border border-neutral-200 px-3.5 py-1.5 text-[13px] text-neutral-700 hover:bg-neutral-50"
            >
              {tt("取消")}
            </button>
            <button
              type="button"
              onClick={() => void handleDelete(deletingSkillId)}
              className="rounded-lg bg-red-600 px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-red-700"
            >
              {tt("删除")}
            </button>
          </div>
        </InTreeDialog>
      )}

      {addMode === "upload" && (
        <InTreeDialog onClose={() => setAddMode(null)} testId="skill-upload">
          <div data-skill-upload-dialog>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-neutral-900">{tt("上传技能")}</h3>
              <button
                type="button"
                aria-label={tt("关闭")}
                onClick={() => setAddMode(null)}
                className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">{tt("技能名称")}</label>
                <input
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[14px] outline-none focus:border-sky-500"
                  placeholder={tt("例如：代码审查流程")}
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">{tt("提示模板内容")}</label>
                <textarea
                  className="h-36 w-full resize-none rounded-lg border border-neutral-200 px-3 py-2 text-[14px] outline-none focus:border-sky-500"
                  placeholder={tt("粘贴或输入技能的提示模板...")}
                  value={newSkillContent}
                  onChange={(e) => setNewSkillContent(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleUploadSave()}
                  className="rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-neutral-800"
                >
                  {tt("保存")}
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode(null)}
                  className="rounded-lg border border-neutral-200 px-4 py-2 text-[13px] text-neutral-700 hover:bg-neutral-50"
                >
                  {tt("取消")}
                </button>
              </div>
            </div>
          </div>
        </InTreeDialog>
      )}

      {addMode === "official" && (
        <InTreeDialog onClose={() => setAddMode(null)} testId="skill-official">
          <div data-skill-official-dialog>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-neutral-900">{tt("官方技能库")}</h3>
              <button
                type="button"
                aria-label={tt("关闭")}
                onClick={() => setAddMode(null)}
                className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2">
              {OFFICIAL_SKILLS.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2.5"
                >
                  <div className="min-w-0 pr-3">
                    <p className="text-[13px] font-medium text-neutral-900">{s.name}</p>
                    <p className="line-clamp-1 text-[12px] text-neutral-500">{s.content}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleAddOfficial(s)}
                    className="shrink-0 rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-neutral-800"
                  >
                    {tt("添加")}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </InTreeDialog>
      )}

      {addMode === "build" && (
        <InTreeDialog onClose={() => setAddMode(null)} testId="skill-build">
          <div data-skill-build-dialog>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-neutral-900">{tt("从过往任务创建技能")}</h3>
              <button
                type="button"
                aria-label={tt("关闭")}
                onClick={() => setAddMode(null)}
                className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              >
                ✕
              </button>
            </div>
            {pastTasks.length === 0 ? (
              <p className="text-[13px] text-neutral-500">{tt("还没有可用的任务。")}</p>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {pastTasks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => void handleBuildFromTask(t)}
                    className="block w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-left text-[13px] text-neutral-800 hover:bg-neutral-50"
                  >
                    {t.title || tt("无标题")}
                  </button>
                ))}
              </div>
            )}
          </div>
        </InTreeDialog>
      )}
    </section>
  );
}
