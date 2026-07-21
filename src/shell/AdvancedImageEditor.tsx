"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { saveCreations, uploadFile } from "../lib/database";
import { useUI } from "../i18n/ui/useUI";
import type { LibraryItem } from "./library-data";

export interface ImageEditSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: number;
  sepia: number;
  blur: number;
  opacity: number;
  radius: number;
  shadow: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  crop: "original" | "1:1" | "4:3" | "16:9" | "3:4" | "9:16";
  format: "image/png" | "image/jpeg" | "image/webp";
  quality: number;
}

const INITIAL: ImageEditSettings = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  sepia: 0,
  blur: 0,
  opacity: 100,
  radius: 0,
  shadow: 0,
  rotation: 0,
  flipX: false,
  flipY: false,
  crop: "original",
  format: "image/png",
  quality: 92,
};

export interface ImageWorkbenchState {
  settings: ImageEditSettings;
  setSettings: Dispatch<SetStateAction<ImageEditSettings>>;
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  loading: boolean;
  saving: boolean;
  error: string;
  savedUrl: string;
  reset: () => void;
  save: () => Promise<void>;
  download: () => void;
}

function cropBox(
  width: number,
  height: number,
  ratio: ImageEditSettings["crop"],
) {
  if (ratio === "original") return { x: 0, y: 0, width, height };
  const [rw, rh] = ratio.split(":").map(Number);
  const target = rw / rh;
  const current = width / height;
  if (current > target) {
    const next = height * target;
    return { x: (width - next) / 2, y: 0, width: next, height };
  }
  const next = width / target;
  return { x: 0, y: (height - next) / 2, width, height: next };
}

export function useImageWorkbench(
  item: LibraryItem,
  siteId = "",
): ImageWorkbenchState {
  const [settings, setSettings] = useState(INITIAL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [imageVersion, setImageVersion] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const sourceUrl =
    item.kind === "image" ? item.url || item.previewUrl || "" : "";

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image?.naturalWidth) return;
    const crop = cropBox(image.naturalWidth, image.naturalHeight, settings.crop);
    const quarterTurn = Math.abs(settings.rotation / 90) % 2 === 1;
    const rawWidth = quarterTurn ? crop.height : crop.width;
    const rawHeight = quarterTurn ? crop.width : crop.height;
    const padding = settings.shadow ? Math.max(12, settings.shadow * 2.5) : 0;
    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(rawWidth, rawHeight));
    const bodyWidth = Math.max(1, Math.round(rawWidth * scale));
    const bodyHeight = Math.max(1, Math.round(rawHeight * scale));
    canvas.width = Math.round(bodyWidth + padding * 2);
    canvas.height = Math.round(bodyHeight + padding * 2);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const radius = Math.min(
      settings.radius * scale,
      bodyWidth / 2,
      bodyHeight / 2,
    );
    if (settings.shadow) {
      context.save();
      context.beginPath();
      context.roundRect(padding, padding, bodyWidth, bodyHeight, radius);
      context.fillStyle = "rgba(255,255,255,.01)";
      context.shadowColor = "rgba(15,23,42,.38)";
      context.shadowBlur = settings.shadow * scale;
      context.shadowOffsetY = settings.shadow * scale * 0.35;
      context.fill();
      context.restore();
    }
    context.save();
    context.beginPath();
    context.roundRect(padding, padding, bodyWidth, bodyHeight, radius);
    context.clip();
    context.globalAlpha = settings.opacity / 100;
    context.filter = [
      `brightness(${settings.brightness}%)`,
      `contrast(${settings.contrast}%)`,
      `saturate(${settings.saturation}%)`,
      `grayscale(${settings.grayscale}%)`,
      `sepia(${settings.sepia}%)`,
      `blur(${settings.blur * scale}px)`,
    ].join(" ");
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((settings.rotation * Math.PI) / 180);
    context.scale(settings.flipX ? -1 : 1, settings.flipY ? -1 : 1);
    context.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      -(crop.width * scale) / 2,
      -(crop.height * scale) / 2,
      crop.width * scale,
      crop.height * scale,
    );
    context.restore();
  }, [settings]);

  useEffect(() => {
    if (!sourceUrl) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      imageRef.current = image;
      setLoading(false);
      setImageVersion((value) => value + 1);
    };
    image.onerror = () => {
      setLoading(false);
      setError("图片源不允许画布读取；仍可在专业编辑器中打开。");
    };
    image.src = sourceUrl;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [sourceUrl]);

  useEffect(() => {
    draw();
  }, [draw, imageVersion]);

  const extension =
    settings.format === "image/jpeg"
      ? "jpg"
      : settings.format === "image/webp"
        ? "webp"
        : "png";

  const save = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    setError("");
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, settings.format, settings.quality / 100),
      );
      if (!blob) {
        setError("当前图片无法导出，请检查图片来源权限。");
        return;
      }
      const title = `${item.title || "图片"}-编辑版`;
      const uploaded = await uploadFile(
        new File([blob], `${title}.${extension}`, { type: settings.format }),
        { siteId: siteId || "oceanleo", title },
      );
      const url = uploaded.data?.file?.url || "";
      if (!uploaded.ok || !url) {
        setError(uploaded.error || "保存到我的库失败");
        return;
      }
      const saved = await saveCreations(siteId || "oceanleo", [
        {
          url,
          thumb_url: url,
          media_type: "image",
          title,
          kind: "image",
          meta: {
            parent_asset_id: item.id,
            source_site: item.siteId || siteId || "",
            editor: "oceanleo-advanced-image-v1",
            settings,
          },
        },
      ]);
      if (!saved.ok) {
        setError(saved.error || "图片已上传，但登记到我的库失败");
        return;
      }
      setSavedUrl(url);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "当前图片无法导出，请检查图片来源权限。",
      );
    } finally {
      setSaving(false);
    }
  }, [extension, item, settings, siteId]);

  const download = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const anchor = document.createElement("a");
      anchor.download = `${item.title || "oceanleo-image"}.${extension}`;
      anchor.href = canvas.toDataURL(settings.format, settings.quality / 100);
      anchor.click();
    } catch {
      setError("当前图片来源不允许导出，请改用专业编辑器。");
    }
  }, [extension, item.title, settings.format, settings.quality]);

  return {
    settings,
    setSettings,
    canvasRef,
    loading,
    saving,
    error,
    savedUrl,
    reset: () => setSettings(INITIAL),
    save,
    download,
  };
}

