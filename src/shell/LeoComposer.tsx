"use client";

import {
  type DragEvent as ReactDragEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { openLeoAssistant } from "./LeoAssistant";
import { useUI } from "../i18n/ui/useUI";

// ============================================================================
// @oceanleo/ui — 标准 OceanLeo 输入框（单一事实源）
// ----------------------------------------------------------------------------
// 操作员 2026-06-17 定稿：所有 *.oceanleo.com 站的输入框统一长这样（对照主站
// 「给 OceanLeo 布置一个任务...」截图）：圆角卡片 + 自增高 textarea + 左下控制区
// + 右下圆形发送键。
//
// 2026-06-26 升级（主站首页诉求）：输入框新增三件能力，全部参数化、默认关闭，
// 不传对应回调就不渲染，老用法零影响：
//   1. 「＋」附件键：点开弹出菜单——「从本地添加文件」/「最近文件」（用户在
//      oceanleo 上最近上传的文件）/ 调用方可注入的额外项（如「使用技能」）。
//      传 onAttachFiles 才出现「从本地」；传 recentFiles+onPickRecent 才出现
//      「最近文件」子菜单；attachMenuExtra 注入任意额外项。
//   2. 语音输入：传 onVoiceTranscript 才出现麦克风键，用浏览器原生
//      SpeechRecognition（Web Speech API）边说边转写，回调把结果交给调用方。
//   3. 附件缩略条：attachments + onRemoveAttachment（业务持有状态，本组件只展示）。
//
// 2026-06-27 升级（主站「会议录音纪要」诉求，对照 Manus「Meeting minutes」截图）：
//   4. 会议录音：传 onMeetingRecording 才出现「会议纪要」录音键。点它把输入框区域
//      切换成一张「录音卡片」——顶部右上角标题、中部提示「录音结束后自动生成纪要」、
//      底部计时器 `0:00 / 上限` + 「放弃 / 开始（→ 停止）」按钮、最下方合规提示。
//      录音用浏览器原生 getUserMedia + MediaRecorder（格式自协商：webm/opus 优先，
//      iOS 回落 mp4/aac，都在阿里云 paraformer-v2 文件转写支持列表内），停止后把整段
//      音频 File 交给 onMeetingRecording，由调用方上传 + 转写 + 生成纪要。本组件只管录。
//
// 与主站的历史差异：主站左下角原是「对话 / Agent / 设计」三件套；2026-06-26 起主站
// 改为「自动」（去掉手动 chat/agent 切换，后端按输入自动判断），设计开关并入 quick
// pill，故主站不再传 leftSlot 的三件套。其余站当输入框「与 AI 生成有关」时，左下角
// 放一个「leo」按钮（宗旨 v11 起从「leo 建议」改名，打开 leo 内容处理面板）。
//
// 因此本组件参数化：
//   - leftSlot：左下角自定义控制区（保留，向后兼容）。
//   - leoSuggest：true 时在左下角渲染「leo」按钮。
//   - 附件 / 语音 / 最近文件：见上。
// ============================================================================

/** 「最近文件」菜单条目（调用方从用户 oceanleo 文件库取，传进来渲染）。 */
export interface ComposerRecentFile {
  id: string;
  name: string;
  /** 图片类传缩略图 url；非图片不传，落到图标。 */
  previewUrl?: string;
  /** 媒体大类（image/doc/video/...），用于挑图标，可不传。 */
  mediaType?: string;
}

/** 已选附件（业务上传后回传进来渲染缩略条；本组件不负责上传）。 */
export interface ComposerAttachment {
  id: string;
  previewUrl?: string;
  name?: string;
  /** 仍在上传中：缩略条上显示转圈。 */
  uploading?: boolean;
}

/** 「＋」菜单里调用方注入的额外项（如「使用技能」）。 */
export interface ComposerMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
}

