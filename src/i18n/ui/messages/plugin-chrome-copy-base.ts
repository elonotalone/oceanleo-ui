// @oceanleo/ui — 统一插件外壳（13 件插件共用的 chrome）与三个 extracted 插件的文案词典。
//
// 为什么单独一册：这批中文是「插件统一改造」一次性铺开的，分布在
// `shell/plugin-chrome/`、`shell/` 的工作台骨架，以及 design / website / video
// 三个同级仓的 extracted 插件里。它们缺译文的样子很特别——顶栏那排投影切换
// 「节点图 分镜 导演台 时间线 History」中英混排，就是因为相邻的键有译文、
// 这一条没有，`useUI()` 回退成中文原文（见 ../useUI.ts）。混排比整屏中文更难被发现，
// 所以这一册用 `assemblePluginChromeCopy` 的入参类型把 16 个语种钉死：
// 少一个语种或少一条 key，`tsc --noEmit` 当场编不过，不靠人记得补。
//
// 有一部分 key 不写在调用处，而是先声明进数据表、再由外壳统一过 `tt()`：
//   - `PluginChromeView.label` / `PluginChromeAction.label` / `busyLabel`
//     → `PluginChromeFrame` 的 `tt(view.label)`（声明侧在插件仓，渲染侧在这里）
//   - 设计画布左栏的 `tabs[].label` → `LeftSidebar` 的 `tt(tab.label)`
// 静态扫调用处看不见它们，所以一并收进这一册。

import { LOCALES, type Locale } from "../../config";

