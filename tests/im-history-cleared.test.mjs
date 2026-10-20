import assert from "node:assert/strict";
import test from "node:test";
import { historyEventTargetsConversation, subscribeHistoryCleared } from "../src/shell/messages/conversation/history-events.ts";
import { ConversationStore } from "../src/shell/messages/conversation/conversation-store.ts";

test("realtime history refresh targets active updates and hidden removals only", () => {
  assert.equal(historyEventTargetsConversation({ type: "conversation.updated", conversation: { id: "active" } }, "active"), true);
  assert.equal(historyEventTargetsConversation({ type: "conversation.updated", conversation: { id: "other" } }, "active"), false);
  for (const reason of ["hidden", "left", "kicked", "dissolved"]) {
    assert.equal(historyEventTargetsConversation({ type: "conversation.removed", conversation_id: "active", reason }, "active"), reason === "hidden");
    assert.equal(historyEventTargetsConversation({ type: "conversation.removed", conversation_id: "other", reason }, "active"), false);
  }
});

test("history clear reloads only the active conversation and unsubscribes on close", () => {
  const target = new EventTarget();
  let reloads = 0;
  const stop = subscribeHistoryCleared(target, "active", () => { reloads += 1; });
  const emit = (detail) => target.dispatchEvent(new CustomEvent("leo:im-history-cleared", { detail }));
  emit({ conversationId: "other" });
  emit(undefined);
  assert.equal(reloads, 0);
  emit({ conversationId: "active" });
  assert.equal(reloads, 1);
  stop();
  emit({ conversationId: "active" });
  assert.equal(reloads, 1);
});

test("clear event replaces cached transcript with the server's remaining history", async () => {
  let items = [{ id: "old", seq: 9, thread_root_id: null }];
  const store = new ConversationStore({
    conversationId: "active", viewerId: "me",
    api: { async listMessages() { return { items, has_more_before: false, has_more_after: false }; } },
  });
  await store.loadLatest();
  assert.equal(store.getSnapshot().messages.length, 1);
  const target = new EventTarget();
  let reloaded;
  const stop = subscribeHistoryCleared(target, "active", () => { reloaded = store.loadLatest(); });
  items = [];
  target.dispatchEvent(new CustomEvent("leo:im-history-cleared", { detail: { conversationId: "active" } }));
  await reloaded;
  assert.deepEqual(store.getSnapshot().messages, []);
  assert.equal(store.getSnapshot().lastSeq, 0);
  stop();
});
