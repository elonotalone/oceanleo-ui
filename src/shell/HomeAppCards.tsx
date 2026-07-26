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
// ============================================================================

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  appTemplates,
  capabilityImageOf,
  representativePrompt,
  type GoalApp,
} from "./app-catalog";
import {
  workspaceAppAdvancedHref,
  workspaceAppFillHref,
} from "./site-catalog-controller";
import {
  loadCustomPromptCards,
  promptCardsForSite,
  saveCustomPromptCards,
  type PromptCard,
} from "./home-cards";
import { AddPromptModal, PromptCardModal } from "./HomePromptModals";
import { TemplateShowcase } from "./ImageLightbox";
import { capabilityImageThumbSrc } from "../lib/app-capability-image";
import { brandColorFor, tintOf } from "../lib/brand-color";
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
// 单张卡（app 卡 / 自建 prompt 卡共用外壳：左方图 + 右文 + 覆盖式主动作按钮）
// ---------------------------------------------------------------------------

function CardShell({
  actionLabel,
  onAction,
  children,
  fill,
  actions,
}: {
  /** 覆盖式主动作按钮的无障碍名。 */
  actionLabel: string;
  /** 卡片主体的唯一主动作（app 卡 = 打开大卡片；自建卡 = 灌它自己的 prompt）。 */
  onAction: () => void;
  children: ReactNode;
  /** 主动作按钮**下方**的装饰层（hover 铺满的功能图），必须 `pointer-events-none`。 */
  fill?: ReactNode;
  /** 主动作按钮**上方**的可点元素（`prompt` 按钮、自建卡右上角的笔）。 */
  actions?: ReactNode;
}) {
  return (
    <div
      data-home-app-card
      className="group relative flex min-h-[100px] overflow-hidden rounded-xl border border-stone-200 bg-white text-left shadow-sm transition duration-200 hover:z-10 hover:scale-105 hover:border-stone-300 hover:shadow-lg"
    >
      {children}
      {fill}
      {/* 卡片根不再是 `role="button"`：它嵌着 <button>，而 role=button 的祖先里放可交互
          后代是 ARIA 违规（button 的 allowed content 不含 interactive descendant）。主
          动作改由这一枚覆盖式原生 <button> 承担，一次解决三件事：
            ① 嵌套违规消失（覆盖按钮与 `prompt` 按钮是兄弟，不是祖孙）；
            ② Enter/Space 由原生按钮处理，不再需要手写 onKeyDown —— 也就不会再因为
               keydown 从内部按钮冒泡上来而把整卡动作**多触发一次**；
            ③ 焦点顺序与焦点环由浏览器给，无障碍名单独可控。
          它排在 `fill` 之后、`actions` 之前：同为定位元素时后画的在上，所以铺满层被它
          盖住（本来就 pointer-events-none），而 `prompt` 按钮盖在它上面、照常可点。 */}
      <button
        type="button"
        data-home-app-card-main
        onClick={onAction}
        aria-label={actionLabel}
        className="absolute inset-0 cursor-pointer rounded-xl outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-500"
      />
      {actions}
    </div>
  );
}

/** 左侧 1:1 图块：有图放图，无图放 emoji tint（同尺寸，绝不留白）。 */
function SquareThumb({
  image,
  icon,
  color,
  alt,
}: {
  image?: string;
  icon: ReactNode;
  color: string;
  alt: string;
}) {
  return (
    <span className="relative block aspect-square w-[96px] shrink-0 overflow-hidden bg-stone-100">
      {image ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={image} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span
          className="grid h-full w-full place-items-center text-[26px] leading-none"
          style={{ background: tintOf(color, 0.14), color }}
        >
          {icon}
        </span>
      )}
    </span>
  );
}