export const PLUGIN_CHROME_COPY_SOURCE = {
  // ---- 统一外壳骨架：顶栏、edit bar 行、左侧面板、保存徽标、主题开关 ----
  viewSwitcher: "视图切换",
  moduleNotRegistered: "该模块未注册",
  editBar: "编辑栏",
  editBarEmptyHint: "选中对象后在此编辑",
  proPage: "专业编辑",
  editBarDocumentEmptyHint: "在画面里选中元素后，可在此编辑",
  saveFailedClickRetry: "保存失败，点击重试",
  collapsePanel: "收起面板",
  revisionLabel: "版本 {label}",
  noPendingChanges: "无待保存改动",
  unsavedChanges: "有未保存改动",
  localOnly: "仅存本地",
  switchToDark: "切换到暗黑主题",
  switchToLight: "切换到纯白主题",

  // ---- 编辑栏停靠：可拖动的浮动编辑栏与它在库页的停靠位 ----
  expandEditBar: "展开编辑栏",
  expandEditBarHint: "展开编辑栏；按住可拖动",
  collapseEditBar: "收起编辑栏",
  collapseEditBarHint: "收起编辑栏；收起后仍可拖动",
  pinEditBar: "固定编辑栏到库",
  unpinEditBar: "取消固定编辑栏",
  editBarDock: "编辑栏停靠区",
  dragEditBarHere: "将编辑栏拖到这里固定",
  releaseToPin: "松开以固定编辑栏",

  // ---- 舞台缩放条 ----
  canvasView: "画布视图",
  zoomIn: "放大",
  zoomOut: "缩小",
  currentZoom: "当前缩放",
  fitCanvas: "适合画布",
  fullscreenStage: "编辑区域全屏",

  // ---- 工作区动作条与操作台导航 ----
  workspaceActions: "工作区操作",
  downloadAndExport: "下载与导出",
  addFromLocal: "从本地添加到画布",
  addFromLocalHint: "从本地添加到画布，也可以直接拖放文件",
  // X1（规范 v2）：上传住进素材库抽屉第一项；保存槽变成菜单，没有 save 动作时只列「立即保存」。
  uploadFromLocal: "从本地上传",
  saveNow: "立即保存",
  saveProblem: "保存遇到问题",
  backToLibrary: "返回库",
  actionFailedRetry: "操作失败，请重试",
  autosaving: "正在自动保存",
  autosaveProblem: "保存遇到问题，点击重试",
  retryAutosave: "点击重试自动保存",
  workspace: "工作区",
  appActions: "App 操作",
  backToConsole: "返回操作台",
  aiAssistantHint: "AI 助手：在左侧和 agent 对话，同时继续改右边",

  // ---- 内联工作台：工具菜单、离开确认、空舞台投放区、拖放上传 ----
  editTools: "编辑工具",
  noToolsInEditor: "当前编辑器没有可用工具",
  openNamedTool: "打开{label}工具",
  leaveWithUnsyncedEdits: "修改仍安全保留在当前编辑器，但尚未同步到云端。仍要离开吗？",
  dropFilesOrUpload: "把文件拖进来，或点上传",
  dropHereToAdd: "拖到这里，添加到画布",
  localFile: "本地文件",
  uploading: "正在上传…",
  uploadingWillConvert: "正在上传，稍后会转成能编辑的格式…",
  everyFormatWelcome: "文档、表格、演示、PDF、图片、视频、音频都可以，落进来就能开始编。",
  orBringWholeProject: "或者，把本地做好的整个项目（文件夹 / zip）搬上来",
  extensionMissing: "这个文件没有扩展名，认不出是什么格式。现在支持：{list}。",
  extensionUnsupported: "这里还打不开 {ext} 文件。现在支持：{list}。",
  projectWithoutId: "项目已经搬上来了，但没拿到它的编号，打不开编辑器。刷新一下再看。",
  uploadFailedRetry: "上传失败，请重试",
  fileAddedToCanvas: "文件已添加到画布",
  assetUnreadable: "无法读取这个素材，请从素材库重新拖入",
  uploadingToCanvas: "正在上传并添加到画布…",
  addingAsset: "正在添加素材…",
  assetAddedToCanvas: "素材已添加到画布",
  assetAddFailed: "素材添加失败",

  // ---- 字体选择器 ----
  searchFonts: "搜索字体",
  noMatchingFont: "没有找到匹配字体",
  fontAppliesImmediately: "选择字体后立即应用到当前文字。",

  // ---- 嵌入编辑器桥：跨源握手、超时、草稿与项目回执 ----
  dismissNotice: "关闭提示",
  selectionChanged: "选择已变化，请重新选择后再编辑。",
  reloadEditor: "重新加载编辑器",
  editorOriginUntrusted: "编辑器地址不受信任",
  trustedOriginOnly: "只允许连接受信任的 OceanLeo 编辑器地址。",
  editorConnectTimeout: "编辑器连接超时",
  editorNotReadyInTime: "专业编辑器没有在预期时间内就绪。请在当前画布重试。",
  editorError: "编辑器发生错误",
  editorEditFailed: "编辑器未能完成这项修改",
  editorDraftRestoreFailed: "编辑器草稿恢复失败",
  editorDraftSaveFailed: "编辑器草稿暂时无法保存",
  newRevisionSaved: "新版本已保存到我的库",
  projectActionFailed: "项目操作失败",
  projectStateUpdated: "项目状态已更新，请重试",

  // ---- extracted 插件①：设计画布（design 仓）上下文条与底栏 ----
  selectedElements: "已选 {count} 个元素",
  selectedKind: "已选 {kind}",
  artboard: "画板",
  backgroundCrop: "背景裁剪",
  fitWindow: "适应窗口",
  openPsd: "打开 PSD",
  opsSummary: "模板 / 素材 / 文字 / 图片 / 洗白 / 背景 / AI",
  selectToolEnabled: "选择工具已启用",

  // 设计画布左栏：背景 / 图片 / 素材三个面板的分类标签
  bgTravel: "文旅",
  bgTexture: "纹理",
  bgFood: "餐饮",
  imgRecommended: "为你推荐",
  imgPeople: "人物形象",
  imgBusiness: "职场商务",
  imgBackgroundTexture: "背景纹理",
  imgNature: "自然风光",
  imgFestive: "节日喜庆",
  shapeTriangle: "三角",
  ribbonBanner: "丝带横幅",
  shapeCircle: "圆",
  shapePolygon: "多边形",
  speechBubble: "对话泡泡",
  shapeStar: "星形",
  shapeRectangle: "矩形",
  lines: "线条",
  lineFrame: "线条边框",
  decorations: "装饰元素",

  // 设计画布左栏：PSD「洗白」面板（把模板里的图整批换成可商用图，不调模型）
  swappableSlots: "{n} 个可换槽位",
  layerCount: "{n} 个图层",
  oneClickWash: "一键洗白（不消耗 token）",
  finishedWorkHint: "成品走上方「文件与操作」的自动保存，以及底部「导出图片」。",
  psdIntro: "打开 PSD 后整页进画布。换图、一键洗白都是本地确定步骤，不消耗 token。上限 {limit}。",
  searchStockImages: "搜索可商用图片素材",
  fullPagePreview: "整页预览",
  fullPagePreviewOnCanvas: "整页预览在右侧画布",
  replaceFromComputer: "本地上传替换",
  slotList: "槽位清单",
  parsingPsd: "正在解析 PSD…",
  restoreSlot: "还原此槽",

  // 设计画布左栏：工具页签与插入动作（`tt(tab.label)`，声明在 LeftPanel/index.tsx）
  comboPromo: "促销组合",
  animation: "动画",
  animationPlayback: "动画播放控制",
  circle: "圆形",
  insertEditableTable: "插入可编辑表格",
  insertSignature: "插入签名",
  insertSticker: "插入贴纸 {emoji}",
  text: "文字",
  wash: "洗白",
  addAndSearch: "添加搜索",
  brush: "画笔",
  straightLine: "直线",
  signature: "签名",
  signatureText: "签名文字",
  freeDraw: "自由绘制",
  backToSelectTool: "返回选择工具",
  enterFreeDraw: "进入自由绘制",
  select: "选择",

  // ---- extracted 插件②：网站编辑（website 仓）顶栏 ----
  explorer: "资源管理器",
  reloadSourceTree: "重新读取源码树",
  // 顶栏三个视图里唯一缺译文的那一个（`W28` 报，`W37` 补）。相邻的「预览」「仪表盘」
  // 早就 16 语齐全，只有它回退成中文原文 ⇒ 外国用户看到的是「Preview 源码 Dashboard」。
  // 声明侧在 website 仓 `gallery-editor/src/website-views.ts`，渲染侧是
  // `PluginChromeFrame` 的 `tt(view.label)`，与本册开头列的第一种情形同形。
  websiteSourceView: "源码",
  // W05（2026-09-06）：预览视口三档，声明侧在 website 仓 `website-project-manifest.ts`。
  websiteViewportPhone: "手机",
  websiteViewportTablet: "平板",
  websiteViewportDesktop: "桌面",
  // X5（2026-09-06）：站编辑器零自画 chrome 后仍留在 iframe 内的文案 —— manifest 的
  // 保存槽动作（套用/放弃草稿及其 busy 态）、数据库/文件存储两个视图、独立打开时的极简栏
  // （仅能改源码 / 打开网站 / 预览路由），以及死预览会话的「预览已停止」卡
  // （`preview-liveness.ts`）。声明侧都在 website 仓 `components/site-editor/`。
  websiteCodeEditsOnly: "仅能改源码",
  websiteOpenSite: "打开网站",
  websitePreviewRoute: "预览路由",
  websiteApplyDraft: "套用草稿",
  websiteDiscardDraft: "放弃草稿",
  websiteApplyingDraft: "正在套用…",
  websiteDiscardingDraft: "正在放弃…",
  websiteDatabaseView: "数据库",
  websiteStorageView: "文件存储",
  websitePreviewStopped: "预览已停止",
  websiteRestartPreview: "重新启动预览",
  websitePreviewStoppedBody: "这个沙箱预览会话已经结束，页面里的内容不再可用。重新启动后会从当前源码重新生成预览。",
  websitePreviewExpiredBody: "这条历史任务的预览已过期，重新生成即可。",
  // U5（2026-09-07）：右侧面板拆进编辑栏后新增的三条 —— 文档级选区的「页面外观」轴、
  // 区块选区的「插入区块」动作（`edit-bar-capabilities.ts`），以及源码工程下专业编辑页签
  // 的不可用原因（manifest `pro.unavailableReason`，`website-project-manifest.ts`）。
  websiteInsertBlock: "插入区块",
  websitePageAppearance: "页面外观",
  websiteProUnavailableSourceProject:
    "此网站是源码工程，专业编辑用于三轴模板站；改源码请用「源码」页",
} as const;

