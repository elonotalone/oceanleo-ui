"use client";

import { createContext, useContext } from "react";

/**
 * SelectionToolbar 在单行编辑栏（`FloatingContextToolbar` 的 `EditBarRow`）里
 * 只是其中一段：撤销重做 / 文档段 / AI / 固定柄都由行来画。它靠这个 context
 * 知道自己在行里——不画胶囊、不画自己的 AI 键与宿主前后缀，量宽时从容量里
 * 扣掉兄弟节点（见 useSelectionToolbarMeasure 的 rowSiblingsInlineSize）。
 *
 * 单独成文件是为了避免 FloatingContextToolbar ↔ SelectionToolbar 互相 import。
 */
export const EditBarRowContext = createContext<boolean>(false);

export function useInsideEditBarRow(): boolean {
  return useContext(EditBarRowContext);
}
