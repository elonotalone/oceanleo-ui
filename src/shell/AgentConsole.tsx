"use client";

// ============================================================================
// @oceanleo/ui — AgentConsole：由 manifest 渲染的通用操作台（可迁移核心）
// ----------------------------------------------------------------------------
// 宗旨 v4：docs/architecture/oceanleo-agent-manifest-and-portable-console.md
//   吃一份 ConsoleManifest（console.json），渲染出与各站手写操作台「完全一致」的
//   「操作台 / agent 双形态左栏 + 右栏结果」—— 因为内部还是复用 StudioSection /
//   FunctionAgentChat / ResultCanvas / OperatorConsole。
//
//   一份 manifest 在任何站点（子站 / 主站工作台 / oceanbizs 预览 / playground）都用
//   这一个组件渲染 → 显示天然一致、零代码搬迁。这就是「前端可迁移性」的落点。
//
// 用法（最常见，单 agent）：
//   <AgentConsole manifest={m} siteId="resume" />
// 多 agent（一个站多个功能区）：传 manifests[] → 内部用 OperatorConsole 顶部按键切换。
// ============================================================================

import { useCallback, useId, useMemo, useState } from "react";
import { Studio } from "./Studio";
import { FunctionAgentChat } from "./FunctionAgentChat";
import { StudioSection } from "./StudioSection";
import { ResultCanvas, CanvasEmpty, type CanvasTab } from "./ResultCanvas";
import { Markdown } from "./Markdown";
import {
  type AgentManifest,
  type ManifestField,
  type ResultRender,
  initialState,
  manifestToOpsSchema,
  normalizeConsoleManifest,
  renderTemplate,
} from "../lib/manifest";
import { runCapability as defaultRunCapability } from "../lib/capabilities";
import type { CapabilityResult } from "../lib/capabilities";
import type { Capability } from "../lib/manifest";
import { useUI } from "../i18n/ui/useUI";

// 能力执行器签名。宗旨 v10：操作台**直接生成**——主行动按钮点了就经此 SDK 出结果填
// 进右栏（agent 形态另有自己的工具调用链路，与操作台独立）。
export type RunCapabilityFn = (
  capability: Capability,
  input: Record<string, unknown>,
  ctx: { siteId: string },
) => Promise<CapabilityResult>;

const inputCls =
  "w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

export interface AgentConsoleProps {
  /** 单 agent：一份 manifest。 */
  manifest?: AgentManifest;
  /** 多 agent（一个站多功能区）：每个功能区一份 manifest。 */
  manifests?: AgentManifest[];
  /** 本站 site_id（计量 + 历史分区 + 能力调用上下文）。 */
  siteId: string;
  accent?: string;
  /** 受控选中的 agent_id（多 agent 时）。 */
  value?: string;
  onChange?: (agentId: string) => void;
  /** solo：隐藏顶部功能区按键条（主站 iframe 内嵌单个功能区时）。 */
  hideTabs?: boolean;
  headerHeight?: number;
  /**
   * 可选：覆盖能力执行器。默认用内置 SDK（直连网关，需用户 OceanLeo token）。
   * oceanbizs 等无 OceanLeo 登录态的场景注入一个走自家服务端代理的实现。
   */
  runCapability?: RunCapabilityFn;
}

// 顶部功能区按键条占用的竖向高度（px），与 OperatorConsole 一致，供 Studio 扣除。
const TABS_BAR_HEIGHT = 60;

