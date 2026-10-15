"use client";

import type { ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { appendTermHint, CUSTOM_TERM_HINTS } from "./bay-audience";
import { BayAutoTextarea } from "./BayAutoTextarea";
import { BAY_FORM_CHIP_BUTTON_CLASS, BAY_FORM_HELP_CLASS } from "./form-ui";

export function BayCustomTerms(props: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}): ReactElement {
  const tt = useUI();
  return (
    <div data-bay-custom-terms="">
      <p className={`mb-2 ${BAY_FORM_HELP_CLASS}`}>{tt("点一下加进条款，也可以自己写")}</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {CUSTOM_TERM_HINTS.map((hint) => (
          <button
            key={hint}
            type="button"
            disabled={props.disabled}
            data-bay-term-hint={hint}
            className={BAY_FORM_CHIP_BUTTON_CLASS}
            onClick={() => props.onChange(appendTermHint(props.value, hint))}
          >
            {tt(hint)}
          </button>
        ))}
      </div>
      <BayAutoTextarea
        maxLength={2000}
        value={props.value}
        disabled={props.disabled}
        placeholder={tt("用户自定义")}
        onChange={(event) => props.onChange(event.target.value)}
        data-bay-field="custom-terms"
      />
    </div>
  );
}
