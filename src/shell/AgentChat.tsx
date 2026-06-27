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
import { SplitWorkspace } from "./SplitWorkspace";
import { Markdown } from "./Markdown";
import { LeoComposer } from "./LeoComposer";
import {
  createTask,
  followUp,
  getTask,
  latestArtifact,
  type AgentMessage,
  type ArtifactMeta,
} from "../lib/agent";

const ARTIFACT_LABEL: Record<string, string> = {
  map: "地图",
  canvas: "画布",
  novel: "小说",
  ppt: "演示文稿",
  sheet: "表格",
  doc: "文档",
  markdown: "结果文档",
  image: "图片",
};

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
  /** Stage C：选中的 agent 引擎（来自 EnginePicker）。""/"oceanleo" = 原生引擎
   *  (平台 key)；claude-code|codex|opencode|cline = 外部引擎(BYOK, gVisor 沙箱)。 */
  engine?: string;
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
}

export function AgentChat({
  siteId = "",
  initialPrompt,
  taskId: initialTaskId,
  mode = "agent",
  agentId = "",
  teamId = "",
  agentModel = "",
  engine = "",
  accent = "#4f46e5",
  headerHeight = 56,
  onTaskCreated,
  renderArtifact,
  appNames,
  appLabel: appLabelProp,
}: AgentChatProps) {
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

  async function start(prompt: string) {
    setBusy(true);
    setError(null);
    setMessages([{ id: -1, role: "user", kind: "text", content: prompt }]);
    const r = await createTask({ prompt, mode, siteId, agentModel, agentId, teamId, engine });
    setBusy(false);
    if (!r.ok || !r.data) {
      setError(r.status === 401 ? "登录后即可使用 app。" : r.error || "创建任务失败");
      return;
    }
    setTaskId(r.data.task_id);
    setStatus("running");
    onTaskCreated?.(r.data.task_id);
    void refresh(r.data.task_id);
  }

  async function send() {
    const prompt = input.trim();
    if (!prompt || busy) return;
    setInput("");
    if (!taskId) {
      await start(prompt);
      return;
    }
    setBusy(true);
    setMessages((m) => [...m, { id: Date.now(), role: "user", kind: "text", content: prompt }]);
    const r = await followUp(taskId, prompt);
    setBusy(false);
    if (r.ok) setStatus("running");
    else setError(r.error || "发送失败");
  }

  const art = latestArtifact(messages);
  const running = status === "running" || busy;

  // 「所属 app」展示名：prop > appNames[site] > site_id 本身。空则不显示标签。
  const resolvedApp =
    appLabelProp || (taskSiteId ? appNames?.[taskSiteId] || taskSiteId : "");
  // 左栏标题：「agent」+（有 app 时）所属 app 小标签。
  const leftLabelNode = resolvedApp ? (
    <span className="flex items-center gap-2">
      <span className="text-[12px] font-medium text-stone-500">agent</span>
      <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
        所属 app · {resolvedApp}
      </span>
    </span>
  ) : (
    "agent"
  );

  const stream = (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !running && (
          <p className="py-10 text-center text-sm text-stone-400">在下方输入，开始与 agent 对话。</p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} m={m} accent={accent} />
        ))}
        {running && (
          <div className="flex items-center gap-2 text-[13px] text-stone-400">
            <span className="v-spinner" /> agent 正在思考…
          </div>
        )}
        {error && <p className="text-[13px] text-rose-500">{error}</p>}
      </div>
      <div className="shrink-0 border-t border-stone-100 p-3">
        <LeoComposer
          value={input}
          onChange={setInput}
          onSubmit={send}
          loading={busy}
          leoSuggest
          placeholder="继续追问，或布置下一步…"
          rows={1}
        />
      </div>
    </div>
  );

  // No artifact yet → single pane (just the chat). Artifact present → split.
  if (!art) {
    return (
      <SplitWorkspace
        left={stream}
        leftLabel={leftLabelNode}
        accent={accent}
        headerHeight={headerHeight}
      />
    );
  }

  const right =
    renderArtifact?.(art.meta, art.content) ?? (
      <DefaultArtifact artifact={art.meta} content={art.content} />
    );

  const splitLeftLabel = resolvedApp ? (
    <span className="flex items-center gap-2">
      <span className="text-[12px] font-medium text-stone-500">AI 推导</span>
      <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
        所属 app · {resolvedApp}
      </span>
    </span>
  ) : (
    "AI 推导"
  );

  return (
    <SplitWorkspace
      left={stream}
      right={right}
      leftLabel={splitLeftLabel}
      rightLabel={ARTIFACT_LABEL[art.meta.type] || art.meta.title || "结果"}
      // 推理（AI 推导）合理展开：左栏默认占比从 1/3 提到 0.46——推理过程更宽更可读，
      // 又不至于完全占满（右栏结果仍有空间）。用户可拖动竖线进一步调整并记忆。
      defaultRatio={0.46}
      storageKey={siteId ? `oceanleo_agent_split:${siteId}` : "oceanleo_agent_split"}
      accent={accent}
      headerHeight={headerHeight}
    />
  );
}

function MessageBubble({ m, accent }: { m: AgentMessage; accent: string }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 text-[13px] text-white"
          style={{ background: accent }}
        >
          {m.content}
        </div>
      </div>
    );
  }
  // assistant
  if (m.kind === "plan") {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50/70 px-3.5 py-2.5">
        <Markdown>{m.content}</Markdown>
      </div>
    );
  }
  if (m.kind === "step") {
    return <div className="px-1 text-[12px] font-medium text-stone-500">{m.content}</div>;
  }
  if (m.kind === "error") {
    return <div className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-600">{m.content}</div>;
  }
  // text / artifact (artifact's full content is mirrored to the right pane; in
  // the stream we just show a short note for artifact-final to avoid duplication)
  if (m.meta?.artifact && m.meta?.final) {
    return (
      <div className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">
        ✅ 已生成结果，见右侧「{ARTIFACT_LABEL[m.meta.artifact.type] || "结果"}」面板。
      </div>
    );
  }
  return (
    <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2 shadow-sm ring-1 ring-stone-100">
      <Markdown>{m.content}</Markdown>
    </div>
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
