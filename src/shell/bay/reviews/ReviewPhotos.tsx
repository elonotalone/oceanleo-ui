"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { safePhotos, stepPhoto } from "./review-model";

const MAX_BYTES = 5 * 1024 * 1024;

function PhotoImg({ src, className }: { src: string; className: string }): ReactElement {
  return <img src={src} loading="lazy" referrerPolicy="no-referrer" alt="" className={className} />;
}

export function ReviewPhotos({
  urls,
  onRemove,
}: {
  urls: string[];
  onRemove?: (index: number) => void;
}): ReactElement | null {
  const tt = useUI();
  const photos = safePhotos(urls);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
      if (event.key === "ArrowRight") setOpen((index) => (index === null ? index : stepPhoto(index, photos.length, 1)));
      if (event.key === "ArrowLeft") setOpen((index) => (index === null ? index : stepPhoto(index, photos.length, -1)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, photos.length]);

  if (!photos.length) return null;
  const current = open === null ? null : photos[open];

  return (
    <div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {photos.map((url, index) => (
          <li key={`${url}:${index}`} className="relative">
            <button type="button" onClick={() => setOpen(index)} className="block overflow-hidden rounded-lg">
              <PhotoImg src={url} className="h-16 w-16 object-cover" />
            </button>
            {onRemove ? (
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="absolute -right-1 -top-1 rounded-full bg-neutral-900 px-1.5 text-[10px] text-white"
              >
                {tt("删除")}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {current ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={tt("评价图片")}
          className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4"
          onClick={() => setOpen(null)}
        >
          <div className="relative max-h-full max-w-3xl" onClick={(event) => event.stopPropagation()}>
            <PhotoImg src={current} className="max-h-[80vh] max-w-full rounded-xl object-contain" />
            <div className="mt-3 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setOpen((index) => (index === null ? index : stepPhoto(index, photos.length, -1)))}
                className="rounded-lg border border-white/40 px-3 py-1.5 text-[12px] text-white"
              >
                {tt("上一张")}
              </button>
              <button type="button" onClick={() => setOpen(null)} className="rounded-lg border border-white/40 px-3 py-1.5 text-[12px] text-white">
                {tt("关闭")}
              </button>
              <button
                type="button"
                onClick={() => setOpen((index) => (index === null ? index : stepPhoto(index, photos.length, 1)))}
                className="rounded-lg border border-white/40 px-3 py-1.5 text-[12px] text-white"
              >
                {tt("下一张")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ReviewPhotoFields({
  urls,
  onChange,
  disabled,
}: {
  urls: string[];
  onChange: (urls: string[]) => void;
  disabled?: boolean;
}): ReactElement {
  const tt = useUI();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const photos = safePhotos(urls);

  async function addFiles(files: FileList | null) {
    if (!files || !files.length || disabled || busy) return;
    setError("");
    const next = [...photos];
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (next.length >= 9) {
          setError(tt("最多上传 9 张图"));
          break;
        }
        if (!file.type.startsWith("image/")) {
          setError(tt("只能添加图片"));
          continue;
        }
        if (file.size > MAX_BYTES) {
          setError(tt("单张图片不能超过 5 MB"));
          continue;
        }
        setProgress(tt("上传中"));
        const { uploadFile } = await import("../../../lib/database");
        const uploaded = await uploadFile(file, {
          siteId: "home",
          title: file.name,
          onProgress: (loaded, total) => {
            if (total > 0) setProgress(`${tt("上传中")} ${Math.round((loaded / total) * 100)}%`);
          },
        });
        const url = uploaded.ok ? uploaded.data?.file?.url : "";
        if (!uploaded.ok || !url) {
          setError(uploaded.ok === false ? uploaded.error || tt("图片没传上去，请换一张再试。") : tt("图片没传上去，请换一张再试。"));
          continue;
        }
        if (!url.startsWith("https://")) {
          setError(tt("图片地址必须是 https:// 开头"));
          continue;
        }
        next.push(url);
        onChange([...next]);
      }
    } finally {
      setBusy(false);
      setProgress("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <ReviewPhotos urls={photos} onRemove={disabled ? undefined : (index) => onChange(photos.filter((_, i) => i !== index))} />
      {photos.length < 9 ? (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
        >
          {busy ? progress || tt("上传中") : tt("添加图片")}
        </button>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => void addFiles(event.target.files)}
      />
      {error ? <p className="text-[12px] text-rose-600">{error}</p> : null}
    </div>
  );
}
