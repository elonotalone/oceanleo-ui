"use client";

import { useEffect, useRef } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { InteractiveDocParameterField } from "./InteractiveDocControls";
import {
  INTERACTIVE_DOC_GRID,
  INTERACTIVE_DOC_PALETTE,
  INTERACTIVE_DOC_TYPE_SCALE,
  INTERACTIVE_DOC_VALUE_PLACEHOLDER,
  type InteractiveDocTextToken,
} from "./interactive-doc-controls";
import type {
  InteractiveDocStageBlock,
  InteractiveDocWorkbench,
} from "./use-interactive-doc-workbench";

const SURFACE = INTERACTIVE_DOC_PALETTE["doc.surface"];
const SURFACE_ALT = INTERACTIVE_DOC_PALETTE["doc.surface.alt"];
const TEXT_PRIMARY = INTERACTIVE_DOC_PALETTE["doc.text.primary"];
const TEXT_SECONDARY = INTERACTIVE_DOC_PALETTE["doc.text.secondary"];
const ACCENT = INTERACTIVE_DOC_PALETTE["doc.accent"];
const POSITIVE = INTERACTIVE_DOC_PALETTE["doc.positive"];
const NEGATIVE = INTERACTIVE_DOC_PALETTE["doc.negative"];
const WARN = INTERACTIVE_DOC_PALETTE["doc.warn"];
const BORDER_DECORATIVE = INTERACTIVE_DOC_PALETTE["doc.border"];
const RULE_STRONG = INTERACTIVE_DOC_PALETTE["doc.rule.strong"];

const CALLOUT_COLOR: Record<string, string> = {
  info: ACCENT,
  warn: WARN,
  danger: NEGATIVE,
  success: POSITIVE,
};

function TextRun({ tokens }: { tokens: InteractiveDocTextToken[] }) {
  // §5.5: tokens become React children, so no HTML string is ever injected.
  return (
    <>
      {tokens.map((token, index) => {
        if (token.kind === "strong") {
          return <strong key={index}>{token.text}</strong>;
        }
        if (token.kind === "emphasis") {
          return <em key={index}>{token.text}</em>;
        }
        if (token.kind === "code") {
          return (
            <code
              key={index}
              style={{
                background: SURFACE_ALT,
                border: `1px solid ${RULE_STRONG}`,
                borderRadius: "4px",
                padding: "0 4px",
              }}
            >
              {token.text}
            </code>
          );
        }
        return <span key={index}>{token.text}</span>;
      })}
    </>
  );
}

