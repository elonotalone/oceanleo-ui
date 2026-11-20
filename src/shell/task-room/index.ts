// Project sessions and the cards a session shows (session / sites wave 2026-11-21, contract §1 / §2.1 / §2.2).
// The directory keeps its old name; the export names are what callers use.
export { ProjectSessionView, type ProjectSessionViewProps } from "./ProjectSessionView";
export { TaskCardView, type TaskCardViewProps } from "./TaskCardView";
export { QuoteCardView, type QuoteCardViewProps } from "./QuoteCardView";
export { QuoteMessagesPanel, type QuoteMessagesPanelProps } from "./QuoteMessagesPanel";
export { openQuotePanel, OPEN_QUOTE_PANEL_EVENT, type OpenQuotePanelDetail } from "./open-quote";
export {
  taskCardOf,
  quoteCardOf,
  quoteLineText,
  quotePreview,
  taskCardStatus,
  programName,
  type TaskCardData,
  type QuoteCardData,
  type TaskCardAccess,
  type TaskCardStatus,
} from "./card-model";
