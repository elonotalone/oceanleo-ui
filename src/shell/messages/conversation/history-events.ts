/** Only user-local history changes reload a transcript; membership removals do not. */
export function historyEventTargetsConversation(
  event: { type: "conversation.updated"; conversation: { id: string } }
    | { type: "conversation.removed"; conversation_id: string; reason: string },
  conversationId: string,
): boolean {
  return event.type === "conversation.updated"
    ? event.conversation.id === conversationId
    : event.conversation_id === conversationId && event.reason === "hidden";
}

/** Clear-history is shared by the inbox and conversation details surfaces. */
export function subscribeHistoryCleared(
  target: EventTarget,
  conversationId: string,
  reload: () => void,
): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ conversationId?: unknown }>).detail;
    if (detail?.conversationId === conversationId) reload();
  };
  target.addEventListener("leo:im-history-cleared", listener);
  return () => target.removeEventListener("leo:im-history-cleared", listener);
}
