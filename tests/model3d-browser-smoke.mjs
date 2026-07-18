import * as THREE from "three";
import {
  exportModel3DGlb,
  parseModel3DGlb,
} from "/src/shell/media-editors/model3d-gltf.mjs";
import {
  model3DCheckpointReason,
} from "/src/shell/media-editors/model3d-operations.mjs";
import { Model3DSceneRuntime } from "/src/shell/media-editors/model3d-runtime.mjs";

const canvas = document.querySelector("#viewport");
const tree = document.querySelector("#tree");
const status = document.querySelector("#status");
const annotations = [];
let latest = null;
let sceneEditCount = 0;
let sceneRevision = 0;
let sceneDirty = false;

function renderSnapshot(snapshot) {
  latest = snapshot;
  tree.replaceChildren();
  for (const node of snapshot.nodes.filter((entry) => entry.selectable)) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.nodeName = node.name;
    button.dataset.nodeId = node.id;
    button.textContent = `${"·".repeat(node.depth)} ${node.name} (${node.type})`;
    button.addEventListener("click", () => runtime.setSelectedNode(node.id));
    tree.append(button);
  }
  if (snapshot.selection) {
    document.querySelector("#position-x").value =
      String(snapshot.selection.transform.position[0]);
  }
  status.textContent = JSON.stringify({
    selected: snapshot.selection?.name || "",
    transformAttached: snapshot.transformAttached,
    transformMode: snapshot.transformMode,
    canUndo: snapshot.history.canUndo,
    canRedo: snapshot.history.canRedo,
    annotationPlacementArmed: snapshot.annotationPlacementArmed,
  });
}

const runtime = new Model3DSceneRuntime(canvas, {
  onSnapshot: renderSnapshot,
  onSceneEdited: () => {
    sceneEditCount += 1;
    sceneRevision += 1;
    sceneDirty = true;
  },
  onAnnotationPoint: (point) => {
    annotations.push({
      id: `annotation-${annotations.length + 1}`,
      label: "Surface note",
      x: point.position[0],
      y: point.position[1],
      z: point.position[2],
      normalX: point.normal[0],
      normalY: point.normal[1],
      normalZ: point.normal[2],
      nodePath: point.nodePath,
    });
    runtime.setAnnotations(annotations);
  },
  onError: (message) => {
    window.__MODEL3D_SMOKE_ERROR__ = message;
  },
});

const sourceScene = new THREE.Scene();
sourceScene.name = "RoundTripScene";
const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({
    name: "Body",
    color: "#ffffff",
    metalness: 0.2,
    roughness: 0.8,
  }),
);
mesh.name = "EditableCube";
sourceScene.add(mesh);
const visibilityNode = new THREE.Mesh(
  new THREE.SphereGeometry(0.25, 8, 6),
  new THREE.MeshStandardMaterial({ color: "#8899aa" }),
);
visibilityNode.name = "VisibilityNode";
visibilityNode.position.set(-1.5, 0, 0);
sourceScene.add(visibilityNode);
const deleteNode = new THREE.Mesh(
  new THREE.SphereGeometry(0.2, 8, 6),
  new THREE.MeshStandardMaterial({ color: "#aa7788" }),
);
deleteNode.name = "DeleteNode";
deleteNode.position.set(1.5, 0, 0);
sourceScene.add(deleteNode);

const authoredCamera = new THREE.PerspectiveCamera(37, 1.5, 0.1, 100);
authoredCamera.name = "AuthoredCamera";
authoredCamera.position.set(3, 2, 4);
authoredCamera.lookAt(0, 0, 0);
sourceScene.add(authoredCamera);

const authoredLight = new THREE.DirectionalLight(0xffeedd, 3.25);
authoredLight.name = "AuthoredLight";
authoredLight.position.set(2, 4, 3);
authoredLight.lookAt(0, 0, 0);
sourceScene.add(authoredLight);

const animationOnlyNode = new THREE.Group();
animationOnlyNode.name = "AnimationOnlyNode";
sourceScene.add(animationOnlyNode);

const animation = new THREE.AnimationClip("MoveX", 1, [
  new THREE.NumberKeyframeTrack(
    "EditableCube.position[x]",
    [0, 1],
    [0, 0.5],
  ),
  new THREE.NumberKeyframeTrack(
    "AnimationOnlyNode.position[x]",
    [0, 1],
    [0, 0.5],
  ),
]);
const sourceGlb = await exportModel3DGlb(sourceScene, [animation]);
await runtime.loadArrayBuffer(sourceGlb);
runtime.setView({
  background: "#112233",
  exposure: 1.2,
  environmentIntensity: 1.5,
  shadowEnabled: true,
  shadowIntensity: 0.8,
  shadowSoftness: 0.6,
});

