"use client";

/**
 * 可玩游戏的**竖向 feed**：整屏逐条 + 滚动吸附（本轮合同 §0 P1）。
 *
 * 参考对象是 Luddi 与 Astrocade 的整屏逐条滚动体验：一条占满内容视口，滚动吸附到
 * 下一条，热度高的在前。**只有这一种布局**——可玩那一类没有网格变体可选，所以本
 * 组件不接受任何 layout/variant 属性，`exploreRenderModeFor("playable")` 在类型层
 * 就只有 `vertical-feed` 一个取值。
 *
 * 吸附类名（W4 要把 `game/tests/shell-standard.test.ts` 的禁 feed 断言反转成正向的，
 * 逐字用这几个）：
 *   容器 `snap-y snap-mandatory overflow-y-auto overscroll-y-contain scroll-smooth`
 *   逐条 `snap-start snap-always`
 *
 * 为什么高度用 `h-full` 而不是 `h-[100dvh]`：探索页在共享外壳里，上面有站点 header、
 * 左边有侧栏。`100dvh` 会让每一条比可滚动视口更高，吸附点永远差一截，「整屏」反而
 * 得到半屏。`h-full` 撑满的是内容视口本身，那才是这一页的「整屏」。
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useUI } from "../i18n/ui/useUI";
import {
  artifactPlayHref,
  exploreEntryPopularity,
  exploreHasPopularityEvidence,
  type ExplorePopularity,
} from "./explore-artifact-class";
import type { LibraryItem } from "./library-data";
import {
  WorkspaceCoverResource,
  workspaceCoverPlan,
} from "./workspace-library-cover";
import type { WorkspaceLibraryEntry } from "./workspace-library-model";

/** 容器与逐条的吸附类名只在这里出现一次，证据与门禁都指着这两个常量。 */
export const EXPLORE_FEED_SCROLLER_CLASS =
  "h-full min-h-[32rem] snap-y snap-mandatory overflow-y-auto overscroll-y-contain scroll-smooth";
export const EXPLORE_FEED_ITEM_CLASS = "h-full min-h-[32rem] snap-start snap-always";

/** 「开玩」落点的取值锚点；验收与跨站门禁按这个属性名找它。 */
export const EXPLORE_FEED_PLAY_LINK_ATTR = "data-explore-feed-play";

export interface ExplorePlayableFeedProps {
  entries: readonly WorkspaceLibraryEntry[];
  accent?: string;
  /** 分区轴 / 筛选条，原样挂在 feed 上方（外壳骨架不动）。 */
  toolbar?: ReactNode;
  loading?: boolean;
  settled?: boolean;
  /** 探针翻到页数上限仍有剩；如实提示，不假装这就是全部。 */
  truncated?: boolean;
  failure?: { title: string; description: string } | null;
  emptyTitle?: string;
  emptyDescription?: string;
  /**
   * **可选**的旁路通知，不是落点。「开玩」走的是条目自己的
   * `artifactPlayHref()` 链接（独立派发通路，不经过编辑器那套检查）；
   * 传了这个回调就由宿主接管导航（用于客户端路由）。
   */
  onPlay?: (item: LibraryItem) => void;
  className?: string;
}

function popularityBadges(
  popularity: ExplorePopularity,
): { key: string; label: string; value: number }[] {
  if (!popularity.known) return [];
  return [
    { key: "plays", label: "游玩", value: popularity.plays },
    { key: "likes", label: "点赞", value: popularity.likes },
    { key: "remixes", label: "二创", value: popularity.remixes },
  ].filter((badge) => badge.value > 0);
}

/**
 * feed 的封面走 W1 的**三态**判据（合同 §3.2），不是布尔。
 *
 *   real               —— 照常显示。
 *   unknown-metadata   —— 元数据没写全，图本身没问题：**照常显示**，只在角上做一个
 *                         弱化标记。这一态绝不能写「封面不可用」，5 万份 SVG 与
 *                         7,013 份健康 webp 正是被那句话误杀的。
 *   proven-placeholder —— 已证实是占位图：明说它是占位图，不假装有封面。
 *
 * 取不到渲染器（`renderer === "unavailable"`）或图片自身加载失败时才落到文字位。
 */
