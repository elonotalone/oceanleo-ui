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

  // ==========================================================================
  // 表格 · 数字格式 / 条件格式 / 数据验证（GridContextToolbar）
  // 表格 · 查找替换与行列尺寸（GridStage、use-grid-editor）
  // `上限`/`下限或值` 是数据验证的数值边界，不是「上面/下面」；
  // `列宽`/`行高` 是几何尺寸；`已写入` 后面直接跟区域地址（「（已写入 A1:C10）」）。
  // ==========================================================================
  numberFormatPreset: "格式预设",
  numberFormatPattern: "格式串",
  sheetRules: "本表规则",
  newRule: "新建规则",
  ruleDescription: "规则说明",
  validationKind: "验证类型",
  validationList: "列表（下拉）",
  validationWholeNumber: "整数",
  validationDecimal: "小数",
  validationTextLength: "文本长度",
  validationCustomFormula: "自定义公式",
  dataValidation: "数据验证",
  comparison: "比较",
  between: "介于",
  notBetween: "不介于",
  greaterOrEqual: "大于等于",
  lessOrEqual: "小于等于",
  validationListSource: "候选项或区域引用",
  validationLowerBound: "下限或值",
  validationUpperBound: "上限",
  onInvalid: "违规时",
  warnStillAllow: "警告（仍可录入）",
  blockEntry: "阻止录入",
  circleInvalidData: "圈出所选区域的无效数据",
  validationCheckResult: "检查结果",
  validationAllPass: "所选区域全部符合",
  findAndReplace: "查找和替换",
  findQueryLabel: "查找内容",
  findNoResult: "无结果",
  findPrevMatch: "上一个匹配",
  findNextMatch: "下一个匹配",
  findScope: "查找范围",
  findInValues: "在值里找",
  findInFormulas: "在公式里找",
  matchCase: "区分大小写",
  matchWholeWord: "全字匹配",
  closeFind: "关闭查找",
  resizeColumn: "调整列宽",
  resizeColumnHint: "拖动改列宽，双击按内容自适应",
  resizeRow: "调整行高",
  resizeRowHint: "拖动改行高",
  fillHandle: "填充柄",
  fillHandleHint: "拖动填充，双击沿相邻列向下填满",
  pasteWrittenTo: "已写入",

  // ==========================================================================
  // 图片创作面板（FabricImageCreationPanels）
  // 形状/箭头工具、重打光方向、外扩比例、背景色预设（证件照那几档）、
  // 处理前后对比、以及「补充说明」这一组提示语。
  // `白底`/`浅灰`/`证件蓝`/`证件红`/`绿幕` 是**背景色**预设，不是单纯的颜色名。
  // ==========================================================================
  shapeEllipse: "椭圆",
  shapeHeart: "心形",
  shapeCurve: "曲线",
  shapeArrow: "单向箭头",
  shapeElbowArrow: "折线箭头",
  relightFront: "正面光",
  relightLeft: "左侧光",
  relightRight: "右侧光",
  relightTop: "顶光",
  relightBack: "逆光",
  outpaintExpand25: "四周各扩 25%",
  outpaintExpand50: "四周各扩 50%",
  bgWhite: "白底",
  bgLightGray: "浅灰",
  bgIdBlue: "证件蓝",
  bgIdRed: "证件红",
  bgGreenScreen: "绿幕",
  previewBefore: "处理前",
  previewAfter: "处理后",
  applyAddsNewLayer: "确认之后会加成新的一层，原来的画面一个像素都不动。",
  applyAsNewLayer: "应用为新图层",
  changeBackgroundNext: "接着换个背景",
  replaceWithBackgroundImage: "换成背景图片",
  extraNotesOptional: "补充说明（选填）",
  extraNotesHint: "想让 AI 特别注意什么，就写在这里；留空也能跑。",
  extraNotesPlaceholder: "例如：保留衣服上的纹理",

  // ==========================================================================
  // 演讲者视图 · 放映（DeckPresenterView）
  // `W16` 把放映挂上之后这一片才第一次上屏：全屏失败的三条回执、跳页提示、
  // 计时器、画笔与激光笔、排练用时表、以及三个入口按钮的 aria-label。
  // `用时`/`占比` 是排练表的**列头**（时长 / 占总时长的百分比），不是动词。
  // ==========================================================================
  fullscreenApiMissingExit: "当前浏览器不支持全屏 API，请按 F11 退出全屏。",
  fullscreenApiMissingEnter: "当前浏览器不支持全屏 API，可以按 F11 手动全屏。",
  fullscreenRequestDenied: "浏览器拒绝了全屏请求，可以按 F11 手动全屏。",
  jumpToSlidePrompt: "跳至第 {page} 页 · Enter 确认，Esc 取消",
  pauseTimer: "暂停计时",
  startTimer: "开始计时",
  resetTimer: "重置计时",
  collapsePen: "收起画笔",
  collapseLaser: "收起激光笔",
  laserPointer: "激光笔",
  eraseInk: "擦除笔迹",
  endPresenting: "结束放映",
  thisSlideElapsed: "本页 {time}",
  decreaseNotesFontSize: "缩小备注字号",
  increaseNotesFontSize: "放大备注字号",
  noNotesOnThisSlide: "这一页没有备注。",
  alreadyLastSlide: "已经是最后一页。",
  rehearsalTiming: "排练用时",
  viewPerSlideTiming: "查看每页用时",
  writeBackToNotes: "写回备注",
  rehearsalElapsedColumn: "用时",
  rehearsalShareColumn: "占比",
  startPresenting: "放映",
  presenterView: "演讲者视图",
  presentSingleWindowSplit: "放映（单窗口分屏）",

  // ==========================================================================
  // PDF 办公面板（PdfOfficePanel / use-pdf-office / PdfContextToolbar）
  // 表单填写与扁平化定稿、手写签名画板、图像签章与骑缝章、涂黑。
  // `涂黑` 是真的把底层文字删掉的 redaction，不是盖一个黑框 —— 译文必须把
  // 「永久」「不可撤销」带出来，这是本册里后果最重的一条。
  // `骑缝章` 是跨页盖章的中式公文做法：越南语有现成的 `dấu giáp lai`、
  // 日文是 `契印`、韩文是 `간인`，其余语种按「跨页印章」意译，不留拼音。
  // `签章` 一律不是 PKI 数字签名（`PDF 签名字段` 那条明确写了本编辑器不做 PKI），
  // 所以各语种都用「印章／戳记」词族，不用 signature/firma digitale 那一族。
  // ==========================================================================
  signaturePad: "手写签名画板",
  saveAsStampPreset: "保存为常用图像签章",
  clearSignaturePad: "清空画板",
  formFilling: "表单填写",
  pdfSignatureFieldReadOnly: "PDF 签名字段（只读，本编辑器不做 PKI 签名）",
  flattenOnSave: "保存时扁平化定稿（字段将不可再编辑）",
  fillAndSaveToPdf: "填写并保存到 PDF",
  imageStamp: "图像签章",
  stampName: "签章名称",
  uploadStampImage: "上传 PNG/JPEG 图像签章",
  addSeamStamp: "添加骑缝图像签章（跨页）",
  redact: "涂黑",
  redactIsPermanent: "涂黑会永久删除区域内的底层文字，不是仅盖黑框。应用后无法撤销。",
  markingRedactionAreas: "正在标记涂黑区域（在页面上拖画）",
  markRedactionAreas: "标记涂黑区域",
  redactionAreaIndex: "区域 {number}",
  applyRedaction: "应用涂黑（不可撤销）",
  fixFormErrorsFirst: "请先修正表单校验错误",
  formFilledAndFlattened: "表单已填写并扁平化为定稿",
  formFilledFieldsEditable: "表单已填写，字段仍可编辑",
  stampPresetSaved: "已保存常用图像签章",
  selectStampToPlaceFirst: "请先选择要放置的图像签章",
  stampPlacedNotPki: "已放置图像签章（非 PKI 数字签名）",
  redactionMarkedStillRemovable: "已标记涂黑区域，应用前仍可删除",
  markRedactionAreaFirst: "请先标记要涂黑的区域",
  redactionApplied: "涂黑已应用：移除 {text} 处文字、{image} 处图像",
  selectSeamStampImageFirst: "请先选择骑缝章图像",
  seamStampNeedsTwoPages: "骑缝章至少需要两页",
  seamStampAdded: "已添加骑缝图像签章：印章已切成 {count} 片，每页一片",
  dragOnPageToPlace: "在页面上拖画以放置「{label}」",
  selectStampThenDragArea: "请选择图像签章后在页面上拖画区域",
  officeTools: "办公工具",
  pdfOfficeTools: "PDF 办公工具",
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
