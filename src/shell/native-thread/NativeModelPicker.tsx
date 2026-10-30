"use client";

// The native program's model control, placed where ModelGroupPicker sits in
// LeoComposer. Trigger, popover and rows reuse ModelGroupPicker's compact
// classes verbatim so a native conversation's composer looks the same.

import { useRef, useState } from "react";
import { useUI, type UITranslate } from "../../i18n/ui/useUI";
import { AnchoredPopover } from "../anchored-popover";
import { IconCheck, IconChevronDown } from "../icons";
import { modelDisplayName, providerLabel } from "../cloud-computer/agent-dialog/notice";
import type { DialogModel, ModeOption } from "../cloud-computer/agent-dialog/types";

export type NativeModelPickerProps = {
  models: DialogModel[];
  selected: string;
  onSelect: (id: string) => void;
  mode?: ModeOption | null;
  selectedMode?: string;
  onMode?: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

function unusableReason(model: DialogModel, tt: UITranslate): string {
  const provider = model.provider_label || providerLabel(model.provider || "") || tt("供应商");
  if (model.reason === "needs_credits") return tt("{provider} 的付费模型需要账户余额。", { provider });
  if (model.reason === "no_credentials") return tt("{provider} 还没有登录。", { provider });
  return tt("这个模型现在不可用。");
}

function groupsOf(models: DialogModel[]): { label: string; models: DialogModel[] }[] {
  const groups = new Map<string, DialogModel[]>();
  for (const model of models) {
    const label = model.provider_label || (model.provider ? providerLabel(model.provider) : "");
    groups.set(label, [...(groups.get(label) || []), model]);
  }
  return Array.from(groups, ([label, rows]) => ({ label, models: rows }));
}

/** Same cap as ModelPicker POPOVER_MAX_HEIGHT (kept local to avoid pulling the account client in). */
const POPOVER_MAX_HEIGHT = 360;

const ROW =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] disabled:cursor-default disabled:opacity-60";

export function NativeModelPicker({
  models,
  selected,
  onSelect,
  mode = null,
  selectedMode = "",
  onMode,
  disabled = false,
  className = "",
}: NativeModelPickerProps) {
  const tt = useUI();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const active = models.find((model) => model.id === selected);
  const modeChoices = mode?.options ?? [];
  const modeName = modeChoices.find((choice) => choice.value === selectedMode)?.name || "";
  const label = active ? modelDisplayName(active) : models.length ? tt("选择模型") : modeName || tt("模式");
  const groups = groupsOf(models);
  const grouped = groups.length > 1 || Boolean(groups[0]?.label);

  return (
    <div className={className} data-native-model-picker="">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[12px] font-medium transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:scale-95 disabled:cursor-default disabled:opacity-50 ${
          open
            ? "border-neutral-300 bg-neutral-100 text-neutral-900"
            : "border-neutral-200/90 bg-stone-50/80 text-neutral-600 hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-900"
        }`}
        title={active ? `${tt("模型")} · ${modelDisplayName(active)}` : tt("模型")}
        data-native-model-trigger=""
      >
        <svg className="h-3 w-3 shrink-0 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M5 7h14M5 12h14M5 17h14" strokeLinecap="round" />
          <circle cx="8" cy="7" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="11" cy="17" r="1.5" fill="currentColor" stroke="none" />
        </svg>
        <span className="max-w-[110px] truncate">{label}</span>
        {modeName && models.length ? <span className="max-w-[60px] truncate text-neutral-400">{modeName}</span> : null}
        <span className={`shrink-0 text-neutral-400 transition-transform duration-[var(--leo-dur-3)] ease-[var(--leo-ease-standard)] ${open ? "rotate-180" : ""}`}>
          <IconChevronDown className="h-3 w-3" />
        </span>
      </button>

      <AnchoredPopover
        open={open && !disabled}
        anchorRef={triggerRef}
        onClose={() => setOpen(false)}
        align="end"
        preferredPlacement="above"
        maxHeight={POPOVER_MAX_HEIGHT}
        role="listbox"
        ariaLabel={tt("模型")}
        className="z-50 flex w-[min(15rem,88vw)] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl"
        attributes={{ "data-native-model-popover": true }}
      >
        <div data-model-picker-list className="min-h-0 flex-1 overflow-y-auto py-1 [scrollbar-width:thin]">
          {models.length ? (
            <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold text-neutral-800">{tt("模型")}</p>
          ) : null}
          {groups.map((group) => (
            <div key={group.label || "models"}>
              {grouped && group.label ? (
                <p className="px-3 pb-0.5 pt-1.5 text-[10px] text-neutral-400">{group.label}</p>
              ) : null}
              {group.models.map((model) => {
                const isSelected = model.id === selected;
                const usable = model.usable !== false;
                const name = modelDisplayName(model);
                return (
                  <button
                    key={model.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={!usable}
                    title={usable ? name : unusableReason(model, tt)}
                    onClick={() => {
                      setOpen(false);
                      if (!isSelected) onSelect(model.id);
                    }}
                    className={`${ROW} ${isSelected ? "bg-neutral-50" : "hover:bg-neutral-50/70"}`}
                    data-native-model-option={model.id}
                  >
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-lg bg-neutral-900 text-[10px] font-bold text-white">
                      {name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-neutral-900">{name}</span>
                    {isSelected ? <IconCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : null}
                  </button>
                );
              })}
            </div>
          ))}
          {modeChoices.length && onMode ? (
            <div className={models.length ? "mt-1 border-t border-neutral-100 pt-1" : ""}>
              <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold text-neutral-800">{mode?.name || tt("模式")}</p>
              {modeChoices.map((choice) => {
                const isSelected = choice.value === selectedMode;
                return (
                  <button
                    key={choice.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      setOpen(false);
                      if (!isSelected) onMode(choice.value);
                    }}
                    className={`${ROW} ${isSelected ? "bg-neutral-50" : "hover:bg-neutral-50/70"}`}
                    data-native-mode-option={choice.value}
                  >
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-neutral-900">{choice.name}</span>
                    {isSelected ? <IconCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </AnchoredPopover>
    </div>
  );
}
