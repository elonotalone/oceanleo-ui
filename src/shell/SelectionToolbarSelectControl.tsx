"use client";

import { useId, useRef, useState } from "react";
import type { WorkbenchIconName } from "./AdvancedEditorIcon";
import { EditBarIcon } from "./EditBarIcon";
import type { CanonicalSelectionControl } from "./edit-bar-canon";
import { captureEditBarTextBookmark, restoreEditBarTextBookmark, editBarFontName,
  normalizeEditBarFontFamily, useEditBarTextStyle, type EditBarTextBookmark } from "./selection-toolbar-canon-controls";
import { AnchoredPopover } from "./anchored-popover";
import {
  selectionRequestId,
  type SelectionCommand,
  type SelectionContext,
  type SelectionControl,
  type SelectionControlValue,
} from "./selection-context";
import { editBarControlClass, EDIT_BAR_FIELD_CLASS, EDIT_BAR_CONTROL_SIZE_PX } from "./edit-bar-surface";
import { preserveEditBarSelection } from "./edit-bar-selection-preserve";
import { useEditBarSessionId } from "./edit-bar-selection-session";
import { selectionControlUsesIconOnly } from "./selection-toolbar-layout";

export function SelectionToolbarSelectControl({
  control,
  selectionId,
  selectionRevision,
  selectionEpoch,
  onCommand,
  accent,
  presentation,
  onActivated,
  forMeasurement = false,
  triggerIcon,
  optionIcon,
  compactValue = "label",
  showIcon = true,
}: {
  control: SelectionControl;
  selectionId: string;
  selectionRevision?: SelectionContext["revision"];
  selectionEpoch?: SelectionContext["epoch"];
  onCommand: (command: SelectionCommand) => void;
  accent: string;
  presentation: "compact" | "menu";
  onActivated?: () => void;
  forMeasurement?: boolean;
  /** 统一栏：图标随当前值（对齐、列表）。缺省用控件自己的图标。 */
  triggerIcon?: WorkbenchIconName;
  optionIcon?: (value: string) => WorkbenchIconName | undefined;
  /** 栏上要不要写出当前值：字体写字体名；对齐 / 列表只看图标；层级是动作菜单，哪儿都不写值。 */
  compactValue?: "label" | "none" | "hidden";
  /** 栏上画不画图标：字体、字号只画值。 */
  showIcon?: boolean;
}) {
  const sessionId = useEditBarSessionId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const bookmarkRef = useRef<EditBarTextBookmark | null>(null);
  const keyboardOpenRef = useRef(false);
  const fontFamily = (control as CanonicalSelectionControl).canonId === "font-family" || control.id === "font-family";
  const inherited = useEditBarTextStyle(forMeasurement || !fontFamily);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const listboxId = `selection-select-${useId().replace(/:/g, "")}`;
  const menu = presentation === "menu";
  const iconOnly = !menu && selectionControlUsesIconOnly(control);
  const accessibleLabel =
    control.disabled && control.unavailableReason
      ? `${control.label}：${control.unavailableReason}`
      : control.label;
  const namedLabel = forMeasurement ? undefined : accessibleLabel;
  const selectedOption = (control.options || []).find(
    (option) => option.value === String(control.value ?? ""),
  );
  const valueDescriptionId = `${listboxId}-value`;
  const selectedLabel = fontFamily ? editBarFontName(control, inherited) :
    selectedOption?.label || String(control.value ?? "") || "未选择";
  const fontPreview = typeof control.value === "string" && !/^(default|inherit|unset)$/i.test(control.value)
    ? control.value : inherited?.fontFamily;
  const emit = (value: SelectionControlValue) =>
    onCommand({
      requestId: selectionRequestId(),
      selectionId,
      controlId: control.id,
      value,
      ...(selectionRevision !== undefined ? { selectionRevision } : {}),
      ...(selectionEpoch !== undefined ? { selectionEpoch } : {}),
    });
  const buttonClass = `${editBarControlClass(menu)} max-w-48 ${fontFamily ? `${EDIT_BAR_FIELD_CLASS} min-w-28` : ""}`;
  const options = (control.options || []).filter((option) => !fontFamily ||
    `${option.label} ${option.value}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const toggle = (keyboard: boolean) => {
    if (forMeasurement) return;
    if (!open) {
      bookmarkRef.current = captureEditBarTextBookmark();
      keyboardOpenRef.current = keyboard;
      setQuery("");
    }
    setOpen(!open);
  };

  return (
    <div
      className={`group/control relative min-w-0 shrink-0 ${menu ? "w-full" : ""}`}
      title={
        namedLabel ? `${namedLabel}：${selectedLabel}` : undefined
      }
      onBlur={(event) => {
        if (forMeasurement) return;
        const relatedTarget = event.relatedTarget as Node | null;
        if (
          !event.currentTarget.contains(relatedTarget) &&
          !menuRef.current?.contains(relatedTarget)
        ) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        disabled={control.disabled}
        tabIndex={forMeasurement ? -1 : undefined}
        onPointerDown={preserveEditBarSelection}
        onClick={(event) => toggle(event.detail === 0)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) toggle(true);
            else {
              const selected = menuRef.current?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
              (selected || menuRef.current?.querySelector<HTMLElement>('[role="option"]'))?.focus();
            }
          }
        }}
        aria-haspopup={forMeasurement ? undefined : "listbox"}
        aria-expanded={forMeasurement ? undefined : open}
        aria-controls={!forMeasurement && open ? listboxId : undefined}
        aria-label={namedLabel}
        aria-describedby={forMeasurement ? undefined : valueDescriptionId}
        className={buttonClass}
        style={!menu && !fontFamily ? { minWidth: EDIT_BAR_CONTROL_SIZE_PX } : undefined}
        data-edit-bar-font-family={fontFamily ? "" : undefined}
      >
        {(menu || showIcon) && (triggerIcon || control.icon) && (
          <EditBarIcon
            name={triggerIcon || control.icon!}
          />
        )}
        {!iconOnly && (menu || !fontFamily) && (
          <span
            className={`text-[10px] font-normal text-[var(--muted,#78716c)] ${
              menu ? "max-w-[45%] min-w-0 truncate" : "shrink-0"
            }`}
          >
            {control.label}
          </span>
        )}
        {(menu ? compactValue !== "hidden" : compactValue === "label") && (
          <span className="min-w-0 truncate font-semibold" style={fontFamily && selectedLabel !== "多种" ? { fontFamily: fontPreview } : undefined}>
            {selectedLabel}
          </span>
        )}
        <span className="shrink-0 text-[9px] opacity-50">⌄</span>
      </button>
      {!forMeasurement && (
        <span id={valueDescriptionId} className="sr-only">
          当前值：{selectedLabel}
        </span>
      )}
      <AnchoredPopover
        open={!forMeasurement && open}
        anchorRef={buttonRef}
        panelRef={menuRef}
        onClose={(reason) => {
          if (reason === "escape") restoreEditBarTextBookmark(bookmarkRef.current, false);
          setOpen(false);
        }}
        initialFocusSelector={fontFamily ? 'input[type="search"]' : keyboardOpenRef.current ? undefined : false}
        id={listboxId}
        role="listbox"
        ariaLabel={control.label}
        align="start"
        maxHeight={288}
        attributes={
          sessionId ? { "data-edit-bar-session": sessionId } : undefined
        }
        className="z-[2147483500] overflow-x-hidden overflow-y-auto rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-1.5 shadow-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          width: Math.max(
            176,
            buttonRef.current?.getBoundingClientRect().width || 0,
          ),
        }}
      >
        {fontFamily && <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={`${control.label} 搜索`}
          placeholder="搜索字体"
          className="mb-1 w-full rounded-lg border border-[var(--border,#e7e5e4)] bg-transparent px-2 py-2 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--awb-accent,#7c3aed)]/40"
        />}
        {options.map((option) => {
          const active = fontFamily ? selectedLabel !== "多种" && normalizeEditBarFontFamily(option.value).toLocaleLowerCase() === normalizeEditBarFontFamily(fontPreview || selectedLabel).toLocaleLowerCase() : option.value === String(control.value ?? "");
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              data-selection-option={option.value}
              aria-selected={active}
              tabIndex={active || (!selectedOption && option === options[0]) ? 0 : -1}
              onPointerDown={preserveEditBarSelection}
              onClick={(event) => {
                restoreEditBarTextBookmark(bookmarkRef.current);
                emit(option.value);
                setOpen(false);
                onActivated?.();
                // 无 DOM 书签的画布选区仍允许键盘继续操作栏；指针提交不抢焦点。
                if (!bookmarkRef.current && event.detail === 0 && menuRef.current?.contains(document.activeElement)) buttonRef.current?.focus({ preventScroll: true });
              }}
              className={`flex min-w-0 w-full items-center justify-between gap-3 overflow-hidden rounded-lg px-3 py-2 text-left text-[11px] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
 active
 ? "bg-[var(--surface-hover,rgba(0,0,0,.06))] font-semibold text-[var(--fg,#292524)]"
 : "text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]"
 }`}
              title={option.label}
            >
              <span className="flex min-w-0 items-center gap-2">
                {optionIcon?.(option.value) && (
                  <EditBarIcon
                    name={optionIcon(option.value)!}
                  />
                )}
                <span className="min-w-0 truncate" style={fontFamily ? { fontFamily: option.value } : undefined}>{option.label}</span>
              </span>
              {active && (
                <span className="shrink-0" style={{ color: accent }}>
                  ✓
                </span>
              )}
            </button>
          );
        })}
        {fontFamily && options.length === 0 && <p className="px-3 py-2 text-[12px]" role="status">无匹配字体</p>}
      </AnchoredPopover>
    </div>
  );
}
