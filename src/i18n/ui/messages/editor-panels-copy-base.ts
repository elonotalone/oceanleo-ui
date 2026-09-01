// @oceanleo/ui — 编辑器内部面板的文案词典（17 语）。
//
// 这一册收的是**编辑器里天天要点的东西**：富文档上下文工具条与批注侧栏、
// 表格上下文工具条与查找替换、PDF 办公面板、图片创作面板、图表高级控件、
// 演讲者视图。它们和 `plugin-chrome-copy-*` 收的外壳文案不同——外壳是「进哪个模块」，
// 这一册是「进去之后每一次点击」。
//
// 为什么会同时缺 16 语：这一片是插件统一改造**之前**就写下的编辑器内部代码，
// `W29` 把批注侧栏挂上、`W16` 把放映挂上之后才第一次真的出现在屏幕上，
// 于是缺译文一直没人看见。`useUI()` 未命中会原样返回中文原文（见 ../useUI.ts）——
// 不崩、不报错，只是把中文印在外国用户脸上。
//
// 形状照 `plugin-chrome-copy-*`：语义名 → 中文原文放这一册，10 个西方语种在
// `-western`、6 个东方语种在 `-eastern`，入参类型
// `Record<Exclude<Locale, "zh">, EditorPanelsCopyMessages>` 把 16 语钉死：
// **少一个语种或少一条 key，`tsc --noEmit` 当场编不过**，不靠人记得补。
//
// ⚠️ 带 `{}` 插值的条目（`{n}` `{page}` `{time}` `{count}` …）必须把占位符原样带过去，
// 少一个就会把花括号印到屏幕上。`i18n-tt-key-coverage` 有一条用例专门验这个。

import { LOCALES, type Locale } from "../../config";

export const EDITOR_PANELS_COPY_SOURCE = {
  // ==========================================================================
  // 富文档 · 批注侧栏（RichDocCommentRail）
  // 「解决」「回复」「全部接受」这一片是 W29 把侧栏挂上之后才上屏的。
  // ==========================================================================
  anonymous: "匿名",
  anchorTextDeleted: "锚定文字已被删除",
  reply: "回复",
  reopenComment: "重开",
  resolveComment: "解决",
  replyBody: "回复内容",
  sendReply: "发送回复",
  selectTextToComment: "选中一段文字即可插入批注。",
  collapseResolved: "收起已解决（{n}）",
  expandResolved: "展开已解决（{n}）",
  pendingRevisions: "待处理修订",
  trackChangesOff: "修订模式已关闭",
  acceptAll: "全部接受",
  rejectAll: "全部拒绝",
  acceptRevision: "接受",
  noPendingRevisions: "没有待处理的修订。",

  // ==========================================================================
  // 富文档 · 查找替换回执（RichDocControls）
  // ==========================================================================
  replacedCount: "已替换 {n} 处，按一次撤销可以全部还原。",
  findNoMatch: "没有找到「{q}」。",
  findMatchCount: "找到 {n} 处。",
  replaceAllIsOneUndo: "全部替换是一步操作，撤销一次就全部还原。",
  findAndReplaceShortcut: "查找和替换（Ctrl/Cmd+F）",

  // ==========================================================================
  // 富文档 · 上下文工具条（RichDocContextToolbar）
  // 排版档位、多级编号、批注与修订、表格单元格。
  // ==========================================================================
  imageTextWrap: "环绕方式",
  lineSpacingAndIndent: "行距与缩进",
  lineSpacingMultiple: "{n} 倍",
  exactLineSpacing: "固定行距",
  // 排版单位「磅」= point (pt)，不是重量单位；它是 `固定行距`/`右缩进`/`段前`/`段后`
  // 四个数字输入框的后缀。
  pointsUnit: "磅",
  firstLineIndent: "首行缩进",
  hangingIndent: "悬挂缩进",
  decreaseIndent: "减少缩进",
  increaseIndent: "增加缩进",
  rightIndent: "右缩进",
  spaceBefore: "段前",
  spaceAfter: "段后",
  // 中文公文的硬约定（首行缩进 2 字符 + 1.5 倍行距）一键给全，
  // 所以译文要说清「这是中文/CJK 排版预设」，不是「把界面切成中文」。
  cjkTypesetting: "中文排版",
  resetTypesetting: "恢复默认排版",
  numberingFormat: "编号格式",
  multilevelNumbering: "多级编号",
  insertComment: "插入批注",
  commentsAndRevisions: "批注与修订",
  trackChangesMode: "修订模式",
  deleteTracked: "删除（留痕）",
  acceptAllRevisions: "全部接受修订",
  rejectAllRevisions: "全部拒绝修订",
  splitCell: "拆分单元格",
  repeatHeaderRow: "表头行重复",
  cellFill: "单元格底色",
  verticalAlign: "垂直对齐",
  // 这三条是**垂直**对齐的三档（顶端/居中/底端）。`居中` 是同一把 key 在
  // 水平与垂直两处共用，所以取通用的 Center 一档，不写成 Word 的 Middle。
  alignTop: "顶端",
  alignCenter: "居中",
  alignBottom: "底端",
  // 表格列宽输入框，后缀是 px —— 是**几何宽度**，不是「宽阔」。
  tableColumnWidth: "列宽",
};

export type EditorPanelsCopyName = keyof typeof EDITOR_PANELS_COPY_SOURCE;
export type EditorPanelsCopyMessages = Record<EditorPanelsCopyName, string>;

/** 本册覆盖的中文原文全集；判据与 `index.ts` 都从这里取，不另抄一份。 */
export const EDITOR_PANELS_COPY_KEYS: readonly string[] = Object.values(
  EDITOR_PANELS_COPY_SOURCE,
);

/** 语义名词典 → 「中文原文 → 译文」平表（`useUI()` 要的形状）。 */
export function editorPanelsDictionaryFrom(
  messages: EditorPanelsCopyMessages,
): Record<string, string> {
  return Object.fromEntries(
    (Object.keys(EDITOR_PANELS_COPY_SOURCE) as EditorPanelsCopyName[]).map((name) => [
      EDITOR_PANELS_COPY_SOURCE[name],
      messages[name],
    ]),
  );
}

/** 中文站：key 就是值，直接从原文表推，避免手抄一遍后与原文漂移。 */
export const EDITOR_PANELS_COPY_ZH: EditorPanelsCopyMessages = {
  ...EDITOR_PANELS_COPY_SOURCE,
};

export function assembleEditorPanelsCopy(
  translations: Record<Exclude<Locale, "zh">, EditorPanelsCopyMessages>,
): Record<Locale, Record<string, string>> {
  return Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      editorPanelsDictionaryFrom(
        locale === "zh" ? EDITOR_PANELS_COPY_ZH : translations[locale],
      ),
    ]),
  ) as Record<Locale, Record<string, string>>;
}
