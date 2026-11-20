"use client";

// 列表顶上的一行：搜索框 + 一个 + 号（0 项不画、1 项直接执行、多项弹出菜单）。
// 外观与任务页同一套：stone 色、rounded-lg 输入框，+ 号是普通图标键，菜单是共用的 FloatingMenu。
import { useRef, useState, type JSX } from "react";
import { FloatingMenu, FloatingMenuItem } from "../../ui/menu/FloatingMenu";
import { ImPlusIcon, ImSearchIcon, LEOCHAT_ICON_BUTTON } from "../messages/messages-surface";

export interface PanelToolbarAction {
  id: string;
  /** 已翻译的文字 */
  label: string;
  onSelect: () => void;
}

export interface PanelToolbarProps {
  search: string;
  onSearch: (value: string) => void;
  /** 回车时调（可选） */
  onSearchCommit?: (value: string) => void;
  /** 已翻译的占位文字，同时作为搜索框的 aria-label */
  placeholder: string;
  /** + 号的动作：1 项 → 点 + 直接执行；2 项及以上 → 点 + 弹出菜单；0 项 → 不画 + 号 */
  actions: PanelToolbarAction[];
  /** + 号的 aria-label 与 title（已翻译） */
  plusLabel: string;
  maxLength?: number;
}

export function PanelToolbar(props: PanelToolbarProps): JSX.Element {
  const { search, onSearch, onSearchCommit, placeholder, actions, plusLabel, maxLength } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const plusRef = useRef<HTMLButtonElement | null>(null);
  const many = actions.length >= 2;
  const showPlus = actions.length > 0;

  return (
    <div data-leochat-toolbar className="flex shrink-0 items-center gap-1 px-2 pb-1 pt-2">
      <label className="relative flex min-w-0 flex-1 items-center">
        <span className="pointer-events-none absolute left-2 text-stone-400">
          <ImSearchIcon />
        </span>
        <input
          type="search"
          data-leochat-search
          value={search}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(event) => onSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) onSearchCommit?.(event.currentTarget.value);
          }}
          className="w-full min-w-0 rounded-lg border border-stone-200 bg-white py-1.5 pl-8 pr-2 text-[13px] text-stone-900 placeholder:text-stone-400 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] focus-visible:border-stone-300 focus-visible:outline-none"
        />
      </label>
      {showPlus ? (
        <button
          ref={plusRef}
          type="button"
          data-leochat-plus
          aria-label={plusLabel}
          title={plusLabel}
          aria-haspopup={many ? "menu" : undefined}
          aria-expanded={many ? menuOpen : undefined}
          onClick={() => {
            if (many) {
              setMenuOpen((open) => !open);
              return;
            }
            actions[0]?.onSelect();
          }}
          className={LEOCHAT_ICON_BUTTON}
        >
          <ImPlusIcon />
        </button>
      ) : null}
      {many ? (
        <FloatingMenu
          open={menuOpen}
          anchorRef={plusRef}
          onClose={() => setMenuOpen(false)}
          align="end"
          width={200}
          ariaLabel={plusLabel}
          attributes={{ "data-leochat-plus-menu": "" }}
        >
          {actions.map((action) => (
            <FloatingMenuItem
              key={action.id}
              label={action.label}
              onSelect={() => {
                setMenuOpen(false);
                action.onSelect();
              }}
            />
          ))}
        </FloatingMenu>
      ) : null}
    </div>
  );
}
