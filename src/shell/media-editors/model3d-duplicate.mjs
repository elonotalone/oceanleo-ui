/**
 * 「复制一份」（统一编辑栏对象组 `duplicate`，2026-10-23 W13）。
 *
 * 复制品与原件共用几何体和材质（改复制品材质时运行时会先 clone 材质，互不影响）。
 * 复制品及其子节点拿**确定的**编辑器 id：根是 `cloneId`，子节点是
 * `cloneId/<相对路径>`。这样操作日志重放（恢复草稿、多人同改、重新打开时的
 * journal）生成的复制品 id 与第一次完全一样，后续对复制品的移动 / 改色仍能命中。
 */
import * as THREE from "three";
import { objectPath } from "./model3d-gltf.mjs";

/** 复制节点并给整棵子树打上确定的编辑器 id。 */
export function cloneModel3DNode(source, cloneId) {
  const clone = source.clone(true);
  clone.traverse((node) => {
    const relative = node === clone ? "" : objectPath(node, clone);
    node.userData = {
      ...node.userData,
      oceanleoEditorId: relative ? `${cloneId}/${relative}` : cloneId,
    };
  });
  clone.name = `${source.name || source.type || "Object"} copy`;
  return clone;
}

/**
 * 把复制品挪到原件旁边（世界坐标沿 X 方向错开一个包围盒宽度多一点），
 * 让用户一眼看到「多了一个」，而不是两份叠在同一处。
 */
export function placeModel3DCloneBeside(clone, source) {
  const parent = source.parent;
  if (!parent) return;
  source.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(source);
  const size = box.isEmpty() ? new THREE.Vector3(1, 1, 1) : box.getSize(new THREE.Vector3());
  const step = Math.max(size.x, size.z, 0.1) * 1.15;
  const world = source.getWorldPosition(new THREE.Vector3());
  world.x += step;
  clone.position.copy(parent.worldToLocal(world));
  clone.updateMatrix();
}

/** 复制品子树里每个节点（含根）的编辑器 id → 节点。 */
export function model3DCloneRegistryEntries(clone) {
  const entries = [];
  clone.traverse((node) => {
    const id = String(node.userData?.oceanleoEditorId || "");
    if (id) entries.push([id, node]);
  });
  return entries;
}
