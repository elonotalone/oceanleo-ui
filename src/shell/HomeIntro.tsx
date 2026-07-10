"use client";

// ============================================================================
// @oceanleo/ui — 站点首页 HomeIntro（单一事实源）
// ----------------------------------------------------------------------------
// 操作员 2026-06-19 定稿：每个 OceanLeo 产品站「首页」统一长这样：
//   - 站点介绍：2–3 句，不花哨。
//   - 收费说明（固定文案，2026-06-28 改版）：平台仅按用户使用 AI token 的
//     成本价收费（不加价、不抽成）；用户也可自带各平台 API key 免费使用。
//     旧文案「盈利 = token 成本的 30%」已作废（网关 SERVICE_MARKUP=0）。
//   - 一个大输入框（对照主站「我能为你做什么 / 给 OceanLeo 布置一个任务…」）。
//     用户提交 → onStart(prompt) 进入 agent 工作界面（高级任务自动一分为二）。
//
// 2026-07-02 升级（对照豆包首页）：传 siteId 即在输入框下方渲染 prompt 卡片，并让
// **输入框吸顶常显**——不管卡片列表怎么往下滑，输入框都看得见（点 prompt 卡片时能
// 立刻看到预设文字进了输入框）。
//
// 宗旨 v12（操作员 2026-07-04）：
//   - **删除首页 agent 卡片**（不再渲染 HomeAgentCards）。
//   - **删除 agent | prompt 并列切换条**——只剩一类卡片时切换键是噪音，prompt 卡片
//     直接常显。
//   - 点 prompt 卡片 → 预设文案填进输入框，且以「占位符高亮」形态呈现（`[字段]` 上
//     accent 色、已填值高亮，对照豆包「帮我写作」），靠 LeoComposer 的 highlightTemplate。
// ============================================================================

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LeoComposer, type ComposerRecentFile } from "./LeoComposer";
import { HomePromptCards } from "./HomeCards";
import { useAttachments } from "./useAttachments";
import { listFiles, type FileItem } from "../lib/database";
import type { AgentAttachment } from "../lib/agent";
import { useUI } from "../i18n/ui/useUI";

export interface HomeIntroProps {
  /** 站名（如「LeoImage」）。 */
  siteName: string;
  /** 介绍文案（2–3 句）。 */
  intro: ReactNode;
  /** 大标题，默认「我能为你做什么？」。 */
  heading?: string;
  /** 输入框 placeholder，默认「给 OceanLeo 布置一个任务...」。 */
  placeholder?: string;
  /** 快捷示例（点了填进输入框）。传了 siteId（卡片分区）时不再渲染，避免重复。 */
  suggestions?: string[];
  /**
   * 提交回调：进入 agent 工作界面。
   *   - opts.agentId    = 用户在「agent」分区选中的 agent（保留）。
   *   - opts.attachments = 用户在首页输入框「＋」上传 / 拖入的文件（已上传到文件库、
   *     拿到公网 url）。宿主应把它透传给 <AgentChat initialAttachments>，让 agent 拿到
   *     首页就带上来的文件（音频自动转写、其它文件按 url 分析）。老宿主不接这个参数也
   *     不影响文字提交（向后兼容）。 */
  onStart: (prompt: string, opts?: { agentId?: string; attachments?: AgentAttachment[] }) => void;
  /** leftSlot：主站放「对话/Agent/设计」；普通站留空。 */
  leftSlot?: ReactNode;
  accent?: string;
  /**
   * 站点 id（如 "word"）。传了它 → 输入框下方直接渲染 prompt 卡片网格，且输入框滚动
   * 吸顶常显（宗旨 v12：不再有 agent | prompt 切换条，prompt 卡片常显）。 */
  siteId?: string;
  /**
   * @deprecated 宗旨 v12（2026-07-04）：首页删 agent 卡片 + 删切换条，prompt 卡片常显。
   * 本 prop 不再控制任何切换（保留签名以兼容旧调用方）。`"none"` 仍可用于「传了 siteId
   * 但不想展示卡片」的场景。 */
  defaultTab?: "prompt" | "agent" | "none";
  /**
   * 首页输入框是否开启【文件上传 / 拖拽 / 「＋」菜单（本地 + 最近文件）+ 语音输入】——
   * 与主站 oceanleo.com 首页输入框完全一致（操作员 2026-07-09）。默认 **true**：全家桶
   * 每个子站首页输入框都自动获得这些能力（无需各站接线，siteId 已够）。个别纯展示站可
   * 传 false 关闭。上传走共享文件库（uploadFile），最近文件走 listFiles，语音走浏览器
   * Web Speech API——都在共享层内完成，宿主只需在 onStart 里把 opts.attachments 透传给
   * AgentChat.initialAttachments 即可（不透传也不影响文字提交）。 */
  enableInputTools?: boolean;
  /** input accept（传给「＋」本地上传）。默认任意类型。 */
  accept?: string;
  /** 语音识别语言，默认 "zh-CN"。 */
  voiceLang?: string;
  /** @deprecated 旧「30% 分成」文案已作废（网关 SERVICE_MARKUP=0）。保留以兼容旧调用方，不再渲染。 */
  markupPct?: number;
}

