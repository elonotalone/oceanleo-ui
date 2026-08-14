"use client";

// ============================================================================
// @oceanleo/ui — 首页 app 卡片网格
// ----------------------------------------------------------------------------
// 一张卡 = 一个 app（本站 `lib/app-catalog.ts` 的 GoalApp）= 一个代表 prompt + 1–2 份
// 模板素材。首页不再渲染 PROMPT_LIBRARY 的纯文字 prompt 卡（那条路径留给未迁移的站，
// 见 HomeCards）。
//
// 版式与交互（合同 2026-07-26 §0.1 / §0.2，推翻 2026-07-25 那版的第 3/4 条）：
//   常态：左侧 1:1 **功能图**（`app.capabilityImage`；无图回退 emoji tint，**不留白**）
//         右上 app 名（深色 15px 半粗）、右下 tagline（浅色 13px，两行截断）
//   hover：**整张卡片放大**（`hover:scale-105` + `hover:z-10` 防被邻卡盖住），功能图
//         同时淡入铺满整卡，卡片下缘浮出**唯一一个** `prompt` 按钮
//   点卡片主体（未命中 `prompt` 按钮）= **打开大卡片**（模板详情浮层）
//   点 `prompt` = 把代表 prompt 灌进首页输入框（`[字段]` 荧光高亮由 LeoComposer 负责）
//   触屏没有 hover：`prompt` 按钮走 `@media (hover: none)` **常驻可见**，轻点卡片主体
//         直接开大卡片（不再有「第一次轻点只展开」这一态）
//   顶部按 `app.group` 出分类 tab（无 group 的归「全部」）；末位一张「查看全部 →」跳
//   `/workspace`；「添加 prompt」入口与用户自建卡保留，自建卡用无图 emoji 版式混排。
//
// 「预览」按钮已删除：点卡片本身就是预览，按钮属同义重复（合同 §0.2 第 3 条）。
// 代表 prompt 为空的 app（music 站 22 个 app 全是这样）：不渲染 `prompt` 按钮，**绝不
// 灌空串**；卡片主体仍可点开大卡片。
//
// 2026-07-27（合同 §0.3 / §3.1 决策 D3）：**版式本身已搬进 `app-card-shell.tsx`**。
// 操作员要求工作台卡片与首页卡片「完完全全一样的格式」，两边各写一遍 CSS 必然漂移，
// 所以首页这侧只保留「取什么数据、点了去哪」，尺寸/圆角/hover 放大/铺满/触屏常驻按钮/
// 栅格一律由 `AppCardShell` 与 `APP_CARD_GRID_CLASS` 提供，工作台（W2）消费同一份。
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import {
  appTemplates,
  capabilityImageOf,
  representativePrompt,
  type GoalApp,
} from "./app-catalog";
import {
  APP_CARD_GRID_CLASS,
  AppCardFrame,
  AppCardShell,
  AppCardText,
  AppCardThumb,
} from "./app-card-shell";
import { workspaceAppFillHref } from "./site-catalog-controller";
import {
  loadCustomPromptCards,
  promptCardsForSite,
  saveCustomPromptCards,
  type PromptCard,
} from "./home-cards";
import { AddPromptModal, PromptCardModal } from "./HomePromptModals";
import { TemplateShowcase } from "./ImageLightbox";
import { MyAppsRail } from "./MyAppsRail";
import { capabilityImageThumbSrc } from "../lib/app-capability-image";
import { brandColorFor } from "../lib/brand-color";
import { useUI } from "../i18n/ui/useUI";

/** 分类 tab 的「全部」哨兵值（不会与站点自定义 group 撞名）。 */
export const HOME_APP_ALL_GROUP = "__all__";
/** 首页精选张数默认上限（合同 §0 第 10 条：只放精选 8–12 张）。 */
export const HOME_APP_FEATURED_LIMIT = 12;
/** 「查看全部 →」目标：本站工作台目录。 */
export const HOME_APP_SEE_ALL_HREF = "/workspace";

/** 出现在首页的 app（隐藏在目录外的运行时不算）。 */
function visibleApps(apps: GoalApp[]): GoalApp[] {
  return (apps || []).filter((a) => a && a.id && !a.hiddenFromDirectory);
}

/**
 * 顶部分类 tab 的 group 列表（按 catalog 里首次出现的顺序去重）。没有 `group` 的 app
 * 不产生 tab —— 它们只在「全部」里出现。
 */
export function homeAppGroups(apps: GoalApp[]): string[] {
  const seen: string[] = [];
  for (const app of visibleApps(apps)) {
    const group = (app.group || "").trim();
    if (group && !seen.includes(group)) seen.push(group);
  }
  return seen;
}