/** 右侧文字：上深色 15px 半粗 app 名，下浅色 13px tagline（两行截断）。 */
function CardText({
  name,
  tagline,
  badge,
  touchActionSpace,
}: {
  name: string;
  tagline?: string;
  badge?: ReactNode;
  /** 触屏上 `prompt` 按钮常驻在卡片下缘：给它让出一条，别压住 tagline。 */
  touchActionSpace?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 flex-col justify-between px-3 py-2.5 ${
        touchActionSpace ? "[@media(hover:none)]:pb-8" : ""
      }`}
    >
      <div className="flex items-start gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-stone-800">{name}</span>
        {badge}
      </div>
      {tagline ? (
        <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-stone-500">{tagline}</p>
      ) : null}
    </div>
  );
}

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
  const color = app.logoColor || brandColorFor(app.id);
  const name = tt(app.name);
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
    <CardShell
      actionLabel={`${tt("查看")} ${name}`}
      onAction={() => onOpen(app)}
      fill={
        /* hover 时功能图淡入铺满整卡（无图的 app 用 tint 铺满，同样不留白）。整卡放大
           在 CardShell 的根 class 上，这一层只负责「铺满」。 */
        <span
          data-home-app-card-fill
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        >
          {image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span
              className="grid h-full w-full place-items-center text-[40px] leading-none"
              style={{ background: tintOf(color, 0.18), color }}
            >
              {app.icon ?? "✨"}
            </span>
          )}
          <span className="absolute inset-0 bg-stone-900/25" />
        </span>
      }
      actions={
        /* 卡片下缘唯一一个按钮：`prompt`（代表 prompt 为空 → 整条不渲染，不灌空串）。
           鼠标端从卡外浮进来；触屏没有 hover，`@media (hover: none)` 让它常驻可见，并把
           压暗渐变去掉（触屏上铺满层不出现，深色渐变会糊住白底卡的文字）。 */
        prompt ? (
          <span
            data-home-app-card-actions
            className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-full items-center justify-center gap-1.5 bg-gradient-to-t from-stone-900/70 to-transparent px-2 pb-2 pt-4 transition-transform duration-200 group-hover:translate-y-0 [@media(hover:none)]:translate-y-0 [@media(hover:none)]:justify-end [@media(hover:none)]:bg-none [@media(hover:none)]:pt-0"
          >
            <button
              type="button"
              onClick={() => onPick(prompt)}
              className="pointer-events-auto rounded-lg px-3 py-1 text-[12px] font-medium text-white shadow-sm transition hover:opacity-90"
              style={{ background: accent }}
            >
              {tt("prompt")}
            </button>
          </span>
        ) : undefined
      }
    >
      <SquareThumb image={image} icon={app.icon ?? "✨"} color={color} alt={name} />
      <CardText
        name={name}
        tagline={app.tagline ? tt(app.tagline) : undefined}
        touchActionSpace={Boolean(prompt)}
        badge={
          app.badge ? (
            <span className="shrink-0 rounded bg-stone-100 px-1 text-[10px] text-stone-500">
              {tt(app.badge)}
            </span>
          ) : undefined
        }
      />
    </CardShell>
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
    <CardShell
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
      <SquareThumb icon={card.icon || "✨"} color={color} alt={card.title} />
      <CardText
        name={title}
        tagline={tt(card.desc || card.prompt)}
        badge={
          <span className="shrink-0 rounded bg-stone-100 px-1 text-[10px] text-stone-400">
            {tt("我的")}
          </span>
        }
      />
    </CardShell>
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
          后的邻卡会盖住它的右边缘。本容器与外层链路都没有 overflow-hidden，不会被裁。 */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

      {/* 大卡片（模板详情浮层，W2 的 `TemplateShowcase`）：左上主预览 + 左下多模板切换条
          + 右侧标题/说明/标签 + 右侧「编辑模板」「生成类似」「下载」。
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
          /* 「编辑模板」与「下载」的目标**不在这里接线**：TemplateShowcase 默认就调 W4 的
             `workspaceTemplateEditHref` / `templateDownloadHref`，而且下载那条要拿到整份
             素材（端点按 artifact id 定位，`TemplateMaterial.id` 只保证同 app 内唯一）。
             在卡片侧转一手只会多一个能拼错的地方。 */
          editHref={workspaceAppAdvancedHref(opened.id)}
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
