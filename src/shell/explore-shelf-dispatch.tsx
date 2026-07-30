"use client";

/**
 * 探索页的呈现模式分派：**按 artifact 类型选布局**（本轮合同 §0 P2）。
 *
 * 这一层刻意住在共享包里、由 `material-library-view.tsx` 调用，而不是做成 game 站的
 * 站内特例。原因是跨站门禁把 `/explore` 的形状锁死了：站点侧只许出现
 * `siteKey appId accent className` 四个属性（`oceanleo-capability-parity-gate.sh` 的
 * C4 与 `game/tests/shell-standard.test.ts` 各锁一遍），任何能力开关一旦暴露给站点，
 * 36 站的一致性门禁立刻红。所以「这一站有没有可玩作品、可玩那一类该用什么布局」
 * 只能由共享包自己按 artifact 类型推导出来。
 *
 * 两件事在这里完成：
 *   1) **可玩探针**：单独按 `artifactType=game` 检索一次。不这么做的话，可玩作品会被
 *      同一页里成千上万份素材挤出结果集——一站 118 款游戏配几千份素材，混检索的第一
 *      页里可能一款游戏都没有，「可玩游戏」那一格就永远不会出现。
 *   2) **分区轴 + 布局分派**：可玩那一类走整屏竖向 feed（唯一布局，P1），素材那一类
 *      走既有网格货架（预览 / 编辑 / 下载全部保留）。
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ArtifactContextRef } from "./artifact-contract";
import {
  EXPLORE_PLAYABLE_ARTIFACT_TYPES,
  EXPLORE_PLAYABLE_MAX_PAGES,
  EXPLORE_PLAYABLE_PAGE_LIMIT,
  defaultExploreClass,
  exploreClassChips,
  exploreEntriesOfClass,
  exploreRenderModeFor,
  type ExploreArtifactClass,
  type ExploreClassAxis,
  type ExploreRenderMode,
} from "./explore-artifact-class";
import { ExplorePlayableFeed } from "./ExplorePlayableFeed";
import type { LibraryItem } from "./library-data";
import {
  queryMaterialLibrary,
  type MaterialLibraryQueryInput,
} from "./material-library-controller";
import {
  entriesFromRemoteResult,
  materialShelfEntries,
} from "./material-library-presentation";
import type { WorkspaceLibraryEntry } from "./workspace-library-model";

/** 探索页交给货架的受控分类。给了就启用分派，不给就是今天的纯网格货架。 */
export interface ExploreClassDispatchInput {
  /** `null` = 还没选过，由 `defaultExploreClass()` 按有没有可玩作品定。 */
  artifactClass: ExploreArtifactClass | null;
  onArtifactClassChange: (artifactClass: ExploreArtifactClass) => void;
}

export interface ExploreShelfDispatch {
  enabled: boolean;
  artifactClass: ExploreArtifactClass;
  renderMode: ExploreRenderMode;
  /** 工具条要渲染的两类分区轴；未启用时为 `null`。 */
  axis: ExploreClassAxis | null;
  /** 当前分类下该渲染的条目，已按真实热度排好。 */
  entries: WorkspaceLibraryEntry[];
  /** 探针是否已有结论。未启用时恒为真，这样调用方的 settle 判据不必分叉。 */
  settled: boolean;
  playableCount: number;
  /** 翻到页数上限仍未取完；`playableCount` 是下界而不是总数。 */
  playableTruncated: boolean;
  playableError: string;
}

/** Official / promoted games land as `generated_output`, never `template`. */
const EXPLORE_PLAYABLE_LIBRARY_ROLE = "generated_output";

function playableRequest(siteKey: string): MaterialLibraryQueryInput {
  const context: ArtifactContextRef = {
    contextId: "",
    siteKey,
    appId: "",
  };
  return {
    level: "site",
    context,
    query: "",
    taxonomy: EXPLORE_PLAYABLE_ARTIFACT_TYPES[0],
    types: EXPLORE_PLAYABLE_ARTIFACT_TYPES,
    role: EXPLORE_PLAYABLE_LIBRARY_ROLE,
    // 素材货架那 60 条的默认页宽在这里不够用：artifact 游戏有 100 款，
    // 第一页装不下就等于第 61 款起永远打不开，「可玩游戏」那一格还会少报 40 款。
    limit: EXPLORE_PLAYABLE_PAGE_LIMIT,
  };
}