export interface LeoComposerProps {
  value: string;
  onChange: (value: string) => void;
  /** 点击发送键 / 回车（无 shift）时触发；不传则不显示发送键 */
  onSubmit?: () => void;
  placeholder?: string;
  /** 提交中：发送键转圈 + 禁用 */
  loading?: boolean;
  /** 是否显示「leo」按钮（仅与 AI 生成有关的输入框传 true） */
  leoSuggest?: boolean;
  /**
   * @deprecated 宗旨 v11（2026-07-02）：「⚡ 一键补充」自动写回输入框违反
   * 「结果永不自动写回」原则，已下线。传了也不再渲染任何按钮（编译兼容）。 */
  leoQuickSuggest?: { siteId: string; docType?: string };
  /** 左下角自定义控制区（向后兼容；主站 2026-06-26 起不再放三件套） */
  leftSlot?: ReactNode;
  /**
   * 左下角「leo 建议」旁边的额外控件（doctrine v7：skill prompt 开源入口移进输入框）。
   * 放在 leftSlot / leo 建议 之后、同一行内。
   */
  inlineSlot?: ReactNode;
  rows?: number;
  /** textarea 自增高上限（px），默认 280 */
  maxHeight?: number;
  /** 透传给最外层卡片的额外 class */
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;

  // --- 「＋」附件菜单（2026-06-26） ---
  /** 传它才出现「＋」键 +「从本地添加文件」。收到用户选/拖进来的文件。 */
  onAttachFiles?: (files: File[]) => void;
  /** input accept，如 "image/*"；默认任意。 */
  accept?: string;
  /** 是否可多选，默认 true。 */
  multiple?: boolean;
  /** 用户最近上传的文件（调用方从文件库取）。传它才出现「最近文件」子菜单。 */
  recentFiles?: ComposerRecentFile[];
  /** 点某个最近文件。 */
  onPickRecent?: (file: ComposerRecentFile) => void;
  /** 最近文件仍在加载（子菜单显示「加载中」）。 */
  recentLoading?: boolean;
  /** 「＋」菜单里追加的额外项（如「使用技能」）。 */
  attachMenuExtra?: ComposerMenuItem[];

  // --- 附件缩略条（2026-06-26） ---
  attachments?: ComposerAttachment[];
  onRemoveAttachment?: (id: string) => void;

  // --- 语音输入（2026-06-26） ---
  /** 传它才出现麦克风键。每段识别结果（最终态）回调给调用方拼进输入框。 */
  onVoiceTranscript?: (text: string) => void;
  /** 语音识别语言，默认 "zh-CN"。 */
  voiceLang?: string;

  // --- 会议录音纪要（2026-06-27） ---
  /**
   * 传它才出现「会议纪要」录音键 + 录音卡片。停止录音后，把整段音频 File 回调给调用方
   * （由调用方负责上传 → ASR 转写 → 生成纪要 → 跳任务页）。本组件只负责浏览器端录音。
   */
  onMeetingRecording?: (file: File) => void;
  /** 录音时长上限（秒），默认 7200（2 小时）。到点自动停止并回调。 */
  meetingRecordingMaxSec?: number;
}

