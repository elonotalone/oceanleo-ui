"use client";

import { useEffect, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { artifactProjectionToLibraryItem } from "../library-data";
import { forkArtifact } from "../artifact-client";
import { ensureOwnGameCopy, gameEditAccess, GAME_FORK_ON_SAVE_NOTICE } from "./game-edit-access";
import { gameProjectApi, type GameProjectApi, type GameProjectJob } from "./game-project-api";
import { gamePlayUrl, isGameTextFile, type GameProject } from "./game-project";

const phases: Record<GameProjectJob["phase"], string> = {
  plan: "规划游戏", art: "制作美术", audio: "制作声音", code: "编写游戏", check: "检查游戏",
  moderation: "审核内容", done: "已完成", failed: "生成失败",
};

/** The key cancels old reads/jobs when the host opens another revision. */
export function GameProjectEditor(props: AdvancedContentWorkbenchProps) {
  return <GameProjectEditorSession key={`${props.item.artifactId || props.item.id}:${props.item.revisionId || ""}`} {...props} />;
}

export function GameProjectEditorSession({ item, taskId, siteId = "", accent = "#1F6FEB", onClose, onSavedItem,
  api = gameProjectApi,
}: AdvancedContentWorkbenchProps & { api?: GameProjectApi }) {
  const tt = useUI();
  const [head, setHead] = useState(item);
  const headRef = useRef(item);
  const [project, setProject] = useState<GameProject | null>(null);
  const [selected, setSelected] = useState("");
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [playError, setPlayError] = useState("");
  const [playUrl, setPlayUrl] = useState("");
  const [orientation, setOrientation] = useState("both");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<GameProjectJob | null>(null);
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState("");
  const lifetime = useRef<AbortController | null>(null);
  const operation = useRef(false);
  const dirty = Object.keys(edits).length > 0;
  const readOnly = !project || project.readOnly || gameEditAccess(head) === "view-only";
  const id = head.artifactId || "";

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setError(""); setProject(null); setPlayUrl(""); setPlayError(""); setTexts({}); setEdits({});
    if (!id) { setError("这个游戏没有可读取的作品编号。"); return () => controller.abort(); }
    void api.load(id, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      if (value.loadedRevisionId) headRef.current = { ...headRef.current, revisionId: value.loadedRevisionId };
      setProject(value); setSelected(value.entrypoint);
      setTexts(Object.fromEntries(value.files.filter(file => file.content !== undefined).map(file => [file.path, file.content!])));
    }).catch(reason => { if (!controller.signal.aborted) setError(String(reason.message || reason)); });
    void api.play(id, controller.signal).then(value => {
      if (!controller.signal.aborted) { setPlayUrl(gamePlayUrl(value.url)); setOrientation(value.orientation); }
    }).catch(reason => { if (!controller.signal.aborted) setPlayError(String(reason.message || reason)); });
    return () => controller.abort();
  }, [api, id, retry]);
  const file = project?.files.find(entry => entry.path === selected);
  const textFile = file && isGameTextFile(file);
  useEffect(() => {
    if (!file || !textFile || texts[file.path] !== undefined) return;
    const controller = new AbortController();
    void api.file(id, file.path, controller.signal).then(content => {
      if (!controller.signal.aborted) setTexts(current => ({ ...current, [file.path]: content }));
    }).catch(reason => { if (!controller.signal.aborted) setError(String(reason.message || reason)); });
    return () => controller.abort();
  }, [api, id, file, textFile, texts]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function ownCopy() {
    const result = await ensureOwnGameCopy(headRef.current, forkArtifact);
    if (!result.ok) throw new Error(result.error);
    // Keep the copy even if saving fails, so retry cannot make duplicate forks.
    headRef.current = result.item;
    return result.item;
  }
  async function save() {
    if (!project || readOnly || !dirty || operation.current) return;
    operation.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const own = await ownCopy();
      const artifact = await api.save(own.artifactId || "", own.revisionId || "", project, edits, lifetime.current?.signal);
      if (lifetime.current?.signal.aborted) return;
      const saved = artifactProjectionToLibraryItem(artifact);
      headRef.current = saved; setHead(saved); setEdits({}); setRetry(value => value + 1);
      setNotice("已保存，预览已更新；封面仍为上一版。"); onSavedItem?.(saved);
    } catch (reason) { if (!lifetime.current?.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { operation.current = false; if (!lifetime.current?.signal.aborted) setBusy(false); }
  }
  async function iterate() {
    if (readOnly || dirty || !prompt.trim() || operation.current) return;
    operation.current = true; setBusy(true); setError(""); setNotice("");
    const signal = lifetime.current?.signal;
    try {
      const own = await ownCopy();
      const jobId = await api.iterate(own.artifactId || "", own.revisionId || "", prompt.trim(), signal);
      while (!signal?.aborted) {
        const state = await api.job(jobId, signal);
        if (signal?.aborted) return;
        setJob(state);
        if (state.phase === "failed") throw new Error(state.message || "游戏生成失败。");
        if (state.phase === "done") {
          if (state.artifactId && state.artifactId !== own.artifactId) throw new Error("游戏任务返回了不匹配的作品。");
          const updated = await api.current(own.artifactId || "", signal);
          if (signal?.aborted) return;
          headRef.current = updated; setHead(updated); setRetry(value => value + 1); setNotice("游戏已更新。");
          onSavedItem?.(updated);
          break;
        }
        await new Promise<void>(resolve => {
          const finish = () => { clearTimeout(timer); signal?.removeEventListener("abort", finish); resolve(); };
          const timer = setTimeout(finish, 1500);
          signal?.addEventListener("abort", finish, { once: true });
        });
      }
    } catch (reason) { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { operation.current = false; if (!signal?.aborted) setBusy(false); }
  }
  const stage = <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3">
    {error && <div role="alert">{tt(error)} <button type="button" disabled={busy || dirty} onClick={() => setRetry(value => value + 1)}>{tt("重试")}</button></div>}
    {!project && !error && <p role="status">{tt("正在读取游戏工程…")}</p>}
    {project && <>
      {project.readOnly && <p>{tt("旧版游戏仅供查看和试玩，不能修改。")}</p>}
      {gameEditAccess(head) === "view-only" && <p>{tt("这个游戏只开放了试玩，不能修改，也不能创建副本。")}</p>}
      {gameEditAccess(head) === "fork" && !project.readOnly && <p>{tt(GAME_FORK_ON_SAVE_NOTICE)}</p>}
      <div className="flex flex-wrap gap-3">
        <label>{tt("文件")} <select aria-label={tt("游戏文件")} value={selected} onChange={event => { setSelected(event.target.value); setError(""); }}>
          {project.files.map(entry => <option key={entry.path} value={entry.path}>{entry.path}</option>)}
        </select></label>
        <button type="button" disabled={readOnly || busy || !dirty} onClick={() => void save()}>{tt(busy ? "处理中…" : "保存文件")}</button>
        {dirty && <span>{tt("有未保存的修改，预览显示已保存版本。")}</span>}
      </div>
      {textFile ? <textarea aria-label={selected} spellCheck={false} rows={14}
        className="w-full resize-y font-mono text-sm" readOnly={readOnly || busy || texts[selected] === undefined}
        value={edits[selected] ?? texts[selected] ?? ""}
        onChange={event => { const value = event.target.value; setEdits(current => {
          const next = { ...current }; if (value === texts[selected]) delete next[selected]; else next[selected] = value; return next;
        }); }} /> : <p>{tt("此文件为游戏素材，保留原文件。")}</p>}
      {!readOnly && <div className="flex flex-col gap-2">
        <label htmlFor="game-project-prompt">{tt("描述这一轮想要的玩法改动")}</label>
        <textarea id="game-project-prompt" rows={3} value={prompt} disabled={busy} onChange={event => setPrompt(event.target.value)} />
        <button type="button" disabled={busy || dirty || !prompt.trim()} onClick={() => void iterate()}>{tt("迭代这一版")}</button>
      </div>}
    </>}
    {job && <div role="status">{tt(phases[job.phase])} {job.progress}% {job.message}<progress max={100} value={job.progress} /></div>}
    {notice && <p role="status">{tt(notice)}</p>}
    {playError && <p role="alert">{tt(playError)}</p>}
    {playUrl && <iframe key={playUrl + retry} title={tt("游戏试玩")} src={playUrl} referrerPolicy="no-referrer"
      style={{ aspectRatio: orientation === "portrait" ? "9 / 16" : "16 / 9", maxWidth: orientation === "portrait" ? "26rem" : "100%", alignSelf: "center" }}
      className="min-h-96 w-full flex-1 border-0" sandbox="allow-scripts allow-pointer-lock" allow="fullscreen; gamepad" />}
  </div>;
  return <AdvancedWorkbenchShell item={head} taskId={taskId} siteId={siteId} accent={accent}
    onClose={() => { if (!dirty || window.confirm(tt("修改尚未保存，仍要关闭吗？"))) onClose(); }}
    adapter={{ id: "game", label: tt("游戏"), pages: { activePageId: "artifact", aux: [] }, stage }} />;
}
