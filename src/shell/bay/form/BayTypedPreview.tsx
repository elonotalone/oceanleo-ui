"use client";

import { Suspense, lazy, useEffect, useMemo, useState, type CSSProperties, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { getCurrentArtifactItem } from "../../artifact-client";
import type { LibraryItem } from "../../library-data";
import { BayImageStage } from "./BayImageGallery";
import { kindFromUrl, slidesFrom, type PreviewFileKind } from "./bay-typed-preview";

const LibraryItemViewer = lazy(() => import("../../library-viewers").then((m) => ({ default: m.LibraryItemViewer })));

const KIND_LABEL: Record<PreviewFileKind, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
  ppt: "PPT",
  sheet: "表格",
  document: "文档",
  website: "网站",
  file: "文件",
};

const STAGE: CSSProperties = { display: "flex", gap: 8, alignItems: "stretch", width: "100%" };
const RAIL: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  width: 56,
  flexShrink: 0,
  maxHeight: 220,
  overflowY: "auto",
};
const THUMB: CSSProperties = {
  position: "relative",
  width: 56,
  height: 56,
  padding: 0,
  borderRadius: 8,
  overflow: "hidden",
  background: "#f5f5f5",
  flexShrink: 0,
  cursor: "pointer",
};
const MAIN: CSSProperties = {
  position: "relative",
  flex: 1,
  minWidth: 0,
  aspectRatio: "16 / 9",
  borderRadius: 12,
  overflow: "hidden",
  background: "#f5f5f5",
};
const MAIN_OPEN: CSSProperties = {
  position: "relative",
  flex: 1,
  minWidth: 0,
  minHeight: 560,
  height: 640,
  borderRadius: 12,
  overflow: "auto",
  background: "#f5f5f5",
};
const EMPTY: CSSProperties = {
  position: "relative",
  width: "100%",
  aspectRatio: "16 / 9",
  borderRadius: 12,
  overflow: "hidden",
  background: "#ffffff",
};

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; item: LibraryItem }
  | { status: "error" };

function httpsUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text.startsWith("https://") ? text : "";
}

function artifactThumb(item: LibraryItem | null): string {
  if (!item) return "";
  const poster = httpsUrl(item.posterUrl);
  if (poster) return poster;
  const thumb = httpsUrl(item.thumbUrl);
  if (thumb && kindFromUrl(thumb) === "image") return thumb;
  const preview = httpsUrl(item.previewUrl);
  if (preview && kindFromUrl(preview) === "image") return preview;
  return "";
}

function artifactKindLabel(item: LibraryItem | null, title?: string): string {
  if (item?.kind && KIND_LABEL[item.kind as PreviewFileKind]) return KIND_LABEL[item.kind as PreviewFileKind];
  const fromUrl = item?.url ? kindFromUrl(item.url) : "file";
  if (fromUrl !== "file") return KIND_LABEL[fromUrl];
  const name = String(title || item?.title || "").trim();
  return name ? KIND_LABEL[kindFromUrl(name)] : "作品";
}

