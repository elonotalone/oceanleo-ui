/**
 * 协同房间里的 3D 场景可能比作品当前版本旧：房间的 Yjs 状态只在「有人在房间里保存」
 * 时才前进，而作品也能在房间外被存成新版本（房间没开、AI、专业模式……）。
 * 后端 `poll_external` 每 10 秒才补发一次 `external_revision`，这之前第一次对齐会把
 * 房间里的旧状态当「对方的改动」套进编辑器，用户就看到比当前版本更旧的 revision
 * （2026-10-22 item 1ad86d53：当前 ed0281b8 glb → 被房间里 9a21029f gltf 盖掉）。
 *
 * 判据只用同一份作品内的版本身份：房间状态的检查点来自本作品的另一个版本
 * （`provenance.artifactId === 本作品` 且 `revisionId` 与编辑器当前的底稿版本不同）→ 过期，忽略；
 * 本端的当前状态随后会被推回房间，把房间纠正过来。别的作品、没有版本身份的状态
 * （别人导入了新模型）不受影响，照常应用。
 */
import { normalizeModel3DSourceProvenance } from "./model3d-project";

export function isStaleModel3DRemoteScene(
  remote: unknown,
  current: {
    artifactId: string;
    /** 条目打开时的版本（item.revisionId）。 */
    itemRevisionId: string;
    /** 编辑器当前底稿的版本；glb 检查点没有，留空即用 itemRevisionId。 */
    sourceRevisionId?: string;
  },
): boolean {
  const record =
    remote && typeof remote === "object"
      ? (remote as Record<string, unknown>)
      : null;
  if (!record || record.provenance === undefined) return false;
  const provenance = normalizeModel3DSourceProvenance(record.provenance);
  const artifactId = String(current.artifactId || "");
  if (!artifactId || provenance.artifactId !== artifactId) return false;
  if (!provenance.revisionId) return false;
  const base = String(current.sourceRevisionId || current.itemRevisionId || "");
  if (!base) return false;
  return provenance.revisionId !== base;
}