/** 当前分类下的精选 app（「全部」含无 group 的卡）。 */
export function featuredHomeApps(
  apps: GoalApp[],
  limit = HOME_APP_FEATURED_LIMIT,
  group: string = HOME_APP_ALL_GROUP,
): GoalApp[] {
  const pool =
    group === HOME_APP_ALL_GROUP
      ? visibleApps(apps)
      : visibleApps(apps).filter((a) => (a.group || "").trim() === group);
  return limit > 0 ? pool.slice(0, limit) : pool;
}

/**
 * 大卡片**无模板时**的回退大图（合同 §0.1：模板素材只在大卡片里出现，功能图只在首页）。
 *
 * 返回的是 **key 或 URL，不是 `<img src>`**——函数名里的 `Key` 是认真的。拼链由
 * `TemplateShowcase` 那侧的 `assetPreviewUrl(imageKey)` 完成，这里再拼一次会拼两遍。
 *
 * 有模板的 app 走不到这里——大卡片主预览由 `TemplateShowcase` 从当前选中模板的
 * `previewUrl` 解析。这里只负责把功能图那一张换成大图变体：站点 catalog 里的图既可能是
 * 稳定素材 key，也可能是已拼好的 `<key>.thumb.webp` 直链，而 `assetPreviewUrl` 对完整
 * URL 是原样透传，不换掉后缀的话大卡片放大的仍是那张 60px 缩略图。
 */
export function appPreviewImageKey(app: GoalApp): string | undefined {
  const source = capabilityImageOf(app) || "";
  if (!source) return undefined;
  return source.replace(/\.thumb\.webp$/i, ".webp");
}

// ---------------------------------------------------------------------------
// 单张卡（版式来自共享外壳 `app-card-shell.tsx`，首页与工作台同一份代码）
// ---------------------------------------------------------------------------

function AppCard({
  app,
  accent,
  onPick,
  onOpen,
}: {
  app: GoalApp;
  accent: string;
  onPick: (prompt: string) => void;
  /** 点卡片主体 = 打开大卡片（模板详情浮层）。 */
  onOpen: (app: GoalApp) => void;
}) {
  const tt = useUI();
  const prompt = representativePrompt(app);
  // `capabilityImageOf()` 只裁决数据源，**原样返回 OSS key**（`cap-app/<site>-<app>`），
  // 不是 URL——规范要求站点 catalog 存 key 不存 URL。直接塞进 `<img src>` 会被浏览器
  // 当相对路径请求，30 个站的卡片图全部 404。拼链统一走 W5 的 `capabilityImageThumbSrc`
  // （它对已经是完整 http(s) URL 的旧数据原样透传，所以未迁移的站也安全）。
  //
  // 卡面 96px 方块与 hover 铺满层**共用同一条 thumb 直链**，这是刻意的，不是照抄：
  //   · 512×512 的 thumb 对 96px 方块绰绰有余；
  //   · 铺满层是盖着 `bg-stone-900/25` 压暗层、垫在文字底下的装饰背景，尺寸约
  //     360×100 CSS（hover 放大后约 378×105），512 宽在 2× 屏上是 1.48 倍上采样——
  //     功能图按规范是单主体高对比的平面示意图，不是照片，这个幅度看不出来；
  //   · 换成 preview（1024×1024，≤160KB）会让首页 12 张卡**每张多发一次请求**、
  //     多约 1.9MB，只为换一层被压暗 25% 的背景。真正需要 1024 的是大卡片主预览，
  //     那条走 `appPreviewImageKey` → `TemplateShowcase` 的 `assetPreviewUrl`。
  const image = capabilityImageThumbSrc(capabilityImageOf(app));

  return (
    <AppCardShell
      app={app}
      image={image}
      variant="home"
      accent={accent}
      /* 点卡片主体 = 打开大卡片；点主按钮 = 把代表 prompt 灌进首页输入框。代表 prompt
         为空（music 站 22 个 app）→ 不给 primaryAction，整条按钮不渲染，不灌空串。 */
      onCardClick={() => onOpen(app)}
      primaryAction={prompt ? { label: tt("prompt"), onClick: () => onPick(prompt) } : null}
    />
  );
}

/**
 * 用户自建卡：无图 emoji 版式，与 app 卡混排；右上角笔 = 查看/编辑。
 *
 * 合同 §0.2 第 4 条的「点卡片主体 = 打开大卡片」**不套用在这里**：自建卡既没有功能图也
 * 没有模板素材，套上去只会得到一张打不开任何东西的死卡。它的主动作保持旧语义 = 把自己
 * 的 prompt 灌进首页输入框 —— 那本来就是用户建这张卡的唯一目的。
 */
