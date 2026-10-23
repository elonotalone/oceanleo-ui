"use client";

// ============================================================================
// 第一行的 `···`（W01，编辑器整改波 2026-10-23，操作员裁定 D1）
// ----------------------------------------------------------------------------
// 一个按钮、一个菜单，顺序固定：
//   [登记项：邀请一起改 · 生成回放] · 分享 · 收藏 / 取消收藏 · 下载 ▸（子菜单列各格式）
// 每项都有图标和文字；点了做的事与原来第一行上的独立按钮一模一样。
//   · 登记项来自 more-menu-registry（协同块懒加载后自己登记，弹窗也由它自己画）。
//   · 分享 / 收藏的状态在 useEditorItemSocial 里，挂在本组件（一直挂着），不在弹层里。
//   · 下载子菜单 = adapter.directDownload + group === "download" 的动作，与原下载菜单同一套。
// 做不到的项不出；一项都没有时连 `···` 都不出（不放死按钮）。
// 键盘：AnchoredPopover 管方向键 / Home / End / Esc；「下载」上 → / Enter 打开子菜单，
// 子菜单里 ← 收回并把焦点还给「下载」。
// ============================================================================

import { useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { Button, IconButton } from "../../ui/Button";
import { AdvancedEditorIcon, type WorkbenchIconName } from "../AdvancedEditorIcon";
import { AnchoredPopover } from "../anchored-popover";
import { useEditorItemSocial } from "../editor-item-social-chrome";
import type { LibraryItem } from "../library-data";
import type { PluginMoreMenuEntry } from "./more-menu-registry";

/** 下载子菜单里的一项；AdvancedWorkbenchAction 与 PluginChromeAction 都满足这个形状。 */
export interface PluginMoreMenuDownload {
  id: string;
  label: string;
  busyLabel?: string;
  icon?: WorkbenchIconName;
  disabled?: boolean;
  busy?: boolean;
}

export interface PluginMoreMenuProps<A extends PluginMoreMenuDownload> {
  /** `···` 按钮的 ref；有登记处时传登记处的 anchorRef，登记方的弹窗才锚得上。 */
  anchorRef?: RefObject<HTMLButtonElement | null>;
  item: LibraryItem | null | undefined;
  entries?: readonly PluginMoreMenuEntry[];
  downloads: readonly A[];
  /** 默认格式（adapter.directDownload）的 id，子菜单里标「默认」。 */
  defaultDownloadId?: string | null;
  onDownload: (action: A) => void | Promise<void>;
  /** 下载失败时外层给的人话原因，挂在 `···` 的 title 上。 */
  errorMessage?: string;
}

/** 把动作拆成「下载子菜单」与「其余」两份，各自保持原顺序。 */
export function splitDownloadActions<A extends { group?: string }>(
  actions: readonly A[] | undefined,
): [A[], A[]] {
  const downloads: A[] = [];
  const rest: A[] = [];
  for (const action of actions || []) {
    (action.group === "download" ? downloads : rest).push(action);
  }
  return [downloads, rest];
}

const MENU_CLASS =
  "z-[2147483550] grid w-60 gap-1 overflow-y-auto rounded-xl border border-[var(--awb-border)] bg-[var(--awb-popover-bg)] p-1.5 text-[var(--awb-text)] shadow-2xl";

function focusLater(target: RefObject<HTMLElement | null>) {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => target.current?.focus());
}

