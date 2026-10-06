// 草稿：停止输入 1 秒后存到服务端（PUT draft），打开会话时恢复。空内容 = 删除。
// 防抖按 (会话, 线程) 各自计时；离开会话时 `flush()` 立刻存。进程内另留一份，切换会话不会丢字。

import { messagesApi, type MessagesApi } from "../../../lib/im/messages-api";

export const DRAFT_DEBOUNCE_MS = 1000;

export function draftKey(conversationId: string, threadRootId: string | null = null): string {
  return `${conversationId}|${threadRootId ?? ""}`;
}

export interface DraftSaverOptions {
  put: (conversationId: string, body: string, threadRootId: string | null) => Promise<unknown>;
  delayMs?: number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export function createDraftSaver(options: DraftSaverOptions) {
  const delay = options.delayMs ?? DRAFT_DEBOUNCE_MS;
  const setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const waiting = new Map<
    string,
    { handle: unknown; conversationId: string; threadRootId: string | null; body: string }
  >();

  const run = (key: string) => {
    const item = waiting.get(key);
    if (!item) return Promise.resolve();
    waiting.delete(key);
    return Promise.resolve(options.put(item.conversationId, item.body, item.threadRootId)).catch(() => undefined);
  };

  return {
    /** 每次输入都调；最后一次输入 1 秒后才真正存。 */
    schedule(conversationId: string, body: string, threadRootId: string | null = null): void {
      const key = draftKey(conversationId, threadRootId);
      const previous = waiting.get(key);
      if (previous) clearTimer(previous.handle);
      const handle = setTimer(() => {
        void run(key);
      }, delay);
      waiting.set(key, { handle, conversationId, threadRootId, body });
    },
    /** 立刻存掉所有等着的（离开会话、关页面前）。 */
    async flush(): Promise<void> {
      const keys = Array.from(waiting.keys());
      for (const key of keys) {
        const item = waiting.get(key);
        if (item) clearTimer(item.handle);
      }
      await Promise.all(keys.map((key) => run(key)));
    },
    /** 发出消息后丢掉还没存的草稿（避免把刚发的内容又存回去）。 */
    cancel(conversationId: string, threadRootId: string | null = null): void {
      const key = draftKey(conversationId, threadRootId);
      const item = waiting.get(key);
      if (item) clearTimer(item.handle);
      waiting.delete(key);
    },
    pending(): number {
      return waiting.size;
    },
  };
}

// ── 进程内草稿簿 ────────────────────────────────────────────────────────────
const local = new Map<string, string>();
let serverLoad: Promise<void> | null = null;

export function createDraftBook(api: Pick<MessagesApi, "listDrafts" | "putDraft">) {
  const saver = createDraftSaver({
    put: (conversationId, body, threadRootId) => api.putDraft(conversationId, body, threadRootId),
  });
  return {
    saver,
    /** 取草稿：先看本进程里的，没有再问服务端（只问一次）。 */
    async read(conversationId: string, threadRootId: string | null = null): Promise<string> {
      const key = draftKey(conversationId, threadRootId);
      if (local.has(key)) return local.get(key) ?? "";
      if (!serverLoad) {
        serverLoad = api
          .listDrafts()
          .then((drafts) => {
            for (const draft of drafts) {
              const k = draftKey(draft.conversation_id, draft.thread_root_id ?? null);
              if (!local.has(k)) local.set(k, draft.body);
            }
          })
          .catch(() => {
            serverLoad = null;
          });
      }
      await serverLoad;
      return local.get(key) ?? "";
    },
    write(conversationId: string, body: string, threadRootId: string | null = null): void {
      local.set(draftKey(conversationId, threadRootId), body);
      saver.schedule(conversationId, body, threadRootId);
    },
    clear(conversationId: string, threadRootId: string | null = null): void {
      local.set(draftKey(conversationId, threadRootId), "");
      saver.cancel(conversationId, threadRootId);
      void Promise.resolve(api.putDraft(conversationId, "", threadRootId)).catch(() => undefined);
    },
  };
}

export const draftBook = createDraftBook(messagesApi);

export function resetDraftBookForTests(): void {
  local.clear();
  serverLoad = null;
}