function ChartBlock({
  block,
  editor,
}: {
  block: Extract<InteractiveDocStageBlock, { kind: "chart" }>;
  editor: InteractiveDocWorkbench;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // Rendering belongs to the data layer's `renderInteractiveDocBlock`
    // (arbitration D4: this directory never reaches into the chart carrier's
    // editor directory).
    editor.renderBlock(block.id, host);
  }, [block.id, block.series, editor]);
  return (
    <div>
      <div ref={hostRef} data-interactive-doc-chart={block.chartType} />
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.body.fontSizePx}px`,
        }}
      >
        <caption
          style={{
            captionSide: "bottom",
            color: TEXT_SECONDARY,
            fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.caption.fontSizePx}px`,
            textAlign: "left",
          }}
        >
          {`${block.xAxisLabel} / ${block.yAxisLabel}`}
        </caption>
        <tbody>
          {block.series.map((series) => (
            <tr key={series.bind} style={{ height: `${INTERACTIVE_DOC_GRID.tableRowHeightPx}px` }}>
              <th
                scope="row"
                style={{
                  textAlign: "left",
                  borderBottom: `1px solid ${RULE_STRONG}`,
                  color: TEXT_PRIMARY,
                  fontWeight: 400,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-block",
                    width: "10px",
                    height: "10px",
                    marginRight: "8px",
                    background: series.color || ACCENT,
                  }}
                />
                {series.name}
              </th>
              <td
                style={{
                  textAlign: "right",
                  borderBottom: `1px solid ${RULE_STRONG}`,
                  color: TEXT_PRIMARY,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {series.display}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The document viewport (`viewportOwnership: "content"`): a 960 px / 12-column
 * flow (§2.2) rendering all ten `blocks[].kind` values with the §2.1 palette
 * and §2.3 type scale. Failures are always text (SC 3.3.1) and result cards
 * declare the parameters they depend on (SC 1.3.1).
 */
export function InteractiveDocStage({
  editor,
}: {
  editor: InteractiveDocWorkbench;
}) {
  const tt = useUI();
  if (editor.loading) {
    return (
      <div
        style={{
          display: "grid",
          placeItems: "center",
          minHeight: "420px",
          height: "100%",
          background: SURFACE_ALT,
          color: TEXT_SECONDARY,
        }}
      >
        {tt("正在载入可算文档…")}
      </div>
    );
  }
  if (editor.phase === "cyclic" || editor.phase === "invalid" || !editor.project) {
    const cycle = editor.link?.topology.cycle || null;
    return (
      <div
        style={{
          display: "grid",
          placeItems: "center",
          minHeight: "420px",
          height: "100%",
          background: SURFACE_ALT,
          padding: "24px",
        }}
      >
        <div
          role="alert"
          style={{
            maxWidth: "640px",
            background: SURFACE,
            border: `1px solid ${RULE_STRONG}`,
            borderRadius: "12px",
            padding: "20px",
            display: "grid",
            gap: "10px",
          }}
        >
          <p style={{ margin: 0, color: NEGATIVE, fontWeight: 600 }}>
            {editor.phase === "cyclic"
              ? tt("计算图存在循环依赖，已停止求值")
              : tt("交互文档源不可用")}
          </p>
          {cycle ? (
            <p style={{ margin: 0, color: TEXT_PRIMARY, fontSize: "13px" }}>
              {tt("环上完整 id 序列：{cycle}", { cycle: cycle.join(" → ") })}
            </p>
          ) : null}
          {editor.diagnostics
            .filter((entry) => entry.severity === "error")
            .slice(0, 8)
            .map((entry, index) => (
              <p
                key={`${entry.code}-${index}`}
                style={{ margin: 0, color: TEXT_SECONDARY, fontSize: "12px" }}
              >
                {`${entry.code}: ${entry.message}`}
              </p>
            ))}
          {editor.error ? (
            <p style={{ margin: 0, color: TEXT_SECONDARY, fontSize: "12px" }}>
              {editor.error}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  const metadata = (editor.project as { metadata?: { title?: string; summary?: string } })
    .metadata;
  const attribution = (
    editor.project as {
      attribution?: { entries?: Array<{ text: string; licenseCode: string; licenseUrl: string }> };
    }
  ).attribution;
  const failedValidations = editor.validations.filter((entry) => !entry.passed);

  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        background: SURFACE_ALT,
        padding: `${INTERACTIVE_DOC_GRID.blockGapPx}px 0`,
      }}
    >
      <article
        style={{
          width: `${INTERACTIVE_DOC_GRID.documentWidthPx}px`,
          maxWidth: "100%",
          margin: "0 auto",
          background: SURFACE,
          padding: `${INTERACTIVE_DOC_GRID.documentPaddingPx}px`,
          borderRadius: "12px",
          border: `1px solid ${BORDER_DECORATIVE}`,
          display: "grid",
          gridTemplateColumns: `repeat(${INTERACTIVE_DOC_GRID.columns}, 1fr)`,
          columnGap: `${INTERACTIVE_DOC_GRID.columnGapPx}px`,
          rowGap: `${INTERACTIVE_DOC_GRID.blockGapPx}px`,
          color: TEXT_PRIMARY,
        }}
      >
        <header style={{ gridColumn: `span ${INTERACTIVE_DOC_GRID.columns}` }}>
          <h1
            style={{
              margin: 0,
              fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.h1.fontSizePx}px`,
              lineHeight: `${INTERACTIVE_DOC_TYPE_SCALE.h1.lineHeightPx}px`,
            }}
          >
            {metadata?.title || tt("可算文档")}
          </h1>
          {metadata?.summary ? (
            <p
              style={{
                margin: "8px 0 0",
                color: TEXT_SECONDARY,
                fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.body.fontSizePx}px`,
                lineHeight: `${INTERACTIVE_DOC_TYPE_SCALE.body.lineHeightPx}px`,
              }}
            >
              {metadata.summary}
            </p>
          ) : null}
          {editor.phase === "degraded" ? (
            <p role="alert" style={{ margin: "8px 0 0", color: WARN, fontSize: "13px" }}>
              {editor.stale
                ? tt("重算超时，显示的是上一轮结果；保存已被阻止。")
                : tt("依赖件缺失，文档进入 degraded；保存已被阻止。")}
            </p>
          ) : null}
        </header>

        {failedValidations.length ? (
          <section
            role="alert"
            style={{
              gridColumn: `span ${INTERACTIVE_DOC_GRID.columns}`,
              background: SURFACE_ALT,
              border: `1px solid ${RULE_STRONG}`,
              borderRadius: "10px",
              padding: "12px 14px",
              display: "grid",
              gap: "6px",
            }}
          >
            {failedValidations.map((entry) => (
              <p
                key={entry.ruleId}
                style={{
                  margin: 0,
                  color: entry.severity === "error" ? NEGATIVE : WARN,
                  fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.body.fontSizePx}px`,
                }}
              >
                {`${entry.ruleId}：${entry.message}`}
              </p>
            ))}
          </section>
        ) : null}

        {editor.blocks.map((block) => {
          const style = {
            gridColumn: `span ${Math.min(INTERACTIVE_DOC_GRID.columns, block.span)}`,
          } as const;
          if (block.kind === "prose") {
            return (
              <section key={block.id} style={style}>
                {block.title ? (
                  <h2
                    style={{
                      margin: "0 0 8px",
                      fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.h2.fontSizePx}px`,
                      lineHeight: `${INTERACTIVE_DOC_TYPE_SCALE.h2.lineHeightPx}px`,
                    }}
                  >
                    {block.title}
                  </h2>
                ) : null}
                <p
                  style={{
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.body.fontSizePx}px`,
                    lineHeight: `${INTERACTIVE_DOC_TYPE_SCALE.body.lineHeightPx}px`,
                  }}
                >
                  <TextRun tokens={block.tokens} />
                </p>
              </section>
            );
          }
          if (block.kind === "parameter-panel") {
            return (
              <section
                key={block.id}
                style={{
                  ...style,
                  background: SURFACE_ALT,
                  border: `1px solid ${RULE_STRONG}`,
                  borderRadius: "10px",
                  padding: "14px",
                  display: "grid",
                  gap: "12px",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.h3.fontSizePx}px`,
                    lineHeight: `${INTERACTIVE_DOC_TYPE_SCALE.h3.lineHeightPx}px`,
                  }}
                >
                  {block.title || tt("参数")}
                </h3>
                {block.controls.map((descriptor) => (
                  <InteractiveDocParameterField
                    key={descriptor.parameterId}
                    descriptor={descriptor}
                    disabled={editor.saving}
                    onChange={(value) =>
                      editor.setParameter(descriptor.parameterId, value)
                    }
                  />
                ))}
              </section>
            );
          }
          if (block.kind === "metric") {
            const dependsId = `${block.id}-depends`;
            return (
              <section
                key={block.id}
                aria-describedby={dependsId}
                style={{
                  ...style,
                  background: SURFACE_ALT,
                  border: `1px solid ${RULE_STRONG}`,
                  borderRadius: "10px",
                  padding: "14px",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.h3.fontSizePx}px`,
                    lineHeight: `${INTERACTIVE_DOC_TYPE_SCALE.h3.lineHeightPx}px`,
                  }}
                >
                  {block.title || block.bind}
                </h3>
                <p
                  style={{
                    margin: "6px 0 0",
                    color: block.display === INTERACTIVE_DOC_VALUE_PLACEHOLDER ? WARN : ACCENT,
                    fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.metric.fontSizePx}px`,
                    lineHeight: `${INTERACTIVE_DOC_TYPE_SCALE.metric.lineHeightPx}px`,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {block.display}
                </p>
                <p
                  id={dependsId}
                  style={{
                    margin: "4px 0 0",
                    color: TEXT_SECONDARY,
                    fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.caption.fontSizePx}px`,
                    lineHeight: `${INTERACTIVE_DOC_TYPE_SCALE.caption.lineHeightPx}px`,
                  }}
                >
                  {block.dependsOnParameterIds.length
                    ? tt("依赖参数：{ids}", {
                        ids: block.dependsOnParameterIds.join(" / "),
                      })
                    : tt("常量结果")}
                </p>
                {block.issue ? (
                  <p role="alert" style={{ margin: "4px 0 0", color: NEGATIVE, fontSize: "12px" }}>
                    {block.issue.message}
                  </p>
                ) : null}
                {block.stale ? (
                  <p role="status" style={{ margin: "4px 0 0", color: WARN, fontSize: "12px" }}>
                    {tt("已过期")}
                  </p>
                ) : null}
              </section>
            );
          }
          if (block.kind === "table") {
            return (
              <section key={block.id} style={style}>
                {block.title ? (
                  <h3
                    style={{
                      margin: "0 0 8px",
                      fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.h3.fontSizePx}px`,
                    }}
                  >
                    {block.title}
                  </h3>
                ) : null}
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {block.rows.map((row, index) => (
                      <tr
                        key={`${block.id}-${row.label}-${index}`}
                        style={{
                          height: `${block.rowHeightPx}px`,
                          background: index % 2 === 1 ? SURFACE_ALT : SURFACE,
                        }}
                      >
                        <th
                          scope="row"
                          style={{
                            textAlign: "left",
                            borderBottom: `1px solid ${RULE_STRONG}`,
                            color: TEXT_PRIMARY,
                            fontWeight: row.emphasis === "none" ? 400 : 600,
                            fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.body.fontSizePx}px`,
                          }}
                        >
                          {row.label}
                        </th>
                        <td
                          style={{
                            textAlign: "right",
                            borderBottom: `1px solid ${RULE_STRONG}`,
                            color: TEXT_PRIMARY,
                            fontWeight: row.emphasis === "total" ? 600 : 400,
                            fontVariantNumeric: "tabular-nums",
                            fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.body.fontSizePx}px`,
                          }}
                        >
                          {row.display}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          }
          if (block.kind === "chart") {
            return (
              <section key={block.id} style={style}>
                {block.title ? (
                  <h3 style={{ margin: "0 0 8px", fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.h3.fontSizePx}px` }}>
                    {block.title}
                  </h3>
                ) : null}
                <ChartBlock block={block} editor={editor} />
              </section>
            );
          }
          if (block.kind === "formula") {
            return (
              <section
                key={block.id}
                style={{
                  ...style,
                  border: `1px solid ${RULE_STRONG}`,
                  borderRadius: "10px",
                  padding: "14px",
                }}
              >
                <h3 style={{ margin: 0, fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.h3.fontSizePx}px` }}>
                  {block.title || block.computationId}
                </h3>
                <ol style={{ margin: "8px 0 0", paddingLeft: "20px" }}>
                  {block.steps.map((step, index) => (
                    <li
                      key={`${block.id}-step-${index}`}
                      style={{
                        color: TEXT_PRIMARY,
                        fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.body.fontSizePx}px`,
                        lineHeight: `${INTERACTIVE_DOC_TYPE_SCALE.body.lineHeightPx}px`,
                      }}
                    >
                      <code>{step.expression}</code>
                      {step.note ? (
                        <span style={{ color: TEXT_SECONDARY }}>{` — ${step.note}`}</span>
                      ) : null}
                    </li>
                  ))}
                </ol>
                <p
                  style={{
                    margin: "8px 0 0",
                    color: ACCENT,
                    fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.body.fontSizePx}px`,
                  }}
                >
                  {tt("当前结果：{value}", { value: block.display })}
                </p>
              </section>
            );
          }
          if (block.kind === "callout") {
            const tone = CALLOUT_COLOR[block.tone] || ACCENT;
            return (
              <aside
                key={block.id}
                style={{
                  ...style,
                  borderLeft: `4px solid ${tone}`,
                  background: SURFACE_ALT,
                  padding: "12px 14px",
                  borderRadius: "8px",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    color: TEXT_PRIMARY,
                    fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.body.fontSizePx}px`,
                    lineHeight: `${INTERACTIVE_DOC_TYPE_SCALE.body.lineHeightPx}px`,
                  }}
                >
                  <span style={{ color: tone, fontWeight: 600 }}>{`${block.tone}: `}</span>
                  <TextRun tokens={block.tokens} />
                </p>
              </aside>
            );
          }
          if (block.kind === "quiz-item") {
            return (
              <section
                key={block.id}
                style={{
                  ...style,
                  border: `1px solid ${RULE_STRONG}`,
                  borderRadius: "10px",
                  padding: "14px",
                  display: "grid",
                  gap: "10px",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.body.fontSizePx}px`,
                    lineHeight: `${INTERACTIVE_DOC_TYPE_SCALE.body.lineHeightPx}px`,
                  }}
                >
                  {block.prompt}
                </p>
                {block.choices.length ? (
                  <div role="group" aria-label={block.title || block.prompt} style={{ display: "grid", gap: "6px" }}>
                    {block.choices.map((choice) => (
                      <button
                        key={choice}
                        type="button"
                        onClick={() => editor.submitQuizAnswer(block.id, choice)}
                        style={{
                          minHeight: `${INTERACTIVE_DOC_GRID.controlMinHeightPx}px`,
                          border: `1px solid ${RULE_STRONG}`,
                          borderRadius: "8px",
                          background:
                            String(block.submitted) === choice ? SURFACE_ALT : SURFACE,
                          color: TEXT_PRIMARY,
                          textAlign: "left",
                          padding: "0 10px",
                          cursor: "pointer",
                        }}
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input
                    aria-label={block.title || block.prompt}
                    type={block.answerKind === "numeric" ? "number" : "text"}
                    onBlur={(event) =>
                      editor.submitQuizAnswer(block.id, event.target.value)
                    }
                    style={{
                      minHeight: `${INTERACTIVE_DOC_GRID.controlMinHeightPx}px`,
                      border: `1px solid ${RULE_STRONG}`,
                      borderRadius: "8px",
                      padding: "0 10px",
                    }}
                  />
                )}
                {block.answered ? (
                  <p
                    role="status"
                    style={{
                      margin: 0,
                      color: block.correct ? POSITIVE : NEGATIVE,
                      fontSize: "13px",
                    }}
                  >
                    {block.correct
                      ? tt("回答正确（第 {n} 次尝试）", { n: block.attempts })
                      : tt("回答错误（第 {n} 次尝试）", { n: block.attempts })}
                  </p>
                ) : null}
                {block.explanation ? (
                  <div>
                    <button
                      type="button"
                      onClick={() => editor.revealQuizExplanation(block.id)}
                      style={{
                        minHeight: `${INTERACTIVE_DOC_GRID.controlMinHeightPx}px`,
                        border: `1px solid ${RULE_STRONG}`,
                        borderRadius: "8px",
                        background: SURFACE,
                        color: ACCENT,
                        padding: "0 10px",
                        cursor: "pointer",
                      }}
                    >
                      {tt("查看解析")}
                    </button>
                    {block.explanationVisible ? (
                      <p style={{ margin: "8px 0 0", color: TEXT_SECONDARY, fontSize: "13px" }}>
                        {block.explanation}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </section>
            );
          }
          if (block.kind === "schedule") {
            return (
              <section
                key={block.id}
                style={{
                  ...style,
                  border: `1px solid ${RULE_STRONG}`,
                  borderRadius: "10px",
                  padding: "14px",
                  display: "grid",
                  gap: "10px",
                }}
              >
                <h3 style={{ margin: 0, fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.h3.fontSizePx}px` }}>
                  {block.title || tt("排程")}
                </h3>
                {block.controls.map((descriptor) => (
                  <InteractiveDocParameterField
                    key={descriptor.parameterId}
                    descriptor={descriptor}
                    disabled={editor.saving}
                    onChange={(value) =>
                      editor.setParameter(descriptor.parameterId, value)
                    }
                  />
                ))}
                <div role="group" aria-label={tt("本次评分")} style={{ display: "flex", gap: "6px" }}>
                  {[0, 1, 2, 3, 4, 5].map((quality) => (
                    <button
                      key={quality}
                      type="button"
                      onClick={() => editor.advanceSchedule(block.id, quality)}
                      style={{
                        minWidth: `${INTERACTIVE_DOC_GRID.controlMinHeightPx}px`,
                        minHeight: `${INTERACTIVE_DOC_GRID.controlMinHeightPx}px`,
                        border: `1px solid ${RULE_STRONG}`,
                        borderRadius: "8px",
                        background:
                          block.progress.lastQuality === quality ? SURFACE_ALT : SURFACE,
                        color: TEXT_PRIMARY,
                        cursor: "pointer",
                      }}
                    >
                      {quality}
                    </button>
                  ))}
                </div>
                <p style={{ margin: 0, color: TEXT_SECONDARY, fontSize: "12px" }}>
                  {tt(
                    "已推进 {step} 步 · 易度因子 {ef} · 重复 {repetition} 次 · 下次间隔 {value}",
                    {
                      step: block.progress.step,
                      ef: block.progress.easeFactor,
                      repetition: block.progress.repetition,
                      value: block.display || INTERACTIVE_DOC_VALUE_PLACEHOLDER,
                    },
                  )}
                </p>
              </section>
            );
          }
          return (
            <hr
              key={block.id}
              style={{
                ...style,
                border: "none",
                borderTop: `1px solid ${BORDER_DECORATIVE}`,
                margin: 0,
              }}
            />
          );
        })}

        {attribution?.entries?.length ? (
          <footer
            style={{
              gridColumn: `span ${INTERACTIVE_DOC_GRID.columns}`,
              borderTop: `1px solid ${BORDER_DECORATIVE}`,
              paddingTop: "12px",
            }}
          >
            <h3
              style={{
                margin: "0 0 6px",
                color: TEXT_SECONDARY,
                fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.caption.fontSizePx}px`,
              }}
            >
              {tt("来源与许可")}
            </h3>
            {attribution.entries.map((entry, index) => (
              <p
                key={`${entry.licenseCode}-${index}`}
                style={{
                  margin: 0,
                  color: TEXT_SECONDARY,
                  fontSize: `${INTERACTIVE_DOC_TYPE_SCALE.caption.fontSizePx}px`,
                  lineHeight: `${INTERACTIVE_DOC_TYPE_SCALE.caption.lineHeightPx}px`,
                }}
              >
                {`${entry.text} · ${entry.licenseCode} · `}
                <a href={entry.licenseUrl} rel="noreferrer noopener" style={{ color: ACCENT }}>
                  {entry.licenseUrl}
                </a>
              </p>
            ))}
          </footer>
        ) : null}
      </article>
    </div>
  );
}
