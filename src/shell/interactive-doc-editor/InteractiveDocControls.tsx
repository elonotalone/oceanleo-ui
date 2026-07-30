"use client";

import { useUI } from "../../i18n/ui/useUI";
import {
  INTERACTIVE_DOC_GRID,
  INTERACTIVE_DOC_PALETTE,
  INTERACTIVE_DOC_TYPE_SCALE,
  type InteractiveDocControlDescriptor,
} from "./interactive-doc-controls";
import type { InteractiveDocWorkbench } from "./use-interactive-doc-workbench";

const FIELD_BORDER = INTERACTIVE_DOC_PALETTE["doc.rule.strong"];
const TEXT_PRIMARY = INTERACTIVE_DOC_PALETTE["doc.text.primary"];
const TEXT_SECONDARY = INTERACTIVE_DOC_PALETTE["doc.text.secondary"];
const NEGATIVE = INTERACTIVE_DOC_PALETTE["doc.negative"];
const WARN = INTERACTIVE_DOC_PALETTE["doc.warn"];
const ACCENT = INTERACTIVE_DOC_PALETTE["doc.accent"];

const CONTROL_STYLE = {
  minHeight: `${INTERACTIVE_DOC_GRID.controlMinHeightPx}px`,
  border: `1px solid ${FIELD_BORDER}`,
  borderRadius: "8px",
  padding: "0 10px",
  color: TEXT_PRIMARY,
  background: INTERACTIVE_DOC_PALETTE["doc.surface"],
  fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.body.fontSizePx}px`,
  lineHeight: `${INTERACTIVE_DOC_TYPE_SCALE.body.lineHeightPx}px`,
  width: "100%",
} as const;

/**
 * One parameter control. Every branch keeps the programmatic label association
 * (SC 1.3.1), the visible min / max / unit sentence (SC 3.3.2) and the textual
 * failure description (SC 3.3.1) — the colour is never the only carrier.
 */
export function InteractiveDocParameterField({
  descriptor,
  disabled = false,
  onChange,
}: {
  descriptor: InteractiveDocControlDescriptor;
  disabled?: boolean;
  onChange: (value: string | number | boolean) => void;
}) {
  const tt = useUI();
  const helpId = `interactive-doc-param-${descriptor.parameterId}-help`;
  const domainId = `interactive-doc-param-${descriptor.parameterId}-domain`;
  const issueId = `interactive-doc-param-${descriptor.parameterId}-issue`;
  const inputId = `interactive-doc-param-${descriptor.parameterId}`;
  const describedBy = descriptor.describedBy.join(" ");
  const numeric =
    descriptor.kind === "number" ||
    descriptor.kind === "integer" ||
    descriptor.kind === "percent" ||
    descriptor.kind === "currency";

  const control = () => {
    if (descriptor.control === "switch") {
      return (
        <button
          type="button"
          id={inputId}
          role="switch"
          aria-checked={descriptor.value === true}
          aria-labelledby={descriptor.labelId}
          aria-describedby={describedBy || undefined}
          disabled={disabled}
          onClick={() => onChange(descriptor.value !== true)}
          style={{
            ...CONTROL_STYLE,
            textAlign: "left",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          {descriptor.value === true ? tt("是") : tt("否")}
        </button>
      );
    }
    if (descriptor.control === "radio") {
      return (
        <div
          role="radiogroup"
          aria-labelledby={descriptor.labelId}
          aria-describedby={describedBy || undefined}
          style={{ display: "grid", gap: "6px" }}
        >
          {descriptor.options.map((option) => (
            <label
              key={String(option.value)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                minHeight: `${INTERACTIVE_DOC_GRID.controlMinHeightPx}px`,
                color: TEXT_PRIMARY,
              }}
            >
              <input
                type="radio"
                name={inputId}
                value={String(option.value)}
                checked={String(descriptor.value) === String(option.value)}
                disabled={disabled}
                onChange={() => onChange(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      );
    }
    if (descriptor.control === "select") {
      return (
        <select
          id={inputId}
          aria-labelledby={descriptor.labelId}
          aria-describedby={describedBy || undefined}
          value={String(descriptor.value)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          style={CONTROL_STYLE}
        >
          {descriptor.options.map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }
    if (descriptor.control === "slider") {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <input
            id={inputId}
            type="range"
            aria-labelledby={descriptor.labelId}
            aria-describedby={describedBy || undefined}
            min={descriptor.min ?? undefined}
            max={descriptor.max ?? undefined}
            step={descriptor.step ?? undefined}
            value={Number(descriptor.value) || 0}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            style={{ flex: 1, accentColor: ACCENT }}
          />
          <output
            htmlFor={inputId}
            style={{
              minWidth: "84px",
              textAlign: "right",
              color: TEXT_PRIMARY,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {String(descriptor.value)}
            {descriptor.unit ? ` ${descriptor.unit}` : ""}
          </output>
        </div>
      );
    }
    if (descriptor.control === "date-picker") {
      return (
        <input
          id={inputId}
          type="date"
          aria-labelledby={descriptor.labelId}
          aria-describedby={describedBy || undefined}
          value={String(descriptor.value || "")}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          style={CONTROL_STYLE}
        />
      );
    }
    return (
      <input
        id={inputId}
        type={numeric ? "number" : "text"}
        inputMode={
          descriptor.kind === "integer"
            ? "numeric"
            : numeric
              ? "decimal"
              : undefined
        }
        aria-labelledby={descriptor.labelId}
        aria-describedby={describedBy || undefined}
        aria-invalid={descriptor.issue?.severity === "error" || undefined}
        min={numeric && descriptor.min !== null ? descriptor.min : undefined}
        max={numeric && descriptor.max !== null ? descriptor.max : undefined}
        step={
          descriptor.control === "stepper" && descriptor.step !== null
            ? descriptor.step
            : numeric && descriptor.step !== null
              ? descriptor.step
              : undefined
        }
        value={String(descriptor.value ?? "")}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        style={CONTROL_STYLE}
      />
    );
  };

  return (
    <div style={{ display: "grid", gap: "4px" }}>
      <label
        id={descriptor.labelId}
        htmlFor={inputId}
        style={{
          color: TEXT_PRIMARY,
          fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.body.fontSizePx}px`,
          lineHeight: `${INTERACTIVE_DOC_TYPE_SCALE.body.lineHeightPx}px`,
        }}
      >
        {descriptor.label}
        {descriptor.unit ? (
          <span style={{ color: TEXT_SECONDARY }}>{`（${descriptor.unit}）`}</span>
        ) : null}
      </label>
      {control()}
      {descriptor.help ? (
        <p
          id={helpId}
          style={{
            margin: 0,
            color: TEXT_SECONDARY,
            fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.caption.fontSizePx}px`,
            lineHeight: `${INTERACTIVE_DOC_TYPE_SCALE.caption.lineHeightPx}px`,
          }}
        >
          {descriptor.help}
        </p>
      ) : null}
      {descriptor.domainHint ? (
        <p
          id={domainId}
          style={{
            margin: 0,
            color: TEXT_SECONDARY,
            fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.caption.fontSizePx}px`,
            lineHeight: `${INTERACTIVE_DOC_TYPE_SCALE.caption.lineHeightPx}px`,
          }}
        >
          {descriptor.domainHint}
        </p>
      ) : null}
      {descriptor.issue ? (
        <p
          id={issueId}
          role={descriptor.issue.severity === "error" ? "alert" : "status"}
          style={{
            margin: 0,
            color: descriptor.issue.severity === "error" ? NEGATIVE : WARN,
            fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.caption.fontSizePx}px`,
            lineHeight: `${INTERACTIVE_DOC_TYPE_SCALE.caption.lineHeightPx}px`,
          }}
        >
          {descriptor.issue.message}
        </p>
      ) : null}
      {descriptor.downstream.length ? (
        <p
          style={{
            margin: 0,
            color: TEXT_SECONDARY,
            fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.caption.fontSizePx}px`,
          }}
        >
          {tt("影响 {ids}", { ids: descriptor.downstream.join(" / ") })}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Toolbox panel: the full parameter set, the recompute mode affordance,
 * scenario slots (§4 C17) and the diagnostics list. Everything here goes
 * through the workbench engine, so the recompute fan-out is identical to the
 * one exercised headlessly in `tests/interactive-doc-workbench.test.mjs`.
 */
export function InteractiveDocControls({
  editor,
}: {
  editor: InteractiveDocWorkbench;
}) {
  const tt = useUI();
  const disabled = editor.loading || editor.saving || !editor.sourceReady;
  const errors = editor.diagnostics.filter((entry) => entry.severity === "error");
  const warnings = editor.diagnostics.filter((entry) => entry.severity === "warn");
  return (
    <div
      style={{
        minHeight: "100%",
        overflowY: "auto",
        background: INTERACTIVE_DOC_PALETTE["doc.surface"],
        padding: "16px",
        display: "grid",
        gap: `${INTERACTIVE_DOC_GRID.blockGapPx}px`,
      }}
    >
      <section style={{ display: "grid", gap: "12px" }}>
        <h2
          style={{
            margin: 0,
            color: TEXT_PRIMARY,
            fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.h3.fontSizePx}px`,
            lineHeight: `${INTERACTIVE_DOC_TYPE_SCALE.h3.lineHeightPx}px`,
          }}
        >
          {tt("参数")}
        </h2>
        {editor.controls.map((descriptor) => (
          <InteractiveDocParameterField
            key={descriptor.parameterId}
            descriptor={descriptor}
            disabled={disabled}
            onChange={(value) => editor.setParameter(descriptor.parameterId, value)}
          />
        ))}
      </section>

      {editor.recomputeMode === "on-commit" ? (
        <section style={{ display: "grid", gap: "8px" }}>
          <p style={{ margin: 0, color: TEXT_SECONDARY, fontSize: "12px" }}>
            {tt("当前为提交后重算模式，待提交参数：{ids}", {
              ids: editor.pendingParameterIds.join(" / ") || tt("无"),
            })}
          </p>
          <button
            type="button"
            disabled={disabled || !editor.pendingParameterIds.length}
            onClick={() => editor.commitInputs()}
            style={{ ...CONTROL_STYLE, color: ACCENT, cursor: "pointer" }}
          >
            {tt("提交并重算")}
          </button>
        </section>
      ) : null}

      {editor.scenarios.length ? (
        <section style={{ display: "grid", gap: "8px" }}>
          <h3
            style={{
              margin: 0,
              color: TEXT_PRIMARY,
              fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.body.fontSizePx}px`,
            }}
          >
            {tt("情景槽位")}
          </h3>
          {editor.scenarios.map((slot, index) => (
            <div
              key={`scenario-${index}`}
              style={{ display: "flex", gap: "8px", alignItems: "center" }}
            >
              <span style={{ color: TEXT_SECONDARY, fontSize: "12px", minWidth: "56px" }}>
                {tt("槽位 {n}", { n: index + 1 })}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => editor.saveScenario(index)}
                style={{ ...CONTROL_STYLE, cursor: "pointer" }}
              >
                {tt("存入")}
              </button>
              <button
                type="button"
                disabled={disabled || !slot}
                onClick={() => editor.applyScenario(index)}
                style={{ ...CONTROL_STYLE, cursor: "pointer" }}
              >
                {tt("回放")}
              </button>
            </div>
          ))}
        </section>
      ) : null}

      <section style={{ display: "grid", gap: "8px" }}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.reset()}
          style={{ ...CONTROL_STYLE, cursor: "pointer" }}
        >
          {tt("重置为初始参数")}
        </button>
        <p style={{ margin: 0, color: TEXT_SECONDARY, fontSize: "12px" }}>
          {tt("重算状态：{phase}，上轮 {ms} ms / 预算 {budget} ms", {
            phase: editor.phase,
            ms: editor.lastRecompute?.durationMs ?? 0,
            budget: editor.recomputeBudgetMs,
          })}
        </p>
        {editor.stale ? (
          <p role="status" style={{ margin: 0, color: WARN, fontSize: "12px" }}>
            {tt("结果已过期：上一轮重算超时，显示的是上一轮结果。")}
          </p>
        ) : null}
      </section>

      {errors.length || warnings.length ? (
        <section style={{ display: "grid", gap: "6px" }}>
          <h3
            style={{
              margin: 0,
              color: TEXT_PRIMARY,
              fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.body.fontSizePx}px`,
            }}
          >
            {tt("校验与诊断")}
          </h3>
          {errors.map((entry, index) => (
            <p
              key={`error-${entry.code}-${index}`}
              role="alert"
              style={{ margin: 0, color: NEGATIVE, fontSize: "12px" }}
            >
              {`${entry.code}: ${entry.message}`}
            </p>
          ))}
          {warnings.map((entry, index) => (
            <p
              key={`warn-${entry.code}-${index}`}
              role="status"
              style={{ margin: 0, color: WARN, fontSize: "12px" }}
            >
              {`${entry.code}: ${entry.message}`}
            </p>
          ))}
        </section>
      ) : null}
    </div>
  );
}
