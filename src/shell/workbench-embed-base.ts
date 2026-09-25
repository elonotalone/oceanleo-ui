// `EmbedEditorPane` 三处（iframe src / 目标 origin / sandbox）共用的 base 解析，
// 从 `workbench-embed.tsx` 拆出（600 行拆分闸）。判定规则逐字保留：
//   · 只有 `workbench-routes.ts` 写死的白名单 base 走这条路；
//   · 浏览器里按 LeoDev 覆盖（query / cookie / env）解析实际加载的 base，
//     覆盖不可加载或 SSR 时回到写死的 base；
//   · sandbox 由「覆盖后的 base + 当前 host」决定（`familyEmbedFrameSandbox` 自己判信任）。
import { isValidEditorTargetOrigin } from "./editor-protocol";
import {
  embedEditorFrameSandbox,
  isTrustedEmbedEditorBase,
} from "./editor-sandbox-origin";
import {
  applyFamilyEmbedOriginOverride,
  canLoadFamilyEmbedBase,
  familyEmbedFrameSandbox,
  familyEmbedOverrideInputFromWindow,
} from "./family-embed-origin";
import type { LibraryItem } from "./library-data";
import { editorRouteFor } from "./workbench-routes";

/**
 * 每类嵌入编辑器的写死白名单 base；只列已实现 editor.v1 接收端的页面。
 * 不得在这里套 LeoDev 覆盖：EmbedEditorPane 第一道闸只认白名单 base，
 * 覆盖由 pane 内的 `resolveEmbedLoadBase` 做。
 */
export function embedEditorBase(item: LibraryItem): string {
  const route = editorRouteFor(item);
  return route.type === "embed" ? route.base : "";
}

export function resolveEmbedLoadBase(editorBase: string): {
  resolved: string;
  loadBase: string;
} {
  if (typeof window === "undefined") {
    return { resolved: editorBase, loadBase: editorBase };
  }
  const resolved = applyFamilyEmbedOriginOverride(
    editorBase,
    familyEmbedOverrideInputFromWindow(),
  );
  const loadBase = canLoadFamilyEmbedBase(resolved, window.location.host)
    ? resolved
    : editorBase;
  return { resolved, loadBase };
}

/** postMessage 的目标 origin；base 不在白名单或解析失败时为空串（发不出去）。 */
export function embedEditorOriginFor(editorBase: string): string {
  if (!isTrustedEmbedEditorBase(editorBase)) return "";
  try {
    const origin = new URL(resolveEmbedLoadBase(editorBase).loadBase).origin;
    return isValidEditorTargetOrigin(origin) ? origin : "";
  } catch {
    return "";
  }
}

export function embedFrameSandboxFor(editorBase: string): string {
  if (typeof window === "undefined") return embedEditorFrameSandbox(editorBase);
  return familyEmbedFrameSandbox(
    resolveEmbedLoadBase(editorBase).resolved,
    window.location.host,
  );
}