// BYOK 支持的平台（与 oceanleo-byok-audit-zerofee.md §5 指导文档一致）。
const BYOK_PROVIDERS = "OpenAI / Anthropic Claude / DeepSeek / 阿里云百炼 / 火山方舟 / OpenRouter";

/**
 * 收费说明卡（单一事实源，2026-07-02 从 HomeIntro 抽出）：
 * 「{siteName} 属于 OceanLeo 系列。平台仅按 …成本价… 收费；自带 API key 免费。」
 * 各站 HomeIntro 底部用它；主站 oceanleo.com 首页也用它（siteName="OceanLeo"
 * 时用主站文案变体——主站不是「属于系列」而是系列本身）。
 */
export function BillingNotice({
  siteName,
  accent = "#4f46e5",
  className = "",
}: {
  siteName: string;
  accent?: string;
  className?: string;
}) {
  const tt = useUI();
  const isMainSite = siteName === "OceanLeo";
  return (
    <div
      className={`max-w-xl rounded-xl border border-stone-200/70 bg-white/60 px-4 py-3 text-center text-[12px] leading-relaxed text-stone-500 ${className}`}
    >
      <span className="font-medium text-stone-600">{siteName}</span>{" "}
      {isMainSite
        ? tt("平台仅按用户在 OceanLeo 平台使用 AI token 的")
        : tt("属于 OceanLeo 系列。平台仅按用户在 OceanLeo 平台使用 AI token 的")}
      <span className="font-semibold" style={{ color: accent }}>
        {tt("成本价")}
      </span>
      {tt("收费。你也可以自带各平台的 API key（{providers}），", { providers: BYOK_PROVIDERS })}
      <span className="font-semibold" style={{ color: accent }}>
        {tt("免费")}
      </span>
      {tt("使用 OceanLeo 的功能。")}
    </div>
  );
}

