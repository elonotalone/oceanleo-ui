"use client";

// ============================================================================
// @oceanleo/ui — agent 工作界面 AgentChat（单一事实源）
// ----------------------------------------------------------------------------
// 首页输入框提交后进入的「agent」界面（聊天为主）。形态（操作员 2026-06-19）：
//   - 普通对话：单栏聊天流（不分屏）。
//   - 高级任务（产出地图/画布/小说/PPT/表格/文档等「格式化可编辑结果」）：
//     一分为二 —— 左栏 = AI 推导（消息流）、右栏 = 结果（可编辑）。
//   - 该次工作 = 一条 agent_task，自动进历史记录。
// 真实后端：createTask → 轮询 getTask → 渲染 messages + 取最新 artifact。
//
// 与「工作台」的区别：AgentChat 左栏以对话为主；工作台左栏以固定模板操控为主。
// 两者共用 SplitWorkspace 分栏骨架（可拖 + 大屏）。
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { SplitWorkspace, type SplitLibraryConfig } from "./SplitWorkspace";
import { Markdown } from "./Markdown";
import { LeoComposer } from "./LeoComposer";
import {
  createTask,
  followUp,
  getTask,
  latestArtifact,
  type AgentAttachment,
  type AgentMessage,
  type ArtifactMeta,
} from "../lib/agent";
import { useAttachments } from "./useAttachments";
import { useUI, type UITranslate } from "../i18n/ui/useUI";

function artifactLabels(tt: UITranslate): Record<string, string> {
  return {
    map: tt("地图"),
    canvas: tt("画布"),
    novel: tt("小说"),
    ppt: tt("演示文稿"),
    sheet: tt("表格"),
    doc: tt("文档"),
    markdown: tt("结果文档"),
    image: tt("图片"),
  };
}

export interface AgentChatProps {
  /** 站点 id（驱动 per-site 工具 md + 计量）。 */
  siteId?: string;
  /** 初次提交的内容（从首页输入框带进来）；传了会自动创建任务。 */
  initialPrompt?: string;
  /** 已有会话 id（从历史记录点进来回看）；与 initialPrompt 二选一。 */
  taskId?: string;
  /** 模式：agent（默认，带规划循环 + artifact）| chat（纯对话）。 */
  mode?: "agent" | "chat";
  /** 绑定单个 agent（专家）。format "<site_id>.<fn_id>"，如 "agent.senior-engineer"。 */
  agentId?: string;
  /** 绑定一个「专家团」(agent.oceanleo.com)。format "team.<slug>"。 */
  teamId?: string;
  /** 选中的文本模型复合 key（来自 ModelPicker），透传给引擎。 */
  agentModel?: string;
  accent?: string;
  headerHeight?: number;
  /** 任务创建后回调（如把 id 写进 URL / 历史高亮）。 */
  onTaskCreated?: (taskId: string) => void;
  /**
   * site_id → app 展示名（doctrine v7：历史回看 / agent 界面要显示「所属 app」）。
   * 回看历史时本组件从 task.site_id 解析出 app 名，显示在左栏标题旁。 */
  appNames?: Record<string, string>;
  /** 直接指定「所属 app」展示名（覆盖 appNames 解析）。 */
  appLabel?: string;
  /** 右栏自定义渲染器：按 artifact.type 返回专用编辑器（map/canvas/ppt…）。
   *  不传或返回 null → 回退到内置 Markdown / 图片渲染。 */
  renderArtifact?: (artifact: ArtifactMeta, content: string) => React.ReactNode;
  /**
   * 操作员 2026-07-01：内建「库」开关（透传给 SplitWorkspace）。给了它，agent 界面
   * 左栏标题右侧出现「库」按钮（默认关）；点开 → 右栏显示共享文件库，agent 生成的
   * 作品可在「作品」分区查看。不传则默认按 siteId 自动启用（见下方 effectiveLibrary）。
   *   - 传对象 → 用它。
   *   - 传 false → 关闭库按钮。 */
  library?: SplitLibraryConfig | false;
  /**
   * 输入框上方的自定义内容（如 agent 站的「skill prompt 开源面板」）。渲染在 composer
   * 之上、对话流之下。用于把 agent 站的 prompt 面板并入共享 AgentChat（复用同一壳层，
   * 获得右栏 artifact + 库，无需自写 chat）。 */
  composerHeader?: React.ReactNode;
  /**
   * doctrine v6：本次会话的 skill-prompt 覆盖（用户编辑了 prompt 并选「用这段直接干活」）。
   * 只对本次会话生效，透传给 createTask，不写回 manifest。 */
  promptOverride?: string;
  /** 输入框占位文案（默认「继续追问，或上传文件让 agent 分析…」）。 */
  placeholder?: string;
  /** 空态提示（还没消息且未运行时显示，默认「在下方输入，开始与 agent 对话。」）。 */
  emptyHint?: React.ReactNode;
}

