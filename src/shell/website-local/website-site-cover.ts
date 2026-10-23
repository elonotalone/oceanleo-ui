"use client";

/**
 * Library cover for a saved site (W14): the first two sections painted onto a
 * 2D canvas with the site's own colours, plus the first section's image when it
 * can be read. Returns null on any failure (no canvas, SSR); the save contract
 * decides whether that blocks the commit (website: it does not, `full` exists).
 */
import { fetchMediaBlob } from "../../lib/media-proxy";
import { safeSiteColor, type SiteDoc, type SiteRow } from "./website-site-doc";

const WIDTH = 1280;
const HEIGHT = 800;
const FONT = "system-ui,-apple-system,'PingFang SC',sans-serif";

function isRow(value: unknown): value is SiteRow {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function wrap(context: CanvasRenderingContext2D, value: string, width: number, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const char of value) {
    const next = line + char;
    if (context.measureText(next).width > width && line) {
      lines.push(line);
      line = char;
      if (lines.length === max) break;
    } else {
      line = next;
    }
  }
  if (lines.length < max && line) lines.push(line);
  return lines;
}

async function loadBitmap(url: string): Promise<ImageBitmap | null> {
  if (!url || typeof createImageBitmap !== "function") return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const blob = await fetchMediaBlob(url, { cache: "force-cache", maxBytes: 12_000_000, signal: controller.signal });
    clearTimeout(timer);
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

export async function renderSiteCoverPng(
  doc: SiteDoc,
  imageUrl: (path: string) => string,
): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement("canvas");
  } catch {
    return null;
  }
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const page = doc.pages[0];
  const sections = page?.sections || [];
  context.fillStyle = safeSiteColor(doc.backgroundColor) || "#ffffff";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = "#0f172a";
  context.font = `800 26px ${FONT}`;
  context.textBaseline = "middle";
  context.fillText(text(doc.siteName).slice(0, 40), 48, 36);
  const accent = safeSiteColor(doc.themeColor) || "#2563eb";
  let top = 72;
  for (const [index, section] of sections.slice(0, 2).entries()) {
    const style = isRow(section.style) ? section.style : {};
    const content = section.content || {};
    const height = index === 0 ? 520 : HEIGHT - top;
    context.fillStyle = safeSiteColor(style.backgroundColor) || safeSiteColor(doc.backgroundColor) || "#ffffff";
    context.fillRect(0, top, WIDTH, height);
    const image = isRow(content.image) ? text(content.image.url) : "";
    const bitmap = index === 0 && image ? await loadBitmap(imageUrl(image)) : null;
    const textWidth = bitmap ? 560 : WIDTH - 160;
    const left = bitmap ? 64 : 80;
    if (bitmap) {
      const boxX = 660;
      const boxY = top + 40;
      const boxW = WIDTH - boxX - 56;
      const boxH = height - 80;
      const scale = Math.max(boxW / bitmap.width, boxH / bitmap.height);
      const sw = boxW / scale;
      const sh = boxH / scale;
      context.save();
      context.beginPath();
      context.rect(boxX, boxY, boxW, boxH);
      context.clip();
      context.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, boxX, boxY, boxW, boxH);
      context.restore();
      bitmap.close?.();
    }
    const ink = safeSiteColor(style.textColor) || "#0f172a";
    let y = top + (index === 0 ? 150 : 90);
    const eyebrow = text(content.eyebrow);
    if (eyebrow) {
      context.fillStyle = accent;
      context.font = `600 20px ${FONT}`;
      context.fillText(eyebrow.slice(0, 40), left, y);
      y += 48;
    }
    context.fillStyle = ink;
    context.font = `800 ${index === 0 ? 54 : 38}px ${FONT}`;
    for (const line of wrap(context, text(content.title), textWidth, 2)) {
      context.fillText(line, left, y);
      y += index === 0 ? 66 : 48;
    }
    const subtitle = text(content.subtitle) || text(content.description);
    if (subtitle) {
      context.globalAlpha = 0.82;
      context.font = `400 22px ${FONT}`;
      for (const line of wrap(context, subtitle, textWidth, 2)) {
        y += 6;
        context.fillText(line, left, y + 10);
        y += 32;
      }
      context.globalAlpha = 1;
    }
    top += height;
    if (top >= HEIGHT) break;
  }
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob && blob.size > 0 ? blob : null), "image/png");
    } catch {
      resolve(null);
    }
  });
}
