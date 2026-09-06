"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { advancedWorkbenchStyle } from "./advanced-workbench-chrome";
import { pluginWorkbenchStyle, type PluginThemeMode } from "./plugin-theme";
import {
  useEditBarDockController,
  type EditBarDockController,
} from "./edit-bar-dock-controller";
import { EditBarCollapsedPill, EditBarPinButton } from "./EditBarDockControls";
import { editBarDockStorageKey } from "./edit-bar-dock-state";
import {
  EDIT_BAR_BUTTON_CLASS,
  EDIT_BAR_DIVIDER_CLASS,
  editBarCollapsedStyle,
  editBarPillStyle,
} from "./edit-bar-surface";
import type { WorkbenchIconName } from "./AdvancedEditorIcon";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import { AnchoredPopover, runAfterOverlayExit } from "./anchored-popover";
import { useAdvancedLayout } from "./advanced-layout-context";
import { PLUGIN_AGENT_DRAWER_ID } from "./plugin-chrome/agent-drawer";
import { useUI } from "../i18n/ui/useUI";
import {
  editBarRowCapacity,
  elementOuterInlineSize,
} from "./selection-toolbar-measure";
import { EditBarRowContext } from "./edit-bar-row-context";

export { useInsideEditBarRow } from "./edit-bar-row-context";

export type FloatingContextToolbarController = EditBarDockController;

/**
 * 页签必须永远能点。两行 chrome（`data-advanced-workbench-header` /
 * `data-plugin-chrome-rows` / `data-pane-header` / `data-plugin-page-row`）
 * 各自在 className 里静态带 `relative z-[2147483647]`，压在本 overlay
 * （zIndex 2_147_483_000）之上。这里不再在运行时改任何元素的 style ——
 * 手势点只许写 transform / opacity（tests/motion-compositor-only.test.mjs）。
 */
export function useFloatingContextToolbar({
  workspaceRootRef,
  stageRef,
  dockRootRef,
  resetKey,
  storageKey,
}: {
  workspaceRootRef?: RefObject<HTMLElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  dockRootRef?: RefObject<HTMLDivElement | null>;
  resetKey: string;
  storageKey?: string;
}): FloatingContextToolbarController {
  return useEditBarDockController({
    workspaceRootRef,
    stageRef,
    dockRootRef,
    resetKey,
    storageKey: storageKey || editBarDockStorageKey(resetKey),
  });
}

/** 文档段折进「更多」前，选中工具那一段至少保住 More 键（44）+ 一个间隙。 */
const SELECTION_SEGMENT_MIN_PX = 52;

/**
 * 行里宽度与本判定无关的「固定段」：撤销重做、分隔线、右段。选中段、文档段
 * （含它的 More 键）与不可见的量宽克隆都不算——前两者是本判定的输出。
 */
function isFixedRowSegment(child: HTMLElement): boolean {
  if (child.getAttribute("aria-hidden") === "true" || child.hidden) return false;
  return !(
    child.hasAttribute("data-edit-bar-document-slot") ||
    child.hasAttribute("data-edit-bar-document-more") ||
    child.hasAttribute("data-edit-bar-document-measure") ||
    child.hasAttribute("data-edit-bar-selection-slot")
  );
}

/**
 * 文档段要不要折进「更多」。判据全部来自与栏自身宽度无关的量：
 * 容量（外部边界）、撤销重做段、右段、文档段克隆的自然宽度、选中段的最小保留。
 * 所以它不会与 SelectionToolbar 的 More 分区互相追赶。
 */
function useDocumentSegmentFold({
  rowRef,
  measureRef,
  hasSelection,
  hasDocument,
}: {
  rowRef: RefObject<HTMLDivElement | null>;
  measureRef: RefObject<HTMLDivElement | null>;
  hasSelection: boolean;
  hasDocument: boolean;
}): boolean {
  const [visible, setVisible] = useState(true);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || !hasDocument) {
      setVisible(true);
      return;
    }
    const read = () => {
      const capacity = editBarRowCapacity(row);
      if (!(capacity > 0)) return;
      const style = window.getComputedStyle(row);
      const gap = Number.parseFloat(style.columnGap) || 0;
      let fixed = 0;
      let segments = 0;
      for (const child of Array.from(row.children)) {
        if (!(child instanceof HTMLElement)) continue;
        if (!isFixedRowSegment(child)) continue;
        const width = elementOuterInlineSize(child);
        if (width <= 0) continue;
        fixed += width;
        segments += 1;
      }
      const documentWidth = elementOuterInlineSize(measureRef.current);
      const selectionMin = hasSelection ? SELECTION_SEGMENT_MIN_PX : 0;
      const needed =
        fixed +
        documentWidth +
        selectionMin +
        Math.max(0, segments + 1 + (hasSelection ? 1 : 0) - 1) * gap;
      const next = !hasSelection || needed <= capacity + 0.5;
      setVisible((current) => (current === next ? current : next));
    };
    read();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(read);
    const boundary = row.closest<HTMLElement>(
      "[data-workspace-floating-toolbar-overlay]",
    );
    if (boundary) observer?.observe(boundary);
    if (measureRef.current) observer?.observe(measureRef.current);
    for (const child of Array.from(row.children)) {
      if (!(child instanceof HTMLElement) || !isFixedRowSegment(child)) continue;
      observer?.observe(child);
    }
    window.addEventListener("resize", read);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", read);
    };
  }, [hasDocument, hasSelection, measureRef, rowRef]);
  return visible;
}