function CustomPromptCard({
  card,
  onPick,
  onEdit,
}: {
  card: PromptCard;
  onPick: (prompt: string) => void;
  onEdit: (card: PromptCard) => void;
}) {
  const tt = useUI();
  const color = brandColorFor(card.id || card.title);
  const title = tt(card.title);
  return (
    <AppCardFrame
      variant="home"
      actionLabel={title}
      onAction={() => onPick(card.prompt)}
      actions={
        <button
          type="button"
          onClick={() => onEdit(card)}
          title={tt("查看 / 编辑")}
          aria-label={tt("查看 / 编辑")}
          className="absolute right-1.5 top-1.5 rounded-md bg-white/80 p-1 text-stone-400 opacity-0 shadow-sm backdrop-blur-sm transition hover:bg-white hover:text-stone-600 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path
              d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      }
    >
      <AppCardThumb icon={card.icon || "✨"} color={color} alt={card.title} />
      <AppCardText
        name={title}
        tagline={tt(card.desc || card.prompt)}
        badge={
          <span className="shrink-0 rounded bg-stone-100 px-1 text-[10px] text-stone-400">
            {tt("我的")}
          </span>
        }
      />
    </AppCardFrame>
  );
}

// ---------------------------------------------------------------------------
// 网格本体
// ---------------------------------------------------------------------------

export interface HomeAppCardsProps {
  /** 本站 app 目录（`XXX_APPS`）。一个 app = 一张卡。 */
  apps: GoalApp[];
  /** 站点 id（自建卡按站隔离持久化）。 */
  siteId: string;
  accent?: string;
  /** 首页精选张数上限，默认 12。 */
  featuredLimit?: number;
  /** 点「prompt」按钮 / 点自建卡：把代表 prompt 灌进首页输入框。 */
  onPick: (prompt: string) => void;
}

