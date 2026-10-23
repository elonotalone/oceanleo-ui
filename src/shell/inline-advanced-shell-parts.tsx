"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useUI } from "../i18n/ui/useUI";
import { AGENT_CONVERSATION_HOST_STRETCH_CLASS } from "./agent-conversation-layout";
import type {
  AdvancedEditorAdapter,
  AdvancedEditorNotice,
} from "./advanced-editor-adapter";
import type { EditBarDockPresentation } from "./EditBarDockHost";
import type { RightPaneSlot } from "./SplitWorkspace";
import {
  pluginThemeIdForAdapter,
  type PluginThemeMode,
} from "./plugin-theme";
import { PluginChromeNotices } from "./plugin-chrome/PluginChromeNotices";
import { buildPluginPages } from "./plugin-chrome/plugin-pages";

/**
 * InlineAdvancedWorkbenchShell 的自洽零件（X1-b）：壳本体守 600 行拆分上限，
 * 这里只放「装配」——每个零件都不持有壳的业务状态，行为、DOM 标记与拆分前逐字相同。
 */

/** 页签行的页面清单：完全由 adapter.pages / adapter.mode 推出。 */
export function usePluginPagesForAdapter(adapter: AdvancedEditorAdapter) {
  const pluginId = pluginThemeIdForAdapter(adapter.id) ?? adapter.id.split("@")[0];
  return useMemo(
    () =>
      buildPluginPages({
        pluginId,
        proLabel: adapter.pages?.proLabel,
        proUnavailableReason:
          adapter.pages?.proUnavailableReason ??
          adapter.mode?.unavailableReason,
        aux: adapter.pages?.aux,
      }),
    [
      pluginId,
      adapter.mode?.unavailableReason,
      adapter.pages?.aux,
      adapter.pages?.proLabel,
      adapter.pages?.proUnavailableReason,
    ],
  );
}

/**
 * 编辑栏停靠呈现：有 SplitWorkspace 右栏时发布给右栏（ownerId 防旧实例 cleanup
 * 覆盖新实例）；没有右栏时交给壳自己的 EditBarDockHost。两条路互斥，返回值只在
 * 本地路上非空。
 */
export function useEditBarDockPresentation({
  rightPaneSlot,
  showEditBar,
  ownerId,
  mode,
  dropActive,
  accent,
  theme,
}: {
  rightPaneSlot: RightPaneSlot | null;
  showEditBar: boolean;
  ownerId: string;
  mode: EditBarDockPresentation["mode"];
  dropActive: boolean;
  accent: string;
  theme: PluginThemeMode | null;
}): EditBarDockPresentation | null {
  const localDockPresentation = useMemo(
    () =>
      rightPaneSlot || !showEditBar
        ? null
        : { ownerId, mode, dropActive, accent, theme },
    [accent, dropActive, mode, ownerId, rightPaneSlot, showEditBar, theme],
  );
  useLayoutEffect(() => {
    if (!rightPaneSlot || !showEditBar) return;
    rightPaneSlot.setEditBarDockPresentation({
      ownerId,
      mode,
      dropActive,
      accent,
      theme,
    });
    return () => rightPaneSlot.clearEditBarDockPresentation(ownerId);
  }, [accent, dropActive, mode, ownerId, rightPaneSlot, showEditBar, theme]);
  return localDockPresentation;
}

/**
 * 隐藏的 <input type=file>：素材库抽屉第一项「从本地上传」与画布拖放共用同一条
 * 上传路径。adapter 不声明 upload 时不渲染。
 */
export function HiddenUploadInput({
  inputRef,
  upload,
  onFiles,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  upload: AdvancedEditorAdapter["upload"];
  onFiles: (files: File[]) => void;
}) {
  if (!upload) return null;
  return (
    <input
      ref={inputRef}
      type="file"
      accept={upload.accept}
      multiple={upload.multiple}
      className="hidden"
      onChange={(event) => {
        onFiles(Array.from(event.currentTarget.files || []));
        event.currentTarget.value = "";
      }}
    />
  );
}

/**
 * 画布左下角的提示胶囊（规范 v2 §1：不是顶部通栏；与右下角缩放控件同高、同层）。
 * 没有提示时不渲染任何节点。
 */
export function StageNoticeCorner({
  notices,
}: {
  notices: readonly AdvancedEditorNotice[] | undefined;
}) {
  if (!notices?.length) return null;
  return (
    <div
      className="pointer-events-none absolute bottom-3 left-3 max-w-[calc(100%-7rem)]"
      style={{ zIndex: 2_147_483_010 }}
    >
      <PluginChromeNotices notices={notices} />
    </div>
  );
}

