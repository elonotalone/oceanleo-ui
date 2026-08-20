// @oceanleo/ui — 对话选段与导出（Copy Text / Copy Link / Generate Image / Generate Document）
export {
  isShareSelectable,
  shareSelectableMessages,
  shareSelectableIds,
  toggleShareSelection,
  toggleSelectAll,
  isAllShareSelected,
  selectedShareMessages,
  pruneShareSelection,
  type ShareSelectableMessage,
} from "./share-selection";
export {
  shareMessageToText,
  shareMessagesToText,
  type ShareTextLabels,
} from "./share-text";
export { writeClipboardText } from "./share-clipboard";
export {
  SHARE_TASK_PATH,
  SHARE_PATH_PREFIX,
  ShareLinkError,
  createShareLink,
  isValidShareId,
  shareFailureMessage,
  shareUrlFor,
  type ShareLink,
} from "./share-client";
export {
  markdownToShareBlocks,
  inlinesToPlainText,
  type ShareBlock,
  type ShareInline,
  type ShareListItem,
} from "./share-blocks";
export {
  SHARE_CARD_WIDTH,
  SHARE_MAX_PAGE_HEIGHT,
  SHARE_MIN_TABLE_FONT,
  layoutShareCard,
  planTableColumns,
  shareFontCss,
  type ShareCardLabels,
  type ShareCardMessage,
  type ShareDrawItem,
  type ShareLayoutResult,
  type SharePage,
} from "./share-layout";
export { encodeQrMatrix, type QrMatrix } from "./share-qr";
export {
  downloadBlobs,
  renderShareCardImages,
  type ShareCardImages,
} from "./share-image";
export {
  buildShareCardMessages,
  generateShareCard,
  shareBlocksForMessage,
  shareCardLabels,
  ShareCardPreview,
} from "./ShareCard";
export {
  downloadBlob,
  shareDocxOutline,
  shareMessagesToDocxBlob,
  type ShareDocxInput,
} from "./share-docx";
export { hasMathDelimiters, loadKatex, KATEX_OPTIONS } from "./katex-runtime";
export { ShareActionBar, ShareCheckbox, ShareEntryButton } from "./ShareActionBar";
export {
  useShareMode,
  type ShareModeState,
  type ShareNotice,
} from "./useShareMode";