export function HomeIntro({
  siteName,
  intro,
  heading: headingProp,
  placeholder: placeholderProp,
  suggestions = [],
  onStart,
  leftSlot,
  accent = "#4f46e5",
  siteId,
  defaultTab = "prompt",
  enableInputTools = true,
  accept,
  voiceLang = "zh-CN",
  // markupPct 已作废，仅为兼容旧调用方保留，不再使用。
  markupPct: _markupPct,
}: HomeIntroProps) {
  void _markupPct;
  const tt = useUI();
  const heading = headingProp ?? tt("我能为你做什么？");
  const placeholder = placeholderProp ?? tt("给 OceanLeo 布置一个任务...");
  const [value, setValue] = useState("");
  // 当前生效的「占位符高亮模板」：点 prompt 卡片时设为该卡文案；用户清空输入框时清掉。
  const [highlightTemplate, setHighlightTemplate] = useState<string | null>(null);
  const [fillNonce, setFillNonce] = useState(0);

  // ── 输入框工具（与主站首页一致）：上传/拖拽/「＋」菜单/语音 ──────────────
  // 传了 siteId 且未显式关闭 → 开启。上传走共享 useAttachments（复用文件库 upload +
  // 缩略条 + 上传中态），最近文件走 listFiles，语音把识别文本续写进输入框。
  const toolsOn = enableInputTools && Boolean(siteId);
  const attachSiteId = siteId || "default";
  const atts = useAttachments(attachSiteId);
  const [recentFiles, setRecentFiles] = useState<ComposerRecentFile[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const recentLoadedRef = useRef(false);
  // 原始 FileItem 按 id 存起来：点「最近文件」时要用真实 url + mime 组装 AgentAttachment
  // （ComposerRecentFile 只携带展示字段，不带落库 url）。
  const recentRawRef = useRef<Record<string, FileItem>>({});

  // 懒加载「最近文件」：挂载后后台预取一次（「＋」菜单里「最近文件」子菜单要用），失败静默。
  const loadRecent = useCallback(async () => {
    if (!toolsOn || recentLoadedRef.current || recentLoading) return;
    recentLoadedRef.current = true;
    setRecentLoading(true);
    const r = await listFiles({ siteId: attachSiteId, scope: "all", limit: 12 });
    setRecentLoading(false);
    if (r.ok && r.data) {
      const items = r.data.items || [];
      const raw: Record<string, FileItem> = {};
      for (const f of items) raw[f.id] = f;
      recentRawRef.current = raw;
      setRecentFiles(
        items.map((f: FileItem) => ({
          id: f.id,
          name: (f.meta?.filename as string) || f.title || tt("文件"),
          previewUrl: f.media_type === "image" ? f.thumb_url || f.url : undefined,
          mediaType: f.media_type,
        })),
      );
    }
  }, [toolsOn, recentLoading, attachSiteId, tt]);

  useEffect(() => {
    if (toolsOn) void loadRecent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolsOn]);

  // 从「最近文件」选一个：它已在文件库，用原始 FileItem 的真实 url 组装 AgentAttachment，
  // 直接进 ready 态（复用 useAttachments 的缩略条展示 + 随消息发送）。
  const pickRecent = useCallback(
    (f: ComposerRecentFile) => {
      const raw = recentRawRef.current[f.id];
      if (!raw?.url) return;
      atts.addReady({
        id: f.id,
        name: f.name,
        previewUrl: f.previewUrl,
        attachment: {
          url: raw.url,
          mime: raw.mime,
          name: f.name,
          media_type: raw.media_type,
        },
      });
    },
    [atts],
  );

  // 语音输入：把识别到的文字续写进输入框（并退出占位模板态）。
  const appendVoice = useCallback((text: string) => {
    setValue((prev) => (prev ? `${prev} ${text}` : text));
    setHighlightTemplate(null);
  }, []);

  const submit = (cleanValue?: string) => {
    const p = (cleanValue ?? value).trim();
    const uploaded = toolsOn ? atts.ready() : [];
    // 有附件时允许空文字提交（与 AgentChat 一致）。
    if (!p && uploaded.length === 0) return;
    if (toolsOn && atts.uploading) return; // 附件还在上传，先别提交
    onStart(p, uploaded.length ? { attachments: uploaded } : undefined);
    atts.clear();
  };

  // 有 siteId 且未显式关掉卡片（defaultTab !== "none"）→ 直接常显 prompt 卡片。
  const withCards = Boolean(siteId) && defaultTab !== "none";

  // 点 prompt 卡片（宗旨 v15）：把该卡文案设为模板 → TemplateFillArea 把字面文字灌进编辑器
  // （字面可编辑、`[字段]` 是荧光块）。每次点击显式自增 fillNonce；同卡重复点击也能重灌，
  // 不再用 null → requestAnimationFrame 的时序弹跳。
  const pickPrompt = (p: string) => {
    setValue("");
    setHighlightTemplate(p);
    setFillNonce((nonce) => nonce + 1);
  };
  const onChangeValue = (v: string) => {
    setValue(v);
  };

  return (
    <div
      className={`mx-auto flex w-full max-w-3xl flex-col items-center px-6 ${
        withCards ? "min-h-[calc(100dvh-56px)] pt-[7vh]" : "min-h-[calc(100dvh-56px)] pt-[12vh]"
      }`}
    >
      <h1 className="text-center text-[32px] font-semibold tracking-tight text-stone-900">
        {heading}
      </h1>
      <p className="mt-4 max-w-xl text-center text-[14px] leading-relaxed text-stone-500">
        {intro}
      </p>

      {/* 输入框：有卡片分区时吸顶常显——往下滑卡片列表时它一直看得见（操作员
          2026-07-02）。2026-07-03：吸顶到【触顶】（top-0，去掉 8px 缝隙）。
          2026-07-09：toolsOn 时开启【文件上传 /「＋」菜单（本地 + 最近文件）/ 拖拽 / 语音】——
          与主站 oceanleo.com 首页输入框完全一致，各子站零改动即获此能力。 */}
      <div className={`mt-8 w-full ${withCards ? "sticky top-0 z-30 pt-2" : ""}`}>
        <LeoComposer
          value={value}
          onChange={onChangeValue}
          onSubmit={submit}
          leoSuggest
          leftSlot={leftSlot}
          placeholder={placeholder}
          autoFocus
          rows={2}
          highlightTemplate={highlightTemplate}
          fillNonce={fillNonce}
          accentColor={accent}
          className={withCards ? "shadow-md" : ""}
          onAttachFiles={toolsOn ? atts.handleAttachFiles : undefined}
          accept={toolsOn ? accept : undefined}
          recentFiles={toolsOn ? recentFiles : undefined}
          onPickRecent={toolsOn ? pickRecent : undefined}
          recentLoading={toolsOn ? recentLoading : undefined}
          attachments={toolsOn ? atts.composerAttachments : undefined}
          onRemoveAttachment={toolsOn ? atts.removeAttachment : undefined}
          onVoiceTranscript={toolsOn ? appendVoice : undefined}
          voiceLang={voiceLang}
        />
      </div>

      {/* 旧快捷示例 pill（未接卡片分区的站保留原样） */}
      {!withCards && suggestions.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setValue(s);
              }}
              className="rounded-full border border-stone-200 bg-white px-4 py-1.5 text-[13px] text-stone-600 transition hover:border-stone-300 hover:text-stone-800"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* prompt 卡片区（宗旨 v12）：直接常显，无 agent | prompt 切换。点卡片 → 预设
          文案进输入框并高亮占位符。 */}
      {withCards && (
        <div className="mt-6 w-full pb-6">
          <HomePromptCards siteId={siteId!} accent={accent} onPick={pickPrompt} />
        </div>
      )}

      <BillingNotice siteName={siteName} accent={accent} className={withCards ? "mb-8 mt-4" : "mt-10"} />
    </div>
  );
}