document.querySelector("#apply-position").addEventListener("click", () => {
  if (!latest?.selection) return;
  const position = [...latest.selection.transform.position];
  position[0] = Number(document.querySelector("#position-x").value);
  runtime.patchSelectedTransform({ position });
});
document.querySelector("#mode-rotate").addEventListener("click", () => {
  runtime.setTransformMode("rotate");
});
document.querySelector("#material-green").addEventListener("click", () => {
  runtime.patchSelectedMaterial({
    color: "#33aa77",
    metalness: 0.65,
    roughness: 0.35,
  });
});
document.querySelector("#texture-map").addEventListener("click", async () => {
  try {
    await runtime.replaceSelectedTexture("baseColor", "/texture.png");
    window.__MODEL3D_TEXTURE_REPLACED__ = true;
  } catch (error) {
    window.__MODEL3D_SMOKE_ERROR__ =
      error instanceof Error ? error.message : String(error);
  }
});
document.querySelector("#add-point-light").addEventListener("click", () => {
  runtime.addLight("point");
});
document.querySelector("#edit-light").addEventListener("click", () => {
  runtime.patchSelectedLight({
    color: "#88aaff",
    intensity: 12.5,
    distance: 20,
    decay: 2,
  });
});
document.querySelector("#edit-camera").addEventListener("click", () => {
  runtime.patchSelectedCamera({ fov: 52, near: 0.25, far: 250 });
});
document.querySelector("#animation-time").addEventListener("click", () => {
  runtime.selectAnimation("MoveX", false);
  runtime.setAnimationTime(0.5);
});
document.querySelector("#annotation").addEventListener("click", () => {
  runtime.armAnnotationPlacement(true);
});
document.querySelector("#undo").addEventListener("click", () => runtime.undo());
document.querySelector("#redo").addEventListener("click", () => runtime.redo());
document.querySelector("#export").addEventListener("click", async () => {
  try {
    const journal = runtime.getOperationJournal();
    const exported = await runtime.exportGlb();
    const reloaded = await parseModel3DGlb(exported);
    const edited = reloaded.scene.getObjectByName("EditableCube");
    const animationOnly = reloaded.scene.getObjectByName("AnimationOnlyNode");
    const material = Array.isArray(edited.material)
      ? edited.material[0]
      : edited.material;
    let pointLight = null;
    reloaded.scene.traverse((entry) => {
      if (!pointLight && entry.isPointLight) pointLight = entry;
    });
    const replayCanvas = document.createElement("canvas");
    replayCanvas.width = 320;
    replayCanvas.height = 200;
    const replayRuntime = new Model3DSceneRuntime(replayCanvas);
    await replayRuntime.loadArrayBuffer(sourceGlb);
    await replayRuntime.applyOperationJournal(journal);
    const replayedMesh =
      replayRuntime.contentScene.getObjectByName("EditableCube");
    const replayedCamera =
      replayRuntime.contentScene.getObjectByName("AuthoredCamera");
    let replayedPointLight = null;
    replayRuntime.contentScene.traverse((entry) => {
      if (!replayedPointLight && entry.isPointLight) replayedPointLight = entry;
    });
    const replayedMaterial = Array.isArray(replayedMesh.material)
      ? replayedMesh.material[0]
      : replayedMesh.material;
    const replayedVisibility =
      replayRuntime.contentScene.getObjectByName("VisibilityNode");
    const authoredTransform = journal.find(
      (operation) => operation.kind === "transform",
    );
    const checkpointCanvas = document.createElement("canvas");
    checkpointCanvas.width = 320;
    checkpointCanvas.height = 200;
    const checkpointRuntime = new Model3DSceneRuntime(checkpointCanvas);
    await checkpointRuntime.loadArrayBuffer(exported);
    await checkpointRuntime.applyOperationJournal([{
      ...authoredTransform,
      id: "post-checkpoint-transform",
      value: {
        ...authoredTransform.value,
        position: [2.5, 0, 0],
      },
    }]);
    const checkpointMesh =
      checkpointRuntime.contentScene.getObjectByName("EditableCube");
    window.__MODEL3D_SMOKE_RESULT__ = {
      exportedBytes: exported.byteLength,
      position: edited.position.toArray(),
      animationOnlyPosition: animationOnly.position.toArray(),
      rotation: edited.rotation.toArray().slice(0, 3),
      scale: edited.scale.toArray(),
      materialColor: `#${material.color.getHexString(THREE.SRGBColorSpace)}`,
      metalness: material.metalness,
      roughness: material.roughness,
      texturePreserved: Boolean(material.map?.isTexture),
      cameraPreserved: reloaded.cameras.some(
        (entry) => entry.name === "AuthoredCamera",
      ),
      cameraFov:
        reloaded.cameras.find((entry) => entry.name === "AuthoredCamera")?.fov ||
        0,
      lightPreserved: Boolean(
        reloaded.scene.getObjectByName("AuthoredLight")?.isDirectionalLight,
      ),
      pointLightPreserved: Boolean(pointLight),
      pointLightIntensity: pointLight?.intensity || 0,
      journalCount: journal.length,
      journalReplayPosition: replayedMesh.position.toArray(),
      journalReplayMaterialColor:
        `#${replayedMaterial.color.getHexString(THREE.SRGBColorSpace)}`,
      journalReplayTexture: Boolean(replayedMaterial.map?.isTexture),
      journalReplayCameraFov: replayedCamera?.fov || 0,
      journalReplayPointLightIntensity: replayedPointLight?.intensity || 0,
      deletedNodeAbsent:
        !reloaded.scene.getObjectByName("DeleteNode") &&
        !replayRuntime.contentScene.getObjectByName("DeleteNode"),
      visibilityExtraPreserved:
        reloaded.scene.getObjectByName("VisibilityNode")
          ?.userData?.oceanleoVisible === false,
      journalReplayVisibility: replayedVisibility?.visible,
      checkpointTargetStable:
        checkpointMesh.userData.oceanleoEditorId === authoredTransform.target,
      checkpointReplayPosition: checkpointMesh.position.toArray(),
      checkpointVisibility:
        checkpointRuntime.contentScene.getObjectByName("VisibilityNode")?.visible,
      animationPreserved: reloaded.animations.some(
        (entry) => entry.name === "MoveX",
      ),
      playbackTime: latest?.animationTime || 0,
      rendererEnvironmentInGlb: Boolean(reloaded.scene.environment),
      annotationCount: annotations.length,
      annotationNodesInGlb: reloaded.scene.children.filter(
        (entry) => entry.userData?.annotationId,
      ).length,
      transformAttached: latest?.transformAttached === true,
      transformMode: latest?.transformMode,
    };
    replayRuntime.dispose();
    checkpointRuntime.dispose();
  } catch (error) {
    window.__MODEL3D_SMOKE_ERROR__ =
      error instanceof Error ? error.message : String(error);
  }
});

