"use client";

// ============================================================================
// @oceanleo/ui — 标准「输入卡片 InputCard」（单一事实源）
// ----------------------------------------------------------------------------
// 操作员 2026-06-17 把 image.oceanleo.com 的「① 输入」卡片定为全家桶规范：
//   ┌─ ①  输入 ───────────────────────────────  ⌄ ─┐
//   │  ┌────────────────────────────────────────┐  │
//   │  │ 描述你想要的…（可输入文字，或上传/拖拽  │  │ ← LeoComposer（带 leo 建议）
//   │  │ 文件做参考；也可从右侧素材库 / 我的数据  │  │
//   │  │ 库直接拖过来）                          │  │
//   │  │                              ✨ leo 建议 │  │
//   │  └────────────────────────────────────────┘  │
//   │  ┌────────────────────────────────────────┐  │
//   │  │            🖼  上传文件（可多选）        │  │ ← 上传按钮（虚线框，可多选）
//   │  └────────────────────────────────────────┘  │
//   └────────────────────────────────────────────────┘
//
// 这是「文字 + 参考文件」二合一的统一入口：用户既能一句话直接成稿，也能上传 /
// 拖入文档、链接、图片做参考——一个卡片承载所有输入方式，不再用多块互斥的
// 「创建方式」tile（那会造成逻辑冗余）。各站只需：
//   - 传 value / onChange / onSubmit 接业务；
//   - 传 accept / multiple 决定能上传什么；
//   - onFiles 收到用户选/拖进来的文件（业务自己上传 + 预览）；
//   - attachments 把已选附件回传进来渲染缩略条（业务持有状态，本组件只展示）。
//
// 它内部复用 StudioSection（序号徽章 + 可折叠）与 LeoComposer（标准输入框 +
// leo 建议）——改这两个组件，所有 InputCard 一起对齐。
// ============================================================================

import { type ReactNode, useRef, useState } from "react";
import { LeoComposer } from "./LeoComposer";
import { StudioSection } from "./StudioSection";

/** 已选附件（业务上传后回传进来渲染缩略条；本组件不负责上传）。 */
export interface InputAttachment {
  id: string;
  /** 缩略图 / 预览 url（图片类）；非图片可不传，落到文件名展示。 */
  previewUrl?: string;
  /** 文件名（链接类可放 url）。 */
  name?: string;
  /** 仍在上传中：缩略条上显示转圈。 */
  uploading?: boolean;
}

export interface InputCardProps {
  value: string;
  onChange: (value: string) => void;
  /** 回车 / 点发送 / 点底部主按钮触发。 */
  onSubmit?: () => void;
  placeholder?: string;
  /** 提交中：发送键 + 主按钮转圈禁用。 */
  loading?: boolean;

  // --- 序号 / 标题 / 折叠（透传给 StudioSection；不传 open 时卡片常展开） ---
  index?: number;
  title?: string;
  accent?: string;
  /** 受控折叠：传了 open + onToggle 就可折叠；不传则常展开（无折叠头）。 */
  open?: boolean;
  onToggle?: () => void;
  /** 折叠态头部右侧概要；不传则用「已填写 / 未填写」。 */
  summary?: ReactNode;

  // --- 上传 / 拖拽 ---
  /** 允许上传时传 onFiles（收到用户选/拖进来的文件）。不传则不显示上传按钮。 */
  onFiles?: (files: File[]) => void;
  /** input accept，如 "image/*" / ".docx,.pdf,.md,.txt"。默认任意。 */
  accept?: string;
  /** 是否可多选，默认 true。 */
  multiple?: boolean;
  /** 上传按钮文案，默认「上传文件（可多选）」。 */
  uploadLabel?: string;
  /** 已选附件缩略条（业务持有状态传入）。 */
  attachments?: InputAttachment[];
  /** 点缩略条上的删除。 */
  onRemoveAttachment?: (id: string) => void;