export function AgentChat({
  siteId = "",
  initialPrompt,
  taskId: initialTaskId,
  mode = "agent",
  agentId = "",
  teamId = "",
  agentModel = "",
  accent = "#4f46e5",
  headerHeight = 56,
  onTaskCreated,
  renderArtifact,
  appNames,
  appLabel: appLabelProp,
  library,
  composerHeader,
  promptOverride,
  placeholder,
  emptyHint,
}: AgentChatProps) {
  const tt = useUI();
  const ARTIFACT_LABEL = artifactLabels(tt);
  // 「库」= 右版面（结果/预览）显隐开关。默认关（对话占满）；生成结果(artifact)到达时
  // 自动打开右版面显示，用户也可用「库」按钮手动开合。显式 false 关闭库按钮。
  const [rightOpen, setRightOpen] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(initialTaskId ?? null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [status, setStatus] = useState<string>("");
  // 「所属 app」展示名：优先 appLabel prop，其次从 task.site_id 解析。
  const [taskSiteId, setTaskSiteId] = useState<string>("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atts = useAttachments(siteId, setError);

  const handleVoiceTranscript = useCallback((text: string) => {
    setInput((v) => (v ? v + " " : "") + text);
  }, []);

  // auto-create the task on first mount when an initialPrompt is given.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (initialTaskId) {
      void refresh(initialTaskId);
      return;
    }
    if (initialPrompt && initialPrompt.trim()) {
      void start(initialPrompt.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async (id: string) => {
    const r = await getTask(id);
    if (r.ok && r.data) {
      setMessages(r.data.messages || []);
      setStatus(r.data.task?.status || "");
      if (r.data.task?.site_id) setTaskSiteId(r.data.task.site_id);
      return r.data.task?.status || "";
    }
    return "";
  }, []);

  // poll while running
  useEffect(() => {
    if (!taskId) return;
    if (status && status !== "running") return;
    const t = setInterval(async () => {
      const s = await refresh(taskId);
      if (s && s !== "running") clearInterval(t);
    }, 1500);
    return () => clearInterval(t);
  }, [taskId, status, refresh]);

  // keep the reasoning stream scrolled to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function start(prompt: string, uploaded?: AgentAttachment[]) {
    setBusy(true);
    setError(null);
    setMessages([
      { id: -1, role: "user", kind: "text", content: prompt,
        meta: uploaded && uploaded.length ? { attachments: uploaded } : undefined },
    ]);
    const r = await createTask({
      prompt, mode, siteId, agentModel, agentId, teamId, attachments: uploaded,
      promptOverride: promptOverride || undefined,
    });
    setBusy(false);
    if (!r.ok || !r.data) {
      setError(r.status === 401 ? tt("登录后即可使用 app。") : r.error || tt("创建任务失败"));
      return;
    }
    setTaskId(r.data.task_id);
    setStatus("running");
    onTaskCreated?.(r.data.task_id);
    void refresh(r.data.task_id);
  }

  async function send() {
    const prompt = input.trim();
    // Allow send when there's an attachment even if the text is empty. But block
    // while any attachment is still uploading.
    const uploaded = atts.ready();
    if ((!prompt && uploaded.length === 0) || busy || atts.uploading) return;
    setInput("");
    atts.clear();
    const effectivePrompt = prompt || tt("请分析我上传的文件。");
    if (!taskId) {
      await start(effectivePrompt, uploaded);
      return;
    }
    setBusy(true);
    setMessages((m) => [
      ...m,
      { id: Date.now(), role: "user", kind: "text", content: effectivePrompt,
        meta: uploaded.length ? { attachments: uploaded } : undefined },
    ]);
    const r = await followUp(taskId, effectivePrompt, uploaded);
    setBusy(false);
    if (r.ok) setStatus("running");
    else setError(r.error || tt("发送失败"));
  }

  const art = latestArtifact(messages);
  const running = status === "running" || busy;

  // 生成结果(artifact)到达 → 自动打开右版面（「点素材查看」路径）。
  const artSig = art ? `${art.meta.type}:${art.meta.url || ""}:${art.content.slice(0, 32)}` : "";
  const seenArtRef = useRef("");
  useEffect(() => {
    if (art && artSig !== seenArtRef.current) {
      seenArtRef.current = artSig;
      setRightOpen(true);
    }
  }, [art, artSig]);

  // 「库」= 右版面显隐开关（受控）。显式 false 关按钮。否则默认启用。
  const effectiveLibrary: SplitLibraryConfig | undefined =
    library === false
      ? undefined
      : {
          label: tt("库"),
          open: rightOpen,
          onOpenChange: setRightOpen,
          paneTitle: tt("库"),
          ...(library || {}),
        };

  // 「所属 app」展示名：prop > appNames[site] > site_id 本身。空则不显示标签。
  const resolvedApp =
    appLabelProp || (taskSiteId ? appNames?.[taskSiteId] || taskSiteId : "");
  // 左栏标题：「agent」+（有 app 时）所属 app 小标签。
  const leftLabelNode = resolvedApp ? (
    <span className="flex items-center gap-2">
      <span className="text-[12px] font-medium text-stone-500">agent</span>
      <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
        {tt("所属 app · {app}", { app: resolvedApp })}
      </span>
    </span>
  ) : (
    "agent"
  );

  const stream = (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {/* 对话内容与下方输入框同宽、居中：读感更集中，气泡不再拉满整栏。 */}
        <div className="mx-auto w-full max-w-2xl space-y-3">
          {messages.length === 0 && !running && (
            <div className="py-10 text-center text-[15px] text-stone-400">
              {emptyHint ?? tt("在下方输入，开始与 agent 对话。")}
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} m={m} />
          ))}
          {running && (
            <div className="flex items-center gap-2 text-[14px] text-stone-400">
              <span className="v-spinner" /> {tt("agent 正在思考…")}
            </div>
          )}
          {error && <p className="text-[14px] text-rose-500">{error}</p>}
        </div>
      </div>
      <div className="shrink-0 border-t border-stone-100 px-3 py-3">
        {/* 输入框收窄居中（操作员 2026-07-01）：不再铺满整栏，限宽 + 居中，
            与主站首页 max-w-3xl 输入框的占比观感一致，左右不再过宽。 */}
        <div className="mx-auto w-full max-w-2xl space-y-2">
          {composerHeader}
          <LeoComposer
            value={input}
            onChange={setInput}
            onSubmit={send}
            loading={busy}
            leoSuggest
            placeholder={placeholder ?? tt("继续追问，或上传文件让 agent 分析…")}
            rows={1}
            onAttachFiles={atts.handleAttachFiles}
            attachments={atts.composerAttachments}
            onRemoveAttachment={atts.removeAttachment}
            onVoiceTranscript={handleVoiceTranscript}
          />
        </div>
      </div>
    </div>
  );

  // OceanLeo 系列右边永远只有【一个】版面：默认收起（对话占满）；点「库」按钮或生成结果
  // (artifact)到达 → 展开右版面显示结果。右版面内容 = 最新 artifact，或空态提示。
  const right = art
    ? renderArtifact?.(art.meta, art.content) ?? (
        <DefaultArtifact artifact={art.meta} content={art.content} />
      )
    : (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-stone-400">
          <svg className="h-10 w-10 text-stone-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M4 17l5-5 4 4 3-3 4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-[13px]">{tt("还没有生成结果。让 agent 帮你生成后，结果会显示在这里。")}</p>
        </div>
      );

  return (
    <SplitWorkspace
      left={stream}
      right={right}
      leftLabel={leftLabelNode}
      rightLabel={art ? ARTIFACT_LABEL[art.meta.type] || art.meta.title || tt("结果") : tt("结果")}
      defaultRatio={0.46}
      storageKey={siteId ? `oceanleo_agent_split:${siteId}` : "oceanleo_agent_split"}
      accent={accent}
      headerHeight={headerHeight}
      // AgentChat 的对话流/输入框内部已 max-w-2xl 居中，外层单栏不再二次限宽（否则双重收窄）。
      soloMaxWidth={null}
      library={effectiveLibrary}
    />
  );
}

