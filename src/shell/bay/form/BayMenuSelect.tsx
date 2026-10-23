"use client";

import type { ReactElement } from "react";
import { MenuSelect } from "../../menu-select";
import { BAY_FORM_LABEL_CLASS } from "./form-ui";

export type BayMenuOption = {
  value: string;
  label: string;
  disabled?: boolean;
  description?: string;
  attrs?: Record<string, string | undefined>;
};

/** Listing fields share the Library/project menu UI and keyboard behavior. */
export function BayMenuSelect(props: {
  label?: string;
  value: string;
  options: readonly BayMenuOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  emptyLabel?: string;
  maxWidth?: number;
  selectProps?: Record<string, string | undefined>;
}): ReactElement {
  const current = props.options.find((option) => option.value === props.value);
  return (
    <div className="block w-full" style={props.maxWidth ? { maxWidth: props.maxWidth } : undefined}>
      {props.label ? <span className={`mb-2 block ${BAY_FORM_LABEL_CLASS}`}>{props.label}</span> : null}
      <MenuSelect
        name="bay-form"
        ariaLabel={props.selectProps?.["aria-label"] || props.label || props.placeholder || props.emptyLabel || current?.label || ""}
        value={props.value}
        options={props.options}
        onChange={props.onChange}
        disabled={props.disabled}
        placeholder={props.emptyLabel || props.placeholder}
        selectProps={props.selectProps}
        triggerProps={{ "data-bay-menu-trigger": "" }}
        menuProps={{ "data-bay-menu": "", "data-bay-menu-scroll": "" }}
      />
    </div>
  );
}
