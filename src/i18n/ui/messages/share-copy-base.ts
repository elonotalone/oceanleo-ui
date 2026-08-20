// @oceanleo/ui — 选段分享 / 长图 / 文档导出 / 回放页 的文案词典（key = 中文原文）。
//
// 为什么单独一份：这批文案里有相当一部分**印在用户对外分享物上**
// （长图卡片的页眉、页脚标语、「完整表格见原对话」、回放页的标题与状态），
// 缺译文不是内部体验问题，是英文用户分享出去的图上印着中文。
//
// 少数 key 不是在调用处写成 `tt("…")`，而是先当中文常量存下来、由调用方过 `tt()`：
//   - `shell/share/share-client.ts` 的 HTTP 失败文案 → `useShareMode` 里 `tt(error.message)`
//   - `shell/share/share-image.ts` / `ShareCard.tsx` 的 throw → 同上
//   - `shell/replay/replay-model.ts` 的 `REPLAY_TOOL_LABELS` → `replayToolLabel(tool, tt)`
// 它们同样是用户能看到的字，所以一并收进这份词典。

import { LOCALES, type Locale } from "../../config";

export const SHARE_COPY_SOURCE = {
  // 选段操作条与勾选框
  checkToShare: "勾选要分享的消息",
  selectedCount: "已选 {count} 条",
  deselectAll: "取消全选",
  copyText: "复制文本",
  generateLongImage: "生成长图",
  selectThisMessage: "选择这条消息",

  // 分享动作的提示
  selectFirst: "先勾选要分享的消息。",
  copiedMessages: "已复制 {count} 条消息。",
  copyTextFailed: "复制失败，请手动选中文本复制。",
  linkCopied: "链接已复制。",
  copyLinkFailed: "复制失败，请手动复制链接。",
  longImageReady: "长图已生成",
  longImageReadyCount: "长图已生成 · 共 {count} 张",
  documentDownloading: "文档已开始下载。",
  shareLinkFailed: "分享链接创建失败，请稍后再试。",
  longImageFailed: "长图生成失败。",
  documentFailed: "文档生成失败。",

  // 分享链接与长图的失败原因
  shareOffline: "网络不通，没能创建分享链接。",
  shareNeedsLogin: "请先登录 OceanLeo 账号，再创建分享链接。",
  shareNotYours: "这段对话不是你的，不能分享。",
  shareLinkComingSoon: "分享链接功能还在上线中，暂时只能复制文本或导出长图。",
  shareTooOften: "分享得太频繁了，缓一分钟再试。",
  shareServiceDown: "分享服务暂时不可用，请过一会儿再试。",
  conversationNotSaved: "这段对话还没保存，稍后再分享。",
  shareNoLink: "分享服务没有返回可用的链接。",
  nothingToRender: "没有可以生成长图的内容。",
  browserOnly: "长图只能在浏览器里生成。",
  noCanvas: "这台设备不支持画布，长图生成不了。",
  longImageEmpty: "长图没能画出来，请稍后重试。",

  // 印在长图卡片与 .docx 上的字（版式受限，见 share-layout.ts 的 slice(0, 2/3)）
  cardTitle: "与 OceanLeo 的对话",
  cardTagline: "在 OceanLeo 上直接出图、写文档、做网站和小工具。",
  tableTruncated: "完整表格见原对话",
  artifactGenerated: "已生成「{label}」",
  longImagePreview: "长图预览",
  longImageNth: "长图第 {index} 张",

  // 分享 / 回放页
  replayTitle: "agent 回放",
  stepCount: "共 {n} 步",
  sharedMessages: "分享了 {n} 条消息",
  openingReplay: "正在打开回放…",
  openingShare: "正在打开分享…",
  replayGone: "这个回放打不开了，可能已被分享者关闭。",
  shareGone: "这个分享打不开了，可能已被分享者关闭。",
  playing: "正在播放",
  playbackDone: "播放完毕",
  inputArgs: "入参",
  previewTruncated: "预览已截断，完整内容见原对话",

  // 回放行卡片的步骤类型
  stepError: "出错",
  stepAwaitingConfirm: "等待确认",
  stepAnswer: "回答",
  stepArtifact: "产出",
  stepRun: "执行",
  memberAnswer: "成员回答",

  // 回放行卡片的工具名（REPLAY_TOOL_LABELS 里尚无译文的那些）
  toolGenMusic: "生成音乐",
  toolTts: "合成语音",
  toolReadUrl: "读网页",
  toolReadImage: "读图",
  toolSearchFiles: "找文件",
  toolSearchMaterials: "找素材",
  toolOpenWorkspace: "打开工作台",
  toolResearchFanout: "并行调研",
  toolRunPython: "运行代码",
  toolMakeMaterial: "制作文件",
  toolUploadArtifact: "保存产出",
  toolConvertFile: "转换格式",
  toolSiteCreate: "创建站点",
  toolSiteWrite: "写站点文件",
  toolSiteRead: "读站点文件",
  toolSiteStatus: "查站点状态",
  toolSitePublish: "发布站点",
  toolSupabaseProvision: "开通数据库",
  toolBrowse: "浏览网页",
} as const;

export type ShareCopyName = keyof typeof SHARE_COPY_SOURCE;
export type ShareCopyMessages = Record<ShareCopyName, string>;

/** 本词典覆盖的中文原文全集；测试与 `index.ts` 都从这里取，不另抄一份。 */
export const SHARE_COPY_KEYS: readonly string[] = Object.values(SHARE_COPY_SOURCE);

/** 语义名词典 → 「中文原文 → 译文」平表（`useUI()` 要的形状）。 */
export function shareCopyDictionaryFrom(
  messages: ShareCopyMessages,
): Record<string, string> {
  return Object.fromEntries(
    (Object.keys(SHARE_COPY_SOURCE) as ShareCopyName[]).map((name) => [
      SHARE_COPY_SOURCE[name],
      messages[name],
    ]),
  );
}

/** 中文站：key 就是值，直接从原文表推，避免手抄 71 行后与原文漂移。 */
export const SHARE_COPY_ZH: ShareCopyMessages = { ...SHARE_COPY_SOURCE };

export function assembleShareCopy(
  translations: Record<Exclude<Locale, "zh">, ShareCopyMessages>,
): Record<Locale, Record<string, string>> {
  return Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      shareCopyDictionaryFrom(
        locale === "zh" ? SHARE_COPY_ZH : translations[locale],
      ),
    ]),
  ) as Record<Locale, Record<string, string>>;
}
