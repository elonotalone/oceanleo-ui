// Shared left-conversation fill / pin contract (editor-repair W4).
//
// Empty assistant views were sizing to the intro + composer, so the composer
// floated mid-column with dead space below. The column must consume the pane
// height; the transcript scrolls; the composer stays on the pane floor.
// Intermediate wrappers (PluginThemeScope, LiveReactNode fragments) often have
// no height, so `h-full` on the chat alone is not enough. Hosts that already
// own a definite pane height apply AGENT_CONVERSATION_HOST_STRETCH_CLASS so
// the first child becomes a flex column without forcing b12 control panels
// to fill the pane.

export const AGENT_CONVERSATION_ATTR = "data-agent-conversation";
export const AGENT_CONVERSATION_SCROLL_ATTR = "data-agent-conversation-scroll";
export const AGENT_COMPOSER_DOCK_ATTR = "data-agent-composer-dock";

export const AGENT_CONVERSATION_COLUMN_CLASS =
  "flex h-full min-h-0 flex-1 flex-col";

export const AGENT_CONVERSATION_SCROLL_CLASS =
  "min-h-0 flex-1 overflow-y-auto";

export const AGENT_COMPOSER_DOCK_CLASS = "mt-auto shrink-0";

/** Stretch the host's first child only when a conversation column is inside. */
export const AGENT_CONVERSATION_HOST_STRETCH_CLASS = [
  "[&:has([data-agent-conversation])>*]:flex",
  "[&:has([data-agent-conversation])>*]:h-full",
  "[&:has([data-agent-conversation])>*]:min-h-0",
  "[&:has([data-agent-conversation])>*]:flex-1",
  "[&:has([data-agent-conversation])>*]:flex-col",
].join(" ");