function DocumentSegmentMore({ children }: { children: ReactNode }) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    return runAfterOverlayExit(panelRef.current, () => setMounted(false));
  }, [open]);
  const label = tt("更多选项");
  return (
    <div data-edit-bar-document-more className="relative flex shrink-0">
      <button
        ref={buttonRef}
        type="button"
        data-edit-bar-interactive
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className={EDIT_BAR_BUTTON_CLASS}
        aria-label={label}
        title={label}
      >
        <AdvancedEditorIcon name="more" />
      </button>
      {(open || mounted) && (
        <AnchoredPopover
          open={open}
          anchorRef={buttonRef}
          panelRef={panelRef}
          onClose={() => setOpen(false)}
          role="dialog"
          ariaLabel={label}
          ariaModal={false}
          align="end"
          maxHeight={512}
          className="z-[2147483500] grid w-72 max-w-[calc(100dvw-1rem)] gap-1 overflow-x-hidden overflow-y-auto rounded-2xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-2 shadow-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div
            data-edit-bar-document-slot
            data-edit-bar-document-folded
            className="flex min-w-0 flex-wrap items-center gap-1"
          >
            {children}
          </div>
        </AnchoredPopover>
      )}
    </div>
  );
}

/**
 * 单行编辑栏本体（规范 v2 §4）：
 * `[撤销 重做] | [选中对象工具…] | [编辑类文档动作] | [trailing] [AI 助手] [固定柄]`
 * 全部内联在一个 `inline-flex flex-nowrap` 里，永不换行；宽度不足先由
 * SelectionToolbar 把选中工具折进它的 More，再由这里把文档段折进「更多选项」。
 */
