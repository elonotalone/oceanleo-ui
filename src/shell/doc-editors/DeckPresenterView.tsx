"use client";

// ============================================================================
// 放出去给人看的那一面
// ----------------------------------------------------------------------------
// 三种面共用一份实现：`stage-only`（投影出去的那块屏）、`dual-window`
// （讲者自己看的那块屏）、`split-fallback`（第二块屏开不出来时的单窗分屏）。
// 之所以是一份而不是三份：三者的状态机、键位、计时、笔迹完全一样，
// 差的只是把哪几块摆出来。拆成三份的代价是「B 键在分屏里失灵」这类漏改。
//
// 三处不容商量的地方，改之前先读：
//
// **① 9 条 keyframes 在这里有一份权威副本。** 原本那份在 `DeckStage.tsx:485-493`
// 的内联 `<style>` 里，不在主题 CSS 管线（`globals.css` 无 `oleo-deck-*`）。
// 第二个窗口的 document 是全新的，里面没有 DeckStage，不自带就一定不播；
// 而 `DeckStage.tsx` 不是本份活的面，抽不出来共享。
// 于是**用判据兜漂移**：`tests/deck-presenter.test.mjs` 会读 `DeckStage.tsx` 源码，
// 把 `@keyframes oleo-deck-*` 逐条抽出来跟这份比，谁单方面改了哪一边，那条当场红。
//
// **② 动效 shorthand 与编辑器逐字相同，包括那个 `ease-out`。**
// 裸曲线擦着 `_COMMON.md` 红线 9，但 P1 明写放映必须与编辑器预览一致——
// 「否则用户在编辑器里调的动效在放映时看不到，等于白调」。两者冲突时以一致为准：
// `durationMs` 是用户数据不是裸时长，`ease-out` 与 `DeckStage` 保持一个字不差。
// 将来换成 motion token 时**两边必须同一次改**，漂移锁会在只改一边时当场红。
// 取舍写在 `verdicts/W16-delivery.md`，给 W01 的那一条在 `signals/W16-request.md`。
//
// **③ 这份视图拿不到任何写操作。** 入参只有 `DeckPresentationSource`
// （`{deck, startIndex}` 两个只读字段），所以放映途中不可能改坏用户的文稿。
// 排练表要写回备注时也不自己动手，交给 `onApplyRehearsalNotes` 让集成方去调
// `editor.patchSlide`。笔迹同理：只在两块屏之间走，永远不进 `DeckSlide`。
// ============================================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { UITranslate } from "../../i18n/ui/useUI";
import { humanErrorMessage } from "../human-error-message";
import {
  deckMasterFor,
  deckTheme,
  type DeckDocument,
  type DeckElement,
  type DeckSlide,
} from "./deck-schema";
import { DeckElementContent, deckShapeClipPath } from "./DeckElementContent";
import {
  openDetachedWindow,
  type DetachedWindowHandle,
  type TabLinkFactory,
} from "./DeckPresenterWindow";
import {
  deckRehearsalNoteLine,
  formatPresenterClock,
  useDeckPresenter,
  type DeckRehearsalRow,
  type PresenterFallbackReason,
  type PresenterRole,
  type PresenterSurface,
} from "./use-deck-presenter";
import type { DeckPresentationSource } from "./use-deck-editor";

/**
 * `DeckStage.tsx:485-493` 那 9 条的权威副本。**逐字相同**，由漂移锁测试守住。
 *
 * 不要「顺手美化」：多一个空格不会红（判据按空白归一化后比对），
 * 但改一个数值、少一条规则会当场红，而那正是它存在的理由。
 */
export const DECK_PRESENTER_KEYFRAMES = `
@keyframes oleo-deck-slide-fade{from{opacity:0}to{opacity:1}}
@keyframes oleo-deck-slide-push-left{from{translate:14% 0;opacity:.65}to{translate:0 0;opacity:1}}
@keyframes oleo-deck-slide-push-right{from{translate:-14% 0;opacity:.65}to{translate:0 0;opacity:1}}
@keyframes oleo-deck-slide-wipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0)}}
@keyframes oleo-deck-slide-zoom{from{scale:.82;opacity:0}to{scale:1;opacity:1}}
@keyframes oleo-deck-element-fade{from{opacity:0}to{opacity:1}}
@keyframes oleo-deck-element-fly-up{from{translate:0 28%;opacity:0}to{translate:0 0;opacity:1}}
@keyframes oleo-deck-element-wipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0)}}
@keyframes oleo-deck-element-zoom{from{scale:.72;opacity:0}to{scale:1;opacity:1}}
`;