interface PlayablePages {
  entries: WorkspaceLibraryEntry[];
  /** 到达 `EXPLORE_PLAYABLE_MAX_PAGES` 时后面还有页没取，必须如实告诉读者。 */
  truncated: boolean;
  error: string;
}

/**
 * 把可玩探针一路翻到底。
 *
 * 单纯把 `limit` 调大解决不了问题：`artifact-client.ts` 的
 * `ARTIFACT_LIBRARY_MAX_LIMIT` 是 100，而 100 款游戏正好顶在上限上，之后再上线
 * 一款就掉出去。所以这里按 `nextCursor` 真的翻页。
 *
 * 两条防线让「翻页」不至于变成无界循环：页数硬上限，以及游标不前进就停
 * （后端把同一个游标回给我们时，继续翻只会原地打转）。
 */
async function loadPlayablePages(
  siteKey: string,
  signal: AbortSignal,
): Promise<PlayablePages> {
  const request = playableRequest(siteKey);
  const entries: WorkspaceLibraryEntry[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < EXPLORE_PLAYABLE_MAX_PAGES; page += 1) {
    const result = await queryMaterialLibrary({ ...request, cursor, signal });
    if (!result.ok || !result.data) {
      return {
        entries,
        truncated: false,
        error: result.error || "可玩作品暂时无法加载。",
      };
    }
    entries.push(
      ...entriesFromRemoteResult(
        result.data.items,
        "site",
        request.context,
        "",
        request.taxonomy,
      ),
    );
    const next = result.data.nextCursor;
    if (!next || seenCursors.has(next)) {
      return { entries, truncated: false, error: "" };
    }
    seenCursors.add(next);
    cursor = next;
  }
  return { entries, truncated: true, error: "" };
}

/**
 * 本站可玩作品的独立检索。
 *
 * 与素材那条检索**分开发**，不是重复取数：两者的作用域不同（这一条按
 * `artifactType=game` 收窄），而且这一条的结果同时是「可玩游戏」那一格的计数来源——
 * 计数必须与当前选中的分类无关，否则读者切到素材那一类之后，可玩那一格会因为
 * 「这一页里没有 game」而消失，再也切不回去。
 *
 * 取数走 `queryMaterialLibrary`，因此沿用它的 15s 新鲜缓存与同键请求去重：
 * 同一站的探索页重复挂载不会重复打网关。
 */
function useExplorePlayableShelf(input: {
  enabled: boolean;
  siteKey: string;
}): {
  entries: WorkspaceLibraryEntry[];
  settled: boolean;
  truncated: boolean;
  error: string;
} {
  const { enabled, siteKey } = input;
  const [entries, setEntries] = useState<WorkspaceLibraryEntry[]>([]);
  const [settled, setSettled] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState("");
  const epochRef = useRef(0);

  useEffect(() => {
    if (!enabled || !siteKey) {
      setEntries([]);
      setError("");
      setTruncated(false);
      // 未启用 = 没有可玩那一层要等；不能留在「未 settle」上，否则调用方永远画骨架。
      setSettled(true);
      return;
    }
    const controller = new AbortController();
    const epoch = ++epochRef.current;
    setSettled(false);
    void loadPlayablePages(siteKey, controller.signal)
      .then((pages) => {
        if (controller.signal.aborted || epoch !== epochRef.current) return;
        setEntries(
          pages.error
            ? []
            : materialShelfEntries({
                level: "site",
                siteKey,
                deepLinked: [],
                officialTemplates: [],
                remote: pages.entries,
                exactLocal: [],
              }),
        );
        setTruncated(pages.truncated);
        setError(pages.error);
        setSettled(true);
      })
      .catch((caught) => {
        if (controller.signal.aborted || epoch !== epochRef.current) return;
        setEntries([]);
        setTruncated(false);
        setError(
          caught instanceof Error ? caught.message : "可玩作品请求失败，请重试。",
        );
        setSettled(true);
      });
    return () => controller.abort();
  }, [enabled, siteKey]);

  return { entries, settled, truncated, error };
}