function MessageBubble({ m }: { m: AgentMessage }) {
  const tt = useUI();
  const ARTIFACT_LABEL = artifactLabels(tt);
  if (m.role === "user") {
    const atts = m.meta?.attachments || [];
    return (
      <div className="flex flex-col items-end gap-1.5">
        {atts.length > 0 && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
            {atts.map((a, i) => (
              <UserAttachmentChip key={i} att={a} />
            ))}
          </div>
        )}
        {m.content && (
          // 用户气泡统一黑色（bg-neutral-900）——与主站任务页 /tasks/[id] 一致。
          // 操作员 2026-07-01：对话/历史回看不能因 accent 变蓝，全程一致黑色。
          // 字号 2026-07-01 调大 13→15px（历史回看字体太小诉求）。
          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-neutral-900 px-4 py-2.5 text-[15px] leading-relaxed text-white">
            {m.content}
          </div>
        )}
      </div>
    );
  }
  // assistant
  if (m.kind === "plan") {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50/70 px-4 py-3">
        <Markdown className="text-[15px] leading-relaxed">{m.content}</Markdown>
      </div>
    );
  }
  if (m.kind === "step") {
    return <div className="px-1 text-[13px] font-medium text-stone-500">{m.content}</div>;
  }
  if (m.kind === "error") {
    return <div className="rounded-lg bg-rose-50 px-3 py-2 text-[14px] text-rose-600">{m.content}</div>;
  }
  // text / artifact (artifact's full content is mirrored to the right pane; in
  // the stream we just show a short note for artifact-final to avoid duplication)
  if (m.meta?.artifact && m.meta?.final) {
    return (
      <div className="rounded-lg bg-emerald-50 px-3 py-2 text-[14px] text-emerald-700">
        {tt("✅ 已生成结果，见右侧「{label}」面板。", {
          label: ARTIFACT_LABEL[m.meta.artifact.type] || tt("结果"),
        })}
      </div>
    );
  }
  return (
    <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-white px-4 py-2.5 shadow-sm ring-1 ring-stone-100">
      <Markdown className="text-[15px] leading-relaxed">{m.content}</Markdown>
    </div>
  );
}

