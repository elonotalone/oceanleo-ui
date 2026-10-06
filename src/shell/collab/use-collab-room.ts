/** B1 空壳：useCollabRoom 返回 null（后续由 provider.ts 实现）。 */
import type { ImEditorKind } from "../../lib/im/types";
import type { CollabRoom } from "./index";

export interface UseCollabRoomOptions {
  resource: { kind: "artifact" | "task"; id: string } | null;
  editorKind: ImEditorKind | "task";
  enabled: boolean;
}

export function useCollabRoom(_opts: UseCollabRoomOptions): CollabRoom | null {
  return null;
}

export function useCollabReadOnly(room: CollabRoom | null): boolean {
  return room ? room.role === "viewer" || room.lock !== null : false;
}

export function useCollabSaveGate(room: CollabRoom | null): boolean {
  return room ? room.isSaver : true;
}