/** 与 `DeckStage.tsx:561-563` 逐字相同。 */
export function deckSlideTransitionStyle(slide: DeckSlide): string | undefined {
  const transition = slide.transition;
  return transition
    ? `oleo-deck-slide-${transition.type} ${transition.durationMs}ms ease-out both`
    : undefined;
}

/** 与 `DeckStage.tsx:331-333` 逐字相同。 */
export function deckElementAnimationStyle(
  element: DeckElement,
): string | undefined {
  const animation = element.animation;
  return animation
    ? `oleo-deck-element-${animation.type} ${animation.durationMs}ms ease-out ${animation.delayMs}ms both`
    : undefined;
}

/**
 * 降级的每一种来源各有一句人话。
 *
 * P4 明令「不要静默变成另一种界面」：讲者上台前把窗口开出来失败了，
 * 他需要知道是**被浏览器拦了**（去关拦截）还是**这个浏览器就不支持**（换一个），
 * 两件事的下一步完全不同。所以这里不是一句通用的「已降级」。
 */
export const DECK_PRESENTER_FALLBACK_MESSAGE: Record<
  Exclude<PresenterFallbackReason, "none">,
  string
> = {
  blocked:
    "浏览器拦截了演讲者窗口。已切换为单窗口分屏；允许本站弹出窗口后可重新打开双屏。",
  unsupported:
    "当前环境打不开第二个窗口。已切换为单窗口分屏；备注与下一页改放在右侧。",
  "no-channel":
    "这个浏览器不支持窗口间同步，两块屏无法互相跟随。已切换为单窗口分屏。",
  "peer-closed": "另一个窗口已关闭。放映仍在继续，当前为单窗口分屏。",
};

const GENERIC_FALLBACK_MESSAGE =
  "演讲者窗口不可用。已切换为单窗口分屏，备注与下一页改放在右侧。";

/**
 * 没传 `translate` 时的退路。
 *
 * 界面上的源串本来就是中文，恒等函数退化后仍然读得懂——这比在子窗里硬调
 * `useUI()` 好：那个 hook 要 `<I18nProvider>` 与 next-intl 的 `useLocale()`
 * （`src/i18n/ui/useUI.ts:104-106`），而第二个窗口是独立的 React root，没有 provider，
 * 硬调必炸。正确接法是主窗调一次 `useUI()` 把 `tt` 当 prop 传进来
 * （同一个 JS realm，函数可以直接传，不需要序列化）。
 */
const identityTranslate: UITranslate = (zh, vars) =>
  vars
    ? zh.replace(/\{(\w+)\}/g, (match, key: string) =>
        key in vars ? String(vars[key]) : match,
      )
    : zh;

function slideAspectRatio(deck: DeckDocument): number {
  return deck.aspect === "4:3" ? 4 / 3 : 16 / 9;
}

function slideLabel(slide: DeckSlide | undefined, index: number): string {
  return slide?.title.trim() || `第 ${index + 1} 页`;
}

// ── 只读幻灯渲染 ─────────────────────────────────────────────────────────────

/**
 * 有定位元素的那一支。几何照 `DeckStage.tsx:300-333`，去掉全部编辑 chrome
 * （选中框、把手、双击进编辑、`data-deck-edit-text`）。
 *
 * 内容复用 `DeckElementContent`：它只 import react 与 deck-schema 的类型，
 * 不碰 context 也不调 `useUI()`，所以在第二个窗口的独立 root 里是安全的。
 * `editing` 默认 false，拿不到任何写回口。
 */
function PositionedPresenterSlide({ slide }: { slide: DeckSlide }) {
  return (
    <>
      {[...slide.elements]
        .sort((left, right) => left.order - right.order)
        .map((element) => {
          const shapeClip =
            element.type === "shape"
              ? deckShapeClipPath(element.shape)
              : undefined;
          return (
            <div
              key={element.id}
              data-deck-presenter-element={element.id}
              data-element-type={element.type}
              className="absolute overflow-visible text-left"
              style={{
                left: `${element.x}%`,
                top: `${element.y}%`,
                width: `${element.width}%`,
                height: `${element.height}%`,
                transform: `rotate(${element.rotation}deg)`,
                zIndex: Math.round(element.order),
                opacity: element.opacity ?? 1,
                background:
                  element.type === "shape" && element.shape !== "line"
                    ? element.fill || "transparent"
                    : undefined,
                border:
                  (element.type === "shape" || element.type === "image") &&
                  element.borderWidth
                    ? `${element.borderWidth}px solid ${element.borderColor || "#000"}`
                    : undefined,
                borderRadius:
                  element.type === "shape" && element.shape === "circle"
                    ? "50%"
                    : `${element.borderRadius || 0}px`,
                boxShadow: element.shadow
                  ? "0 14px 32px rgba(15,23,42,.24)"
                  : undefined,
                clipPath: shapeClip,
              }}
            >
              <div
                data-deck-presenter-element-animation={
                  element.animation ? element.animation.type : "none"
                }
                className="h-full w-full overflow-hidden rounded-[inherit]"
                style={{ animation: deckElementAnimationStyle(element) }}
              >
                <DeckElementContent element={element} />
              </div>
            </div>
          );
        })}
    </>
  );
}

