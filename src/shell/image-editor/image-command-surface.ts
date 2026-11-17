import type { EditorContextSurfaceInput } from "../plugin-command/types";
import type { LibraryItem } from "../library-data";
import type { FabricImageEditorState } from "./types";
import { boundedAgentContent } from "../plugin-command/bounded-agent-content";
import { pluginTargetForLibraryItem } from "../active-agent-file";
export function createImageContext({ editor, item }: { editor: FabricImageEditorState; item: LibraryItem }): EditorContextSurfaceInput {
  return {
    editorId: "image",
    target: () => pluginTargetForLibraryItem(item, "image", editor.editRevision),
    selection: () => ({ kind: "objects", objectIds: editor.selected ? [editor.selected.id] : [], ...(editor.selected ? { region: { x: editor.selected.x, y: editor.selected.y, width: editor.selected.width, height: editor.selected.height } } : {}) }),
    agentContext: () => {
      if (editor.loading || !editor.sourceReady) return { ready: false, reason: "Image source unavailable" };
      const raw = editor.captureRecovery() as { snapshot?: { json?: { objects?: Record<string, unknown>[] }; doc?: unknown } } | null;
      const selectedId = editor.selected?.id;
      const objects = raw?.snapshot?.json?.objects || [];
      return boundedAgentContent({ size: raw?.snapshot?.doc, objects: objects.filter(o => !selectedId || (o.oceanleoId || o.id) === selectedId).map(({ src, data, ...object }) => object) });
    },
  };
}
