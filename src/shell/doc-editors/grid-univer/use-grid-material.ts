"use client";

/**
 * 表格的素材库适配器（D2，W10 2026-10-23；从舞台抽出，舞台不再变大）：
 * 点一张图片 = 在当前格子插浮动图片（Univer 插图命令进撤销栈，见 `material-image.ts`），
 * 并按 W02 的契约登记 command（目标 = 这份表格，基线 = 当前 revision；W04 保存后前移）。
 */
import { useMemo, type MutableRefObject } from "react";
import { fetchMediaBlob } from "../../../lib/media-proxy";
import { advancedRootItemId } from "../../advanced-session";
import type { LibraryItem } from "../../library-data";
import { withEditorHistoryCommand } from "../../workbench-material-command";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../../workbench-material-provider";
import {
  GRID_IMAGE_MAX_BYTES,
  gridAcceptsImageMaterial,
  gridImageDataUrlFromBlob,
  gridMaterialImageUrl,
  insertGridImageAtSelection,
  type GridImageInsertApi,
} from "./material-image";

export function useGridMaterialAdapter(options: {
  item: LibraryItem;
  getApi: () => unknown;
  blockedRef: MutableRefObject<boolean>;
  tt: (zh: string) => string;
}): void {
  const { item, getApi, blockedRef, tt } = options;
  const adapter = useMemo<WorkbenchMaterialAdapter>(
    () => ({
      id: "grid-materials@3",
      actions: ["insert"],
      materialTypes: ["image"],
      accepts: (material, action) => action === "insert" && gridAcceptsImageMaterial(material),
      mutate: async (_action, material) => {
        if (blockedRef.current) throw new Error(tt("现在是只读状态，不能修改。"));
        const blob = await fetchMediaBlob(gridMaterialImageUrl(material), {
          maxBytes: GRID_IMAGE_MAX_BYTES,
        });
        const dataUrl = await gridImageDataUrlFromBlob(blob).catch((error: Error) => {
          throw new Error(tt(error.message));
        });
        if (!(await insertGridImageAtSelection(getApi() as GridImageInsertApi, dataUrl))) {
          throw new Error(tt("图片没有插进表格，请重试。"));
        }
      },
    }),
    // getApi / blockedRef 读的是 ref，稳定。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tt],
  );
  useWorkbenchMaterialAdapter(
    withEditorHistoryCommand(adapter, {
      documentId: advancedRootItemId(item),
      targetRevisionId: item.revisionId ? String(item.revisionId) : "",
    }),
  );
}