/**
 * 没有定位元素的老版式。
 *
 * `DeckLegacySlideLayout` 在这里用不了：它整屏是 `<textarea>`，而且要一个完整的
 * `DeckEditorState`（放映态刻意只有只读的两个字段）。所以照它的版式写一份只读的。
 *
 * 字号用 `cqw` 而不是原件的 `vw`：这一份要同时出现在整屏投影和演讲者窗里那块
 * 小预览上，`vw` 会让小预览里的标题跟投影一样大，直接糊出去。
 */
function LegacyPresenterSlide({
  deck,
  slide,
}: {
  deck: DeckDocument;
  slide: DeckSlide;
}) {
  const theme = deckTheme(deck.theme);
  const master = deckMasterFor(deck, slide);
  const isCenter = slide.layout === "title" || slide.layout === "section";
  const hasImage =
    slide.layout === "image-left" || slide.layout === "image-right";
  const imageLeft = slide.layout === "image-left";

  const textPanel = (
    <div
      className={`flex min-w-0 flex-1 flex-col ${
        isCenter ? "items-center justify-center text-center" : "justify-start"
      }`}
    >
      <h2
        className={`w-full font-bold ${
          isCenter ? "text-center text-[6cqw]" : "text-[4.4cqw]"
        }`}
        style={{
          color: master.textColor || theme.text,
          fontFamily: master.fontFamily || theme.fontFamily,
        }}
      >
        {slide.title}
      </h2>
      {slide.layout !== "blank" && slide.body.trim() && (
        <p
          className={`mt-[1.5cqw] w-full whitespace-pre-wrap text-[2.4cqw] leading-relaxed ${
            isCenter ? "text-center" : "text-left"
          }`}
          style={{ color: theme.muted, fontFamily: theme.fontFamily }}
        >
          {slide.body}
        </p>
      )}
      {slide.layout !== "blank" && slide.bullets.length > 0 && (
        <ul
          className={`mt-[2cqw] w-full space-y-[1.2cqw] text-[2.3cqw] ${
            isCenter ? "text-left" : ""
          }`}
          style={{ color: theme.text }}
        >
          {slide.bullets.map((bullet, index) => (
            <li key={`${index}-${bullet}`} className="flex gap-[1.4cqw]">
              <span
                className="mt-[0.55em] h-[0.7cqw] w-[0.7cqw] shrink-0 rounded-full"
                style={{ background: master.accentColor || theme.accent }}
              />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const imagePanel = hasImage ? (
    <div
      className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-[2cqw]"
      style={{ background: theme.surface }}
    >
      {slide.image?.url ? (
        <img
          src={slide.image.url}
          alt={slide.image.alt || ""}
          className="h-full w-full object-cover"
        />
      ) : null}
    </div>
  ) : null;

  return (
    <div className="flex h-full w-full p-[6cqw]">
      <span
        className="absolute left-[6cqw] top-[4cqw] h-[0.5cqw] w-[9cqw] rounded-full"
        style={{ background: master.accentColor || theme.accent }}
      />
      <div
        className={`flex min-h-0 w-full gap-[5cqw] ${hasImage ? "" : "items-stretch"}`}
      >
        {imageLeft && imagePanel}
        {textPanel}
        {!imageLeft && imagePanel}
      </div>
    </div>
  );
}

/**
 * 一整页，含切换动效。
 *
 * **`key` 落在带动效的那个包裹层上，这是「动效要真的播放」的全部机关。**
 * CSS 动画只在 `animation` 这个值**变化**时才重启；连着两页都是
 * `fade 400ms` 时字符串一模一样，不换节点就一帧都不会播。
 * `DeckStage` 那边的包裹层不带 key（编辑态里翻页只在两页动效不同时才看得见一次），
 * 放映态不能这样——讲者每翻一页都要看到他在编辑器里调的那个动效。
 * 动效**声明**与编辑器逐字相同，变的只是「什么时候重新播」。
 */
function PresenterSlideSurface({
  deck,
  slide,
  index,
  className = "",
  children,
}: {
  deck: DeckDocument;
  slide: DeckSlide | undefined;
  index: number;
  className?: string;
  children?: ReactNode;
}) {
  const theme = deckTheme(deck.theme);
  const master = slide ? deckMasterFor(deck, slide) : undefined;
  return (
    <div
      data-deck-presenter-slide={slide?.id ?? ""}
      className={`relative overflow-hidden ${className}`}
      style={{
        aspectRatio: `${slideAspectRatio(deck)}`,
        background: slide?.background || master?.background || theme.background,
        color: master?.textColor || theme.text,
        fontFamily: master?.fontFamily || theme.fontFamily,
        containerType: "inline-size",
      }}
    >
      {slide && (
        <div
          key={`${slide.id}:${index}`}
          data-deck-presenter-transition={slide.transition?.type ?? "none"}
          className="h-full w-full"
          style={{ animation: deckSlideTransitionStyle(slide) }}
        >
          {slide.elements.length > 0 ? (
            <PositionedPresenterSlide slide={slide} />
          ) : (
            <LegacyPresenterSlide deck={deck} slide={slide} />
          )}
        </div>
      )}
      {children}
    </div>
  );
}

// ── 笔迹 ─────────────────────────────────────────────────────────────────────

/**
 * 画笔与激光笔。坐标一律存成**页面百分比**，于是讲者在自己那块小屏上画的一笔，
 * 投影那块大屏上落在同一个地方。
 *
 * 激光笔不留痕：它是「看这里」，不是「记下来」。
 */
function PresenterInkLayer({
  strokes,
  tool,
  onCommit,
}: {
  strokes: readonly string[];
  tool: "off" | "pen" | "laser";
  onCommit: (strokes: readonly string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [laser, setLaser] = useState<{ x: number; y: number } | null>(null);
  const drawing = useRef(false);
  // 在途那一笔同时进 ref。`onPointerUp` 只看 ref：抬笔那一下如果和落笔挤在同一批
  // 更新里（真实设备上快速点一下就会这样），闭包里的 `draft` 还是上一帧的空串，
  // 整笔会被静静丢掉。渲染用 state，落账用 ref。
  const draftRef = useRef("");

  const pointAt = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    };
  };

  if (tool === "off" && strokes.length === 0) return null;

  return (
    <div
      data-deck-presenter-ink={tool}
      className={`absolute inset-0 z-30 ${
        tool === "off" ? "pointer-events-none" : "cursor-crosshair"
      }`}
      onPointerDown={(event) => {
        if (tool === "off") return;
        const point = pointAt(event);
        if (!point) return;
        if (tool === "laser") {
          setLaser(point);
          return;
        }
        drawing.current = true;
        draftRef.current = `M ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
        setDraft(draftRef.current);
      }}
      onPointerMove={(event) => {
        if (tool === "off") return;
        const point = pointAt(event);
        if (!point) return;
        if (tool === "laser") {
          setLaser(point);
          return;
        }
        if (!drawing.current) return;
        draftRef.current = `${draftRef.current} L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
        setDraft(draftRef.current);
      }}
      onPointerUp={() => {
        if (!drawing.current) return;
        drawing.current = false;
        if (draftRef.current) onCommit([...strokes, draftRef.current]);
        draftRef.current = "";
        setDraft("");
      }}
      onPointerLeave={() => setLaser(null)}
    >
      <svg
        className="h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {[...strokes, draft].filter(Boolean).map((path, index) => (
          <path
            key={`${index}-${path.length}`}
            d={path}
            fill="none"
            stroke="#ef4444"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {laser && tool === "laser" && (
          <circle cx={laser.x} cy={laser.y} r={1.2} fill="#ef4444" />
        )}
      </svg>
    </div>
  );
}

// ── 视图 ─────────────────────────────────────────────────────────────────────

export interface DeckPresenterViewProps {
  source: DeckPresentationSource;
  /** 摆哪一块。缺省是投影出去的那一面。 */
  surface?: PresenterSurface;
  /** 通道上的身份。缺省由 `surface` 推出，一般不用传。 */
  role?: PresenterRole;
  /** 两个窗口必须给同一个名字。 */
  channelName: string;
  /** 为什么降级。`split-fallback` 时务必给，界面要照着说。 */
  fallbackReason?: PresenterFallbackReason;
  /** 主窗调一次 `useUI()` 把 `tt` 传进来；子窗 root 里没有 provider。 */
  translate?: UITranslate;
  onExit?: () => void;
  /**
   * 排练表写回 deck 的接线。这份视图拿不到写操作，也不该拿到——
   * 集成方接 `editor.patchSlide` 即可，`deckRehearsalNoteLine(row)` 就是内容。
   */
  onApplyRehearsalNotes?: (rows: DeckRehearsalRow[]) => void;
  /** 注入口：jsdom 没有 `BroadcastChannel`；`null` 表示明确不要通道。 */
  linkFactory?: TabLinkFactory | null;
  /** 注入口：让排练计时的判据可控。 */
  now?: () => number;
  autoStartTimer?: boolean;
}

const CONTROL_CLASS =
  "rounded-md border border-white/15 bg-white/10 px-2.5 py-1 text-[12px] text-white/85 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60";

export function DeckPresenterView({
  source,
  surface = "stage-only",
  role,
  channelName,
  fallbackReason = "none",
  translate,
  onExit,
  onApplyRehearsalNotes,
  linkFactory,
  now,
  autoStartTimer,
}: DeckPresenterViewProps) {
  const tt = translate ?? identityTranslate;
  const resolvedRole: PresenterRole =
    role ?? (surface === "dual-window" ? "presenter" : "stage");
  const {
    state,
    current,
    next,
    count,
    elapsedMs,
    slideElapsedMs,
    linked,
    peerGone,
    ink,
    pushInk,
    run,
    handleKey,
    rehearsal,
    announceFarewell,
  } = useDeckPresenter({
    source,
    role: resolvedRole,
    channelName,
    onExit,
    linkFactory,
    now,
    autoStartTimer: autoStartTimer ?? surface !== "stage-only",
  });

  const rootRef = useRef<HTMLDivElement>(null);
  const [notesFontPx, setNotesFontPx] = useState(18);
  const [tool, setTool] = useState<"off" | "pen" | "laser">("off");
  const [showRehearsal, setShowRehearsal] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState("");

  // 键盘挂在**自己这份文档**上，不是主窗的 document。演讲者窗是另一个 document，
  // 挂错地方的表现是「按键在讲者那块屏上全部失灵」，而那正是他唯一会去按的地方。
  useEffect(() => {
    const doc = rootRef.current?.ownerDocument;
    if (!doc) return;
    const onKeyDown = (event: KeyboardEvent) => {
      handleKey(event);
    };
    doc.addEventListener("keydown", onKeyDown);
    return () => doc.removeEventListener("keydown", onKeyDown);
  }, [handleKey]);

  // 窗口被直接关掉时 effect 的清理不一定跑得到，`pagehide` 补一条。
  useEffect(() => {
    const view = rootRef.current?.ownerDocument?.defaultView;
    if (!view || resolvedRole !== "stage") return;
    const onHide = () => announceFarewell();
    view.addEventListener("pagehide", onHide);
    return () => view.removeEventListener("pagehide", onHide);
  }, [announceFarewell, resolvedRole]);

  useEffect(() => {
    const doc = rootRef.current?.ownerDocument;
    if (!doc) return;
    const sync = () => setFullscreen(Boolean(doc.fullscreenElement));
    sync();
    doc.addEventListener("fullscreenchange", sync);
    return () => doc.removeEventListener("fullscreenchange", sync);
  }, []);

  /**
   * 全屏。能力探测 + try/catch，被拒时走第一方 `humanErrorMessage()`
   * ——浏览器抛的是英文技术原文（`Permissions check failed` 之类），
   * 直接摆给讲者等于没说。jsdom 不实现这套 API，走的就是能力探测那一支。
   */
  const toggleFullscreen = useCallback(async () => {
    const node = rootRef.current;
    const doc = node?.ownerDocument;
    if (!node || !doc) return;
    try {
      if (doc.fullscreenElement) {
        if (typeof doc.exitFullscreen !== "function") {
          setNotice(tt("当前浏览器不支持全屏 API，请按 F11 退出全屏。"));
          return;
        }
        await doc.exitFullscreen();
        return;
      }
      if (typeof node.requestFullscreen !== "function") {
        setNotice(tt("当前浏览器不支持全屏 API，可以按 F11 手动全屏。"));
        return;
      }
      await node.requestFullscreen();
      setNotice("");
    } catch (error) {
      setNotice(
        humanErrorMessage(error, tt("浏览器拒绝了全屏请求，可以按 F11 手动全屏。")),
      );
    }
  }, [tt]);

  // 排练表是一张即时快照：计时器每 tick 一次、每翻一页都该重算。
  const rows = useMemo(
    () => (showRehearsal ? rehearsal() : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showRehearsal, state, elapsedMs],
  );

  /**
   * 到底降没降级，以及为什么。
   *
   * 顺序有讲究：调用方给的原因（开窗时当场量到的）最准；其次是「对面走了」；
   * 最后才是「这个浏览器没有通道」。`stage-only` 是单窗放映，本来就没有第二块屏，
   * 没有通道不算降级——把它也报成降级，讲者会以为出了事。
   */
  const resolvedFallback: PresenterFallbackReason =
    fallbackReason !== "none"
      ? fallbackReason
      : peerGone
        ? "peer-closed"
        : surface !== "stage-only" && !linked
          ? "no-channel"
          : "none";
  const fallbackText =
    resolvedFallback === "none"
      ? surface === "split-fallback"
        ? GENERIC_FALLBACK_MESSAGE
        : ""
      : DECK_PRESENTER_FALLBACK_MESSAGE[resolvedFallback];

  const blackoutOverlay =
    state.blackout === "none" ? null : (
      <div
        data-deck-presenter-blackout={state.blackout}
        aria-hidden="true"
        className="absolute inset-0 z-40"
        style={{ background: state.blackout === "black" ? "#000" : "#fff" }}
      />
    );

  const inkLayer = (
    <PresenterInkLayer strokes={ink} tool={tool} onCommit={pushInk} />
  );

  const pageIndicator = (
    <span
      data-deck-presenter-page={`${state.index + 1}/${count}`}
      className="text-[12px] tabular-nums text-white/70"
    >
      {state.index + 1} / {count}
    </span>
  );

  const jumpHint = state.jumpBuffer ? (
    <span
      role="status"
      data-deck-presenter-jump={state.jumpBuffer}
      className="rounded-md bg-white/15 px-2 py-1 text-[12px] tabular-nums text-white"
    >
      {tt("跳至第 {page} 页 · Enter 确认，Esc 取消", { page: state.jumpBuffer })}
    </span>
  ) : null;

  const fallbackNotice = fallbackText ? (
    <p
      role="status"
      data-deck-presenter-fallback={resolvedFallback}
      className="rounded-md border border-amber-300/40 bg-amber-300/15 px-3 py-2 text-[12px] leading-relaxed text-amber-100"
    >
      {tt(fallbackText)}
    </p>
  ) : null;

  const noticeLine = notice ? (
    <p
      role="status"
      data-deck-presenter-notice
      className="rounded-md border border-white/20 bg-white/10 px-3 py-2 text-[12px] leading-relaxed text-white/85"
    >
      {notice}
    </p>
  ) : null;

  const transportControls = (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        className={CONTROL_CLASS}
        onClick={() => run({ kind: "previous" })}
      >
        {tt("上一页")}
      </button>
      <button
        type="button"
        className={CONTROL_CLASS}
        onClick={() => run({ kind: "next" })}
      >
        {tt("下一页")}
      </button>
      <button
        type="button"
        data-deck-presenter-timer={state.timer.running ? "running" : "paused"}
        className={CONTROL_CLASS}
        onClick={() => run({ kind: "timer-toggle" })}
      >
        {state.timer.running ? tt("暂停计时") : tt("开始计时")}
      </button>
      <button
        type="button"
        className={CONTROL_CLASS}
        onClick={() => run({ kind: "timer-reset" })}
      >
        {tt("重置计时")}
      </button>
      <button
        type="button"
        data-deck-presenter-tool={tool}
        className={CONTROL_CLASS}
        onClick={() => setTool((current) => (current === "pen" ? "off" : "pen"))}
      >
        {tool === "pen" ? tt("收起画笔") : tt("画笔")}
      </button>
      <button
        type="button"
        className={CONTROL_CLASS}
        onClick={() =>
          setTool((current) => (current === "laser" ? "off" : "laser"))
        }
      >
        {tool === "laser" ? tt("收起激光笔") : tt("激光笔")}
      </button>
      {ink.length > 0 && (
        <button
          type="button"
          className={CONTROL_CLASS}
          onClick={() => pushInk([])}
        >
          {tt("擦除笔迹")}
        </button>
      )}
      <button
        type="button"
        className={CONTROL_CLASS}
        onClick={() => void toggleFullscreen()}
      >
        {fullscreen ? tt("退出全屏") : tt("全屏")}
      </button>
      <button
        type="button"
        className={CONTROL_CLASS}
        onClick={() => run({ kind: "escape" })}
      >
        {tt("结束放映")}
      </button>
    </div>
  );

  const clocks = (
    <div className="flex items-baseline gap-4">
      <span
        data-deck-presenter-elapsed={String(Math.floor(elapsedMs))}
        className="text-[30px] font-semibold tabular-nums text-white"
      >
        {formatPresenterClock(elapsedMs)}
      </span>
      <span
        data-deck-presenter-dwell={String(Math.floor(slideElapsedMs))}
        className="text-[15px] tabular-nums text-white/70"
      >
        {tt("本页 {time}", { time: formatPresenterClock(slideElapsedMs) })}
      </span>
    </div>
  );

  const notesPanel = (
    <section className="flex min-h-0 flex-1 flex-col gap-2">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-[12px] font-medium uppercase tracking-wide text-white/50">
          {tt("演讲者备注")}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={CONTROL_CLASS}
            aria-label={tt("缩小备注字号")}
            onClick={() => setNotesFontPx((size) => Math.max(12, size - 2))}
          >
            A-
          </button>
          <button
            type="button"
            className={CONTROL_CLASS}
            aria-label={tt("放大备注字号")}
            onClick={() => setNotesFontPx((size) => Math.min(40, size + 2))}
          >
            A+
          </button>
        </div>
      </header>
      <div
        data-deck-presenter-notes
        data-notes-font-px={String(notesFontPx)}
        className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-white/5 p-3 leading-relaxed text-white/90"
        style={{ fontSize: `${notesFontPx}px` }}
      >
        {current?.notes.trim() ? (
          current.notes
        ) : (
          <span className="text-white/40">{tt("这一页没有备注。")}</span>
        )}
      </div>
    </section>
  );

  const nextPanel = (
    <section className="flex flex-col gap-2">
      <h2 className="text-[12px] font-medium uppercase tracking-wide text-white/50">
        {tt("下一页")}
      </h2>
      {next ? (
        <div data-deck-presenter-next={next.id}>
          <PresenterSlideSurface
            deck={source.deck}
            slide={next}
            index={state.index + 1}
            className="w-full rounded-lg ring-1 ring-white/10"
          />
          <p className="mt-1.5 truncate text-[12px] text-white/60">
            {slideLabel(next, state.index + 1)}
          </p>
        </div>
      ) : (
        <p
          data-deck-presenter-next=""
          className="rounded-lg bg-white/5 p-3 text-[12px] text-white/40"
        >
          {tt("已经是最后一页。")}
        </p>
      )}
    </section>
  );

  const rehearsalPanel = (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[12px] font-medium uppercase tracking-wide text-white/50">
          {tt("排练用时")}
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={CONTROL_CLASS}
            onClick={() => setShowRehearsal((open) => !open)}
          >
            {showRehearsal ? tt("收起") : tt("查看每页用时")}
          </button>
          {showRehearsal && onApplyRehearsalNotes && (
            <button
              type="button"
              data-deck-presenter-apply-rehearsal
              className={CONTROL_CLASS}
              onClick={() => onApplyRehearsalNotes(rehearsal())}
            >
              {tt("写回备注")}
            </button>
          )}
        </div>
      </div>
      {showRehearsal && (
        <table
          data-deck-presenter-rehearsal
          className="w-full border-collapse text-left text-[12px] text-white/80"
        >
          <thead>
            <tr className="text-white/45">
              <th className="py-1 pr-2 font-normal">{tt("页")}</th>
              <th className="py-1 pr-2 font-normal">{tt("标题")}</th>
              <th className="py-1 pr-2 font-normal">{tt("用时")}</th>
              <th className="py-1 font-normal">{tt("占比")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                data-rehearsal-row={row.id}
                data-rehearsal-ms={String(Math.floor(row.totalMs))}
                title={deckRehearsalNoteLine(row)}
                className={row.index === state.index ? "text-white" : ""}
              >
                <td className="py-1 pr-2 tabular-nums">{row.index + 1}</td>
                <td className="max-w-[14rem] truncate py-1 pr-2">{row.title}</td>
                <td className="py-1 pr-2 tabular-nums">
                  {formatPresenterClock(row.totalMs)}
                </td>
                <td className="py-1 tabular-nums">{row.sharePercent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );

  const shellClass =
    "relative flex h-full min-h-0 w-full flex-col bg-[#0b0b0f] text-white outline-none";

  // ── 投影出去的那一面 ──────────────────────────────────────────────────────
  if (surface === "stage-only") {
    return (
      <div
        ref={rootRef}
        data-deck-presenter-surface="stage-only"
        role="region"
        aria-label={tt("放映")}
        tabIndex={0}
        className={`${shellClass} items-center justify-center`}
      >
        <style>{DECK_PRESENTER_KEYFRAMES}</style>
        <PresenterSlideSurface
          deck={source.deck}
          slide={current}
          index={state.index}
          className="max-h-full w-full max-w-full"
        >
          {inkLayer}
          {blackoutOverlay}
        </PresenterSlideSurface>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3">
          <div className="pointer-events-auto flex flex-col gap-2">
            {fallbackNotice}
            {noticeLine}
            {jumpHint}
          </div>
          <div className="pointer-events-auto flex items-center gap-3 opacity-40 transition-opacity focus-within:opacity-100 hover:opacity-100">
            {transportControls}
            {pageIndicator}
          </div>
        </div>
      </div>
    );
  }

  // ── 讲者自己看的那一面 ────────────────────────────────────────────────────
  if (surface === "dual-window") {
    return (
      <div
        ref={rootRef}
        data-deck-presenter-surface="dual-window"
        role="region"
        aria-label={tt("演讲者视图")}
        tabIndex={0}
        className={`${shellClass} gap-3 p-4`}
      >
        <style>{DECK_PRESENTER_KEYFRAMES}</style>
        <header className="flex flex-wrap items-center justify-between gap-3">
          {clocks}
          <div className="flex items-center gap-3">
            {jumpHint}
            {pageIndicator}
          </div>
        </header>
        {fallbackNotice}
        {noticeLine}
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col gap-2">
            <PresenterSlideSurface
              deck={source.deck}
              slide={current}
              index={state.index}
              className="w-full rounded-xl ring-1 ring-white/10"
            >
              {inkLayer}
              {blackoutOverlay}
            </PresenterSlideSurface>
            <p className="truncate text-[13px] text-white/70">
              {slideLabel(current, state.index)}
            </p>
            {transportControls}
          </div>
          <div className="flex min-h-0 flex-col gap-4 overflow-auto">
            {nextPanel}
            {notesPanel}
            {rehearsalPanel}
          </div>
        </div>
      </div>
    );
  }

  // ── 第二块屏开不出来时的那一面 ────────────────────────────────────────────
  return (
    <div
      ref={rootRef}
      data-deck-presenter-surface="split-fallback"
      role="region"
      aria-label={tt("放映（单窗口分屏）")}
      tabIndex={0}
      className={`${shellClass} gap-3 p-4`}
    >
      <style>{DECK_PRESENTER_KEYFRAMES}</style>
      {fallbackNotice}
      {noticeLine}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col gap-2">
          <PresenterSlideSurface
            deck={source.deck}
            slide={current}
            index={state.index}
            className="w-full rounded-xl ring-1 ring-white/10"
          >
            {inkLayer}
            {blackoutOverlay}
          </PresenterSlideSurface>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {transportControls}
            <div className="flex items-center gap-3">
              {jumpHint}
              {pageIndicator}
            </div>
          </div>
        </div>
        <div className="flex min-h-0 flex-col gap-4 overflow-auto">
          {clocks}
          {nextPanel}
          {notesPanel}
          {rehearsalPanel}
        </div>
      </div>
    </div>
  );
}

// ── 开第二块屏 ───────────────────────────────────────────────────────────────

export interface OpenDeckPresenterWindowOptions
  extends Omit<DeckPresenterViewProps, "surface" | "role" | "fallbackReason"> {
  title?: string;
  /** 注入口：jsdom 的 `window.open` 恒返回 `null`。 */
  opener?: (url: string, name: string, features: string) => Window | null;
  sourceDocument?: Document | null;
}

export type OpenDeckPresenterWindowResult =
  | { ok: true; handle: DetachedWindowHandle; dispose: () => void }
  | {
      ok: false;
      reason: Exclude<PresenterFallbackReason, "none" | "peer-closed">;
    };

/**
 * 同步开窗 → 异步挂 root。
 *
 * 两处**必须**这样写，不是风格问题：
 *
 * **① 开窗那一句必须同步。** 它得留在用户手势的调用栈里，`await` 一下就出栈了，
 * 拦截器一律当作程序自发弹窗拦掉。所以 `openDetachedWindow()` 不返回 Promise，
 * 而这个函数在第一个 `await` 之前就把窗开好。
 *
 * **② 子窗必须自己一个 React root，不能 `createPortal` 过去。**
 * React 的事件委托挂在 root 的 container 上；portal 到**另一个 document** 的容器时，
 * 那边的原生事件根本到不了这边的委托监听器，表现是演讲者窗里每一个按钮都按不动。
 * `await import("react-dom/client")` 顺带把这个 client-only 模块挡在 SSR 图之外，
 * 也是仓里已有的写法（`await import(` 27 处，`01-verified-facts.md` §1.7）。
 */
export async function openDeckPresenterWindow({
  title = "演讲者视图",
  opener,
  sourceDocument,
  ...viewProps
}: OpenDeckPresenterWindowOptions): Promise<OpenDeckPresenterWindowResult> {
  const outcome = openDetachedWindow({
    name: `oleo-deck-presenter-${viewProps.channelName}`,
    title,
    opener,
    sourceDocument,
  });
  if (!outcome.ok) return { ok: false, reason: outcome.reason };

  const { createRoot } = await import("react-dom/client");
  const root = createRoot(outcome.handle.container);
  root.render(
    <DeckPresenterView {...viewProps} surface="dual-window" role="presenter" />,
  );

  return {
    ok: true,
    handle: outcome.handle,
    dispose: () => {
      // 先卸载再关窗：反过来的话 React 会去操作一个已经销毁的 document。
      try {
        root.unmount();
      } catch {
        // 窗口先被用户关掉了，卸载失败无所谓。
      }
      outcome.handle.close();
    },
  };
}