export function PluginMoreMenu<A extends PluginMoreMenuDownload>({
  anchorRef,
  item,
  entries = [],
  downloads,
  defaultDownloadId = null,
  onDownload,
  errorMessage,
}: PluginMoreMenuProps<A>) {
  const tt = useUI();
  const ownTriggerRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = anchorRef ?? ownTriggerRef;
  const menuRef = useRef<HTMLDivElement>(null);
  const downloadItemRef = useRef<HTMLButtonElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const social = useEditorItemSocial(item);
  const idBase = useId().replace(/:/g, "");
  const menuId = `plugin-more-menu-${idBase}`;
  const submenuId = `plugin-more-download-${idBase}`;

  const hasDownloads = downloads.length > 0;
  if (
    entries.length === 0 &&
    !social.shareAvailable &&
    !social.favoriteAvailable &&
    !hasDownloads
  ) {
    return null;
  }

  const closeAll = (restoreFocus: boolean) => {
    setDownloadOpen(false);
    setOpen(false);
    if (restoreFocus) focusLater(triggerRef);
  };
  const openSubmenu = () => setDownloadOpen(true);
  const closeSubmenu = () => {
    setDownloadOpen(false);
    focusLater(downloadItemRef);
  };
  // Enter / 空格走按钮自己的 click（切换子菜单）；→ 只负责打开。
  const onDownloadItemKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    openSubmenu();
  };
  const onSubmenuKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft") return;
    event.preventDefault();
    event.stopPropagation();
    closeSubmenu();
  };

  return (
    <span
      data-editor-item-social
      data-artifact-id={social.artifactId || undefined}
      data-revision-id={social.revisionId || undefined}
      className="flex items-center"
    >
      <IconButton
        ref={triggerRef}
        variant="ghost"
        data-workspace-more-launcher
        onClick={() => {
          setDownloadOpen(false);
          setOpen((value) => !value);
        }}
        label={tt("更多")}
        title={errorMessage || social.error || tt("更多")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-busy={social.busy !== "" || undefined}
        icon={<AdvancedEditorIcon name="more" className="h-4 w-4" />}
      />
      <span className="sr-only" role="status" aria-live="polite">
        {errorMessage || social.error}
      </span>
      <AnchoredPopover
        open={open}
        anchorRef={triggerRef}
        panelRef={menuRef}
        onClose={() => closeAll(false)}
        id={menuId}
        role="menu"
        ariaLabel={tt("更多")}
        align="end"
        maxHeight={420}
        attributes={{ "data-workspace-more-menu": true }}
        className={MENU_CLASS}
      >
        {entries.map((entry) => (
          <Button
            key={entry.id}
            variant="ghost"
            block
            align="start"
            role="menuitem"
            tabIndex={-1}
            data-more-menu-entry={entry.id}
            onClick={() => {
              closeAll(false);
              entry.onSelect();
            }}
          >
            <AdvancedEditorIcon name={entry.icon} className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
          </Button>
        ))}
        {social.shareAvailable ? (
          <Button
            variant="ghost"
            block
            align="start"
            role="menuitem"
            tabIndex={-1}
            data-more-menu-entry="share"
            data-editor-chrome-action="share"
            onClick={() => {
              closeAll(true);
              void social.share();
            }}
          >
            <AdvancedEditorIcon name="share" className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{tt("分享")}</span>
          </Button>
        ) : null}
        {social.favoriteAvailable ? (
          <Button
            variant="ghost"
            block
            align="start"
            role="menuitem"
            tabIndex={-1}
            data-more-menu-entry="favorite"
            data-editor-chrome-action="favorite"
            data-favorite={social.favorite ? "true" : "false"}
            onClick={() => {
              closeAll(true);
              void social.toggleFavorite();
            }}
          >
            <AdvancedEditorIcon
              name="star"
              filled={social.favorite}
              className="h-4 w-4 shrink-0"
            />
            <span className="min-w-0 flex-1 truncate">
              {tt(social.favorite ? "取消收藏" : "收藏")}
            </span>
          </Button>
        ) : null}
        {hasDownloads ? (
          <>
            <Button
              ref={downloadItemRef}
              variant="ghost"
              block
              align="start"
              role="menuitem"
              tabIndex={-1}
              selected={downloadOpen}
              data-more-menu-entry="download"
              data-workspace-download-launcher
              aria-haspopup="menu"
              aria-expanded={downloadOpen}
              aria-controls={submenuId}
              onClick={() => setDownloadOpen((value) => !value)}
              onKeyDown={onDownloadItemKeyDown}
            >
              <AdvancedEditorIcon name="download" className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{tt("下载")}</span>
              <AdvancedEditorIcon
                name="chevron"
                className="h-3.5 w-3.5 shrink-0 -rotate-90 opacity-70 rtl:rotate-90"
              />
            </Button>
            <AnchoredPopover
              open={open && downloadOpen}
              anchorRef={downloadItemRef}
              panelRef={submenuRef}
              onClose={() => setDownloadOpen(false)}
              id={submenuId}
              role="menu"
              ariaLabel={tt("下载")}
              side="left"
              maxHeight={384}
              attributes={{ "data-workspace-download-menu": true }}
              className={MENU_CLASS}
            >
              {downloads.map((action) => {
                const isDefault = action.id === defaultDownloadId;
                const label =
                  action.busy && action.busyLabel ? action.busyLabel : action.label;
                return (
                  <Button
                    key={action.id}
                    variant="ghost"
                    block
                    align="start"
                    role="menuitem"
                    tabIndex={-1}
                    data-workspace-export-action-id={action.id}
                    data-workspace-export-action-kind={isDefault ? "default" : "secondary"}
                    disabled={action.disabled || action.busy}
                    aria-busy={action.busy || undefined}
                    onKeyDown={onSubmenuKeyDown}
                    onClick={() => {
                      closeAll(true);
                      void onDownload(action);
                    }}
                  >
                    <AdvancedEditorIcon
                      name={action.icon || "download"}
                      className="h-4 w-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate">{tt(label)}</span>
                    {isDefault ? (
                      <span className="shrink-0 text-[9px] text-[var(--awb-muted)]">
                        {tt("默认")}
                      </span>
                    ) : null}
                  </Button>
                );
              })}
            </AnchoredPopover>
          </>
        ) : null}
      </AnchoredPopover>
    </span>
  );
}
