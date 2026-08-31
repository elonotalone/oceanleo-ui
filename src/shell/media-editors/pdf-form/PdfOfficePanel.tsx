"use client";

import { useCallback, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { PDF_READER_LAYOUT } from "../pdf-workbench-utils";
import { PDF_FORM_NO_FIELDS_HINT } from "./acroform";
import type { PdfOfficeWorkbenchState } from "./types";
import { SIGNATURE_IMAGE_LABEL } from "./signature";

function SignatureSketchPad({
  disabled,
  onSave,
}: {
  disabled: boolean;
  onSave: (pngBytes: Uint8Array) => void;
}) {
  const tt = useUI();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const save = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      void blob.arrayBuffer().then((buffer) => {
        onSave(new Uint8Array(buffer));
        clear();
      });
    }, "image/png");
  }, [clear, onSave]);

  return (
    <div className="space-y-1.5">
      <canvas
        ref={canvasRef}
        width={280}
        height={96}
        aria-label={tt("手写签名画板")}
        className="w-full rounded-lg border border-[var(--border,#e7e5e4)] bg-white touch-none"
        style={{ minHeight: `${PDF_READER_LAYOUT.minimumHitTarget}px` }}
        onPointerDown={(event) => {
          if (disabled) return;
          drawing.current = true;
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          last.current = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          };
          canvas.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext("2d");
          if (!canvas || !ctx || !last.current) return;
          const rect = canvas.getBoundingClientRect();
          const point = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          };
          ctx.strokeStyle = "#111";
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(last.current.x, last.current.y);
          ctx.lineTo(point.x, point.y);
          ctx.stroke();
          last.current = point;
        }}
        onPointerUp={() => {
          drawing.current = false;
          last.current = null;
        }}
      />
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={save}
          className="rounded-lg border px-2 py-1 text-[10px] disabled:opacity-40"
        >
          {tt("保存为常用图像签章")}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={clear}
          className="rounded-lg border px-2 py-1 text-[10px] disabled:opacity-40"
        >
          {tt("清空画板")}
        </button>
      </div>
    </div>
  );
}