export function BayTypedPreview(props: {
  artifactId?: string;
  workTitle?: string;
  imageUrls: string[];
  emptyLabel?: string;
  item?: LibraryItem | null;
}): ReactElement {
  const tt = useUI();
  const givenItem = props.item || null;
  const artifactId = String(props.artifactId || givenItem?.artifactId || givenItem?.id || "").trim();
  const imageKey = Array.isArray(props.imageUrls) ? props.imageUrls.join("\0") : "";
  const slides = useMemo(
    () => slidesFrom({ artifactId, workTitle: props.workTitle || givenItem?.title, imageUrls: props.imageUrls || [] }),
    [artifactId, givenItem?.title, imageKey, props.workTitle],
  );
  const [active, setActive] = useState(0);
  const [fetched, setFetched] = useState<FetchState>(() =>
    givenItem ? { status: "ready", item: givenItem } : artifactId ? { status: "loading" } : { status: "idle" },
  );

  useEffect(() => {
    setActive(0);
  }, [artifactId, imageKey]);

  useEffect(() => {
    if (givenItem) {
      setFetched({ status: "ready", item: givenItem });
      return;
    }
    if (!artifactId) {
      setFetched({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    setFetched({ status: "loading" });
    void getCurrentArtifactItem(artifactId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.ok && result.data) setFetched({ status: "ready", item: result.data });
        else setFetched({ status: "error" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setFetched({ status: "error" });
      });
    return () => controller.abort();
  }, [artifactId, givenItem]);

  if (!slides.length) {
    return (
      <div data-bay-typed-preview="" data-bay-gallery-empty="" style={EMPTY} className="grid place-items-center border border-neutral-200 text-[13px] text-neutral-400">
        {props.emptyLabel || tt("卖家暂未上传作品图")}
      </div>
    );
  }

  const hasArtifact = slides[0]?.type === "artifact";
  if (!hasArtifact) {
    return (
      <div data-bay-typed-preview="">
        <BayImageStage
          urls={slides.filter((slide): slide is { type: "image"; url: string } => slide.type === "image").map((slide) => slide.url)}
          emptyLabel={props.emptyLabel}
        />
      </div>
    );
  }

  const safeActive = Math.min(Math.max(active, 0), slides.length - 1);
  const current = slides[safeActive];
  const item = fetched.status === "ready" ? fetched.item : givenItem;
  const thumb = artifactThumb(item);
  const typeLabel = artifactKindLabel(item, props.workTitle);
  const opening = fetched.status === "loading" || fetched.status === "idle";

  return (
    <div data-bay-typed-preview="" data-bay-gallery-count={slides.length} style={STAGE}>
      {slides.length > 1 ? (
      <div data-bay-gallery-rail="" style={RAIL}>
        {slides.map((slide, index) => {
          const selected = safeActive === index;
          const border = selected ? "2px solid #171717" : "1px solid #e5e5e5";
          if (slide.type === "artifact") {
            return (
              <button
                key={`artifact-${slide.id}`}
                type="button"
                data-bay-typed-thumb="artifact"
                data-bay-typed-slide="artifact"
                aria-pressed={selected}
                aria-label={slide.title || typeLabel}
                onClick={() => setActive(index)}
                style={{ ...THUMB, border }}
              >
                {thumb ? (
                  <img src={thumb} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center px-0.5 text-center text-[10px] leading-tight text-neutral-600">{typeLabel}</span>
                )}
              </button>
            );
          }
          return (
            <button
              key={`image-${index}-${slide.url}`}
              type="button"
              data-bay-gallery-thumb={index}
              aria-pressed={selected}
              aria-label={tt("第 {n} 张", { n: index + 1 })}
              onClick={() => setActive(index)}
              style={{ ...THUMB, border }}
            >
              <img src={slide.url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            </button>
          );
        })}
      </div>
      ) : null}
      <div data-bay-gallery-main="" data-bay-typed-open={current?.type === "artifact" ? "" : undefined} style={current?.type === "artifact" ? MAIN_OPEN : MAIN}>
        {current?.type === "image" ? (
          <img src={current.url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        ) : opening ? (
          <p className="grid h-full place-items-center text-[13px] text-neutral-500" role="status">
            {tt("正在打开这份素材…")}
          </p>
        ) : !item || fetched.status === "error" ? (
          <p className="grid h-full place-items-center px-3 text-center text-[13px] text-neutral-600" role="status" data-bay-typed-preview-error="">
            {tt("素材没读出来，请稍后再试。")}
          </p>
        ) : (
          <div className="h-full overflow-auto" data-bay-typed-slide="artifact">
            <Suspense
              fallback={
                <p className="grid h-full place-items-center text-[13px] text-neutral-500" role="status">
                  {tt("正在打开这份素材…")}
                </p>
              }
            >
              <LibraryItemViewer item={item} />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