export type PluginChromeCopyName = keyof typeof PLUGIN_CHROME_COPY_SOURCE;
export type PluginChromeCopyMessages = Record<PluginChromeCopyName, string>;

/** 本册覆盖的中文原文全集；测试与 `index.ts` 都从这里取，不另抄一份。 */
export const PLUGIN_CHROME_COPY_KEYS: readonly string[] = Object.values(
  PLUGIN_CHROME_COPY_SOURCE,
);

/** 语义名词典 → 「中文原文 → 译文」平表（`useUI()` 要的形状）。 */
export function pluginChromeDictionaryFrom(
  messages: PluginChromeCopyMessages,
): Record<string, string> {
  return Object.fromEntries(
    (Object.keys(PLUGIN_CHROME_COPY_SOURCE) as PluginChromeCopyName[]).map((name) => [
      PLUGIN_CHROME_COPY_SOURCE[name],
      messages[name],
    ]),
  );
}

/** 中文站：key 就是值，直接从原文表推，避免手抄一遍后与原文漂移。 */
export const PLUGIN_CHROME_COPY_ZH: PluginChromeCopyMessages = {
  ...PLUGIN_CHROME_COPY_SOURCE,
};

export function assemblePluginChromeCopy(
  translations: Record<Exclude<Locale, "zh">, PluginChromeCopyMessages>,
): Record<Locale, Record<string, string>> {
  return Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      pluginChromeDictionaryFrom(
        locale === "zh" ? PLUGIN_CHROME_COPY_ZH : translations[locale],
      ),
    ]),
  ) as Record<Locale, Record<string, string>>;
}