  /** 输入框下方、上传按钮上方的自定义插槽（如链接输入、风格 chips）。 */
  belowComposer?: ReactNode;
  /** 底部主行动按钮文案；不传则不渲染（靠输入框右下发送键提交）。 */
  submitLabel?: string;
  /** 主按钮禁用判定覆盖（默认：value 为空且无附件即禁用）。 */
  submitDisabled?: boolean;
}

export function InputCard({
  value,
  onChange,
  onSubmit,
  placeholder = "描述你想要的内容，可输入文字，或上传 / 拖拽文件做参考（也可从右侧素材库 / 我的数据库直接拖过来）",
  loading = false,
  index,
  title = "输入",
  accent = "#4f46e5",
  open,
  onToggle,
  summary,
  onFiles,
  accept,
  multiple = true,
  uploadLabel = "上传文件（可多选）",
  attachments,
  onRemoveAttachment,
  belowComposer,
  submitLabel,
  submitDisabled,
  }: InputCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const hasContent = Boolean(value.trim()) || (attachments?.length ?? 0) > 0;
  const disableSubmit = submitDisabled ?? (!hasContent || loading);

  function emitFiles(list: FileList | null) {
    if (!list || !onFiles) return;
    const files = Array.from(list);
    if (files.length) onFiles(files);
  }

  const body = (
    <div
      onDragOver={
        onFiles
          ? (e) => {
              e.preventDefault();
              setDragging(true);
            }
          : undefined
      }
      onDragLeave={onFiles ? () => setDragging(false) : undefined}
      onDrop={
        onFiles
          ? (e) => {
              e.preventDefault();
              setDragging(false);
              emitFiles(e.dataTransfer.files);
            }
          : undefined
      }
      className="space-y-3"
    >
      <LeoComposer
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        leoSuggest
        loading={loading}
        placeholder={placeholder}
        className={dragging ? "border-dashed" : ""}
      />

      {attachments && attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="group relative flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-1 py-1 pr-2 text-[11px] text-stone-600 shadow-sm"
            >
              {a.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.previewUrl}
                  alt={a.name || ""}
                  className="h-9 w-9 rounded-md object-cover"
                />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-stone-100">
                  <FileGlyph />
                </span>
              )}
              <span className="max-w-[120px] truncate">{a.name || "附件"}</span>
              {a.uploading && <span className="v-spinner text-[10px] text-stone-400" />}
              {onRemoveAttachment && (
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(a.id)}
                  aria-label="移除"
                  className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {belowComposer}

      {onFiles && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={`flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-3 text-[13px] font-medium transition-colors ${
            dragging
              ? "border-stone-400 bg-stone-50 text-stone-700"
              : "border-stone-300 text-stone-600 hover:border-stone-400 hover:bg-stone-50"
          }`}
        >
          <ImageGlyph />
          {uploadLabel}
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
        </button>
      )}

      {submitLabel && onSubmit && (
        <button
          type="button"
          onClick={() => !disableSubmit && onSubmit()}
          disabled={disableSubmit}
          className="w-full rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: accent }}
        >
          {loading ? <span className="v-spinner" /> : submitLabel}
        </button>
      )}
    </div>
  );

  // 折叠模式：包进 StudioSection（带序号徽章 + 折叠头）。
  if (open != null && onToggle) {
    return (
      <StudioSection
        index={index}
        title={title}
        accent={accent}
        open={open}
        onToggle={onToggle}
        summary={summary ?? (hasContent ? "已填写" : "未填写")}
      >
        {body}
      </StudioSection>
    );
  }

  // 常展开模式：带序号徽章的标题 + 内容（无折叠头）。
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white/80 p-4 shadow-sm">
      {(index != null || title) && (
        <div className="mb-3 flex items-center gap-2.5">
          {index != null && (
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold text-white"
              style={{ background: accent }}
            >
              {index}
            </span>
          )}
          <span className="text-sm font-semibold text-stone-800">{title}</span>
        </div>
      )}
      {body}
    </section>
  );
}

function ImageGlyph() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FileGlyph() {
  return (
    <svg className="h-4 w-4 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M14 3v4h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