function FeedCover({
  entry,
  alt,
}: {
  entry: WorkspaceLibraryEntry;
  alt: string;
}) {
  const tt = useUI();
  const item = entry.libraryItem;
  const [failed, setFailed] = useState(false);
  const plan = useMemo(
    () =>
      workspaceCoverPlan({
        item,
        kind: item?.kind || entry.kind || "image",
        url: entry.thumbUrl || item?.thumbUrl || item?.previewUrl || "",
      }),
    [entry.kind, entry.thumbUrl, item],
  );
  const evidence = plan.coverEvidence;
  if (failed || plan.renderer === "unavailable") {
    return (
      <div
        data-explore-feed-cover={evidence}
        aria-label={alt}
        role="img"
        className="flex h-full w-full items-center justify-center bg-[var(--surface-2,#f5f5f4)] px-6 text-center text-[13px] text-[var(--muted,#737373)]"
      >
        {tt(
          evidence === "proven-placeholder"
            ? "这张封面是占位图。"
            : "封面还没就绪。",
        )}
      </div>
    );
  }
  return (
    <div className="relative h-full w-full" data-explore-feed-cover={evidence}>
      <WorkspaceCoverResource
        plan={plan}
        alt={alt}
        resourceKey={`${entry.id}:${plan.url}`}
        className="h-full w-full"
        onReady={() => {}}
        onError={() => setFailed(true)}
      />
      {evidence === "unknown-metadata" ? (
        <span
          data-explore-feed-cover-note="unknown-metadata"
          className="absolute bottom-2 right-2 rounded-full bg-black/45 px-2 py-0.5 text-[11px] text-white"
        >
          {tt("封面信息不全")}
        </span>
      ) : null}
    </div>
  );
}