function UserAttachmentChip({ att }: { att: AgentAttachment }) {
  const tt = useUI();
  const isImage =
    (att.mime || "").startsWith("image/") ||
    att.media_type === "image" ||
    /\.(png|jpe?g|webp|gif)$/i.test((att.url || "").split("?")[0]);
  if (isImage && att.url) {
    return (
      <a href={att.url} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={att.url}
          alt={att.name || ""}
          className="h-16 w-16 rounded-lg border border-stone-200 object-cover"
        />
      </a>
    );
  }
  return (
    <a
      href={att.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-[12px] text-stone-600 shadow-sm hover:bg-stone-50"
    >
      <svg className="h-4 w-4 shrink-0 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
        <path d="M14 3v4h4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="max-w-[140px] truncate">{att.name || tt("附件")}</span>
    </a>
  );
}

function DefaultArtifact({ artifact, content }: { artifact: ArtifactMeta; content: string }) {
  if (artifact.type === "image" && artifact.url) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={artifact.url} alt={artifact.title || ""} className="max-h-full max-w-full rounded-lg object-contain" />
      </div>
    );
  }
  // map / canvas / novel / ppt / sheet / doc / markdown → render markdown.
  // Each site may override via renderArtifact for a richer editor.
  // overflow-y-auto so long deliverables scroll inside the (flex-filled) pane.
  return (
    <div className="h-full overflow-y-auto p-5">
      <Markdown>{content}</Markdown>
    </div>
  );
}
