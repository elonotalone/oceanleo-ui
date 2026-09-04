export { lineDiff, wordDiff, unifiedDiff, type DiffOp } from "./diff";
export {
  createReviewSession,
  hostReviewSession,
  invertParked,
  proposalItemIds,
  revisionNumber,
  type ParkedReview,
  type ReviewSession,
  type ReviewSnapshot,
  type ItemDecision,
} from "./session";
export {
  submitAgentReviewProposal,
  submitRawReviewProposal,
  publishAgentSelection,
  readAgentSelection,
  readMentionCatalog,
  subscribeAgentSelection,
  rememberEditorChips,
  rememberedChips,
  subscribeEditorChips,
  resetAgentReviewInbox,
} from "./inbox";
export { readAgentCommandSurface, resolveAgentSurfaceSource } from "./surface";
export {
  AgentReviewDock,
  AgentReviewHostProvided,
  useHostReviewActions,
  type HostReviewActions,
} from "./dock";
export {
  gateSurfaceForAgent,
  isAgentGatedSurface,
  createReviewGatedReader,
  applyParkedReview,
  parkedFromPending,
  parkedFromMutatingRun,
  withReviewApply,
  reviewApplyHeld,
  resetReviewApplyHolds,
  routeAgentCommandRun,
  type AgentCommandRunRoute,
  type ReviewApplyHold,
} from "./gate";
export {
  selectionToAgent,
  formatSelectionContext,
  parseAtMentions,
  buildAgentSelectionBlock,
  assembleAgentEditorContext,
  type AgentSelection,
  type MentionHit,
} from "./selection-bridge";
export { AgentReviewPanel, ReviewPanelView } from "./AgentReviewPanel";
export {
  selectionFromToolbarAttrs,
  refreshAgentSelectionFromDom,
} from "./selection-live";
export {
  installAgentReviewGate,
  uninstallAgentReviewGate,
  installSelectionBridge,
  uninstallSelectionBridge,
  emitReviewDecision,
} from "./install";