export function AgentConsole({
  manifest,
  manifests,
  siteId,
  accent = "#4f46e5",
  value,
  onChange,
  hideTabs = false,
  headerHeight = 56,
  runCapability,
}: AgentConsoleProps) {
  const tt = useUI();
  const list = useMemo(
    () => (manifests && manifests.length ? manifests : manifest ? [manifest] : []),
    [manifest, manifests],
  );
  const groupId = useId();
  const first = list[0]?.agent_id ?? "";
  const [internal, setInternal] = useState(first);
  const activeId = value ?? internal;
  const active = list.find((m) => m.agent_id === activeId) ?? list[0];

  const select = (id: string) => {
    if (value === undefined) setInternal(id);
    onChange?.(id);
  };

  if (list.length === 0) {
    return (
      <div className="grid h-full place-items-center p-8 text-center text-sm text-stone-400">
        {tt("该 agent 暂无可渲染的操作台配置。")}
      </div>
    );
  }

  // 顶部功能区按键条：多 agent 且非 solo 时显示（与 OperatorConsole 同构）。
  const showTabs = list.length > 1 && !hideTabs;
  const topBar = showTabs ? (
    <div className="shrink-0 px-4 pt-4">
      <div
        role="tablist"
        className="flex flex-wrap gap-1.5 rounded-2xl border border-stone-200/80 bg-white/80 p-1.5 shadow-sm"
      >
        {list.map((m) => {
          const on = m.agent_id === activeId;
          return (
            <button
              key={m.agent_id}
              id={`${groupId}-tab-${m.agent_id}`}
              role="tab"
              type="button"
              aria-selected={on}
              onClick={() => select(m.agent_id)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                on ? "text-white shadow-sm" : "text-stone-600 hover:bg-stone-100"
              }`}
              style={on ? { background: accent } : undefined}
            >
              {m.icon && <span className="shrink-0">{m.icon}</span>}
              <span>{m.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  const studioHeaderHeight = headerHeight + (showTabs ? TABS_BAR_HEIGHT : 0);

  return (
    <div>
      {topBar}
      <ManifestPane
        key={active.agent_id}
        m={active}
        siteId={siteId}
        accent={active.console.accent || accent}
        headerHeight={studioHeaderHeight}
        runCapability={runCapability}
      />
    </div>
  );
}

// 一个 manifest 的完整渲染：Studio（左=操作台/agent 同栏双形态，右=结果画布）。
// 宗旨 v10：操作台**直接生成**——表单底部主行动按钮经能力 SDK 出结果填进右栏。
// agent 形态独立（不读/不写操作台 state），其产物经 onArtifact 进同一个右栏结果区。
function ManifestPane({
  m,
  siteId,
  accent,
  headerHeight = 56,
  runCapability,
}: {
  m: AgentManifest;
  siteId: string;
  accent: string;
  headerHeight?: number;
  runCapability?: RunCapabilityFn;
}) {
  const tt = useUI();
  const runCap = runCapability ?? defaultRunCapability;
  const con = useMemo(() => normalizeConsoleManifest(m.console), [m.console]);
  const hasOpsForm = con.sections.length > 0;
  const [state, setState] = useState<Record<string, unknown>>(() => initialState(con));
  const [openSec, setOpenSec] = useState<string | null>(con.sections[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = useCallback((key: string, v: unknown) => {
    setState((s) => ({ ...s, [key]: v }));
  }, []);

  const schema = useMemo(() => manifestToOpsSchema(m.agent_id, con), [m.agent_id, con]);

  // 操作台「生成」：required 校验 → 经能力 SDK 出结果 → 写进结果字段（右栏显示）。
  const runGenerate = useCallback(async () => {
    if (!hasOpsForm) return;
    setError(null);
    for (const sec of con.sections) {
      for (const f of sec.fields) {
        if (f.required && !String(state[f.key] ?? "").trim()) {
          setError(tt("请填写「{label}」。", { label: f.label }));
          return;
        }
      }
    }
    setBusy(true);
    try {
      const a = con.action;
      const input: Record<string, unknown> =
        a.capability === "chat"
          ? {
              system: renderTemplate(a.systemTemplate || "", state),
              user: renderTemplate(a.userTemplate || "", state),
            }
          : {
              ...mapParams(a.params, state),
              prompt: renderTemplate(a.params?.prompt || a.userTemplate || "", state) || undefined,
            };
      const r = await runCap(a.capability, input, { siteId });
      if (!r.ok) {
        setError(r.error || tt("生成失败，请重试。"));
        return;
      }
      const out = r.text ?? (r.urls && r.urls.length ? r.urls.join("\n") : "");
      setField(a.output.key, out);
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("生成失败，请重试。"));
    } finally {
      setBusy(false);
    }
  }, [con, hasOpsForm, state, siteId, setField, runCap]);

  // agent 线程产出 artifact（图片 / 文档…）→ 写进结果字段，让右侧画布显示它（共用右栏）。
  const applyArtifact = useCallback(
    (meta: { type: string; url?: string }, content: string) => {
      const key = con.action.output.key;
      const value = meta.type === "image" && meta.url ? meta.url : content;
      if (!value) return;
      setState((s) => ({ ...s, [key]: value }));
    },
    [con.action.output.key],
  );

  // 左栏「操作台」：StudioSection 表单 + 底部「生成」主按钮（宗旨 v10：操作台直接生成）。
  const opsContent = (
    <div className="space-y-3">
      {!hasOpsForm ? (
        <p className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs leading-relaxed text-stone-500">
          {tt("该 app 暂无可填写的操作台选项。切到上方「agent」用对话完成工作即可。")}
        </p>
      ) : null}
      {con.sections.map((sec, i) => {
        const filled = sec.fields.some((f) => String(state[f.key] ?? "").trim());
        return (
          <StudioSection
            key={sec.id}
            index={i + 1}
            title={sec.title}
            accent={accent}
            open={openSec === sec.id}
            onToggle={() => setOpenSec((cur) => (cur === sec.id ? null : sec.id))}
            summary={filled ? tt("已填写") : sec.fields.some((f) => f.required) ? tt("必填") : tt("可选")}
          >
            <div className="space-y-3">
              {sec.fields.map((f) => (
                <FieldControl key={f.key} f={f} value={state[f.key]} onChange={(v) => setField(f.key, v)} accent={accent} />
              ))}
            </div>
          </StudioSection>
        );
      })}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{tt(error)}</div>
      )}
      {hasOpsForm ? (
        <button
          type="button"
          onClick={() => void runGenerate()}
          disabled={busy}
          className="w-full rounded-2xl px-4 py-3 text-sm font-bold text-white shadow-md transition hover:opacity-90 disabled:opacity-50"
          style={{ background: accent }}
        >
          {busy ? tt("生成中…") : `${con.action.label} ✦`}
        </button>
      ) : null}
    </div>
  );

  // 右栏：结果画布。
  const [activeTab, setActiveTab] = useState(con.canvas.tabs[0]?.id ?? "result");
  const tabs: CanvasTab[] = con.canvas.tabs.map((t) => ({
    id: t.id,
    label: t.label,
    content: (
      <ResultView
        render={t.render}
        value={state[t.from]}
        busy={busy}
        emptyTitle={t.emptyTitle || tt("结果会显示在这里")}
        emptyHint={t.emptyHint}
        onEdit={(v) => setField(t.from, v)}
      />
    ),
  }));
  const canvas = <ResultCanvas tabs={tabs} active={activeTab} onChange={setActiveTab} />;

  // 左栏 = 操作台/agent 双形态（FunctionAgentChat），右栏 = 结果画布。两栏共用
  // Studio 的可拖动分栏骨架（与各站手写操作台版式完全一致）。
  const ops = (
    <FunctionAgentChat
      agentId={m.agent_id}
      siteId={siteId}
      schema={schema}
      accent={accent}
      opsContent={opsContent}
      showOps={hasOpsForm}
      onArtifact={applyArtifact}
      appLabel={m.name}
      appIcon={typeof m.icon === "string" ? m.icon : undefined}
    />
  );

  return (
    <Studio
      ops={ops}
      canvas={canvas}
      opsWidth={460}
      accent={accent}
      headerHeight={headerHeight}
      storageKey={`agentconsole:${m.agent_id}`}
    />
  );
}

// 非 chat 能力：把 action.params（值含 {{field}} 模板）展开成请求参数。
function mapParams(
  params: Record<string, string> | undefined,
  state: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!params) return out;
  for (const [k, tpl] of Object.entries(params)) {
    out[k] = renderTemplate(tpl, state);
  }
  return out;
}

// 单个字段控件渲染。
function FieldControl({
  f,
  value,
  onChange,
  accent,
}: {
  f: ManifestField;
  value: unknown;
  onChange: (v: unknown) => void;
  accent: string;
}) {
  const tt = useUI();
  const v = value ?? "";
  switch (f.control) {
    case "longtext":
      return (
        <textarea
          className={`${inputCls} min-h-24 resize-y`}
          placeholder={tt(f.placeholder || f.label)}
          value={String(v)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "number":
      return (
        <input
          type="number"
          className={inputCls}
          placeholder={tt(f.placeholder || f.label)}
          value={String(v)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "boolean":
      return (
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={Boolean(v)} onChange={(e) => onChange(e.target.checked)} />
          {tt(f.label)}
        </label>
      );
    case "enum": {
      const opts = (f.options || []).map((o) => (typeof o === "string" ? { value: o, label: o } : o));
      return (
        <div className="flex flex-wrap items-center gap-2">
          {opts.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                v === o.value ? "text-white" : "border border-stone-300 text-stone-600 hover:bg-stone-50"
              }`}
              style={v === o.value ? { background: accent } : undefined}
            >
              {tt(o.label)}
            </button>
          ))}
        </div>
      );
    }
    case "image-upload":
      return (
        <input
          className={inputCls}
          placeholder={f.placeholder || tt("粘贴图片 URL（上传控件待接入对象存储）")}
          value={String(v)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    default:
      return (
        <input
          className={inputCls}
          placeholder={tt(f.placeholder || f.label)}
          value={String(v)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

// 结果渲染（按 ResultRender 词表）。
function ResultView({
  render,
  value,
  busy,
  emptyTitle,
  emptyHint,
  onEdit,
}: {
  render: ResultRender;
  value: unknown;
  busy: boolean;
  emptyTitle: string;
  emptyHint?: string;
  onEdit: (v: string) => void;
}) {
  const tt = useUI();
  const has = value != null && String(value).trim() !== "";
  if (busy && !has) {
    return (
      <div className="grid h-full place-items-center py-16">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-[3px] border-indigo-200 border-t-indigo-600" />
          <p className="mt-3 text-xs text-stone-400">{tt("生成中…")}</p>
        </div>
      </div>
    );
  }
  if (!has) return <CanvasEmpty title={emptyTitle} hint={emptyHint} />;

  const urls = String(value).split("\n").filter(Boolean);

  // 鲁棒兜底：值本身就是图片 URL(s) 时，无论 manifest 声明的 render 是什么都按图片渲染。
  // 这样 agent 生成的图片即便落进一个声明为 editable-text 的结果字段，也会正常显示成图片
  // （而不是把一串 URL 当纯文本显示）。
  const looksLikeImage =
    urls.length > 0 &&
    urls.every((u) => /^https?:\/\//i.test(u) && /\.(jpg|jpeg|png|gif|webp|avif)(\?|$)/i.test(u));
  if (looksLikeImage && render !== "image-grid") {
    return (
      <div className="grid grid-cols-2 gap-3">
        {urls.map((u) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={u} src={u} alt="" className="w-full rounded-xl border border-stone-200" />
        ))}
      </div>
    );
  }

  switch (render) {
    case "markdown":
      return (
        <div className="prose prose-sm max-w-none">
          <Markdown>{String(value)}</Markdown>
        </div>
      );
    case "image-grid":
      return (
        <div className="grid grid-cols-2 gap-3">
          {urls.map((u) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={u} src={u} alt="" className="w-full rounded-xl border border-stone-200" />
          ))}
        </div>
      );
    case "video-player":
      return <video src={urls[0]} controls className="w-full rounded-xl" />;
    case "audio-player":
      return <audio src={urls[0]} controls className="w-full" />;
    case "3d-preview":
      return (
        <div className="space-y-2">
          <p className="text-xs text-stone-500">{tt("3D 模型已生成：")}</p>
          {urls.map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer" className="block truncate text-sm text-indigo-600 underline">
              {u}
            </a>
          ))}
        </div>
      );
    case "editable-text":
    default:
      return (
        <textarea
          className="min-h-[22rem] w-full flex-1 resize-y rounded-xl border border-stone-200 bg-stone-50/50 p-4 text-sm leading-relaxed outline-none focus:border-indigo-400"
          value={String(value)}
          onChange={(e) => onEdit(e.target.value)}
        />
      );
  }
}