export function useExploreShelfDispatch(input: {
  dispatch?: ExploreClassDispatchInput | null;
  /** 只有「本站素材」那一层分派；抽屉里的「此 app」面板形状一个字不变。 */
  level: string;
  siteKey: string;
  /** 网格货架当前算出来的条目（分区轴与筛选之后）。 */
  entries: readonly WorkspaceLibraryEntry[];
}): ExploreShelfDispatch {
  const enabled = Boolean(input.dispatch) && input.level === "site";
  const playable = useExplorePlayableShelf({
    enabled,
    siteKey: input.siteKey,
  });
  const playableEntries = useMemo(
    // 服务端已按 game 收窄；这里再按 artifact 类型过一遍是 fail-closed：
    // 没上线 `artifactTypes` 参数的部署会静默忽略收窄，那时素材会混进 feed。
    () => exploreEntriesOfClass(playable.entries, "playable"),
    [playable.entries],
  );
  const materialEntries = useMemo(
    // 素材那一格的成员来自 `EXPLORE_MATERIAL_ARTIFACT_TYPES` 那条全覆盖名单，
    // 第 15 / 16 类 `geo_map` / `interactive_doc` 就在里面（`explore-artifact-class.ts`
    // 有加载期不变量兜住漏项），所以两类新素材在探索页网格里可见、
    // 且**不会**被可玩探针那条 `artifactType=game` 收窄误收进竖向 feed。
    () => exploreEntriesOfClass(input.entries, "material"),
    [input.entries],
  );
  const requested = input.dispatch?.artifactClass ?? null;
  const artifactClass: ExploreArtifactClass = enabled
    ? requested || defaultExploreClass({ playableCount: playableEntries.length })
    : "material";
  const chips = useMemo(
    () =>
      exploreClassChips({
        playableCount: playableEntries.length,
        materialCount: materialEntries.length,
      }),
    [materialEntries.length, playableEntries.length],
  );
  const onSelect = input.dispatch?.onArtifactClassChange;
  const axis: ExploreClassAxis | null =
    enabled && onSelect
      ? {
          chips,
          selected: artifactClass,
          onSelect,
          hideTypeFilter: artifactClass === "playable",
        }
      : null;
  return {
    enabled,
    artifactClass,
    renderMode: exploreRenderModeFor(artifactClass),
    axis,
    entries: artifactClass === "playable" ? playableEntries : materialEntries,
    settled: !enabled || playable.settled,
    playableCount: playableEntries.length,
    playableTruncated: playable.truncated,
    playableError: playable.error,
  };
}

/**
 * 可玩那一类的整块呈现。货架的返回分支只有一行，所有布线在这里。
 *
 * `onPlay` 是**可选的旁路通知**，不是落点：真正的「开玩」落点是 feed 里那条
 * `artifactPlayHref()` 算出来的链接。宿主想接管客户端路由时才传它。
 */
export function ExplorePlayableSurface({
  dispatch,
  toolbar,
  accent,
  loading,
  failure,
  onPlay,
  className,
}: {
  dispatch: ExploreShelfDispatch;
  toolbar: ReactNode;
  accent: string;
  loading: boolean;
  failure: { title: string; description: string } | null;
  onPlay?: (item: LibraryItem) => void;
  className: string;
}) {
  return (
    <ExplorePlayableFeed
      entries={dispatch.entries}
      accent={accent}
      toolbar={toolbar}
      loading={loading}
      settled={dispatch.settled}
      truncated={dispatch.playableTruncated}
      failure={
        failure ||
        (dispatch.playableError
          ? {
              title: "可玩作品暂时无法显示",
              description: dispatch.playableError,
            }
          : null)
      }
      onPlay={onPlay}
      className={className}
    />
  );
}
