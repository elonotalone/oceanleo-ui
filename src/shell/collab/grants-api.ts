/** B1 空壳：按会话授权（实现见后续提交）。 */
import type { CollabRole } from "./index";

export async function grantCoeditToConversation(
  _roomKey: string,
  _conversationId: string,
  _role: CollabRole = "editor",
): Promise<void> {
  throw new Error("collab grants not wired yet");
}
