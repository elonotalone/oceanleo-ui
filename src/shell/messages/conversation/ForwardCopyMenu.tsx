"use client";

// The conversation header's Forward / Copy entry (session / sites wave 2026-11-21, contract §1): one icon button right of
// search, the same icon and classes as the task page's Share entry (`share/ShareActionBar.tsx` ShareEntryButton). Click →
// select mode with everything selected, and this small menu: Forward, Copy, "N selected", Select all / Clear selection —
// the same AccessPopover + FloatingMenuItem rows the task Share menu uses (`share/TaskSharePanel.tsx`). Forward's second
// page is the ForwardPicker (unit UT). Closing the menu leaves select mode (the host does that in `onClose`).
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { SS_UC_COPY as copy } from "../../../i18n/ui/messages/ss-uc-copy";
import { FloatingMenuItem, FloatingMenuLabel, FloatingMenuSeparator } from "../../../ui/menu/FloatingMenu";
import { AccessPopover } from "../../access/AccessPopover";
import { ForwardPicker } from "../../forward";
import { writeClipboardText } from "../../share/share-clipboard";
import { SELECT_ALL_LIMIT } from "./message-selection";

export type ForwardCopyPage = "actions" | "forward";

export interface ForwardCopyMenuProps {
  conversationId: string;
  title: string;
  open: boolean;
  page: ForwardCopyPage;
  /** The header button: opens (the host selects everything) or, when open, closes. */
  onToggle: () => void;
  /** Menu closed (outside click, Escape, done): the host leaves select mode. */
  onClose: () => void;
  onPage: (page: ForwardCopyPage) => void;
  selectedCount: number;
  allSelected: boolean;
  /** Older history is being paged in for "Select all". */
  selectingAll: boolean;
  onToggleAll: () => void;
  /** Selected messages as clipboard text, oldest first, and how many they are. */
  copyText: () => { text: string; count: number };
  /** Selected message ids, oldest first. */
  messageIds: readonly string[];
  /** Rows of the list stay clickable while the menu is open. */
  ignoreOutsideSelector?: string;
}

/** `ShareEntryButton`'s classes and icon, with this button's own name (that one is hard-wired to "Share"). */
export function ForwardCopyButton({ onClick, active, expanded, panelId, anchorRef, label }: {
  onClick: () => void; active: boolean; expanded: boolean; panelId: string;
  anchorRef: RefObject<HTMLButtonElement | null>; label: string;
}) {
  return (
    <button
      type="button"
      ref={anchorRef}
      onClick={onClick}
      aria-haspopup="menu"
      aria-expanded={expanded}
      aria-controls={expanded ? panelId : undefined}
      aria-pressed={active}
      title={label}
      aria-label={label}
      data-forward-copy-entry={active ? "active" : "idle"}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg p-1.5 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-stone-100 hover:text-stone-800 active:scale-95 ${active ? "bg-stone-100 text-stone-800" : "text-stone-500"}`}
    >
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12v-1a7 7 0 0 1 7-7h8m0 0-4-4m4 4-4 4" />
      </svg>
    </button>
  );
}

const ICONS = {
  forward: "M4 12v-1a7 7 0 0 1 7-7h8m0 0-4-4m4 4-4 4",
  copy: "M9 9h11v11H9zM5 15V5h10",
  select: "M4 12l5 5L20 6",
} as const;

function MenuIcon({ name }: { name: keyof typeof ICONS }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[name]} /></svg>;
}

export function ForwardCopyMenu(props: ForwardCopyMenuProps) {
  const { conversationId, title, open, page, onToggle, onClose, onPage, selectedCount, allSelected, selectingAll, onToggleAll, copyText, messageIds } = props;
  const tt = useUI();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { if (!open) setNotice(null); }, [open]);
  const say = (tone: "ok" | "error", text: string) => {
    setNotice({ tone, text });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(null), 2600);
  };
  const copySelection = async () => {
    const { text, count } = copyText();
    const copied = count > 0 && await writeClipboardText(text);
    say(copied ? "ok" : "error", copied ? tt("已复制 {count} 条消息。", { count }) : tt("复制失败，请手动选中文本复制。"));
  };
  const empty = selectedCount === 0;
  const label = tt(copy.forwardOrCopy);
  return (
    <>
      <ForwardCopyButton anchorRef={anchorRef} active={open} expanded={open} panelId={panelId} label={label} onClick={onToggle} />
      <AccessPopover
        open={open}
        anchorRef={anchorRef}
        onClose={onClose}
        title={page === "forward" ? tt("转发") : label}
        ignoreOutsideSelector={props.ignoreOutsideSelector ?? "[data-share-select-control]"}
        id={panelId}
        role={page === "actions" ? "menu" : "dialog"}
        width={page === "actions" ? 224 : 288}
      >
        {page === "actions" ? (
          <div data-forward-copy-actions="">
            <FloatingMenuItem icon={<MenuIcon name="forward" />} label={tt("转发")} disabled={empty} onSelect={() => onPage("forward")} />
            <FloatingMenuItem icon={<MenuIcon name="copy" />} label={tt("复制")} disabled={empty} onSelect={() => void copySelection()} />
            <FloatingMenuSeparator />
            <FloatingMenuLabel>{tt("已选 {count} 条", { count: selectedCount })}</FloatingMenuLabel>
            <FloatingMenuItem
              icon={<MenuIcon name="select" />}
              label={tt(allSelected ? "取消全选" : "全选")}
              disabled={selectingAll}
              onSelect={onToggleAll}
            />
            {selectingAll ? <p role="status" className="px-2.5 py-1.5 text-xs text-neutral-500">{tt(copy.loadingEarlier)}</p> : null}
            {!selectingAll && selectedCount >= SELECT_ALL_LIMIT ? (
              <p className="px-2.5 py-1.5 text-xs text-neutral-500">{tt(copy.selectCap, { count: SELECT_ALL_LIMIT })}</p>
            ) : null}
            {notice ? (
              <p role="status" className={`px-2.5 py-1.5 text-xs ${notice.tone === "ok" ? "text-neutral-500" : "text-rose-600"}`}>{notice.text}</p>
            ) : null}
          </div>
        ) : (
          <div data-forward-copy-page="forward">
            {/* The picker's own first row is Back (→ `onCancel`); a second back row here would duplicate it. */}
            <ForwardPicker
              source={{ conversationId, title }}
              messageIds={messageIds}
              onDone={onClose}
              onCancel={() => onPage("actions")}
            />
          </div>
        )}
      </AccessPopover>
    </>
  );
}