window.__MODEL3D_RUNTIME__ = runtime;
window.__MODEL3D_RUN_GESTURE_TEST__ = async (mode) => {
  await runtime.loadArrayBuffer(sourceGlb);
  sceneEditCount = 0;
  sceneRevision = 0;
  sceneDirty = false;
  const cube = runtime.contentScene.getObjectByName("EditableCube");
  runtime.setSelectedNode(cube.uuid);
  if (mode === "commit-transform") {
    runtime.beginGesture("position-x");
    for (let index = 1; index <= 100; index += 1) {
      const current = latest.selection.transform.position;
      runtime.patchSelectedTransform({
        position: [index / 100, current[1], current[2]],
      });
    }
    const preview = {
      edits: sceneEditCount,
      canUndo: latest.history.canUndo,
      journalCount: latest.operationCount,
      x: latest.selection.transform.position[0],
    };
    runtime.commitGesture();
    return {
      preview,
      committed: {
        edits: sceneEditCount,
        revision: sceneRevision,
        dirty: sceneDirty,
        canUndo: latest.history.canUndo,
        journalCount: latest.operationCount,
        x: latest.selection.transform.position[0],
      },
    };
  }
  const baseColor = latest.selection.materials[0].color;
  runtime.beginGesture("material-metallic");
  for (let index = 1; index <= 100; index += 1) {
    runtime.patchSelectedMaterial({
      color: index % 2 ? "#ff0000" : "#00ff00",
      metalness: index / 100,
      roughness: 1 - index / 100,
    });
  }
  const previewColor = latest.selection.materials[0].color;
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  return {
    baseColor,
    previewColor,
    restoredColor: latest.selection.materials[0].color,
    edits: sceneEditCount,
    revision: sceneRevision,
    dirty: sceneDirty,
    canUndo: latest.history.canUndo,
    journalCount: latest.operationCount,
  };
};
window.__MODEL3D_RUN_RECOVERY_TEST__ = async () => {
  await runtime.loadArrayBuffer(sourceGlb);
  const cube = runtime.contentScene.getObjectByName("EditableCube");
  runtime.setSelectedNode(cube.uuid);
  for (let index = 1; index <= 64; index += 1) {
    runtime.patchSelectedTransform({ position: [index, 0, 0] });
  }
  const journal = runtime.getOperationJournal();
  const serialized = JSON.parse(JSON.stringify(journal));
  const checkpointReason = model3DCheckpointReason(serialized);
  const reopenedCanvas = document.createElement("canvas");
  reopenedCanvas.width = 320;
  reopenedCanvas.height = 200;
  const reopened = new Model3DSceneRuntime(reopenedCanvas);
  await reopened.loadArrayBuffer(sourceGlb);
  await reopened.applyOperationJournal(serialized);
  const reopenedPosition =
    reopened.contentScene.getObjectByName("EditableCube").position.x;
  const retainedAfterFailure = runtime.getOperationJournal().length;
  const coveredIds = journal.map((operation) => operation.id);
  runtime.patchSelectedTransform({ position: [65, 0, 0] });
  runtime.commitCheckpoint(coveredIds);
  const remainingAfterSuccess = runtime.getOperationJournal();
  const undoRetainedAfterCheckpoint = latest.history.canUndo;
  reopened.dispose();
  await runtime.loadArrayBuffer(sourceGlb);
  return {
    checkpointReason,
    retainedAfterFailure,
    reopenedPosition,
    remainingAfterSuccess: remainingAfterSuccess.length,
    remainingPosition: remainingAfterSuccess[0]?.value?.position?.[0],
    undoRetainedAfterCheckpoint,
  };
};
window.__MODEL3D_SMOKE_READY__ = true;