export function EditBarRow({
  controller,
  children,
  documentSegment,
  trailing,
  assistant,
  emptyHint,
}: {
  controller: FloatingContextToolbarController;
  children?: ReactNode;
  documentSegment?: ReactNode;
  trailing?: ReactNode;
  assistant?: ReactNode | null;
  emptyHint?: string;
}) {
  const tt = useUI();
  const layout = useAdvancedLayout();
  const rowRef = useRef<HTMLDivElement | null>(null);
  const documentMeasureRef = useRef<HTMLDivElement | null>(null);
  const history = layout?.contextBarLeading ?? null;
  const hostTrailing = layout?.contextBarTrailing ?? null;
  const hasSelection = Boolean(children);
  const hasDocument = Boolean(documentSegment);
  const documentVisible = useDocumentSegmentFold({
    rowRef,
    measureRef: documentMeasureRef,
    hasSelection,
    hasDocument,
  });
  // AI 固定在右段，13 个插件同一个位置。点它把左侧操控台换成 agent 对话。
  // `assistant === null`：宿主已在 children 里画了自己的 AI 键（PluginChromeFrame，
  // 被 tests/plugin-chrome-agent-drawer 钉死），这里不再画第二个。
  const agentActive = layout?.activeDrawerId === PLUGIN_AGENT_DRAWER_ID;
  const agentButton =
    assistant !== undefined ? assistant : layout ? (
    <button
      type="button"
      data-edit-bar-agent
      data-edit-bar-interactive
      aria-pressed={agentActive}
      onClick={() =>
        agentActive
          ? layout.closeDrawer()
          : layout.openDrawer(PLUGIN_AGENT_DRAWER_ID)
      }
      className={`${EDIT_BAR_BUTTON_CLASS} ${
        agentActive
          ? "bg-[var(--pchrome-accent,var(--awb-accent,#7c3aed))] text-[var(--pchrome-on-accent,#fff)] hover:bg-[var(--pchrome-accent,var(--awb-accent,#7c3aed))] hover:text-[var(--pchrome-on-accent,#fff)]"
          : ""
      }`}
      aria-label={tt("AI 助手")}
      title={tt("AI 助手：在左侧和 agent 对话，同时继续改右边")}
    >
      <AdvancedEditorIcon name="agent" className="h-[18px] w-[18px]" />
    </button>
  ) : null;
  const pinButton = controller.canDock ? (
    <EditBarPinButton mode={controller.mode} onToggle={controller.toggleDock} />
  ) : null;
  const trailingVisible = Boolean(
    trailing || hostTrailing || agentButton || pinButton,
  );
  const body = hasSelection || hasDocument;
  return (
    <div
      ref={rowRef}
      data-workspace-edit-bar
      data-empty={body ? undefined : true}
      role="toolbar"
      aria-label={tt("编辑栏")}
      className="pointer-events-auto relative inline-flex max-w-full flex-nowrap items-center gap-1 overflow-hidden whitespace-nowrap"
      style={editBarPillStyle()}
    >
      {history && (
        <div
          data-edit-bar-history-slot
          className="flex shrink-0 items-center gap-1"
        >
          {history}
        </div>
      )}
      {history && (body || emptyHint) && (
        <span className={EDIT_BAR_DIVIDER_CLASS} />
      )}
      {!body && emptyHint && (
        <span
          data-edit-bar-empty-hint
          className="shrink-0 px-2 text-[12px] text-[var(--pchrome-ink-mid,var(--awb-muted,#57534e))]"
        >
          {tt(emptyHint)}
        </span>
      )}
      {hasSelection && (
        <div
          data-edit-bar-selection-slot
          // 插件控件里偶有 25px 高的小按钮（pdf「办公工具」）：统一到 44px 命中区，
          // 整行按钮同一条 y 带，规范 v2 §4「所有可见按钮 y 同带」才成立。
          className="flex min-w-0 shrink items-center [&_button]:min-h-11"
        >
          <EditBarRowContext.Provider value={true}>
            {children}
          </EditBarRowContext.Provider>
        </div>
      )}
      {hasSelection && hasDocument && (
        <span className={EDIT_BAR_DIVIDER_CLASS} />
      )}
      {hasDocument &&
        (documentVisible ? (
          <div
            data-edit-bar-document-slot
            // 文档段按键统一 44px 高：与撤销重做 / AI 同一条 y 带，探针按 y 聚类才是 1 行。
            className="flex shrink-0 items-center gap-0.5 [&_button]:h-11 [&_button]:min-h-11"
          >
            {documentSegment}
          </div>
        ) : (
          <DocumentSegmentMore>{documentSegment}</DocumentSegmentMore>
        ))}
      {trailingVisible && (
        <div
          data-edit-bar-trailing-slot
          className={`flex shrink-0 items-center gap-1 ${
            body || history || emptyHint
              ? "ml-1 border-l border-[var(--pchrome-line,var(--divider,#e7e5e4))]/60 pl-2"
              : ""
          }`}
        >
          {trailing}
          {hostTrailing}
          {agentButton}
          {pinButton}
        </div>
      )}
      {hasDocument && (
        // 文档段的量宽克隆：不可见、不可交互、不进无障碍树，也不在
        // `[data-workspace-edit-bar]` 的可见按钮之列（绝对定位、visibility:hidden）。
        <div
          ref={documentMeasureRef}
          aria-hidden="true"
          inert
          data-edit-bar-document-measure
          className="pointer-events-none invisible absolute left-0 top-0 flex w-max flex-nowrap items-center gap-0.5 [&_button]:h-11 [&_button]:min-h-11"
          style={{ contain: "layout style paint" }}
        >
          {documentSegment}
        </div>
      )}
    </div>
  );
}