export function HomeAppCards({
  apps,
  siteId,
  accent = "#4f46e5",
  featuredLimit = HOME_APP_FEATURED_LIMIT,
  onPick,
}: HomeAppCardsProps) {
  const tt = useUI();
  const [group, setGroup] = useState<string>(HOME_APP_ALL_GROUP);
  const [custom, setCustom] = useState<PromptCard[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PromptCard | null>(null);
  // 当前打开的大卡片（模板详情浮层）。点卡片主体即打开（合同 §0.2 第 4 条）。
  const [opened, setOpened] = useState<GoalApp | null>(null);

  // 自建卡沿用 home-cards 的 localStorage 存取（老数据不得丢）。
  useEffect(() => {
    setCustom(loadCustomPromptCards(siteId));
  }, [siteId]);

  const groups = useMemo(() => homeAppGroups(apps), [apps]);
  const shown = useMemo(
    () => featuredHomeApps(apps, featuredLimit, group),
    [apps, featuredLimit, group],
  );
  // 「添加 prompt」弹窗的预制库仍是 home-cards 的内置集（它不再当首页卡片来源）。
  const presets = useMemo(() => promptCardsForSite(siteId), [siteId]);
  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const c of custom) {
      if (c.category && !seen.includes(c.category)) seen.push(c.category);
    }
    return seen;
  }, [custom]);

  function persist(next: PromptCard[]) {
    setCustom(next);
    saveCustomPromptCards(siteId, next);
  }

  function saveAsMine(card: PromptCard) {
    if (!card.custom || !card.id.startsWith("custom-")) {
      persist([
        {
          ...card,
          id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          custom: true,
          category: card.category || tt("我的"),
        },
        ...custom,
      ]);
    } else {
      persist(custom.map((c) => (c.id === card.id ? { ...card, custom: true } : c)));
    }
  }

  const openedPrompt = opened ? representativePrompt(opened) : null;
  // 大卡片的模板集合走 W3 的 `appTemplates()`（已剔除缺 id/title/previewUrl/artifactId
  // 的脏条目），不要在这里重写一遍过滤 —— 切换条「1 份不显示、2 份才显示」的判据必须与
  // 数据侧同源。
  const openedTemplates = opened ? appTemplates(opened) : [];

  return (
    <section className="w-full" data-home-app-cards>
      <MyAppsRail variant="home" />

      {/* 分类 tab（按 app.group；无 group 的只在「全部」出现） */}
      <div className="flex flex-wrap items-center gap-1 border-b border-stone-200/70 pb-0">
        {[HOME_APP_ALL_GROUP, ...groups].map((g) => {
          const on = group === g;
          return (
            <button
              key={g}
              type="button"
              onClick={() => setGroup(g)}
              className={`relative px-3 pb-2 pt-1 text-[13px] transition ${
                on ? "font-semibold text-stone-900" : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {g === HOME_APP_ALL_GROUP ? tt("全部") : tt(g)}
              {on && (
                <span
                  className="absolute inset-x-2.5 -bottom-px h-[2px] rounded-full"
                  style={{ background: accent }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* 每行三个（合同 §0.2 第 5 条）。lg 下单卡约 360px，`hover:scale-105` 每边外扩约
          9px，比 12px 沟槽的一半略多——所以整卡放大必须配 `hover:z-10`，否则 DOM 顺序靠
          后的邻卡会盖住它的右边缘。本容器与外层链路都没有 overflow-hidden，不会被裁。
          栅格串本身在 `APP_CARD_GRID_CLASS`：工作台（W2）引同一个常量，列数与沟槽才不会
          在两侧各漂一点（合同 §0.3「逐像素与首页一致」）。 */}
      <div className={`mt-3 ${APP_CARD_GRID_CLASS}`}>
        {custom.map((c) => (
          <CustomPromptCard key={c.id} card={c} onPick={onPick} onEdit={setEditing} />
        ))}

        {shown.map((app) => (
          <AppCard key={app.id} app={app} accent={accent} onPick={onPick} onOpen={setOpened} />
        ))}

        {/* 「添加 prompt」入口（自建卡从这里来，localStorage 老数据不动） */}
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex min-h-[100px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-stone-300 bg-white/60 px-3 py-3 text-stone-400 transition hover:border-stone-400 hover:text-stone-600"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          <span className="text-[13px] font-medium">{tt("添加 prompt")}</span>
        </button>

        {/* 网格末位：查看全部 → /workspace */}
        <a
          data-home-app-see-all
          href={HOME_APP_SEE_ALL_HREF}
          className="flex min-h-[100px] flex-col items-center justify-center gap-1 rounded-xl border border-stone-200 bg-white/70 px-3 py-3 text-[13px] font-medium text-stone-600 shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow"
        >
          {/* 只用 17 语已覆盖的 `查看全部`：副标题曾是一条未进词典的中文串（V1-verdict R1），
              i18n 词典是 W3 独占目录，故本侧改为不再产出未翻译文案。 */}
          <span>{tt("查看全部")} →</span>
        </a>
      </div>

      {/* 大卡片（模板详情浮层，W3 的 `TemplateShowcase`）：左上主预览 + 左下多模板切换条
          + 右侧标题/说明/标签 + 右侧三颗按钮「预览&编辑」「生成类似」「更多」（合同 §0.4，
          「下载」本轮已从大卡片删除，入口迁到库详情页与探索页素材卡）。
          `imageKey` 只是**无模板**时的回退大图（功能图），有模板时主预览跟随选中项。 */}
      {opened && (
        <TemplateShowcase
          appId={opened.id}
          title={tt(opened.name)}
          templates={openedTemplates}
          imageKey={appPreviewImageKey(opened)}
          fallbackIcon={opened.icon ?? "✨"}
          accent={accent}
          prompt={openedPrompt}
          fillHref={workspaceAppFillHref(opened.id)}
          /* 「预览&编辑」与「更多」的目标**不在这里接线**：TemplateShowcase 默认就调
             `workspaceTemplatePreviewHref(appId, artifactId)` 与 `exploreAppHref(appId)`，
             在卡片侧转一手只会多一个能拼错的地方。
             也**不给 `editHref` 兜底**：那个 prop 是「无模板时预览&编辑落到哪」，而无模板
             时唯一能给的旧目标是 `workspaceAppAdvancedHref`（app 级重型编辑器）——正是操作员
             点名的「探索时误入重型功能」。
             宁可让那颗按钮整颗不出现（用户仍有「更多」去探索页）。 */
          onClose={() => setOpened(null)}
        />
      )}

      {adding && (
        <AddPromptModal
          accent={accent}
          presets={presets}
          existing={custom}
          categories={categories}
          onAdd={saveAsMine}
          onClose={() => setAdding(false)}
        />
      )}

      {editing && (
        <PromptCardModal
          card={editing}
          isNew={false}
          accent={accent}
          categories={categories}
          onUse={(text) => {
            onPick(text);
            setEditing(null);
          }}
          onSave={(card) => {
            saveAsMine(card);
            setEditing(null);
          }}
          onDelete={
            editing.custom
              ? () => {
                  persist(custom.filter((c) => c.id !== editing.id));
                  setEditing(null);
                }
              : undefined
          }
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