function Slider({
  label,
  value,
  min,
  max,
  unit = "%",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-[11px] text-stone-600">
        <span>{label}</span>
        <span className="tabular-nums text-stone-400">{value}{unit}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-stone-800"
      />
    </label>
  );
}

export function ImageWorkbenchControls({
  editor,
  accent = "#4f46e5",
}: {
  editor: ImageWorkbenchState;
  accent?: string;
}) {
  const tt = useUI();
  const { settings, setSettings } = editor;
  const patch = (next: Partial<ImageEditSettings>) =>
    setSettings((current) => ({ ...current, ...next }));
  return (
    <div className="space-y-4 overflow-y-auto p-3">
      <section>
        <p className="mb-2 text-[11px] font-semibold text-stone-800">{tt("构图")}</p>
        <div className="grid grid-cols-3 gap-1.5">
          {(["original", "1:1", "4:3", "16:9", "3:4", "9:16"] as const).map((ratio) => (
            <button
              key={ratio}
              type="button"
              onClick={() => patch({ crop: ratio })}
              className="rounded-lg border px-2 py-1.5 text-[11px]"
              style={
                settings.crop === ratio
                  ? { borderColor: accent, color: accent, background: `${accent}12` }
                  : { borderColor: "#e7e5e4", color: "#57534e" }
              }
            >
              {ratio === "original" ? tt("原图") : ratio}
            </button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          <button type="button" onClick={() => patch({ rotation: settings.rotation - 90 })} className="rounded-lg border border-stone-200 py-1.5 text-[13px]" title={tt("向左旋转")}>↶</button>
          <button type="button" onClick={() => patch({ rotation: settings.rotation + 90 })} className="rounded-lg border border-stone-200 py-1.5 text-[13px]" title={tt("向右旋转")}>↷</button>
          <button type="button" onClick={() => patch({ flipX: !settings.flipX })} className="rounded-lg border border-stone-200 py-1.5 text-[11px]">{tt("水平")}</button>
          <button type="button" onClick={() => patch({ flipY: !settings.flipY })} className="rounded-lg border border-stone-200 py-1.5 text-[11px]">{tt("垂直")}</button>
        </div>
      </section>
      <section className="space-y-2.5 border-t border-stone-100 pt-3">
        <p className="text-[11px] font-semibold text-stone-800">{tt("调整")}</p>
        <Slider label={tt("亮度")} value={settings.brightness} min={0} max={200} onChange={(value) => patch({ brightness: value })} />
        <Slider label={tt("对比度")} value={settings.contrast} min={0} max={200} onChange={(value) => patch({ contrast: value })} />
        <Slider label={tt("饱和度")} value={settings.saturation} min={0} max={200} onChange={(value) => patch({ saturation: value })} />
        <Slider label={tt("透明度")} value={settings.opacity} min={0} max={100} onChange={(value) => patch({ opacity: value })} />
      </section>
      <section className="space-y-2.5 border-t border-stone-100 pt-3">
        <p className="text-[11px] font-semibold text-stone-800">{tt("效果")}</p>
        <Slider label={tt("灰度")} value={settings.grayscale} min={0} max={100} onChange={(value) => patch({ grayscale: value })} />
        <Slider label={tt("复古")} value={settings.sepia} min={0} max={100} onChange={(value) => patch({ sepia: value })} />
        <Slider label={tt("模糊")} value={settings.blur} min={0} max={20} unit="px" onChange={(value) => patch({ blur: value })} />
        <Slider label={tt("圆角")} value={settings.radius} min={0} max={300} unit="px" onChange={(value) => patch({ radius: value })} />
        <Slider label={tt("阴影")} value={settings.shadow} min={0} max={80} unit="px" onChange={(value) => patch({ shadow: value })} />
      </section>
      <button type="button" onClick={editor.reset} className="w-full rounded-lg border border-stone-200 py-2 text-[11px] text-stone-600 hover:bg-stone-50">
        {tt("重置全部调整")}
      </button>
    </div>
  );
}

export function ImageWorkbenchCanvas({
  editor,
  accent = "#4f46e5",
}: {
  editor: ImageWorkbenchState;
  accent?: string;
}) {
  const tt = useUI();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[radial-gradient(#d6d3d1_1px,transparent_1px)] [background-size:18px_18px] p-8">
        {editor.loading && <p className="text-[12px] text-stone-400">{tt("正在载入图片…")}</p>}
        <canvas
          ref={editor.canvasRef}
          className={`max-h-full max-w-full object-contain ${editor.loading ? "hidden" : ""}`}
        />
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-stone-200 bg-white px-4 py-2.5">
        <select
          value={editor.settings.format}
          onChange={(event) =>
            editor.setSettings((current) => ({
              ...current,
              format: event.target.value as ImageEditSettings["format"],
            }))
          }
          className="rounded-lg border border-stone-200 px-2 py-1.5 text-[11px]"
        >
          <option value="image/png">PNG</option>
          <option value="image/jpeg">JPEG</option>
          <option value="image/webp">WebP</option>
        </select>
        <button type="button" onClick={editor.download} className="rounded-lg border border-stone-200 px-3 py-1.5 text-[11px] text-stone-600 hover:bg-stone-50">
          {tt("下载")}
        </button>
        <span className="min-w-0 flex-1 truncate text-[11px] text-stone-400">
          {editor.error || (editor.savedUrl ? tt("已保存到我的库") : tt("编辑不会覆盖原素材"))}
        </span>
        <button
          type="button"
          disabled={editor.saving || editor.loading}
          onClick={() => void editor.save()}
          className="rounded-lg px-4 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
          style={{ background: accent }}
        >
          {editor.saving ? tt("保存中…") : tt("保存到我的库")}
        </button>
      </div>
    </div>
  );
}
