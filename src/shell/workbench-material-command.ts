import type { ArtifactEditorCommand } from "./artifact-contract";
import type { LibraryItem } from "./library-data";
import type {
  WorkbenchMaterialAdapter,
  WorkbenchMaterialCommandContract,
} from "./workbench-material-registry";

/**
 * 10-23 W02（D2）：素材库「点一下 = 插入 / 替换」的共享闸要求编辑器登记
 * command/history 契约（`oceanleo-typed-artifact-and-app-material-bindings.md` §5.1：
 * Insert/Replace 走目标编辑器自己的 history，带着来源 revision）。在这之前没有一件
 * 编辑器登记过，面板里的「插入」恒灰。
 *
 * 这个助手让编辑器 owner 用一行把自己已有的 `mutate` 接上契约：
 * - 编辑器给出目标文件 id 与**当前**基线 revision（保存后前移，W04），以及
 *   replace 时选中的那个对象；
 * - `mutate` 收到带来源 artifactId / revisionId 的 command，必须走编辑器自己的撤销历史。
 * 基线还不知道（新建未存、加载中）时不登记契约——面板如实说「还不能插入」，不假装能用。
 */
export interface EditorReplaceTarget {
  targetId: string;
  slotId: string;
  geometry: { x: number; y: number; width: number; height: number };
}

export interface EditorHistoryCommandOptions {
  /** 编辑器正在改的那份文件（目标 root / document id）。 */
  documentId: string | null | undefined;
  /** 目标文件当前的基线 revision。 */
  targetRevisionId: string | null | undefined;
  /** replace：此刻选中、要被换掉的对象；没选中返回 null。 */
  replaceTarget?: () => EditorReplaceTarget | null;
}

let sequence = 0;

function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`;
}

export const SELECT_TARGET_FIRST = "先选中要替换的对象，再点素材。";

export function editorHistoryCommandContract(
  options: EditorHistoryCommandOptions,
  execute: WorkbenchMaterialCommandContract["execute"],
): WorkbenchMaterialCommandContract | undefined {
  const documentId = String(options.documentId || "").trim();
  const targetRevisionId = String(options.targetRevisionId || "").trim();
  if (!documentId || !targetRevisionId) return undefined;
  return {
    version: 1,
    history: "editor-command",
    createCommand: (action, item) => {
      const base = {
        schema: "oceanleo.editor-command.v1" as const,
        commandId: nextId(`material-${action}`),
        historyGroupId: nextId("material-history"),
        source: {
          artifactId: item.artifactId,
          revisionId: item.revisionId,
          artifactType: item.artifactType,
          sourceFormat: item.artifact?.sourceFormat as string,
        },
        expectedRevision: { targetRevisionId },
        cas: { expectedRevisionId: targetRevisionId },
      };
      if (action === "insert") {
        return {
          ...base,
          action,
          target: { documentId },
          strategy: { mode: "insert-new-object" },
        } as ArtifactEditorCommand;
      }
      const target = options.replaceTarget?.();
      if (!target) throw new Error(SELECT_TARGET_FIRST);
      return {
        ...base,
        action,
        target: { documentId, ...target, geometry: { ...target.geometry } },
        strategy: { mode: "replace-selection", preserve: ["slot", "geometry"] },
      } as ArtifactEditorCommand;
    },
    execute,
  };
}

/**
 * 编辑器 owner 的一行接法：
 * `useWorkbenchMaterialAdapter(withEditorHistoryCommand(adapter, { documentId, targetRevisionId }))`。
 * command 执行时转给 adapter 自己的 `mutate`（第 4 个参数就是 command，可记来源 revision）。
 */
export function withEditorHistoryCommand(
  adapter: WorkbenchMaterialAdapter,
  options: EditorHistoryCommandOptions,
): WorkbenchMaterialAdapter {
  const command = editorHistoryCommandContract(
    options,
    (value: ArtifactEditorCommand, item: LibraryItem, placement) =>
      adapter.mutate(value.action, item, placement, value),
  );
  return command ? { ...adapter, command } : adapter;
}
