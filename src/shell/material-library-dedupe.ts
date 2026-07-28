/**
 * 素材货架的去重与多归属（`01-decisions.md` D3）。
 *
 * 这里回答两个互相牵制的问题：
 *   1. 同一份素材在一个视图里只出现一张卡——不管它绑了几个 app；
 *   2. 它到底属于哪些 app——卡片要标归属，详情浮层要为每个归属各开一个编辑入口。
 *
 * 旧实现只回答了半个第一问：`mergeMaterialEntries` 按 `artifactId:revisionId` 去重，
 * 先到的那条赢，第二条连同它的 app 归属一起被丢掉；而官方模板目录行根本不是 durable，
 * 退化成按 catalog key 去重之后**每个 app 一条**，于是跨 app 素材反而渲染成两张
 * 一模一样的卡。两个症状同一个根。
 *
 * 独立成文件而不是并进 `material-library-controller.ts`：那个模块贴着 800 行硬顶
 * （`material-library-scope.test.mjs` 在管），而这是一条自成一体的关注点。
 */

import { isDurableLibraryItem } from "./library-data";
import {
  libraryItemAppAttributions,
  libraryItemStoredAppAttributions,
  mergeAppAttributions,
  MATERIAL_APP_BINDINGS_META_KEY,
  type MaterialAppAttribution,
} from "./material-library-scope";
import type { WorkspaceLibraryEntry } from "./workspace-library-model";

/**
 * 这条 entry 指向哪个 artifact。durable 条目直接有 `artifactId`；官方模板目录行不是
 * durable（目录端点刻意不下发 revision 身份），但它在 meta 里带着自己的 artifact id。
 */
function entryArtifactId(entry: WorkspaceLibraryEntry): string {
  const item = entry.libraryItem;
  if (!item) return "";
  if (isDurableLibraryItem(item)) return item.artifactId;
  const templateArtifactId = item.meta?.template_material_artifact_id;
  return typeof templateArtifactId === "string"
    ? templateArtifactId.trim()
    : "";
}

/**
 * 一个视图一张卡（D3.1）的去重键。
 *
 * 与旧键 `artifactId:revisionId` 有两处有意的差别：
 *   1. **不含 revisionId**。同一 artifact 的两个 revision 同场时是同一份素材。
 *   2. **官方模板目录行也按 artifactId 归并**。image 站那 9 组跨 app 素材正是从
 *      `/v1/template-materials` 来的，旧键对非 durable 条目退化成
 *      `template-material:<catalog id>`（每个 app 一个）。
 */
export function materialArtifactDedupeKey(
  entry: WorkspaceLibraryEntry,
): string {
  const artifactId = entryArtifactId(entry);
  if (artifactId) return `artifact:${artifactId}`;
  return entry.libraryItem?.key || entry.id || "";
}

/** `(artifact, app)` 语义的键；需要「每个归属各占一行」的面用这个。 */
export function materialAppDedupeKey(
  entry: WorkspaceLibraryEntry,
  appId: string,
): string {
  return `${materialArtifactDedupeKey(entry)}@app:${String(appId || "").trim()}`;
}

function withAppAttributions(
  entry: WorkspaceLibraryEntry,
  attributions: readonly MaterialAppAttribution[],
): WorkspaceLibraryEntry {
  const item = entry.libraryItem;
  if (!item) return entry;
  return {
    ...entry,
    libraryItem: {
      ...item,
      meta: {
        ...item.meta,
        [MATERIAL_APP_BINDINGS_META_KEY]: attributions,
      },
    },
  };
}

/**
 * 归并成「一个 artifact 一条 entry」，同时把各条目的归属 app **并集**写回幸存的那条。
 * 幸存条目的其余字段（标题、缩略图、linkUrl）原样保留，只有 `libraryItem.meta` 多了
 * 一个 `MATERIAL_APP_BINDINGS_META_KEY`。
 *
 * 站内货架请传 `options.siteKey`：不传会把别站的绑定也收进来，那正是 D1 要根除的污染。
 */
export function mergeMaterialEntries(
  groups: readonly (readonly WorkspaceLibraryEntry[])[],
  options: { siteKey?: string } = {},
): WorkspaceLibraryEntry[] {
  const siteKey = String(options.siteKey ?? "").trim();
  const order: string[] = [];
  const kept = new Map<string, WorkspaceLibraryEntry>();
  const apps = new Map<string, MaterialAppAttribution[]>();
  for (const group of groups) {
    for (const entry of group) {
      const key = materialArtifactDedupeKey(entry);
      if (!key) continue;
      const attributions = libraryItemAppAttributions(
        entry.libraryItem,
        siteKey,
      );
      if (!kept.has(key)) {
        order.push(key);
        kept.set(key, entry);
        apps.set(key, attributions);
        continue;
      }
      apps.set(key, mergeAppAttributions(apps.get(key) || [], attributions));
    }
  }
  return order.map((key) =>
    withAppAttributions(kept.get(key)!, apps.get(key) || []),
  );
}

/**
 * 这条 entry 的全部归属 app，已排序（`[0]` 即 D3.3 的主 app）。合并过的 entry 读的是
 * 并集，未合并的现算。
 */
export function materialEntryAppAttributions(
  entry: WorkspaceLibraryEntry,
  siteKey = "",
): MaterialAppAttribution[] {
  return libraryItemStoredAppAttributions(entry.libraryItem, siteKey);
}

/** D3.3 的主 app；解析不出归属时为 ""。 */
export function materialEntryPrimaryAppId(
  entry: WorkspaceLibraryEntry,
  siteKey = "",
): string {
  return materialEntryAppAttributions(entry, siteKey)[0]?.appId || "";
}

/**
 * 选中某个场景分区时卡片该标哪个 app（D3.3）：该分区下的 app 若在归属里就用它，
 * 否则回落主 app。
 */
export function materialEntryAppForScope(
  entry: WorkspaceLibraryEntry,
  scopeAppIds: readonly string[],
  siteKey = "",
): MaterialAppAttribution | null {
  const attributions = materialEntryAppAttributions(entry, siteKey);
  if (attributions.length === 0) return null;
  const wanted = new Set(
    scopeAppIds.map((value) => String(value || "").trim()).filter(Boolean),
  );
  if (wanted.size > 0) {
    const scoped = attributions.find((app) => wanted.has(app.appId));
    if (scoped) return scoped;
  }
  return attributions[0];
}