export function FloatingContextToolbar({
  controller,
  accent,
  theme = null,
  collapsedIcon,
  collapsedLabel,
  busy = false,
  dirty = false,
  children,
  documentSegment,
  trailing,
  assistant,
  emptyHint,
}: {
  controller: FloatingContextToolbarController;
  accent: string;
  /** 插件内主题档；null = 非 10 件插件，沿用站点主题别名。 */
  theme?: PluginThemeMode | null;
  /** 收起圆上显示的上下文图标与文案，让用户收起后仍知道选中了什么。 */
  collapsedIcon?: WorkbenchIconName;
  collapsedLabel?: string;
  busy?: boolean;
  dirty?: boolean;
  /** 选中对象工具（宿主 renderContextToolbar 的 SelectionToolbar）；没选中时传 null，栏照样在。 */
  children?: ReactNode;
  /** 编辑类文档动作（`group === "edit"`），与选中工具同一行。 */
  documentSegment?: ReactNode;
  /** 可选附加节点，排在 AI 助手之前。 */
  trailing?: ReactNode;
  /**
   * AI 助手键。缺省（undefined）由行自己画（需要 AdvancedLayout）；传 `null`
   * 表示宿主已在 children 里画了一份（PluginChromeFrame），行不再画第二个。
   */
  assistant?: ReactNode | null;
  /** 没选中也没有文档动作时（`data-empty`）栏里显示的一句提示。 */
  emptyHint?: string;
}) {
  if (!controller.portalRoot) return null;
  const docked = controller.mode === "docked" && !controller.collapsed;
  return createPortal(
    <div
      data-workspace-floating-toolbar-overlay
      data-floating-toolbar-boundary="editor-shell"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ contain: "layout paint", zIndex: 2_147_483_000 }}
    >
      <div
        data-workspace-docked-toolbar={docked || undefined}
        data-workspace-floating-toolbar={!docked || undefined}
        data-edit-bar-mode={controller.mode}
        data-edit-bar-presentation={controller.presentation}
          data-edit-bar-dragging={controller.dragging || undefined}
          data-edit-bar-move-mode={controller.moveMode || undefined}
          data-edit-bar-selected={controller.selected || undefined}
        className="pointer-events-none absolute inset-0 overflow-visible"
      >
        <div
          ref={controller.toolbarRef}
          data-advanced-context-row
          data-workspace-edit-bar-toolbar
          data-plugin-theme={theme || undefined}
          data-edit-bar-mode={controller.mode}
          data-edit-bar-offset={`${controller.offset.x},${controller.offset.y}`}
          onPointerDownCapture={controller.rootProps.onPointerDownCapture}
          onPointerMoveCapture={controller.rootProps.onPointerMoveCapture}
          onPointerUpCapture={controller.rootProps.onPointerUpCapture}
          onClickCapture={controller.rootProps.onClickCapture}
          onDoubleClickCapture={controller.rootProps.onDoubleClickCapture}
          onKeyDown={controller.rootProps.onKeyDown}
          aria-keyshortcuts={controller.rootProps["aria-keyshortcuts"]}
          className="pointer-events-auto absolute left-0 top-0 inline-flex w-fit max-w-[calc(100%-1rem)] overflow-visible will-change-transform"
          // transform 刻意不在这里写：位置由控制器的 paintMotion() 一处写入，
          // 否则每次重渲染都会把弹簧算出来的中间帧盖回去。
          style={
            theme
              ? pluginWorkbenchStyle(theme, accent)
              : advancedWorkbenchStyle(accent)
          }
        >
          {controller.morphGhost && (
            // 正在离开的那一形态，**永远只是一层画着它的惰性表面**，不是真内容：
            // 点圆展开时真圆必须当场卸载（既有断言要求 `[data-edit-bar-collapsed-pill]`
            // 立刻为 null），能留下来淡出的只能是这个 ghost。
            <div
              ref={controller.morphGhostRef}
              aria-hidden="true"
              data-edit-bar-morph-ghost
              className="pointer-events-none absolute left-0 top-0 origin-top-left"
              style={{
                ...(controller.morphGhostKind === "collapsed"
                  ? editBarCollapsedStyle()
                  : editBarPillStyle()),
                width: controller.morphGhost.width,
                height: controller.morphGhost.height,
              }}
            />
          )}
          <div
            ref={controller.morphLiveRef}
            data-edit-bar-morph-live
            className="inline-flex max-w-full origin-top-left"
          >
            {controller.collapsed ? (
              <EditBarCollapsedPill
                icon={collapsedIcon}
                contextLabel={collapsedLabel}
                busy={busy}
                dirty={dirty}
                dragging={controller.dragging}
                {...controller.collapsedProps}
              />
            ) : (
              <EditBarRow
                controller={controller}
                documentSegment={documentSegment}
                trailing={trailing}
                assistant={assistant}
                emptyHint={emptyHint}
              >
                {children}
              </EditBarRow>
            )}
          </div>
          {controller.selected && !controller.moveMode && (
            <div
              aria-hidden="true"
              data-edit-bar-selected-ring
              className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-[var(--pchrome-accent,var(--awb-accent,#7c3aed))]/45"
            />
          )}
          {controller.moveMode && (
            // 按住拖的这一段盖住控件：松手之前按钮不许被点到。
            <div
              aria-hidden="true"
              data-edit-bar-move-shield
              className="absolute inset-0 cursor-grabbing rounded-full ring-2 ring-[var(--pchrome-accent,var(--awb-accent,#7c3aed))]/60"
            />
          )}
        </div>
      </div>
    </div>,
    controller.portalRoot,
  );
}
