"use client";

/**
 * 签名（D4）：手写或打字生成签名图片；存在本机（按用户 id 分开），下次一点就放。
 * 放到当前页中央，成为一条图章批注，之后可拖动、缩放、删除。
 */
import { useEffect, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { getUserId } from "../../lib/auth/client";
import {
  readPdfSignatures,
  removePdfSignature,
  savePdfSignature,
  type PdfSavedSignature,
} from "./pdf-signature-store";

const PAD_WIDTH = 480;
const PAD_HEIGHT = 160;
const SCRIPT_FONT = '"Snell Roundhand", "Segoe Script", "Brush Script MT", "STKaiti", "KaiTi", cursive';

/** 把画板裁到笔迹的外框，导出透明底 PNG。 */
function trimmedPng(canvas: HTMLCanvasElement): { dataUrl: string; width: number; height: number } | null {
  const context = canvas.getContext("2d");
  if (!context) return null;
  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, width, height).data;
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null;
  const pad = 6;
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  const w = Math.min(width, right + pad) - left;
  const h = Math.min(height, bottom + pad) - top;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")?.drawImage(canvas, left, top, w, h, 0, 0, w, h);
  return { dataUrl: out.toDataURL("image/png"), width: w, height: h };
}

export function PdfSignatureDialog({
  onPlace,
  onClose,
}: {
  onPlace: (signature: PdfSavedSignature) => Promise<void> | void;
  onClose: () => void;
}) {
  const tt = useUI();
  const [userId, setUserId] = useState("");
  const [saved, setSaved] = useState<PdfSavedSignature[]>([]);
  const [tab, setTab] = useState<"draw" | "type">("draw");
  const [typed, setTyped] = useState("");
  const [inked, setInked] = useState(false);
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let alive = true;
    void getUserId().then((id) => {
      if (!alive) return;
      setUserId(id || "");
      setSaved(readPdfSignatures(id || ""));
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setInked(false);
    if (tab === "type" && typed.trim()) {
      context.fillStyle = "#111827";
      context.font = `56px ${SCRIPT_FONT}`;
      context.textBaseline = "middle";
      context.textAlign = "center";
      context.fillText(typed.trim(), canvas.width / 2, canvas.height / 2, canvas.width - 24);
      setInked(true);
    }
  }, [tab, typed]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * PAD_WIDTH,
      y: ((event.clientY - box.top) / box.height) * PAD_HEIGHT,
    };
  };

  const use = async (signature: PdfSavedSignature) => {
    setError("");
    try {
      await onPlace(signature);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tt("签名没有放上去。"));
    }
  };

  const create = async () => {
    const canvas = canvasRef.current;
    const image = canvas ? trimmedPng(canvas) : null;
    if (!image) {
      setError(tt("先写下或输入签名。"));
      return;
    }
    try {
      const entry = savePdfSignature(userId, image);
      setSaved(readPdfSignatures(userId));
      await use(entry);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tt("签名没有存下来。"));
    }
  };

  return (
    <div
      className="absolute inset-0 z-20 grid place-items-center bg-black/30"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tt("签名")}
        data-pdf-signature-dialog=""
        onKeyDown={(event) => event.key === "Escape" && onClose()}
        className="w-[528px] max-w-[94%] rounded-2xl border border-[var(--awb-border)] bg-[var(--awb-popover-bg)] p-4 text-[var(--awb-text)] shadow-[var(--awb-shadow-floating)]"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold">{tt("签名")}</h2>
          <div role="tablist" className="flex gap-1 rounded-lg bg-[var(--awb-hover)] p-0.5 text-[12px]">
            {(["draw", "type"] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`rounded-md px-3 py-1 ${tab === key ? "bg-[var(--awb-chrome-bg)] font-semibold shadow-sm" : "text-[var(--awb-muted)]"}`}
              >
                {key === "draw" ? tt("手写") : tt("打字")}
              </button>
            ))}
          </div>
        </div>
        {tab === "type" ? (
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value.slice(0, 40))}
            placeholder={tt("输入你的名字")}
            aria-label={tt("输入你的名字")}
            autoFocus
            className="mb-2 h-11 w-full rounded-lg border border-[var(--awb-border)] bg-[var(--awb-chrome-bg)] px-3 text-[13px] outline-none"
          />
        ) : null}
        {/* 签名板是白纸：签名本身是黑色墨迹，最后放在白色的 PDF 页面上。 */}
        <canvas
          ref={canvasRef}
          width={PAD_WIDTH}
          height={PAD_HEIGHT}
          aria-label={tt("在这里手写签名")}
          className="w-full touch-none rounded-xl border border-dashed border-[var(--awb-border)] bg-white"
          onPointerDown={(event) => {
            if (tab !== "draw") return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drawing.current = point(event);
          }}
          onPointerMove={(event) => {
            const from = drawing.current;
            const context = canvasRef.current?.getContext("2d");
            if (!from || !context) return;
            const to = point(event);
            context.strokeStyle = "#111827";
            context.lineWidth = 3;
            context.lineCap = "round";
            context.lineJoin = "round";
            context.beginPath();
            context.moveTo(from.x, from.y);
            context.lineTo(to.x, to.y);
            context.stroke();
            drawing.current = to;
            setInked(true);
          }}
          onPointerUp={() => {
            drawing.current = null;
          }}
        />
        {error ? <p role="alert" className="mt-2 text-[12px] text-[var(--awb-danger)]">{error}</p> : null}
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setTyped("");
              const canvas = canvasRef.current;
              canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
              setInked(false);
            }}
            className="rounded-lg px-3 py-1.5 text-[12px] text-[var(--awb-muted)] hover:bg-[var(--awb-hover)]"
          >
            {tt("清除")}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-[12px] hover:bg-[var(--awb-hover)]"
            >
              {tt("取消")}
            </button>
            <button
              type="button"
              disabled={!inked}
              onClick={() => void create()}
              className="rounded-lg bg-[var(--awb-accent)] px-3 py-1.5 text-[12px] font-semibold text-[var(--awb-on-accent)] disabled:opacity-40"
            >
              {tt("存下并放到页面")}
            </button>
          </div>
        </div>
        {saved.length ? (
          <div className="mt-4 border-t border-[var(--awb-border)] pt-3">
            <p className="mb-2 text-[12px] text-[var(--awb-muted)]">{tt("存过的签名（点一下放到页面）")}</p>
            <div className="grid grid-cols-3 gap-2">
              {saved.map((signature) => (
                <div key={signature.id} className="group relative">
                  <button
                    type="button"
                    data-pdf-saved-signature=""
                    onClick={() => void use(signature)}
                    aria-label={tt("放这个签名")}
                    className="grid h-16 w-full place-items-center rounded-lg border border-[var(--awb-border)] bg-white p-1 hover:ring-2 hover:ring-[var(--awb-accent)]"
                  >
                    <img src={signature.dataUrl} alt="" className="max-h-full max-w-full object-contain" />
                  </button>
                  <button
                    type="button"
                    aria-label={tt("删除这个签名")}
                    onClick={() => {
                      removePdfSignature(userId, signature.id);
                      setSaved(readPdfSignatures(userId));
                    }}
                    className="absolute -right-3 -top-3 hidden h-11 w-11 place-items-center group-hover:grid group-focus-within:grid"
                  >
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--awb-popover-bg)] text-[11px] text-[var(--awb-danger)] shadow ring-1 ring-[var(--awb-border)]">
                      ×
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
