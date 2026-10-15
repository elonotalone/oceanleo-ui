"use client";

import { useRef, useState, type DragEvent, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { uploadFile } from "../../../lib/database";

export function BayCoverDrop(props: {
  url: string;
  onUrl: (url: string) => void;
  disabled?: boolean;
  /** `avatar`：主页页头圆形头像；默认是封面/图集那块方槽。 */
  variant?: "tile" | "avatar";
}): ReactElement {
  const tt = useUI();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const disabled = Boolean(props.disabled);
  const avatar = props.variant === "avatar";

  async function addFile(file: File | undefined) {
    if (!file || disabled || busy) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      setError(tt("只能添加图片"));
      return;
    }
    setBusy(true);
    try {
      const uploaded = await uploadFile(file, { siteId: "home", title: file.name });
      const url = uploaded.ok ? uploaded.data?.file?.url : "";
      if (!uploaded.ok || !url) {
        setError(uploaded.ok === false ? uploaded.error || tt("图片没传上去") : tt("图片没传上去"));
        return;
      }
      if (!url.startsWith("https://")) {
        setError(tt("图片没传上去"));
        return;
      }
      props.onUrl(url);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!disabled) setDragging(true);
  }

  function onDragLeave() {
    setDragging(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled || busy) return;
    void addFile(event.dataTransfer.files?.[0]);
  }

  return (
    <div className="flex items-start gap-3">
      <div
        data-bay-cover-drop=""
        data-bay-cover-variant={avatar ? "avatar" : "tile"}
        data-bay-cover-state={props.url ? "filled" : "empty"}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`relative overflow-hidden border border-dashed ${
          avatar ? "h-16 w-16 rounded-full" : "h-20 w-20 rounded-xl"
        } ${dragging ? "border-neutral-400 bg-neutral-50" : "border-neutral-300 bg-white"}`}
      >
        <p data-bay-cover-hint="" className="hidden">
          {busy ? tt("上传中") : tt("把图片拖到这里")}
        </p>
        {props.url ? (
          <img src={props.url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        ) : null}
        <button
          type="button"
          data-bay-cover-pick=""
          aria-label={props.url ? tt("换一张") : tt("选择图片")}
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className={`absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium disabled:opacity-60 ${
            props.url ? "bg-black/50 text-white opacity-0 hover:opacity-100" : "text-neutral-700"
          }`}
        >
          {props.url ? (
            tt("换一张")
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={avatar ? "h-4 w-4" : "h-5 w-5"} aria-hidden="true"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
              {avatar ? null : busy ? tt("上传中") : tt("选择图片")}
            </>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          disabled={disabled}
          onChange={(event) => void addFile(event.target.files?.[0])}
        />
      </div>
      {error ? (
        <p role="alert" className="text-[12px] text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
