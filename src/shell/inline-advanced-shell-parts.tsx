"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type {
  AdvancedEditorAdapter,
  AdvancedEditorNotice,
} from "./advanced-editor-adapter";
import { EditBarHistoryControls } from "./EditBarDockControls";
import type { EditBarDockPresentation } from "./EditBarDockHost";
import type { RightPaneSlot } from "./SplitWorkspace";
import type { PluginThemeMode } from "./plugin-theme";
import { PluginChromeNotices } from "./plugin-chrome/PluginChromeNotices";
import { buildPluginPages } from "./plugin-chrome/plugin-pages";

/**
 * InlineAdvancedWorkbenchShell 的自洽零件（X1-b）：壳本体守 600 行拆分上限，
 * 这里只放「装配」——每个零件都不持有壳的业务状态，行为、DOM 标记与拆分前逐字相同。
 */

/** 页签行的页面清单：完全由 adapter.pages / adapter.mode 推出。 */
export function usePluginPagesForAdapter(adapter: AdvancedEditorAdapter) {
  return useMemo(
    () =>
      buildPluginPages({
        proLabel: adapter.pages?.proLabel,
        proUnavailableReason:
          adapter.pages?.proUnavailableReason ??
          adapter.mode?.unavailableReason,
        aux: adapter.pages?.aux,
      }),
    [
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
 * 离开确认门。原生 window.confirm 冻住主线程、样式不可控、移动端尤其糟，换成
 * ConfirmDialog 后它是异步的；用一道 promise 门把壳里那段命令式流程接回来：
 * requestClose 里 `await confirmLeave()`，用户点哪个按钮就 resolve 成什么。
 * 卸载时把门放掉，否则 requestClose 里那个 await 会永远挂着。
 */
export function useLeaveGate() {
  const leaveResolveRef = useRef<((leave: boolean) => void) | null>(null);
  const [askingLeave, setAskingLeave] = useState(false);
  const confirmLeave = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        leaveResolveRef.current = resolve;
        setAskingLeave(true);
      }),
    [],
  );
  const answerLeave = useCallback((leave: boolean) => {
    const resolve = leaveResolveRef.current;
    leaveResolveRef.current = null;
    setAskingLeave(false);
    resolve?.(leave);
  }, []);
  useEffect(() => () => answerLeave(false), [answerLeave]);
  return { askingLeave, confirmLeave, answerLeave };
}

/** 撤销/重做从顶栏搬到编辑栏最左段（见 EditBarHistoryControls 的注释）。 */
export function useHistoryControls(
  history: AdvancedEditorAdapter["history"],
): ReactNode {
  return useMemo(
    () =>
      history ? (
        <EditBarHistoryControls
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={history.undo}
          onRedo={history.redo}
        />
      ) : null,
    [history],
  );
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
