"use client";

// 2026-10-31 W1: an image a native (computer) conversation saved to the cloud
// shows as a picture again, not a generic file chip. The owner-checked route
// hands out a short-lived signed address; the bytes are read once into a local
// `blob:` URL, so the page never renders or links a storage host. Anything
// that does not work (not a raster image, too big, route refused, CORS, bad
// address) falls back to the caller's file chip.

import { useEffect, useState, type ReactNode } from "react";

const ROUTE = /^\/v1\/computer-task-sessions\/[A-Za-z0-9_-]{1,128}\/attachments\/[A-Za-z0-9_-]{1,128}$/;
const RASTER = /^image\/(?:png|jpeg|gif|webp)$/i;
export const ARCHIVED_THUMB_MAX_BYTES = 10 * 1024 * 1024;

type Load = (path: string) => Promise<string>;

async function signedUrl(path: string): Promise<string> {
  const api = await import("../../lib/cloud-computer-api");
  const result = await api.cloudComputerRequest<{ url: string }>(path);
  return result.url;
}

// One read per attachment per page: the same picture in several bubbles, or
// a re-render, reuses the blob.
const thumbs = new Map<string, Promise<string | null>>();

export function archivedImageEligible(mime: string, size: unknown, path: unknown): path is string {
  return RASTER.test(mime || "")
    && typeof path === "string" && ROUTE.test(path)
    && (typeof size !== "number" || (size > 0 && size <= ARCHIVED_THUMB_MAX_BYTES));
}

export async function loadArchivedThumb(path: string, mime: string, load: Load = signedUrl): Promise<string | null> {
  const parsed = new URL(await load(path));
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
  const res = await fetch(parsed.href, { credentials: "omit", referrerPolicy: "no-referrer" });
  if (!res.ok) return null;
  const bytes = await res.blob();
  if (!bytes.size || bytes.size > ARCHIVED_THUMB_MAX_BYTES) return null;
  // Stored as octet-stream; the archive row knows the real image type.
  const typed = RASTER.test(bytes.type) ? bytes : new Blob([bytes], { type: mime });
  return URL.createObjectURL(typed);
}

function thumbFor(path: string, mime: string): Promise<string | null> {
  let hit = thumbs.get(path);
  if (!hit) {
    hit = loadArchivedThumb(path, mime).catch(() => null);
    thumbs.set(path, hit);
    // A failure may be transient (offline, expired login): let a later mount retry.
    void hit.then((url) => { if (!url) thumbs.delete(path); });
  }
  return hit;
}

export function resetArchivedThumbsForTests(): void {
  thumbs.clear();
}

export function NativeArchivedImage({
  name,
  path,
  mime,
  fallback,
  render,
}: {
  name: string;
  path: string;
  mime: string;
  /** Shown when the picture cannot be read (the file chip). */
  fallback: ReactNode;
  /** Draws the thumbnail from a local `blob:` URL (the host's tile). */
  render?: (url: string) => ReactNode;
}) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setUrl("");
    setFailed(false);
    void thumbFor(path, mime).then((value) => {
      if (!alive) return;
      if (value) setUrl(value);
      else setFailed(true);
    });
    return () => { alive = false; };
  }, [path, mime]);
  if (failed) return <>{fallback}</>;
  if (!url) {
    return (
      <span
        role="img"
        aria-label={name}
        className="block h-16 w-16 animate-pulse select-none rounded-lg border border-stone-200 bg-stone-100"
        data-native-archived-image="loading"
      />
    );
  }
  if (render) return <>{render(url)}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name}
      draggable={false}
      className="h-16 w-16 select-none rounded-lg border border-stone-200 object-cover"
      data-native-archived-image="ready"
    />
  );
}
