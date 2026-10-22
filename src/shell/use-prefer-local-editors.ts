"use client";

/**
 * 所有编辑器都是本地原生编辑器：不再有「网页默认嵌子站、原生才走本地」这一档。
 * 恒为 true。只为 `VideoCanvasStage`（W07 的文件）里尚未删除的嵌入回落分支保留，
 * 那条分支因此不可达；W07 删掉分支后，连同本文件一并删除。
 */
export function usePreferLocalRemoteEditor(_editorId: string): boolean {
  return true;
}