export function PdfOfficePanel({
  editor,
}: {
  editor: PdfOfficeWorkbenchState;
}) {
  const tt = useUI();
  const busy = editor.loading || editor.processing || editor.saving;
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const [signatureLabel, setSignatureLabel] = useState(SIGNATURE_IMAGE_LABEL);

  const pageMarks = editor.redactionMarks.filter(
    (mark) => mark.pageIndex === editor.pageNumber - 1,
  );

  return (
    <div className="space-y-3 border-t border-[var(--border,#e7e5e4)] pt-3">
      <section className="space-y-2" data-pdf-form-panel>
        <p className="text-[11px] font-semibold text-[var(--fg,#292524)]">
          {tt("表单填写")}
        </p>
        {!editor.formHasFields ? (
          <p className="text-[10px] leading-relaxed text-[var(--muted,#78716c)]">
            {tt(PDF_FORM_NO_FIELDS_HINT)}
          </p>
        ) : (
          <>
            <ul className="max-h-40 space-y-2 overflow-y-auto">
              {editor.formFields.map((field) => (
                <li key={field.name} className="space-y-0.5">
                  <label className="block text-[10px] font-medium text-[var(--fg,#292524)]">
                    {field.name}
                    {field.required ? " *" : ""}
                    <span className="ml-1 font-normal text-[var(--muted,#78716c)]">
                      ({field.kind})
                    </span>
                  </label>
                  {field.kind === "checkbox" ? (
                    <input
                      type="checkbox"
                      checked={editor.formValues[field.name] === true}
                      disabled={busy || field.readOnly}
                      onChange={(event) =>
                        editor.setFormValue(field.name, event.target.checked)
                      }
                    />
                  ) : field.kind === "dropdown" || field.kind === "radio" ? (
                    <select
                      value={String(editor.formValues[field.name] ?? "")}
                      disabled={busy || field.readOnly}
                      onChange={(event) =>
                        editor.setFormValue(field.name, event.target.value)
                      }
                      className="w-full rounded-lg border px-2 py-1 text-[10px]"
                    >
                      <option value="">{tt("未选择")}</option>
                      {field.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : field.kind === "option-list" ? (
                    <select
                      multiple
                      value={
                        Array.isArray(editor.formValues[field.name])
                          ? (editor.formValues[field.name] as string[])
                          : []
                      }
                      disabled={busy || field.readOnly}
                      onChange={(event) =>
                        editor.setFormValue(
                          field.name,
                          Array.from(event.target.selectedOptions).map(
                            (option) => option.value,
                          ),
                        )
                      }
                      className="w-full rounded-lg border px-2 py-1 text-[10px]"
                    >
                      {field.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : field.kind === "signature" ? (
                    <p className="text-[10px] text-[var(--muted,#78716c)]">
                      {tt("PDF 签名字段（只读，本编辑器不做 PKI 签名）")}
                    </p>
                  ) : field.multiline ? (
                    <textarea
                      rows={2}
                      value={String(editor.formValues[field.name] ?? "")}
                      disabled={busy || field.readOnly}
                      maxLength={field.maxLength ?? undefined}
                      onChange={(event) =>
                        editor.setFormValue(field.name, event.target.value)
                      }
                      className="w-full rounded-lg border px-2 py-1 text-[10px]"
                    />
                  ) : (
                    <input
                      type="text"
                      value={String(editor.formValues[field.name] ?? "")}
                      disabled={busy || field.readOnly}
                      maxLength={field.maxLength ?? undefined}
                      onChange={(event) =>
                        editor.setFormValue(field.name, event.target.value)
                      }
                      className="w-full rounded-lg border px-2 py-1 text-[10px]"
                    />
                  )}
                  {editor.formErrors[field.name] ? (
                    <p className="text-[10px] text-red-600">
                      {editor.formErrors[field.name]}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            <label className="flex items-center gap-1.5 text-[10px]">
              <input
                type="checkbox"
                checked={editor.formFlatten}
                disabled={busy}
                onChange={(event) => editor.setFormFlatten(event.target.checked)}
              />
              {tt("保存时扁平化定稿（字段将不可再编辑）")}
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void editor.applyFormFill()}
              className="w-full rounded-lg border px-2 py-1.5 text-[10px] font-medium disabled:opacity-40"
            >
              {tt("填写并保存到 PDF")}
            </button>
          </>
        )}
      </section>

      <section className="space-y-2 border-t border-[var(--border,#e7e5e4)] pt-3">
        <p className="text-[11px] font-semibold text-[var(--fg,#292524)]">
          {tt("图像签章")}
        </p>
        <p className="text-[10px] leading-relaxed text-[var(--muted,#78716c)]">
          {editor.signatureDisclaimer}
        </p>
        <input
          type="text"
          value={signatureLabel}
          disabled={busy}
          onChange={(event) => setSignatureLabel(event.target.value)}
          placeholder={tt("签章名称")}
          aria-label={tt("签章名称")}
          className="w-full rounded-lg border px-2 py-1 text-[10px]"
        />
        <SignatureSketchPad
          disabled={busy}
          onSave={(pngBytes) =>
            editor.saveSignatureFromPng(signatureLabel, pngBytes)
          }
        />
        <input
          ref={uploadRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void file.arrayBuffer().then((buffer) => {
              editor.saveSignatureFromPng(
                signatureLabel || file.name,
                new Uint8Array(buffer),
              );
            });
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => uploadRef.current?.click()}
          className="w-full rounded-lg border px-2 py-1 text-[10px] disabled:opacity-40"
        >
          {tt("上传 PNG/JPEG 图像签章")}
        </button>
        {editor.savedSignatures.length ? (
          <ul className="space-y-1">
            {editor.savedSignatures.map((entry) => (
              <li key={entry.id} className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={editor.pendingSignatureId === entry.id}
                  onClick={() => {
                    editor.setPendingSignatureId(entry.id);
                    editor.setOfficeTool("signature");
                  }}
                  className="min-w-0 flex-1 truncate rounded-lg border px-2 py-1 text-left text-[10px]"
                >
                  {entry.label}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => editor.removeSavedSignature(entry.id)}
                  className="rounded-lg border px-2 py-1 text-[10px] text-red-600"
                >
                  {tt("删除")}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {editor.officeTool === "signature" ? (
          <p className="text-[10px] text-[var(--muted,#78716c)]">
            {editor.signaturePlacementLabel}
          </p>
        ) : null}
        <button
          type="button"
          disabled={busy || editor.pageCount < 2 || !editor.pendingSignatureId}
          onClick={() => void editor.applyCrossPageSeal()}
          className="w-full rounded-lg border px-2 py-1 text-[10px] disabled:opacity-40"
        >
          {tt("添加骑缝图像签章（跨页）")}
        </button>
      </section>

      <section className="space-y-2 border-t border-[var(--border,#e7e5e4)] pt-3">
        <p className="text-[11px] font-semibold text-[var(--fg,#292524)]">
          {tt("涂黑")}
        </p>
        <p className="text-[10px] leading-relaxed text-[var(--muted,#78716c)]">
          {tt(
            "涂黑会永久删除区域内的底层文字，不是仅盖黑框。应用后无法撤销。",
          )}
        </p>
        <button
          type="button"
          disabled={busy}
          aria-pressed={editor.officeTool === "redaction"}
          onClick={() =>
            editor.setOfficeTool(
              editor.officeTool === "redaction" ? "none" : "redaction",
            )
          }
          className="w-full rounded-lg border px-2 py-1.5 text-[10px] disabled:opacity-40"
        >
          {editor.officeTool === "redaction"
            ? tt("正在标记涂黑区域（在页面上拖画）")
            : tt("标记涂黑区域")}
        </button>
        {pageMarks.length ? (
          <ul className="space-y-1">
            {pageMarks.map((mark, index) => (
              <li
                key={mark.id}
                className="flex items-center justify-between text-[10px]"
              >
                <span>
                  {tt("区域 {number}", { number: index + 1 })}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => editor.removeRedactionMark(mark.id)}
                  className="text-red-600"
                >
                  {tt("移除")}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          disabled={busy || !editor.redactionMarks.length}
          onClick={() => void editor.applyRedactions()}
          className="w-full rounded-lg border border-red-300 px-2 py-1.5 text-[10px] font-medium text-red-700 disabled:opacity-40"
        >
          {tt("应用涂黑（不可撤销）")}
        </button>
      </section>
    </div>
  );
}
