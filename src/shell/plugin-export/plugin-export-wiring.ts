"use client";

/**
 * 把导出链接到真实网关上。这一层只做接线，不做判断：
 * 上传走文件库、补登走 `/v1/artifacts/ensure`、可下载与否问下载闸门，
 * 三个都是「我的库」今天已经在用的入口，本波没有新增任何端点。
 */

import { uploadFile } from "../../lib/database";
import {
  ARTIFACT_LIBRARY_CHANGE_EVENT,
  artifactDownloadEvidence,
  ensureArtifact,
} from "../artifact-client";
import { isDurableLibraryItem, type LibraryItem } from "../library-data";
import {
  exportToLibrary,
  type PluginExportDependencies,
  type PluginExportPath,
  type PluginExportResult,
} from "./plugin-export-runtime";
import type { PluginExportRequest } from "./plugin-export-contract";

export const liveExportDependencies: PluginExportDependencies = {
  upload: (file, options) => uploadFile(file, options),
  ensure: (transient) => ensureArtifact(transient),
  downloadEvidence: (item) => artifactDownloadEvidence(item),
  announce: (item: LibraryItem, via: PluginExportPath) => {
    // `ensureArtifact()` 成功时自己已经发过一次（`artifact-client.ts:1796`），
    // 再发一次只会让「我的库」白刷新一遍。
    if (via === "ensure-receipt") return;
    if (typeof window === "undefined" || !isDurableLibraryItem(item)) return;
    window.dispatchEvent(
      new CustomEvent(ARTIFACT_LIBRARY_CHANGE_EVENT, {
        detail: {
          action: "upload",
          artifactId: item.artifactId,
          revisionId: item.revisionId,
          item,
        },
      }),
    );
  },
};

/** 功能件调这一个函数就够了：导出物落进「我的库」，当场可见、可下载。 */
export function exportToMyLibrary(
  request: PluginExportRequest,
): Promise<PluginExportResult> {
  return exportToLibrary(request, liveExportDependencies);
}