function FeedItem({
  entry,
  index,
  total,
  active,
  accent,
  onPlay,
  itemRef,
}: {
  entry: WorkspaceLibraryEntry;
  index: number;
  total: number;
  active: boolean;
  accent: string;
  onPlay?: (item: LibraryItem) => void;
  itemRef: (node: HTMLElement | null) => void;
}) {
  const tt = useUI();
  const popularity = exploreEntryPopularity(entry);
  const badges = popularityBadges(popularity);
  const item = entry.libraryItem;
  // 「开玩」的落点。**独立通路**：由 artifact 坐标（或目录落库的 `play_href`）
  // 直接算出播放地址，不经过 `openPreparedItem` / `isAdvancedEditableShelfItem`
  // 那套编辑器检查——100 款游戏是 view_only，走编辑器派发必抛。
  const playHref = item ? artifactPlayHref(item) : "";
  const play = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!item || !onPlay) return;
    // 新标签页/后台打开是浏览器的事，别把它抢过来。
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    try {
      onPlay(item);
    } catch {
      // 宿主接管导航时自己负责报错；feed 绝不让异常冒到滚动容器上。
    }
  };
  return (
    <article
      ref={itemRef}
      data-explore-feed-item={entry.id}
      data-explore-feed-index={String(index)}
      data-explore-feed-active={active ? "true" : "false"}
      data-explore-popularity={String(Math.round(popularity.score * 1000) / 1000)}
      data-explore-popularity-known={popularity.known ? "true" : "false"}
      aria-posinset={index + 1}
      aria-setsize={total}
      aria-label={entry.title}
      className={`${EXPLORE_FEED_ITEM_CLASS} relative flex w-full flex-col overflow-hidden`}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden bg-[var(--surface-2,#f5f5f4)]">
        <FeedCover entry={entry} alt={entry.title} />
      </div>
      <div className="shrink-0 border-t border-[var(--border,#e5e5e5)] bg-[var(--card,#fff)] px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-[17px] font-semibold text-[var(--fg,#171717)]">
              {entry.title}
            </h2>
            <p className="mt-0.5 truncate text-[12px] text-[var(--muted,#737373)]">
              {entry.category || tt("可玩游戏")}
            </p>
          </div>
          {playHref ? (
            <a
              href={playHref}
              data-explore-feed-play={entry.id}
              data-explore-feed-play-href={playHref}
              onClick={play}
              style={{ backgroundColor: accent }}
              className="shrink-0 rounded-full px-4 py-2 text-[13px] font-medium text-white"
            >
              {tt("开玩")}
            </a>
          ) : (
            <span
              data-explore-feed-play-unavailable={entry.id}
              className="shrink-0 rounded-full bg-[var(--surface-2,#f5f5f4)] px-4 py-2 text-[13px] text-[var(--muted,#737373)]"
            >
              {tt("这一款还没有可玩地址。")}
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[var(--fg-2,#57534e)]">
          {badges.length > 0 ? (
            badges.map((badge) => (
              <span
                key={badge.key}
                data-explore-feed-metric={badge.key}
                className="rounded-full bg-[var(--surface-2,#f5f5f4)] px-2 py-0.5"
              >
                {tt(badge.label)} {badge.value}
              </span>
            ))
          ) : (
            <span
              data-explore-feed-metric="none"
              className="text-[var(--muted,#737373)]"
            >
              {tt("这一条还没有热度数据。")}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * 逐条滚动吸附的可玩 feed。
 *
 * 排序不在这里做：调用方交上来的顺序已经是 `sortByExplorePopularity` 的结果
 * （热度降序，无热度数据的排在后面且保持服务端原顺序）。feed 只负责呈现，
 * 这样「排序对不对」能被纯函数用例断言，不必渲染一遍 DOM 才看得出来。
 */
export function ExplorePlayableFeed({
  entries,
  accent = "#4f46e5",
  toolbar,
  loading = false,
  settled = true,
  truncated = false,
  failure = null,
  emptyTitle = "本站还没有可玩作品",
  emptyDescription = "这里只显示本站已发布的可玩作品。",
  onPlay,
  className = "",
}: ExplorePlayableFeedProps) {
  const tt = useUI();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const popularityReady = exploreHasPopularityEvidence(entries);

  const registerItem = useCallback(
    (index: number) => (node: HTMLElement | null) => {
      itemRefs.current[index] = node;
    },
    [],
  );

  // 当前是第几条：用 IntersectionObserver 而不是 scroll 事件。吸附滚动的中间帧
  // 里 scrollTop 会落在两条之间，按它算索引会在滚动过程中来回跳。
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || entries.length === 0) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (records) => {
        for (const record of records) {
          if (!record.isIntersecting) continue;
          const index = Number(
            (record.target as HTMLElement).dataset.exploreFeedIndex,
          );
          if (Number.isInteger(index)) setActive(index);
        }
      },
      { root: scroller, threshold: 0.6 },
    );
    for (const node of itemRefs.current) {
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [entries]);

  const goTo = useCallback(
    (index: number) => {
      const bounded = Math.min(Math.max(index, 0), entries.length - 1);
      const node = itemRefs.current[bounded];
      if (!node) return;
      node.scrollIntoView({ behavior: "smooth", block: "start" });
      setActive(bounded);
    },
    [entries.length],
  );

  // 键盘也要能逐条走：吸附容器只有鼠标滚轮/触摸能用的话，键盘用户拿不到 feed。
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowDown" || event.key === "PageDown" || event.key === "j"
        ? 1
        : event.key === "ArrowUp" || event.key === "PageUp" || event.key === "k"
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    goTo(active + step);
  };

  const body =
    entries.length > 0 ? (
      <div
        ref={scrollerRef}
        role="feed"
        tabIndex={0}
        aria-label={tt("可玩游戏 feed")}
        aria-busy={loading || undefined}
        data-explore-feed="vertical"
        data-explore-render-mode="vertical-feed"
        data-explore-feed-count={String(entries.length)}
        data-explore-popularity-order="hot"
        data-explore-popularity-ready={popularityReady ? "true" : "false"}
        onKeyDown={onKeyDown}
        className={EXPLORE_FEED_SCROLLER_CLASS}
      >
        {entries.map((entry, index) => (
          <FeedItem
            key={entry.id}
            entry={entry}
            index={index}
            total={entries.length}
            active={index === active}
            accent={accent}
            onPlay={onPlay}
            itemRef={registerItem(index)}
          />
        ))}
        {truncated ? (
          <p
            data-explore-feed-truncated="true"
            className="px-5 py-4 text-center text-[12px] text-[var(--muted,#737373)]"
          >
            {tt("还有更多可玩作品未载入。")}
          </p>
        ) : null}
      </div>
    ) : (
      <div
        data-explore-feed="vertical"
        data-explore-render-mode="vertical-feed"
        data-explore-feed-count="0"
        className="flex h-full min-h-[20rem] flex-col items-center justify-center gap-1 px-6 text-center"
      >
        <p className="text-[14px] font-medium text-[var(--fg,#171717)]">
          {tt(
            failure ? failure.title : loading || !settled ? "正在加载可玩作品…" : emptyTitle,
          )}
        </p>
        <p className="text-[13px] text-[var(--muted,#737373)]">
          {tt(
            failure
              ? failure.description
              : loading || !settled
                ? "正在为你取回本站的可玩作品。"
                : emptyDescription,
          )}
        </p>
      </div>
    );

  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`}>
      {toolbar ? <div className="shrink-0">{toolbar}</div> : null}
      <div className="min-h-0 flex-1">{body}</div>
    </div>
  );
}