export function LeoComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  loading = false,
  leoSuggest = false,
  leftSlot,
  inlineSlot,
  rows = 2,
  maxHeight = 280,
  className = "",
  autoFocus = false,
  disabled = false,
  onAttachFiles,
  accept,
  multiple = true,
  recentFiles,
  onPickRecent,
  recentLoading = false,
  attachMenuExtra,
  attachments,
  onRemoveAttachment,
  onVoiceTranscript,
  voiceLang = "zh-CN",
  onMeetingRecording,
  meetingRecordingMaxSec = 7200,
}: LeoComposerProps) {
  const tt = useUI();
  const placeholderText = placeholder ?? tt("给 OceanLeo 布置一个任务...");
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // 会议录音卡片是否展开（覆盖在 textarea 区域之上）。
  const [meetingOpen, setMeetingOpen] = useState(false);
  // 拖拽上传：文件被拖到输入框卡片上方（显示虚线落区）。dragDepth 抵消
  // 子元素间穿梭时反复触发的 enter/leave（只在真正离开卡片时收起）。
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  const autogrow = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, maxHeight) + "px";
  }, [maxHeight]);

  useEffect(() => {
    autogrow();
  }, [value, autogrow]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const canSend = Boolean(value.trim()) && !loading && !disabled;
  const hasAttachMenu =
    Boolean(onAttachFiles) ||
    Boolean(recentFiles && onPickRecent) ||
    Boolean(attachMenuExtra && attachMenuExtra.length);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      onSubmit &&
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.nativeEvent.isComposing
    ) {
      e.preventDefault();
      if (canSend) onSubmit();
    }
  }

  function handleLeoSuggest() {
    ref.current?.setAttribute("data-ai-assistant-target", "");
    ref.current?.focus();
    openLeoAssistant();
  }

  function emitFiles(list: FileList | null) {
    if (!list || !onAttachFiles) return;
    const files = Array.from(list);
    if (files.length) onAttachFiles(files);
  }

  // ── 拖拽上传（传了 onAttachFiles 才启用）：把文件拖到整个输入框卡片上，松手即上传。
  //    与主站首页「整页拖拽」互补——这里落点在输入框本体，各站零改动即获此能力。
  const dragEnabled = Boolean(onAttachFiles) && !disabled;
  function hasFiles(e: ReactDragEvent) {
    return Array.from(e.dataTransfer?.types || []).includes("Files");
  }
  function onDragEnter(e: ReactDragEvent) {
    if (!dragEnabled || !hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragOver(true);
  }
  function onDragOver(e: ReactDragEvent) {
    if (!dragEnabled || !hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }
  function onDragLeave(e: ReactDragEvent) {
    if (!dragEnabled) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  }
  function onDrop(e: ReactDragEvent) {
    if (!dragEnabled || !hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    emitFiles(e.dataTransfer?.files || null);
  }

  if (onMeetingRecording && meetingOpen) {
    return (
      <div className={className}>
        <MeetingRecorderCard
          maxSec={meetingRecordingMaxSec}
          onClose={() => setMeetingOpen(false)}
          onDone={(file) => {
            setMeetingOpen(false);
            onMeetingRecording(file);
          }}
        />
      </div>
    );
  }

  return (
    <div
      onDragEnter={dragEnabled ? onDragEnter : undefined}
      onDragOver={dragEnabled ? onDragOver : undefined}
      onDragLeave={dragEnabled ? onDragLeave : undefined}
      onDrop={dragEnabled ? onDrop : undefined}
      className={`relative rounded-2xl border bg-white shadow-sm transition-all duration-200 focus-within:border-neutral-300 focus-within:shadow-md ${
        dragOver ? "border-indigo-400 ring-2 ring-indigo-200" : "border-neutral-200"
      } ${className}`}
    >
      {/* 拖拽落区提示（覆盖整张卡片）——传了 onAttachFiles 才可能出现。 */}
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-indigo-400 bg-indigo-50/85 text-indigo-600">
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M12 16V4m0 0l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" />
          </svg>
          <span className="text-[13px] font-medium">{tt("松开即可上传文件")}</span>
        </div>
      )}
      <textarea
        ref={ref}
        data-ai-assistant-target={leoSuggest ? "" : undefined}
        className="w-full resize-none rounded-t-2xl border-0 bg-transparent px-5 pb-2 pt-5 text-[15px] leading-relaxed text-neutral-800 outline-none placeholder:text-neutral-400"
        rows={rows}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onInput={autogrow}
        placeholder={placeholderText}
        onKeyDown={handleKeyDown}
      />

      {/* 附件缩略条（上传中转圈 / 可删除） */}
      {attachments && attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-1">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="group relative flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-1 py-1 pr-2 text-[11px] text-neutral-600 shadow-sm"
            >
              {a.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.previewUrl}
                  alt={a.name || ""}
                  className="h-9 w-9 rounded-md object-cover"
                />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-neutral-100">
                  <FileGlyph />
                </span>
              )}
              <span className="max-w-[120px] truncate">{a.name || tt("附件")}</span>
              {a.uploading && <span className="v-spinner text-[10px] text-neutral-400" />}
              {onRemoveAttachment && !a.uploading && (
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(a.id)}
                  aria-label={tt("移除")}
                  className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between px-4 pb-3.5">
        <div className="flex flex-wrap items-center gap-2">
          {hasAttachMenu && (
            <AttachMenu
              onAttachFiles={onAttachFiles}
              openFilePicker={() => fileRef.current?.click()}
              recentFiles={recentFiles}
              onPickRecent={onPickRecent}
              recentLoading={recentLoading}
              extra={attachMenuExtra}
            />
          )}
          {leftSlot}
          {leoSuggest && (
            <button
              type="button"
              onClick={handleLeoSuggest}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] text-neutral-600 transition-all duration-200 hover:bg-neutral-100 active:scale-95"
              title={tt("让 leo 帮你处理这段内容（扩充 / 精简 / 总结 / 解释 / 翻译…）")}
            >
              <Sparkle />
              leo
            </button>
          )}
          {inlineSlot}
        </div>

        <div className="flex items-center gap-1.5">
          {onMeetingRecording && (
            <button
              type="button"
              onClick={() => setMeetingOpen(true)}
              disabled={disabled}
              aria-label={tt("会议录音纪要")}
              title={tt("会议录音纪要")}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] text-neutral-400 transition-all duration-150 hover:bg-neutral-100 hover:text-neutral-700 active:scale-95"
            >
              <MeetingGlyph />
            </button>
          )}
          {onVoiceTranscript && (
            <VoiceButton lang={voiceLang} onTranscript={onVoiceTranscript} disabled={disabled} />
          )}
          {onSubmit && (
            <button
              type="button"
              onClick={() => canSend && onSubmit()}
              disabled={!canSend}
              aria-label={tt("发送")}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-all duration-200 ${
                canSend
                  ? "bg-neutral-900 hover:scale-105 hover:bg-neutral-800 active:scale-95"
                  : "cursor-not-allowed bg-neutral-300"
              }`}
            >
              {loading ? <span className="v-spinner text-[12px]" /> : <ArrowUp />}
            </button>
          )}
        </div>
      </div>

      {/* 隐藏的本地文件选择 input（「从本地添加文件」点它） */}
      {onAttachFiles && (
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            emitFiles(e.target.files);
            e.target.value = "";
          }}
        />
      )}
    </div>
  );
}

// --- 「＋」附件菜单 ---------------------------------------------------------
function AttachMenu({
  onAttachFiles,
  openFilePicker,
  recentFiles,
  onPickRecent,
  recentLoading,
  extra,
}: {
  onAttachFiles?: (files: File[]) => void;
  openFilePicker: () => void;
  recentFiles?: ComposerRecentFile[];
  onPickRecent?: (f: ComposerRecentFile) => void;
  recentLoading: boolean;
  extra?: ComposerMenuItem[];
}) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setRecentOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const showRecent = Boolean(recentFiles && onPickRecent);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={tt("添加附件")}
        aria-expanded={open}
        className={`flex h-7 w-7 items-center justify-center rounded-full border transition-all duration-150 active:scale-95 ${
          open
            ? "border-neutral-300 bg-neutral-100 text-neutral-800"
            : "border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-700"
        }`}
      >
        <PlusGlyph />
      </button>

      {open && (
        <div className="v-fade-up absolute bottom-9 left-0 z-50 min-w-[208px] rounded-xl border border-neutral-200 bg-white py-1.5 shadow-lg">
          {onAttachFiles && (
            <MenuRow
              icon={<PaperclipGlyph />}
              label={tt("从本地添加文件")}
              onClick={() => {
                setOpen(false);
                setRecentOpen(false);
                openFilePicker();
              }}
            />
          )}

          {showRecent && (
            <div
              className="relative"
              onMouseEnter={() => setRecentOpen(true)}
              onMouseLeave={() => setRecentOpen(false)}
            >
              <MenuRow
                icon={<DocGlyph />}
                label={tt("最近文件")}
                chevron
                onClick={() => setRecentOpen((v) => !v)}
              />
              {recentOpen && (
                <div className="absolute bottom-0 left-full z-50 ml-1 max-h-[260px] min-w-[240px] overflow-y-auto rounded-xl border border-neutral-200 bg-white py-1.5 shadow-lg">
                  {recentLoading ? (
                    <p className="px-3 py-2 text-[12px] text-neutral-400">{tt("加载中…")}</p>
                  ) : (recentFiles || []).length === 0 ? (
                    <p className="px-3 py-2 text-[12px] text-neutral-400">{tt("还没有最近文件")}</p>
                  ) : (
                    (recentFiles || []).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          onPickRecent?.(f);
                          setOpen(false);
                          setRecentOpen(false);
                        }}
                        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-neutral-700 transition hover:bg-neutral-100"
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded bg-neutral-100">
                          {f.previewUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={f.previewUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <MediaGlyph mediaType={f.mediaType} />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {(extra || []).map((item) => (
            <MenuRow
              key={item.id}
              icon={item.icon ?? <SkillGlyph />}
              label={item.label}
              chevron
              onClick={() => {
                setOpen(false);
                setRecentOpen(false);
                item.onClick();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MenuRow({
  icon,
  label,
  chevron,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  chevron?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-neutral-700 transition hover:bg-neutral-100"
    >
      <span className="shrink-0 text-neutral-500">{icon}</span>
      <span className="flex-1">{label}</span>
      {chevron && <ChevronRightGlyph />}
    </button>
  );
}

// --- 语音输入键（Web Speech API） ------------------------------------------
function VoiceButton({
  lang,
  onTranscript,
  disabled,
}: {
  lang: string;
  onTranscript: (text: string) => void;
  disabled: boolean;
}) {
  const tt = useUI();
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (e: any) => {
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      }
      if (finalText.trim()) onTranscript(finalText);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    return () => {
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  if (!supported) return null;

  function toggle() {
    const rec = recRef.current;
    if (!rec) return;
    if (listening) {
      try {
        rec.stop();
      } catch {
        /* noop */
      }
      setListening(false);
    } else {
      try {
        rec.start();
        setListening(true);
      } catch {
        /* already started */
      }
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-label={listening ? tt("停止语音输入") : tt("语音输入")}
      aria-pressed={listening}
      title={tt("语音输入")}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-150 active:scale-95 ${
        listening
          ? "bg-rose-100 text-rose-600"
          : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
      }`}
    >
      {listening && (
        <span className="absolute h-8 w-8 animate-ping rounded-full bg-rose-300/40" />
      )}
      <MicGlyph />
    </button>
  );
}

