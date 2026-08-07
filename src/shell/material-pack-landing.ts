/**
 * 「这张卡坐在**哪个素材包**里」—— 详情里那一颗编辑按钮的落点从这里来。
 *
 * 这是 `W5-pack-model.md` §5.1 那条链子的最后一段。之前的状态是：
 * `material-library-view.tsx` 把包视图**下发**进 `material-pack-scope` 的模块级 Map，
 * `WorkspaceLibrary` 也开好了 `packAppIdForEntry` 这个 prop，但**没有任何产品代码
 * 把两头接起来**（全仓只有测试在传那个 prop）。于是「按素材包决定落点」在生产里空转，
 * 按钮走的是兜底顺序。本文件就是那一段：把包视图读出来，算成一个
 * `entry → 包的 appId` 的解析器交给货架。
 *
 * 为什么不能只看 entry 自己：同一件素材进多个包时，各包的卡片是
 * `{ ...entry, title, category }`（`material-pack-model.ts:269-282`）——
 * **`id` 完全一样**。所以「在哪个包里」只能由渲染上下文回答，不能由条目自述。
 *
 * 独立成文件而不是并进 `material-library-view.tsx`：那个文件 799 行，
 * 贴着 `material-library-scope.test.mjs` 管的 800 行硬顶，塞不下。
 */

import { useMemo } from "react";
import { materialArtifactDedupeKey } from "./material-library-dedupe";
import type {
  MaterialPackView,
  MaterialPackViewInput,
} from "./material-pack-model";
import { useMaterialPackView } from "./material-pack-scope";
import type { MaterialSceneView } from "./material-scene-axis";
import type { WorkspaceLibraryEntry } from "./workspace-library-model";

/** 空串 = 没有包上下文，详情按兜底顺序挑落点（锚定 app → 主归属）。 */
export type MaterialPackAppResolver = (
  entry: WorkspaceLibraryEntry | undefined,
) => string;

/**
 * 当前分类下，每件素材进了哪些包（值是包的 appId，按包的展示顺序）。
 *
 * 只收 `view.packs` —— 那是**当前分类 / `?app=` 锚点筛过**的那批包，正是用户此刻
 * 眼前的东西。跨包重复在这里是允许的（操作员明确要的），所以值是数组不是单值。
 * `appId` 为空的兜底包（「其他素材」）不进来：它不是一个能落脚的 app。
 */
export function materialPackMembership(
  view: MaterialPackView | null,
): Map<string, string[]> {
  const membership = new Map<string, string[]>();
  for (const pack of view?.packs || []) {
    if (!pack.appId) continue;
    for (const section of pack.sections) {
      for (const card of section.cards) {
        if (!card.artifactKey) continue;
        const packs = membership.get(card.artifactKey);
        if (!packs) membership.set(card.artifactKey, [pack.appId]);
        else if (!packs.includes(pack.appId)) packs.push(pack.appId);
      }
    }
  }
  return membership;
}

/**
 * 算出「这张卡在哪个包里」。三级阶梯，第一个有结论的胜出：
 *
 * 1. **卡片此刻显示在哪个 app 名下**（`MaterialSceneCard.appId`），且包视图确认
 *    这件素材确实在那个 app 的包里。货架上那张卡的归属标题就是用户看到的包上下文，
 *    它和包视图同源（两边都走 `materialEntryAppAttributions` + 同一套场景/锚点筛选），
 *    所以正常情况下这一级就命中。
 * 2. 这件素材在当前分类下**只进了一个包** —— 没有第二种可能，直接用它。
 * 3. **回空串**。进了多个包、又说不出用户点的是哪一个时，宁可交回兜底顺序，
 *    也不要随手挑一个：挑错了就是把用户送进一个他没在看的 app（判严不判松）。
 *
 * 拿不到包视图（还没下发、不在站点层）时返回 `undefined`，货架就不传这个 prop，
 * 详情行为与今天逐字相同——**缺包上下文绝不会退回过去那一排按钮**。
 */
export function materialPackAppIdResolver(
  view: MaterialPackView | null,
  sceneView: MaterialSceneView | null,
): MaterialPackAppResolver | undefined {
  const membership = materialPackMembership(view);
  if (membership.size === 0) return undefined;
  // 货架上每件素材当前显示在哪个 app 名下。分区轴已按 artifact 去重，一件一张卡。
  const shown = new Map<string, string>();
  for (const card of sceneView?.cards || []) {
    if (!card.appId || !card.artifactKey) continue;
    if (!shown.has(card.artifactKey)) shown.set(card.artifactKey, card.appId);
  }
  return (entry) => {
    const artifactKey = entry ? materialArtifactDedupeKey(entry) : "";
    const packs = artifactKey ? membership.get(artifactKey) : undefined;
    if (!packs || packs.length === 0) return "";
    const rendered = shown.get(artifactKey);
    if (rendered && packs.includes(rendered)) return rendered;
    return packs.length === 1 ? packs[0] : "";
  };
}

/**
 * 算包视图、下发、并回一个落点解析器。`input` 为 null（不在站点层）时什么都不做，
 * 返回 `undefined`。
 */
export function useMaterialPackLanding(
  input: MaterialPackViewInput | null,
  sceneView: MaterialSceneView | null,
): MaterialPackAppResolver | undefined {
  const view = useMaterialPackView(input);
  return useMemo(
    () => materialPackAppIdResolver(view, sceneView),
    [sceneView, view],
  );
}
