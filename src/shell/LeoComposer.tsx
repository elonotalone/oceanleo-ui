"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { openLeoAssistant } from "./LeoAssistant";

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
// 与主站的历史差异：主站左下角原是「对话 / Agent / 设计」三件套；2026-06-26 起主站
// 改为「自动」（去掉手动 chat/agent 切换，后端按输入自动判断），设计开关并入 quick
// pill，故主站不再传 leftSlot 的三件套。其余站当输入框「与 AI 生成有关」时，左下角
// 放一个「leo 建议」按钮。
//
// 因此本组件参数化：
//   - leftSlot：左下角自定义控制区（保留，向后兼容）。
//   - leoSuggest：true 时在左下角渲染「leo 建议」按钮。
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
  /** 是否显示「leo 建议」按钮（仅与 AI 生成有关的输入框传 true） */
  leoSuggest?: boolean;
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
}

export function LeoComposer({
  value,
  onChange,
  onSubmit,
  placeholder = "给 OceanLeo 布置一个任务...",
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
}: LeoComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  return (
    <div
      className={`rounded-2xl border border-neutral-200 bg-white shadow-sm transition-all duration-200 focus-within:border-neutral-300 focus-within:shadow-md ${className}`}
    >
      <textarea
        ref={ref}
        data-ai-assistant-target={leoSuggest ? "" : undefined}
        className="w-full resize-none rounded-t-2xl border-0 bg-transparent px-5 pb-2 pt-5 text-[15px] leading-relaxed text-neutral-800 outline-none placeholder:text-neutral-400"
        rows={rows}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onInput={autogrow}
        placeholder={placeholder}
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
              <span className="max-w-[120px] truncate">{a.name || "附件"}</span>
              {a.uploading && <span className="v-spinner text-[10px] text-neutral-400" />}
              {onRemoveAttachment && !a.uploading && (
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(a.id)}
                  aria-label="移除"
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
              title="让 leo 帮你补充 / 整理这段内容"
            >
              <Sparkle />
              leo 建议
            </button>
          )}
          {inlineSlot}
        </div>

        <div className="flex items-center gap-1.5">
          {onVoiceTranscript && (
            <VoiceButton lang={voiceLang} onTranscript={onVoiceTranscript} disabled={disabled} />
          )}
          {onSubmit && (
            <button
              type="button"
              onClick={() => canSend && onSubmit()}
              disabled={!canSend}
              aria-label="发送"
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
        aria-label="添加附件"
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
              label="从本地添加文件"
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
                label="最近文件"
                chevron
                onClick={() => setRecentOpen((v) => !v)}
              />
              {recentOpen && (
                <div className="absolute bottom-0 left-full z-50 ml-1 max-h-[260px] min-w-[240px] overflow-y-auto rounded-xl border border-neutral-200 bg-white py-1.5 shadow-lg">
                  {recentLoading ? (
                    <p className="px-3 py-2 text-[12px] text-neutral-400">加载中…</p>
                  ) : (recentFiles || []).length === 0 ? (
                    <p className="px-3 py-2 text-[12px] text-neutral-400">还没有最近文件</p>
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
      aria-label={listening ? "停止语音输入" : "语音输入"}
      aria-pressed={listening}
      title="语音输入"
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
      <path
        d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z"
        fill="currentColor"
      />
      <path d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9L18 14z" fill="currentColor" opacity="0.6" />
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
