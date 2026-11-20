"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { useUI } from "../../../i18n/ui/useUI";
import { ImApiError } from "../../../lib/im/client";
import { messagesApi } from "../../../lib/im/messages-api";
import { hostState } from "../host-state";
import { ConversationView } from "./ConversationView";

/** Notifications, ?im= links and restored LeoChat state share this boundary.
 * Resolve before mounting a chat: project sessions belong on their project page. */
export function LeoChatConversation(props: ComponentProps<typeof ConversationView>) {
  const router = useRouter();
  const tt = useUI();
  const [readyId, setReadyId] = useState<string | null>(null);
  const unavailable = useRef(props.onUnavailable);
  unavailable.current = props.onUnavailable;
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = 1000;
    const resolve = async () => {
      try {
        const conversation = await messagesApi.getConversation(props.conversationId);
        if (!live) return;
        if (conversation.kind === "project" && conversation.project_id) {
          const host = hostState();
          host.showConversation(null);
          host.close();
          router.push(`/projects/${encodeURIComponent(conversation.project_id)}?session=${encodeURIComponent(props.conversationId)}`);
        } else {
          setReadyId(props.conversationId);
        }
      } catch (error) {
        if (!live) return;
        if (error instanceof ImApiError && (error.status === 403 || error.status === 404)) {
          unavailable.current?.();
          return;
        }
        // A transient failure must not mount a project session in LeoChat.
        timer = setTimeout(() => void resolve(), delay);
        delay = Math.min(delay * 2, 30_000);
      }
    };
    void resolve();
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [props.conversationId, router]);
  return readyId === props.conversationId ? <ConversationView {...props} /> : (
    <p role="status" className="p-3 text-xs text-stone-500">{tt("正在加载…")}</p>
  );
}