/**
 * 没有可用工作区左栏时（`/advanced/<featureId>`、宿主把左栏收着的库页面）壳自己的
 * 左侧面板：320px，滑入滑出；收起后 300ms 内保留上一份内容，退场不闪空。
 */
export function FallbackDetailAside({
  fallbackDetail,
  onClose,
}: {
  fallbackDetail: { label: ReactNode; content: ReactNode } | null;
  onClose: () => void;
}) {
  const tt = useUI();
  const [closing, setClosing] = useState<typeof fallbackDetail>(null);
  const lastRef = useRef<typeof fallbackDetail>(fallbackDetail);
  if (fallbackDetail) lastRef.current = fallbackDetail;
  useEffect(() => {
    if (fallbackDetail) {
      lastRef.current = fallbackDetail;
      setClosing(null);
      return;
    }
    const previous = lastRef.current;
    if (!previous) return;
    lastRef.current = null;
    setClosing(previous);
    const timer = globalThis.setTimeout(() => setClosing(null), 300);
    return () => globalThis.clearTimeout(timer);
  }, [fallbackDetail]);
  const displayed = fallbackDetail || closing || lastRef.current;
  return (
    <aside
      data-workspace-pane={fallbackDetail ? "left" : undefined}
      data-left-panel={fallbackDetail ? "tool-detail" : undefined}
      aria-hidden={!fallbackDetail}
      inert={!fallbackDetail}
      style={{
        width: fallbackDetail ? 320 : 0,
        flexBasis: fallbackDetail ? 320 : 0,
        opacity: fallbackDetail ? 1 : 0,
        pointerEvents: fallbackDetail ? "auto" : "none",
        borderRightWidth: fallbackDetail ? undefined : 0,
      }}
      className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-[var(--awb-border)] bg-[var(--awb-chrome-bg)] transition-[width,flex-basis,opacity] duration-300 ease-out motion-reduce:transition-none"
    >
      {displayed && (
        <>
          <div className="flex h-11 items-center gap-2 border-b border-[var(--awb-border)] px-3">
            <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">
              {displayed.label}
            </span>
            <button
              type="button"
              data-editor-fallback-close
              onClick={onClose}
              aria-label={tt("收起面板")}
              title={tt("收起面板")}
              className="grid h-8 w-8 place-items-center rounded-lg outline-none transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-[var(--awb-hover)] focus-visible:ring-2 focus-visible:ring-[var(--awb-accent)]/35"
            >
              <span aria-hidden="true" className="text-lg leading-none">×</span>
            </button>
          </div>
          <div
            data-editor-fallback-pane
            className={`min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&:has([data-agent-conversation])]:overflow-hidden ${AGENT_CONVERSATION_HOST_STRETCH_CLASS}`}
          >
            {displayed.content}
          </div>
        </>
      )}
    </aside>
  );
}

const SELECTION_CONTROL_SELECTOR =
  "button, input, select, textarea, [role='button'], [role='combobox']";

/**
 * 「此刻有没有选中对象」的探针（D3）：编辑器的选区工具栏没选中时什么都不画，
 * 但多数编辑器总是交出一个包装组件。这里包一层 `display: contents`，看它里面有没有
 * 真的画出控件；没有就算「没选中」，编辑栏改显示抽屉按钮。
 */
export function SelectionPresenceProbe({
  children,
  onChange,
  onKindChange,
}: {
  children: ReactNode;
  onChange: (present: boolean) => void;
  /** 选区种类（SelectionToolbar 根上的 `data-selection-kind`），给收起后的小圆选图标。 */
  onKindChange?: (kind: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onKindChangeRef = useRef(onKindChange);
  onKindChangeRef.current = onKindChange;
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    let last: boolean | null = null;
    let lastKind: string | null | undefined;
    const read = () => {
      const present = Boolean(node.querySelector(SELECTION_CONTROL_SELECTOR));
      const rawKind = present
        ? node
            .querySelector("[data-selection-kind]")
            ?.getAttribute("data-selection-kind")
        : null;
      const kind = rawKind && rawKind !== "none" ? rawKind : null;
      if (kind !== lastKind) {
        lastKind = kind;
        onKindChangeRef.current?.(kind);
      }
      if (present === last) return;
      last = present;
      onChangeRef.current(present);
    };
    read();
    if (typeof MutationObserver !== "function") return;
    const observer = new MutationObserver(read);
    observer.observe(node, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-selection-kind"],
    });
    return () => {
      observer.disconnect();
      onChangeRef.current(false);
      onKindChangeRef.current?.(null);
    };
  }, []);
  return (
    <div ref={ref} data-edit-bar-selection-probe style={{ display: "contents" }}>
      {children}
    </div>
  );
}
