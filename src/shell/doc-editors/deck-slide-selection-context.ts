import type { UITranslate } from "../../i18n/ui/useUI";
import type { SelectionContext } from "../selection-context";
import type { DeckEditorState } from "./use-deck-editor";

export function deckSlideSelectionContext(
  editor: DeckEditorState,
  tt: UITranslate,
): SelectionContext {
  const slide = editor.activeSlide;
  const context: SelectionContext = {
    version: 1,
    kind: "slide",
    id: `slide:${slide.id}`,
    label: tt("第 {page} 页", { page: editor.activeIndex + 1 }),
    controls: [
      {
        id: "background",
        kind: "color",
        label: tt("页面背景"),
        icon: "background",
        value: slide.background || "#ffffff",
      },
      {
        id: "transition",
        kind: "select",
        // 「动画」图标归规范项 animation（对象组）；页面过渡是特有控件，只显示文字。
        label: tt("过渡"),
        value: slide.transition?.type || "none",
        options: [
          { value: "none", label: tt("无") },
          { value: "fade", label: tt("淡入") },
          { value: "push-left", label: tt("向左推进") },
          { value: "push-right", label: tt("向右推进") },
          { value: "wipe", label: tt("擦除") },
          { value: "zoom", label: tt("缩放") },
        ],
      },
      ...(slide.transition
        ? [
            {
              id: "transition-duration",
              kind: "range" as const,
              label: tt("过渡时长"),
              value: slide.transition.durationMs,
              min: 100,
              max: 3_000,
              step: 50,
              slot: "inspector" as const,
              inspectorGroup: "deck-slide-transition",
              inspectorLabel: tt("页面过渡"),
              inspectorIcon: "animate" as const,
            },
          ]
        : []),
      {
        id: "master",
        kind: "select",
        label: tt("母版"),
        value: editor.activeMaster.id,
        options: editor.deck.masters.map((master) => ({
          value: master.id,
          label: master.name,
        })),
        slot: "inspector",
        inspectorGroup: "deck-master",
        inspectorLabel: tt("母版与版式"),
        inspectorIcon: "templates",
      },
      {
        id: "master-name",
        kind: "text",
        label: tt("母版名称"),
        value: editor.activeMaster.name,
        slot: "inspector",
        inspectorGroup: "deck-master",
        inspectorLabel: tt("母版与版式"),
        inspectorIcon: "templates",
      },
      {
        id: "master-background",
        kind: "color",
        label: tt("母版背景"),
        value: editor.activeMaster.background,
        slot: "inspector",
        inspectorGroup: "deck-master",
        inspectorLabel: tt("母版与版式"),
        inspectorIcon: "background",
      },
      {
        id: "master-text-color",
        kind: "color",
        label: tt("母版文字色"),
        value: editor.activeMaster.textColor,
        slot: "inspector",
        inspectorGroup: "deck-master",
        inspectorLabel: tt("母版与版式"),
        inspectorIcon: "text",
      },
      {
        id: "master-accent-color",
        kind: "color",
        label: tt("母版强调色"),
        value: editor.activeMaster.accentColor,
        slot: "inspector",
        inspectorGroup: "deck-master",
        inspectorLabel: tt("母版与版式"),
        inspectorIcon: "background",
      },
      {
        id: "master-font-family",
        kind: "text",
        label: tt("母版字体"),
        value: editor.activeMaster.fontFamily,
        slot: "inspector",
        inspectorGroup: "deck-master",
        inspectorLabel: tt("母版与版式"),
        inspectorIcon: "font",
      },
      {
        id: "master-duplicate",
        kind: "action",
        label: tt("复制为新母版"),
        slot: "inspector",
        inspectorGroup: "deck-master",
        inspectorLabel: tt("母版与版式"),
        inspectorIcon: "templates",
      },
      {
        id: "master-delete",
        kind: "action",
        label: tt("删除当前母版"),
        danger: true,
        disabled: editor.deck.masters.length <= 1,
        slot: "inspector",
        inspectorGroup: "deck-master",
        inspectorLabel: tt("母版与版式"),
        inspectorIcon: "templates",
      },
      // 「页面内容」（slide.title / body）不再上栏：有对象的页面上改它画面不变（死按钮），
      // 旧式页面本来就在画布上原地编辑标题和正文。
      {
        id: "notes",
        kind: "text",
        label: tt("演讲者备注"),
        value: slide.notes,
        slot: "inspector",
        inspectorGroup: "deck-slide-notes",
        inspectorLabel: tt("演讲者备注"),
        // 「便签」抽屉用 note 字形；备注暂用 text，专用图标见 signals/W07-to-W03.md。
        inspectorIcon: "text",
      },
      {
        id: "duplicate-slide",
        kind: "action",
        label: tt("复制页面"),
        placement: "more",
      },
      {
        id: "delete-slide",
        kind: "action",
        label: tt("删除页面"),
        placement: "more",
        danger: true,
        disabled: editor.deck.slides.length <= 1,
      },
    ],
  };
  // 做不到的（只剩一页、只剩一个母版）不出，不放灰按钮（10-23 D9）。
  return {
    ...context,
    controls: context.controls.filter((control) => !control.disabled),
  };
}