// --- 会议录音纪要卡片（getUserMedia + MediaRecorder） ----------------------
// 录制策略（对照阿里云 paraformer-v2 文件转写支持的格式列表，已查 upstream 文档）：
//   - 桌面 Chrome/Edge/Firefox：audio/webm;codecs=opus（受支持）。
//   - iOS/部分 Safari：webm 不被支持，回落 audio/mp4 / audio/aac（受支持）。
//   - 全部失败：交给浏览器默认（不传 mimeType），仍能录，文件名后缀按实际 mime 推断。
const MEETING_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
  "audio/ogg;codecs=opus",
];

function pickRecorderMime(): string {
  if (typeof window === "undefined" || typeof (window as any).MediaRecorder === "undefined") {
    return "";
  }
  const MR = (window as any).MediaRecorder;
  if (typeof MR.isTypeSupported !== "function") return "";
  for (const m of MEETING_MIME_CANDIDATES) {
    try {
      if (MR.isTypeSupported(m)) return m;
    } catch {
      /* noop */
    }
  }
  return "";
}

function extForMime(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("aac")) return "aac";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
}

function MeetingRecorderCard({
  maxSec,
  onClose,
  onDone,
}: {
  maxSec: number;
  onClose: () => void;
  onDone: (file: File) => void;
}) {
  const tt = useUI();
  const [phase, setPhase] = useState<"idle" | "recording" | "saving">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeRef = useRef<string>("");
  // 录音停止后是否要把成品交回去（放弃时置 false，stop 的 onstop 据此决定）。
  const emitRef = useRef<boolean>(true);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function" ||
      typeof (window as any).MediaRecorder === "undefined"
    ) {
      setError(tt("当前浏览器不支持录音，请用最新版 Chrome / Edge / Safari。"));
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(tt("没拿到麦克风权限。请在浏览器地址栏允许麦克风后重试。"));
      return;
    }
    streamRef.current = stream;
    const mime = pickRecorderMime();
    mimeRef.current = mime;
    chunksRef.current = [];
    emitRef.current = true;
    let rec: MediaRecorder;
    try {
      rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
    } catch {
      rec = new MediaRecorder(stream);
    }
    recRef.current = rec;
    rec.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      cleanup();
      const outMime = mimeRef.current || rec.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: outMime });
      chunksRef.current = [];
      if (!emitRef.current || blob.size === 0) {
        setPhase("idle");
        setElapsed(0);
        return;
      }
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const file = new File([blob], `meeting-${stamp}.${extForMime(outMime)}`, {
        type: outMime,
      });
      setPhase("saving");
      onDone(file);
    };
    rec.start(1000); // 每秒切片，长录音更稳。
    setPhase("recording");
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        if (next >= maxSec) {
          // 到上限自动停止（onstop 会回调）。
          try {
            recRef.current?.stop();
          } catch {
            /* noop */
          }
        }
        return next;
      });
    }, 1000);
  }, [cleanup, maxSec, onDone]);

  const stopAndEmit = useCallback(() => {
    emitRef.current = true;
    try {
      recRef.current?.stop();
    } catch {
      cleanup();
      setPhase("idle");
    }
  }, [cleanup]);

  const discard = useCallback(() => {
    if (phase === "recording") {
      emitRef.current = false;
      try {
        recRef.current?.stop();
      } catch {
        /* noop */
      }
    }
    cleanup();
    setElapsed(0);
    setPhase("idle");
    onClose();
  }, [phase, cleanup, onClose]);

  const recording = phase === "recording";
  const saving = phase === "saving";

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white px-5 pb-4 pt-4 shadow-sm">
      <div className="mb-3 flex items-center justify-end">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-neutral-500">
          <MeetingGlyph />
          {tt("会议录音纪要")}
        </span>
      </div>

      <div className="border-t border-dashed border-neutral-200 pt-4">
        <p className="min-h-[40px] text-[14px] leading-relaxed text-neutral-500">
          {error ? (
            <span className="text-rose-600">{error}</span>
          ) : recording ? (
            tt("正在录音… 结束后将自动转写并生成会议纪要。")
          ) : saving ? (
            tt("录音已结束，正在上传并转写…")
          ) : (
            tt("录音结束后将自动转写并整理成会议纪要。")
          )}
        </p>

        <div className="mt-3 flex items-center justify-between">
          <span className="font-mono text-[13px] tabular-nums text-neutral-400">
            {recording && (
              <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-rose-500 align-middle" />
            )}
            {fmtClock(elapsed)} / {fmtClock(maxSec)}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={discard}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-full border border-neutral-200 px-4 py-2 text-[13px] font-medium text-neutral-700 transition hover:bg-neutral-50 active:scale-95 disabled:opacity-50"
            >
              <TrashGlyph />
              {tt("放弃")}
            </button>
            {recording ? (
              <button
                type="button"
                onClick={stopAndEmit}
                className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800 active:scale-95"
              >
                <StopGlyph />
                {tt("停止")}
              </button>
            ) : (
              <button
                type="button"
                onClick={start}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800 active:scale-95 disabled:opacity-50"
              >
                {saving ? <span className="v-spinner text-[12px]" /> : <RecordGlyph />}
                {saving ? tt("处理中") : tt("开始")}
              </button>
            )}
          </div>
        </div>

        <p className="mt-3 text-[12px] leading-relaxed text-neutral-400">
          {tt("开始录音即代表你已获得在场各方的录音同意。")}
        </p>
      </div>
    </div>
  );
}

