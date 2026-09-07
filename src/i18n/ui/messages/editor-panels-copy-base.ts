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

  // ==========================================================================
  // 图表编辑器（chart-advanced-controls / ChartContextToolbar）
  // 系列画法与双 Y 轴、堆叠与面积填充、平均线／目标线／高亮区间三种标注，
  // 以及三个图表类型名与「不可发布」这个后缀。
  // `平均` 是画在标注线上的**标签**（average mark line 的文字），是名词不是动词；
  // `热力`/`箱线`/`K 线` 是图表类型名，按各语的统计学惯用名译，不逐字直译；
  // `不可发布` 出现在类型名后的括号里（`散点（不可发布）`）——它说的是
  // 这个系列类型不在可发布的图表规格里，不是「按钮不可用」。
  // ==========================================================================
  markLineAverageLabel: "平均",
  seriesHowToDraw: "这条系列怎么画",
  whichYAxisToDrawOn: "画在哪条 Y 轴",
  primaryAxisLeft: "主轴（左）",
  secondaryAxisRight: "副轴（右）",
  stackWithSameGroup: "与同组系列堆叠",
  fillBelowLine: "折线下方填充",
  marksAndThresholdLines: "标注与阈值线",
  averageLine: "平均线",
  targetLineValue: "目标线数值（留空不画）",
  highlightBandStart: "高亮区间起点（留空不画）",
  highlightBandEnd: "高亮区间终点",
  highlightBand: "高亮区间",
  chartTypeHeatmap: "热力",
  chartTypeBoxplot: "箱线",
  chartTypeCandlestick: "K 线",
  primaryYAxisLeft: "主 Y 轴（左）",
  notPublishable: "不可发布",

  // ==========================================================================
  // 上传进度与三条零散回执（progress-view / AdvancedWorkbenchStage / AgentChat / route-boundary）
  // 上传进度那一行是拼出来的（`4.2 MB / 18.6 MB · 已用 0:12 · 剩余约 0:35`），
  // 所以 `已用 {elapsed}` / `剩余约 {remaining}` 两条必须是能并排读的短片段，不要写成整句。
  // `用原图` 是压缩回执旁边的**撤销按钮**：点它就改用未压缩的原图上传，不是「查看原图」。
  // `实时流不可用，已回落到轮询刷新。` 说的是 SSE 断了改用轮询——用户要看懂的是
  // 「还在更新，只是慢一点」，不要译成「加载失败」。
  // ==========================================================================
  uploadElapsed: "已用 {elapsed}",
  uploadRemainingApprox: "剩余约 {remaining}",
  compressedBeforeAfter: "已压缩：{before} → {after}",
  useOriginalImages: "用原图",
  compressingImages: "正在压缩图片…",
  liveStreamFellBackToPolling: "实时流不可用，已回落到轮询刷新。",
  tryAgainLater: "请稍后重试。",

  // ==========================================================================
  // 补批 · 被 `W48` 的接线拉进零容忍集的两条（`粗体` / `替代文字`）
  // `W43` 第三棒开工时这两条还只在 oceanleo-ui 内部，落在有基线豁免的那一档；
  // `W48` 在 `website` 仓提了 `b5a006e`（网站编辑器选区检查器 16 条 label 接共享词典）之后，
  // `site-editor/editor-controls.ts` 也开始 `tt()` 它们 —— 于是它们进了
  // 「统一外壳 + 在场同级插件」那个**没有白名单**的集合，判据当场红。
  // 扫描面跨五个同级仓，同级仓是各自独立的 git 仓：**oceanleo-ui 一行没动，红也会长出来。**
  // `粗体` 是 font-weight 700 那一档的选项名（不是「加粗」这个动作）；
  // `替代文字` 是 `<img alt>` 的输入框标签，各语一律用无障碍领域的既有说法。
  // ==========================================================================
  boldWeight: "粗体",
  altText: "替代文字",

  // ==========================================================================
  // A-11 欠账 · 三处 ConfirmDialog 的 body（W05 R-2 已备好译文）
  // 这三处确认框原来只有标题，没说清「会发生什么、能不能撤销」。
  // D-2 能撤销，重点是「随时可以从应用市场加回来」；
  // D-3 不可撤销，同时要安抚「历史任务会不会一起没」这个真实担忧；
  // D-4 说的是改动只在这台设备上，换设备打不开。
  // 译文从 signals/W05-request.md 的三张表原样抽出（signals/W43-a11-extract.mjs），
  // 唯一例外：D-4 那张表只有 15 语、zh-TW 缺行，繁体那条由 W43 补。
  // ==========================================================================
  removeAppFromMyApps: "应用会从「我的应用」里消失，你随时可以从应用市场重新添加。",
  deleteModelGroupIrreversible: "组合里的模型搭配会被删除且无法恢复；已经跑过的任务不受影响。",
  leaveEditorLocalOnly: "改动留在这台设备的编辑器里，换台设备就打不开；回到编辑器可以再同步一次。",
  // ==========================================================================
  // 短 CJK 键人工复核（W43）
  // `tt("中")` 全仓调用点都是对齐（左/中/右），旧表 en.ts 写成 Medium
  // （计算器档位 低/中/高 的形容词）。本册 spread 在 en.ts 之后，这条压过它。
  // `左`/`右`/`行`/`列` 旧表根本没有，英文界面上一直露着汉字。
  // `高`/`宽` 已是 Height/Width 与 ja 高さ/幅，不改。
  // `旋转` 既当工具动词又当检查器名词，拆开要改调用点，本笔不动。
  // ==========================================================================
  alignLeft: "左",
  alignCenterShort: "中",
  alignRight: "右",
  tableRow: "行",
  tableColumn: "列",

  // ==========================================================================
  // 视频时间线 · 媒体探测失败（三种原因必须分开说，不许再把超时写成「无法解码」）
  // ==========================================================================
  videoSourceProbeTimeout:
    "视频源 15 秒内没有响应，可能是网络或服务太慢，请重试",
  videoSourceProbeError: "视频源加载失败（网络或地址不可达）",
  videoSourceProbeNoTrack: "视频源没有可用的视频轨或时长为 0",
  audioSourceProbeTimeout:
    "音频源 15 秒内没有响应，可能是网络或服务太慢，请重试",
  audioSourceProbeError: "音频源加载失败（网络或地址不可达）",
  audioSourceProbeNoTrack: "音频源没有可用的音轨或时长为 0",
  mediaProbeClipPrefix: "片段 {clipId}：{detail}",
  mediaProbeAppendSuffix: "{detail}，未加入时间线",

  // 换核波新长出的指令/审阅/快捷动作文案（W26）
  saveCopy: "保存副本",
  fullTextSearch: "全文搜索",
  secondaryYAxisRight: "副 Y 轴（右）",
  dualYAxis: "双 Y 轴",
  mergePdf: "合并 PDF",
  revertToPreviousVersion: "回滚到上一版",
  fillForm: "填写表单",
  flattenAfterFill: "填完压平",
  reviewChanges: "审阅改动",
  quickActions: "快捷动作",
  executeRedaction: "执行涂黑",
  rejectThis: "拒绝这条",
  acceptThis: "接受这条",
  extractPages: "提取页",
  insertBlankPage: "插入空白页",
  placeSignature: "放置签名",
  reviewStaleDocument: "文档已经变了，这条改动不能接受。",
  rotatePage: "旋转页",
  markRedactionArea: "标记涂黑区",
  noPendingReviews: "没有待审阅的改动。",
  moveAnnotation: "移动批注",
  movePage: "移动页",
  detectFormFields: "识别表单字段",
  selectAnnotation: "选中批注",

  // ==========================================================================
  // 表格 · Univer 舞台（GridUniverStage / grid-univer/stage-plan / facade-commands /
  // document-actions）。2026-09-07 core-swap:delete grid 之后表格只剩 Univer 一条路，
  // 命令表的 `label` 经 `tt(command.label)` 进浮条与检查器，状态栏与编辑栏文案同册。
  // `人民币`/`百分比` 是数字格式的**类型选项**；`小数位` 是位数；`行操作`/`列操作`/`排序与筛选`/`条件格式` 是检查器组名。
  // `工作簿` 是无标题时的默认名，也进保存标题；`编辑版` 是另存副本的后缀（音频/3D/PDF 共用）。
  // ==========================================================================
  gridRowInsertAbove: "上方插入行",
  gridRowInsertBelow: "下方插入行",
  gridDeleteSelectedRows: "删除所选行",
  gridColumnInsertLeft: "左侧插入列",
  gridColumnInsertRight: "右侧插入列",
  gridDeleteSelectedColumns: "删除所选列",
  gridSortAscending: "升序",
  gridSortDescending: "降序",
  gridHeaderRow: "首行为表头",
  gridFilterCurrentColumn: "筛选当前列",
  gridMergeSelectedCells: "合并所选单元格",
  gridSplitMergedCells: "拆分合并单元格",
  gridDataType: "数据类型",
  gridDecimals: "小数位",
  gridFormatPreview: "格式预览",
  gridCondition: "条件",
  gridComparisonValue: "比较值",
  gridConditionTextColor: "条件文字色",
  gridConditionBackground: "条件底色",
  gridConditionBold: "条件粗体",
  gridApplyToSelection: "应用到所选区域",
  gridClearSelectionRules: "清除所选区域规则",
  gridAgentSetCell: "写入单元格",
  gridAgentReadCell: "读取单元格",
  gridAgentSelectCell: "选中单元格",
  gridAgentInsertRow: "插入行",
  gridAgentInsertColumn: "插入列",
  gridAgentSortColumn: "按列排序",
  gridAddSheet: "新增工作表",
  gridCurrencyCny: "人民币",
  gridPercent: "百分比",
  gridNumberFormatGroup: "数字格式",
  gridSortFilterGroup: "排序与筛选",
  gridConditionalGroup: "条件格式",
  gridRowOpsGroup: "行操作",
  gridColumnOpsGroup: "列操作",
  gridWorkbook: "工作簿",
  gridLoading: "正在载入表格",
  gridLoadFailed: "表格载入失败。",
  gridExportXlsxFailed: "导出 XLSX 失败",
  gridExportFailed: "导出失败。",
  gridNoSheetToExport: "没有可导出的工作表。",
  gridKernelNotReady: "表格内核还没准备好。",
  gridNoLegacyToConvert: "找不到可以转换的旧表格。",
  gridNoSuchDownloadFormat: "这里没有 {ext} 这个下载格式。",
  gridDirectDownload: "直接下载 {fmt}",
  gridConvertToNew: "转换为新表格",
  editedCopySuffix: "编辑版",
  gridRecalculate: "重新计算",
  gridReloadSheet: "重新载入表格",
  gridSourceUnreadable: "没能读到这份表格的源文件。",
  gridSourceUnreadableDetail: "没能读到这份表格的源文件（{detail}）。",
  gridSourceWayOut: "点「重新载入表格」再试一次，或者关掉这份文档重新打开。",
  gridLegacyReadonlyNotice: "这份表格是用旧引擎存的，现在是只读打开的。点「转换为新表格」之后才会改动它。",
  gridRecalculated: "已重新计算全部公式。",
  gridMaterialNoUrl: "这个表格素材没有可用地址。",
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
