"use client";

import { useUI } from "../../i18n/ui/useUI";
import { CHROME, PanelSection } from "../editor-chrome";
import { DECK_THEMES } from "./deck-schema";
import type { DeckEditorState } from "./use-deck-editor";

// 幻灯片「设计」overlay 侧栏内容：画幅 / 主题 / 图层。创建按钮（加文字/图片/
// 形状）与撤销重做已上移到统一顶栏，这里只放需要面板承载的复杂选择项。

export function DeckControls({
  editor,
  accent = "#4f46e5",
}: {
  editor: DeckEditorState;
  accent?: string;
}) {
  const tt = useUI();
  const slide = editor.activeSlide;
  return (
    <div className="space-y-1">
      <PanelSection title={tt("画幅")}>
        <div className="grid grid-cols-2 gap-1.5">
          {(["16:9", "4:3"] as const).map((aspect) => (
            <button
              key={aspect}
              type="button"
              onClick={() => editor.setAspect(aspect)}
              className={`rounded-lg border px-2 py-2 text-[11px] transition ${CHROME.hover}`}
              style={
                editor.deck.aspect === aspect
                  ? { borderColor: accent, color: accent, background: `${accent}12` }
                  : { borderColor: "var(--border,#e7e5e4)", color: "var(--fg-2,#57534e)" }
              }
            >
              {aspect}
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title={tt("主题")}>
        <div className="grid grid-cols-2 gap-1.5">
          {DECK_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => editor.setTheme(theme.id)}
              className="flex items-center gap-2 rounded-lg border px-2 py-2 text-left text-[11px] transition"
              style={
                editor.deck.theme === theme.id
                  ? { borderColor: theme.accent, color: theme.text, background: theme.background }
                  : { borderColor: "var(--border,#e7e5e4)", color: "var(--fg-2,#57534e)" }
              }
            >
              <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: theme.accent }} />
              <span className="min-w-0 truncate">{tt(theme.label)}</span>
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title={tt("图层")} defaultOpen={slide.elements.length > 0}>
        {slide.elements.length > 0 ? (
          <div className="space-y-1">
            {[...slide.elements]
              .sort((left, right) => right.order - left.order)
              .map((element) => (
                <button
                  key={element.id}
                  type="button"
                  onClick={() => editor.selectElement(element.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition ${CHROME.hover}`}
                  style={
                    element.id === editor.selectedElementId
                      ? { color: accent, background: `${accent}12` }
                      : { color: "var(--fg-2,#57534e)" }
                  }
                >
                  <span className="w-9 shrink-0 text-[8px] uppercase text-[var(--muted,#78716c)]">
                    {element.type}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {element.text || element.alt || element.label || tt("未命名元素")}
                  </span>
                </button>
              ))}
          </div>
        ) : (
          <p className="px-1 text-[11px] leading-relaxed text-[var(--muted,#78716c)]">
            {tt("用顶栏“加文字/图片/形状”创建元素，然后点击画布上的元素调整属性。")}
          </p>
        )}
      </PanelSection>
    </div>
  );
}