function ArrowUp() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Sparkle() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
      <defs>
        <linearGradient id="leo-composer-sparkle-g" x1="0" y1="0" x2="24" y2="24">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>
      </defs>
      <path
        d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z"
        fill="url(#leo-composer-sparkle-g)"
      />
      <path
        d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9L18 14z"
        fill="url(#leo-composer-sparkle-g)"
        opacity="0.65"
      />
    </svg>
  );
}

function PlusGlyph() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function MicGlyph() {
  return (
    <svg className="relative h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0014 0M12 18v3" strokeLinecap="round" />
    </svg>
  );
}

function MeetingGlyph() {
  // 麦克风 + 声波，区别于「语音输入」的纯麦克风，表达「整段会议录音」。
  return (
    <svg className="h-[17px] w-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="9" y="2.5" width="6" height="10" rx="3" />
      <path d="M6 10.5a6 6 0 0012 0M12 16.5v3" strokeLinecap="round" />
      <path d="M3 9v3M21 9v3" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

function RecordGlyph() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="7" />
    </svg>
  );
}

function StopGlyph() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function TrashGlyph() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PaperclipGlyph() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        d="M21 11.5l-8.5 8.5a5 5 0 01-7-7l8.5-8.5a3 3 0 014 4l-8.5 8.5a1 1 0 01-1.5-1.5l7.8-7.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DocGlyph() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M14 3v4h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SkillGlyph() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 7.7l5.4-.8z" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightGlyph() {
  return (
    <svg className="h-4 w-4 shrink-0 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FileGlyph() {
  return (
    <svg className="h-4 w-4 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M14 3v4h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MediaGlyph({ mediaType }: { mediaType?: string }) {
  if (mediaType === "image") {
    return (
      <svg className="h-3.5 w-3.5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg className="h-3.5 w-3.5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M14 3v4h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
