import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import {
  disposeModel3DObject,
  editablePbrMaterials,
  exportModel3DGlb,
  loadModel3DUrl,
  objectPath,
  parseModel3DGlb,
  replaceMeshMaterial,
  sceneTreeSnapshot,
} from "./model3d-gltf.mjs";
import { Model3DCommandHistory } from "./model3d-history.mjs";
import {
  model3DJournalByteLength,
  normalizeModel3DOperation,
  normalizeModel3DOperationJournal,
} from "./model3d-operations.mjs";
import {
  model3DBokehSettings,
  model3DDepthOfFieldRuntimeCapability,
  model3DDirectorFrameAt,
  model3DPlayblastRuntimeCapability,
  model3DRecorderMime,
  model3DRuntimeError,
} from "./model3d-director-runtime.mjs";

const TEXTURE_SLOTS = {
  baseColor: ["map"],
  normal: ["normalMap"],
  metallicRoughness: ["metalnessMap", "roughnessMap"],
  emissive: ["emissiveMap"],
  occlusion: ["aoMap"],
};

const noop = () => {};
const identity = (value) => value;
const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, Number(value)));
const degrees = (value) => THREE.MathUtils.radToDeg(value);
const radians = (value) => THREE.MathUtils.degToRad(value);
const vectorArray = (vector) => vector.toArray().map((value) => Number(value));
let generatedId = 0;
const uniqueId = (prefix) =>
  globalThis.crypto?.randomUUID?.() ||
  `${prefix}-${Date.now().toString(36)}-${(generatedId += 1).toString(36)}`;

function transformSnapshot(object) {
  return {
    position: vectorArray(object.position),
    rotation: [
      degrees(object.rotation.x),
      degrees(object.rotation.y),
      degrees(object.rotation.z),
    ],
    scale: vectorArray(object.scale),
  };
}

function applyTransform(object, snapshot) {
  object.position.fromArray(snapshot.position);
  object.rotation.set(
    radians(snapshot.rotation[0]),
    radians(snapshot.rotation[1]),
    radians(snapshot.rotation[2]),
  );
  object.scale.fromArray(snapshot.scale);
  object.updateMatrix();
  object.updateMatrixWorld(true);
}

function sameTransform(left, right) {
  return ["position", "rotation", "scale"].every((key) =>
    left[key].every(
      (value, index) => Math.abs(value - right[key][index]) <= 1e-8,
    ),
  );
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function pbrSnapshot(material) {
  return {
    color: `#${material.color.getHexString(THREE.SRGBColorSpace)}`,
    metalness: material.metalness,
    roughness: material.roughness,
  };
}

function applyPbr(material, value) {
  material.color.set(value.color);
  material.metalness = clamp(value.metalness, 0, 1);
  material.roughness = clamp(value.roughness, 0, 1);
  material.needsUpdate = true;
}

function cameraSnapshot(camera) {
  return {
    fov: camera.fov,
    zoom: camera.zoom,
    near: camera.near,
    far: camera.far,
  };
}

function applyCamera(camera, value) {
  if (camera.isPerspectiveCamera && Number.isFinite(value.fov)) {
    camera.fov = clamp(value.fov, 1, 179);
  }
  if (camera.isOrthographicCamera && Number.isFinite(value.zoom)) {
    camera.zoom = clamp(value.zoom, 0.01, 100);
  }
  camera.near = clamp(value.near, 0.0001, 1_000);
  camera.far = Math.max(camera.near + 0.001, Number(value.far));
  camera.updateProjectionMatrix();
}

function lightSnapshot(light) {
  return {
    color: `#${light.color.getHexString(THREE.SRGBColorSpace)}`,
    intensity: light.intensity,
    distance: Number(light.distance || 0),
    decay: Number(light.decay || 0),
    angle: light.isSpotLight ? degrees(light.angle) : 0,
    penumbra: light.isSpotLight ? light.penumbra : 0,
  };
}

function applyLight(light, value) {
  light.color.set(value.color);
  light.intensity = Math.max(0, Number(value.intensity));
  if (light.isPointLight || light.isSpotLight) {
    light.distance = Math.max(0, Number(value.distance));
    light.decay = Math.max(0, Number(value.decay));
  }
  if (light.isSpotLight) {
    light.angle = radians(clamp(value.angle, 1, 89));
    light.penumbra = clamp(value.penumbra, 0, 1);
  }
}

function applyVisibility(object, visible) {
  if (!object) return;
  object.visible = Boolean(visible);
  object.userData.oceanleoVisible = object.visible;
}

function textureSource(texture) {
  if (!texture?.isTexture) return "";
  return String(
    texture?.userData?.oceanleoSourceUrl ||
      texture?.source?.data?.currentSrc ||
      texture?.source?.data?.src ||
      "embedded",
  );
}

function materialSnapshot(object, selectedIndex) {
  return editablePbrMaterials(object).map(({ index, name, material }) => ({
    index,
    name,
    selected: index === selectedIndex,
    color: `#${material.color.getHexString(THREE.SRGBColorSpace)}`,
    metalness: material.metalness,
    roughness: material.roughness,
    textures: Object.fromEntries(
      Object.entries(TEXTURE_SLOTS).map(([slot, properties]) => [
        slot,
        textureSource(material[properties[0]]),
      ]),
    ),
  }));
}

function selectionSnapshot(object, root, selectedMaterialIndex) {
  if (!object) return null;
  const snapshot = {
    id: object.uuid,
    path: objectPath(object, root),
    name: object.name || object.type || "Object3D",
    type: object.type || "Object3D",
    visible: object.visible !== false,
    transform: transformSnapshot(object),
    materials: materialSnapshot(object, selectedMaterialIndex),
  };
  if (object.isPerspectiveCamera) {
    snapshot.camera = {
      projection: "perspective",
      fov: object.fov,
      near: object.near,
      far: object.far,
    };
  } else if (object.isOrthographicCamera) {
    snapshot.camera = {
      projection: "orthographic",
      zoom: object.zoom,
      near: object.near,
      far: object.far,
    };
  }
  if (object.isLight) {
    snapshot.light = {
      kind: object.isDirectionalLight
        ? "directional"
        : object.isSpotLight
          ? "spot"
          : object.isPointLight
            ? "point"
            : "light",
      color: `#${object.color.getHexString(THREE.SRGBColorSpace)}`,
      intensity: object.intensity,
      distance: Number(object.distance || 0),
      decay: Number(object.decay || 0),
      angle: object.isSpotLight ? degrees(object.angle) : 0,
      penumbra: object.isSpotLight ? object.penumbra : 0,
    };
  }
  return snapshot;
}

export class Model3DSceneRuntime {
  constructor(canvas, options = {}) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new TypeError("Model3DSceneRuntime requires a canvas");
    }
    this.canvas = canvas;
    this.options = {
      onSnapshot: options.onSnapshot || noop,
      onSceneEdited: options.onSceneEdited || noop,
      onViewChange: options.onViewChange || noop,
      onViewCommit: options.onViewCommit || noop,
      onAnnotationPoint: options.onAnnotationPoint || noop,
      onAnnotationFrame: options.onAnnotationFrame || noop,
      onError: options.onError || noop,
      resolveAssetUrl: options.resolveAssetUrl || identity,
    };
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderScene = new THREE.Scene();
    this.renderScene.background = new THREE.Color("#f5f5f4");
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10_000);
    this.camera.position.set(4, 3, 6);
    this.composer = null;
    this.renderPass = null;
    this.bokehPass = null;
    this.depthOfFieldReason = "";
    this.depthOfField = {
      enabled: false,
      apertureFStop: 2.8,
      focusDistance: 5,
    };
    this.initializeDepthOfField();
    this.orbit = new OrbitControls(this.camera, canvas);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.screenSpacePanning = true;
    this.transform = new TransformControls(this.camera, canvas);
    this.transform.setSpace("local");
    this.transformMode = "translate";
    this.transform.setMode(this.transformMode);
    this.transformHelper = this.transform.getHelper();
    this.transformHelper.userData.oceanleoEditorHelper = true;
    this.renderScene.add(this.transformHelper);
    this.grid = new THREE.GridHelper(20, 20, 0x888888, 0xcccccc);
    this.grid.userData.oceanleoEditorHelper = true;
    this.renderScene.add(this.grid);
    this.viewerLight = new THREE.HemisphereLight(0xffffff, 0x444455, 1.8);
    this.viewerLight.userData.oceanleoEditorHelper = true;
    this.renderScene.add(this.viewerLight);
    this.viewerKey = new THREE.DirectionalLight(0xffffff, 2.2);
    this.viewerKey.position.set(4, 6, 5);
    this.viewerKey.castShadow = true;
    this.viewerKey.userData.oceanleoEditorHelper = true;
    this.renderScene.add(this.viewerKey);
    this.annotationGroup = new THREE.Group();
    this.annotationGroup.userData.oceanleoEditorHelper = true;
    this.renderScene.add(this.annotationGroup);
    this.annotations = [];
    this.history = new Model3DCommandHistory({
      onChange: () => this.emitSnapshot(),
    });
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.clock = new THREE.Clock();
    this.contentScene = null;
    this.objectRegistry = new Map();
    this.checkpointTextures = new Map();
    this.operationJournal = [];
    this.replayingOperations = false;
    this.pendingHistoryOperation = null;
    this.animations = [];
    this.mixer = null;
    this.action = null;
    this.animationName = "";
    this.animationPlaying = false;
    this.animationSpeed = 1;
    this.animationTime = 0;
    this.selected = null;
    this.selectedMaterialIndex = 0;
    this.baseDistance = 5;
    this.view = {
      azimuth: 35,
      elevation: 65,
      zoom: 110,
      autoRotate: false,
      exposure: 1,
      background: "#f5f5f4",
      environmentUrl: "",
      environmentIntensity: 1,
      shadowEnabled: true,
      shadowIntensity: 1,
      shadowSoftness: 1,
    };
    this.environmentTexture = null;
    this.environmentGeneration = 0;
    this.loadGeneration = 0;
    this.annotationPlacementArmed = false;
    this.editGesture = null;
    this.transformDragging = false;
    this.pointerStart = null;
    this.disposed = false;
    this.lastOverlayAt = 0;
    this.lastAnimationAt = 0;

    this.onResize = () => this.resize();
    this.onPointerDown = (event) => {
      this.pointerStart = { x: event.clientX, y: event.clientY };
    };
    this.onPointerUp = (event) => this.handlePointerUp(event);
    this.onKeyDown = (event) => {
      if (event.key === "Escape") this.cancelGesture();
    };
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointerup", this.onPointerUp);
    this.resizeObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(this.onResize)
        : null;
    this.resizeObserver?.observe(canvas.parentElement || canvas);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);

    this.orbit.addEventListener("start", () => {
      this.orbitGestureStarted = true;
    });
    this.orbit.addEventListener("change", () => this.handleOrbitChange());
    this.orbit.addEventListener("end", () => {
      if (!this.orbitGestureStarted) return;
      this.orbitGestureStarted = false;
      this.options.onViewCommit({ ...this.view });
    });
    this.transform.addEventListener("dragging-changed", (event) => {
      this.transformDragging = Boolean(event.value);
      this.orbit.enabled = !this.transformDragging;
    });
    this.transform.addEventListener("mouseDown", () => {
      this.beginGesture("transform-control");
    });
    this.transform.addEventListener("objectChange", () => this.emitSnapshot());
    this.transform.addEventListener("mouseUp", () => {
      this.commitGesture();
    });
    this.resize();
    this.animate();
  }

  initializeDepthOfField() {
    try {
      const context = this.renderer.getContext();
      const colorBufferFloat =
        context.getExtension("EXT_color_buffer_float") ||
        context.getExtension("EXT_color_buffer_half_float");
      const capability = model3DDepthOfFieldRuntimeCapability({
        webgl2: this.renderer.capabilities.isWebGL2,
        renderableHalfFloatColorBuffer: Boolean(colorBufferFloat),
      });
      if (!capability.enabled) {
        this.depthOfFieldReason = capability.reason;
        return;
      }
      this.composer = new EffectComposer(this.renderer);
      this.renderPass = new RenderPass(this.renderScene, this.camera);
      this.bokehPass = new BokehPass(this.renderScene, this.camera, {
        focus: this.depthOfField.focusDistance,
        aperture: 0.000025,
        maxblur: 0.008,
      });
      this.composer.addPass(this.renderPass);
      this.composer.addPass(this.bokehPass);
    } catch (caught) {
      this.composer?.dispose?.();
      this.bokehPass?.dispose?.();
      this.composer = null;
      this.renderPass = null;
      this.bokehPass = null;
      this.depthOfFieldReason = `Depth-of-field postprocessing initialization failed: ${
        caught instanceof Error ? caught.message : "unknown WebGL error"
      }`;
    }
  }

  depthOfFieldCapability() {
    return this.composer && this.bokehPass
      ? { enabled: true }
      : {
          enabled: false,
          reason:
            this.depthOfFieldReason ||
            "Depth-of-field postprocessing is unavailable in this WebGL runtime",
        };
  }

  setDepthOfField(value = {}, render = true) {
    const enabled = value.enabled === true;
    const apertureFStop = clamp(
      value.apertureFStop ?? this.depthOfField.apertureFStop,
      0.7,
      64,
    );
    const focusDistance = clamp(
      value.focusDistance ?? this.depthOfField.focusDistance,
      0.001,
      1_000_000,
    );
    if (enabled && (!this.composer || !this.bokehPass)) {
      throw model3DRuntimeError(
        "model3d-dof-runtime-unavailable",
        this.depthOfFieldCapability().reason,
      );
    }
    this.depthOfField = {
      enabled,
      apertureFStop,
      focusDistance,
    };
    if (this.bokehPass) {
      const settings = model3DBokehSettings(apertureFStop, focusDistance);
      this.bokehPass.uniforms.focus.value = settings.focus;
      this.bokehPass.uniforms.aperture.value = settings.aperture;
      this.bokehPass.uniforms.maxblur.value = settings.maxBlur;
    }
    if (render) this.renderFrame(enabled);
    return this.depthOfFieldCapability();
  }

  applyDirectorCameraFrame(camera, frame) {
    this.camera.position.fromArray(frame.position);
    this.camera.fov = clamp(frame.fovDegrees, 1, 179);
    this.camera.near = clamp(camera.near, 0.0001, 1_000_000);
    this.camera.far = Math.max(
      this.camera.near + 0.001,
      clamp(camera.far, 0.001, 10_000_000),
    );
    this.orbit?.target.fromArray(frame.target);
    this.camera.lookAt(frame.target[0], frame.target[1], frame.target[2]);
    this.camera.updateProjectionMatrix();
    if (camera.depthOfFieldEnabled) {
      this.setDepthOfField({
        enabled: true,
        apertureFStop: frame.apertureFStop,
        focusDistance: camera.focusDistance,
      }, false);
    } else if (this.depthOfField.enabled) {
      this.setDepthOfField({
        enabled: false,
        apertureFStop: frame.apertureFStop,
        focusDistance: camera.focusDistance,
      }, false);
    }
  }

  setDirectorCamera(camera) {
    if (camera?.projection === "orthographic") {
      throw model3DRuntimeError(
        "model3d-orthographic-previs-unavailable",
        "The current Three workbench uses a perspective viewer camera; orthographic director metadata is preserved but cannot be previewed",
      );
    }
    const frame = model3DDirectorFrameAt(camera, [], 0);
    this.applyDirectorCameraFrame(camera, frame);
    this.renderFrame(camera.depthOfFieldEnabled === true);
  }

  renderFrame(strictDepthOfField = false) {
    if (this.depthOfField.enabled && this.composer) {
      try {
        this.composer.render();
        return;
      } catch (caught) {
        const message = `Depth-of-field postprocessing failed at runtime: ${
          caught instanceof Error ? caught.message : "unknown WebGL error"
        }`;
        this.depthOfField.enabled = false;
        this.depthOfFieldReason = message;
        this.options.onError(message);
        if (strictDepthOfField) {
          throw model3DRuntimeError(
            "model3d-dof-render-failed",
            message,
            true,
          );
        }
      }
    }
    this.renderer.render(this.renderScene, this.camera);
  }

  playblastCapability() {
    if (!this.contentScene) {
      return { enabled: false, reason: "The 3D scene is not loaded" };
    }
    const capability = model3DPlayblastRuntimeCapability({
      canvasCaptureStream: typeof this.canvas.captureStream === "function",
      mediaRecorder: typeof globalThis.MediaRecorder === "function",
    });
    if (!capability.enabled) return capability;
    return {
      enabled: true,
      mimeType: model3DRecorderMime(globalThis.MediaRecorder) || "browser-default",
    };
  }

  async capturePlayblast({
    durationMs,
    fps = 24,
    camera,
    motionPath = [],
    poses = [],
    signal,
    onProgress = noop,
  }) {
    const capability = this.playblastCapability();
    if (!capability.enabled) {
      throw model3DRuntimeError(
        "model3d-playblast-runtime-unavailable",
        capability.reason,
      );
    }
    if (camera?.projection === "orthographic") {
      throw model3DRuntimeError(
        "model3d-orthographic-previs-unavailable",
        "The current Three workbench cannot record an orthographic director camera",
      );
    }
    const boundedDuration = Number(durationMs);
    if (
      !Number.isInteger(boundedDuration) ||
      boundedDuration < 100 ||
      boundedDuration > 120_000
    ) {
      throw model3DRuntimeError(
        "model3d-playblast-duration-unsupported",
        "Browser playblast duration must be an integer between 100ms and 120000ms",
      );
    }
    const boundedFps = Math.round(clamp(fps, 1, 60));
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (camera.depthOfFieldEnabled && !this.depthOfFieldCapability().enabled) {
      throw model3DRuntimeError(
        "model3d-dof-runtime-unavailable",
        this.depthOfFieldCapability().reason,
      );
    }

    const saved = {
      position: this.camera.position.clone(),
      quaternion: this.camera.quaternion.clone(),
      fov: this.camera.fov,
      near: this.camera.near,
      far: this.camera.far,
      target: this.orbit.target.clone(),
      orbitEnabled: this.orbit.enabled,
      depthOfField: { ...this.depthOfField },
    };
    const poseSnapshots = [];
    for (const pose of poses) {
      const object = this.objectByEditorId(pose.nodeId);
      if (!object) continue;
      poseSnapshots.push({ object, transform: transformSnapshot(object) });
      applyTransform(object, pose.transform);
    }
    this.orbit.enabled = false;
    const stream = this.canvas.captureStream(boundedFps);
    const track = stream.getVideoTracks()[0];
    if (!track) {
      stream.getTracks().forEach((entry) => entry.stop());
      throw model3DRuntimeError(
        "model3d-playblast-track-unavailable",
        "Canvas capture did not produce a video track",
      );
    }
    const mimeType = model3DRecorderMime(globalThis.MediaRecorder);
    let recorder;
    try {
      recorder = mimeType
        ? new globalThis.MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: 8_000_000,
          })
        : new globalThis.MediaRecorder(stream);
    } catch (caught) {
      stream.getTracks().forEach((entry) => entry.stop());
      throw model3DRuntimeError(
        "model3d-playblast-encoder-unavailable",
        `MediaRecorder could not initialize a canvas video encoder: ${
          caught instanceof Error ? caught.message : "unknown encoder error"
        }`,
      );
    }

    let frameCount = 0;
    let animationFrame = 0;
    const chunks = [];
    try {
      const blob = await new Promise((resolve, reject) => {
        let aborted = false;
        let settled = false;
        const cleanup = () => {
          cancelAnimationFrame(animationFrame);
          signal?.removeEventListener("abort", onAbort);
        };
        const fail = (error) => {
          if (settled) return;
          settled = true;
          cleanup();
          if (recorder.state !== "inactive") {
            try {
              recorder.stop();
            } catch {
              // Stopping a failed encoder is best effort.
            }
          }
          reject(error);
        };
        const onAbort = () => {
          aborted = true;
          cancelAnimationFrame(animationFrame);
          if (recorder.state === "inactive") {
            fail(new DOMException("Aborted", "AbortError"));
          } else {
            recorder.stop();
          }
        };
        recorder.ondataavailable = (event) => {
          if (event.data?.size) chunks.push(event.data);
        };
        recorder.onerror = (event) => {
          fail(
            model3DRuntimeError(
              "model3d-playblast-encode-failed",
              `MediaRecorder failed while encoding the playblast: ${
                event.error?.message || "unknown encoder error"
              }`,
              true,
            ),
          );
        };
        recorder.onstop = () => {
          if (settled) return;
          settled = true;
          cleanup();
          if (aborted || signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          const output = new Blob(chunks, {
            type: recorder.mimeType || mimeType || "video/webm",
          });
          if (!output.size) {
            reject(
              model3DRuntimeError(
                "model3d-playblast-empty",
                "MediaRecorder produced an empty playblast",
                true,
              ),
            );
            return;
          }
          resolve(output);
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        let startedAt = 0;
        let nextFrameAt = 0;
        const frameInterval = 1_000 / boundedFps;
        const tick = (timestamp) => {
          try {
            if (!startedAt) startedAt = timestamp;
            if (signal?.aborted) {
              onAbort();
              return;
            }
            const elapsed = Math.min(boundedDuration, timestamp - startedAt);
            if (elapsed + 0.5 >= nextFrameAt || elapsed >= boundedDuration) {
              const frame = model3DDirectorFrameAt(camera, motionPath, elapsed);
              this.applyDirectorCameraFrame(camera, frame);
              this.renderFrame(camera.depthOfFieldEnabled === true);
              track.requestFrame?.();
              frameCount += 1;
              nextFrameAt = Math.max(nextFrameAt + frameInterval, elapsed);
              onProgress(Math.min(1, elapsed / boundedDuration));
            }
            if (elapsed >= boundedDuration) {
              recorder.stop();
            } else {
              animationFrame = requestAnimationFrame(tick);
            }
          } catch (caught) {
            fail(
              caught instanceof Error
                ? caught
                : model3DRuntimeError(
                    "model3d-playblast-capture-failed",
                    "Playblast frame capture failed",
                    true,
                  ),
            );
          }
        };
        try {
          recorder.start(250);
          animationFrame = requestAnimationFrame(tick);
        } catch (caught) {
          fail(
            model3DRuntimeError(
              "model3d-playblast-encode-failed",
              `MediaRecorder could not start: ${
                caught instanceof Error ? caught.message : "unknown encoder error"
              }`,
            ),
          );
        }
      });
      return {
        blob,
        durationMs: boundedDuration,
        fps: boundedFps,
        frameCount,
        mimeType: blob.type || mimeType || "video/webm",
        width: Math.max(1, this.canvas.width || this.canvas.clientWidth || 1),
        height: Math.max(1, this.canvas.height || this.canvas.clientHeight || 1),
      };
    } finally {
      stream.getTracks().forEach((entry) => entry.stop());
      for (const entry of poseSnapshots) {
        applyTransform(entry.object, entry.transform);
      }
      this.camera.position.copy(saved.position);
      this.camera.quaternion.copy(saved.quaternion);
      this.camera.fov = saved.fov;
      this.camera.near = saved.near;
      this.camera.far = saved.far;
      this.camera.updateProjectionMatrix();
      this.orbit.target.copy(saved.target);
      this.orbit.enabled = saved.orbitEnabled;
      try {
        this.setDepthOfField(saved.depthOfField);
      } catch {
        this.depthOfField.enabled = false;
      }
      this.renderFrame();
    }
  }

  async loadUrl(url, onProgress) {
    const generation = ++this.loadGeneration;
    const gltf = await loadModel3DUrl(url, onProgress);
    if (generation !== this.loadGeneration || this.disposed) {
      disposeModel3DObject(gltf.scene);
      return;
    }
    this.installGltf(gltf);
  }

  async loadArrayBuffer(source) {
    const generation = ++this.loadGeneration;
    const gltf = await parseModel3DGlb(source);
    if (generation !== this.loadGeneration || this.disposed) {
      disposeModel3DObject(gltf.scene);
      return;
    }
    this.installGltf(gltf);
  }

  cancelLoad() {
    this.loadGeneration += 1;
  }

  clear() {
    this.cancelLoad();
    this.cancelGesture();
    this.transform.detach();
    if (this.contentScene) {
      this.renderScene.remove(this.contentScene);
      disposeModel3DObject(this.contentScene);
    }
    this.contentScene = null;
    this.animations = [];
    this.mixer = null;
    this.action = null;
    this.animationName = "";
    this.animationPlaying = false;
    this.animationTime = 0;
    this.selected = null;
    this.objectRegistry.clear();
    this.checkpointTextures.clear();
    this.operationJournal = [];
    this.history.clear();
    this.emitSnapshot();
  }

  installGltf(gltf) {
    this.cancelGesture();
    this.transform.detach();
    if (this.contentScene) {
      this.renderScene.remove(this.contentScene);
      disposeModel3DObject(this.contentScene);
    }
    this.contentScene = gltf.scene;
    this.contentScene.name ||= "Scene";
    this.operationJournal = [];
    this.indexCheckpointScene();
    this.animations = [...(gltf.animations || [])];
    this.renderScene.add(this.contentScene);
    this.contentScene.traverse((node) => {
      if (typeof node.userData?.oceanleoVisible === "boolean") {
        node.visible = node.userData.oceanleoVisible;
      }
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
      if (node.isDirectionalLight || node.isPointLight || node.isSpotLight) {
        node.castShadow = this.view.shadowEnabled;
        if (node.shadow) {
          node.shadow.intensity = this.view.shadowIntensity;
          node.shadow.radius = this.view.shadowSoftness * 8;
        }
      }
    });
    this.mixer = this.animations.length
      ? new THREE.AnimationMixer(this.contentScene)
      : null;
    this.selected = null;
    this.selectedMaterialIndex = 0;
    this.history.clear();
    this.frameModel();
    const requested = this.animations.some(
      (clip) => clip.name === this.animationName,
    )
      ? this.animationName
      : "";
    this.selectAnimation(requested, false);
    this.emitSnapshot();
  }

  indexCheckpointScene() {
    this.objectRegistry.clear();
    this.checkpointTextures.clear();
    if (!this.contentScene) return;
    const used = new Set();
    this.contentScene.traverse((node) => {
      const path = objectPath(node, this.contentScene);
      const baseId = node === this.contentScene ? "root" : `base:${path}`;
      let id = String(node.userData?.oceanleoEditorId || baseId);
      let suffix = 1;
      while (used.has(id)) id = `${baseId}:${suffix++}`;
      used.add(id);
      node.userData.oceanleoEditorId = id;
      this.objectRegistry.set(id, node);
      for (const entry of editablePbrMaterials(node)) {
        for (const [slot, properties] of Object.entries(TEXTURE_SLOTS)) {
          this.checkpointTextures.set(
            `${id}:${entry.index}:${slot}`,
            entry.material[properties[0]] || null,
          );
        }
      }
    });
  }

  editorId(object) {
    return String(object?.userData?.oceanleoEditorId || "");
  }

  objectByEditorId(id) {
    return this.objectRegistry.get(String(id || "")) || null;
  }

  createOperation(kind, target, fields = {}) {
    return normalizeModel3DOperation({
      id: uniqueId("model3d-operation"),
      kind,
      target: this.editorId(target) || String(target || ""),
      ...fields,
    });
  }

  appendOperation(operation) {
    if (this.replayingOperations || !operation) return;
    const normalized = normalizeModel3DOperation(operation);
    if (!normalized) return;
    this.operationJournal.push(normalized);
  }

  getOperationJournal() {
    return normalizeModel3DOperationJournal(this.operationJournal);
  }

  commitCheckpoint(coveredOperationIds = []) {
    const covered = new Set(coveredOperationIds);
    this.operationJournal = this.operationJournal.filter(
      (operation) => !covered.has(operation.id),
    );
    if (!this.operationJournal.length) this.indexCheckpointScene();
    this.emitSnapshot();
  }

  async applyOperationJournal(value) {
    const journal = normalizeModel3DOperationJournal(value);
    this.replayingOperations = true;
    try {
      for (const operation of journal) {
        await this.applyOperation(operation);
      }
    } finally {
      this.replayingOperations = false;
    }
    this.operationJournal = journal;
    this.history.clear();
    this.emitSnapshot();
    return journal.length;
  }

  async applyOperation(operation) {
    const object = this.objectByEditorId(operation.target);
    if (operation.kind === "transform") {
      if (object) applyTransform(object, operation.value);
      return;
    }
    if (operation.kind === "material") {
      const entry = editablePbrMaterials(object).find(
        (candidate) => candidate.index === operation.materialIndex,
      );
      if (!entry) return;
      const material = entry.material.clone();
      applyPbr(material, operation.value);
      replaceMeshMaterial(object, entry.index, material);
      return;
    }
    if (operation.kind === "texture") {
      const entry = editablePbrMaterials(object).find(
        (candidate) => candidate.index === operation.materialIndex,
      );
      const properties = TEXTURE_SLOTS[operation.slot];
      if (!entry || !properties) return;
      let texture = null;
      if (operation.value === "checkpoint") {
        texture = this.checkpointTextures.get(
          `${operation.target}:${operation.materialIndex}:${operation.slot}`,
        ) || null;
      } else if (operation.value) {
        texture = await new THREE.TextureLoader().loadAsync(
          this.options.resolveAssetUrl(operation.value),
        );
        texture.flipY = false;
        texture.colorSpace =
          operation.slot === "baseColor" || operation.slot === "emissive"
            ? THREE.SRGBColorSpace
            : THREE.NoColorSpace;
        texture.userData.oceanleoSourceUrl = operation.value;
      }
      const material = entry.material.clone();
      for (const property of properties) material[property] = texture;
      material.needsUpdate = true;
      replaceMeshMaterial(object, entry.index, material);
      return;
    }
    if (operation.kind === "camera") {
      if (object?.isCamera) applyCamera(object, operation.value);
      return;
    }
    if (operation.kind === "light") {
      if (object?.isLight) applyLight(object, operation.value);
      return;
    }
    if (operation.kind === "visibility") {
      applyVisibility(object, operation.visible);
      return;
    }
    if (operation.kind === "presence") {
      let target = object;
      if (!target && operation.object) {
        target = this.createObjectFromSpec(operation.object, operation.target);
      }
      if (!target) return;
      const parent = this.objectByEditorId(operation.parent) || this.contentScene;
      if (operation.present && parent) {
        parent.add(target);
        const current = parent.children.indexOf(target);
        parent.children.splice(current, 1);
        parent.children.splice(
          Math.min(operation.index, parent.children.length),
          0,
          target,
        );
        target.parent = parent;
      } else {
        target.parent?.remove(target);
      }
    }
  }

  createObjectFromSpec(spec, id) {
    let object;
    if (spec.kind === "camera") {
      object = new THREE.PerspectiveCamera();
      applyCamera(object, spec.camera);
    } else if (spec.kind === "directional") {
      object = new THREE.DirectionalLight();
      applyLight(object, spec.light);
    } else if (spec.kind === "spot") {
      object = new THREE.SpotLight();
      applyLight(object, spec.light);
    } else {
      object = new THREE.PointLight();
      applyLight(object, spec.light);
    }
    object.name = spec.name;
    object.userData.oceanleoEditorId = id;
    applyTransform(object, spec.transform);
    this.objectRegistry.set(id, object);
    return object;
  }

  objectSpec(object) {
    const kind = object.isCamera
      ? "camera"
      : object.isDirectionalLight
        ? "directional"
        : object.isSpotLight
          ? "spot"
          : "point";
    return {
      kind,
      name: object.name,
      transform: transformSnapshot(object),
      ...(object.isCamera ? { camera: cameraSnapshot(object) } : {}),
      ...(object.isLight ? { light: lightSnapshot(object) } : {}),
    };
  }

  async exportGlb() {
    if (!this.contentScene) throw new Error("3D 模型尚未加载完成");
    const animationState = this.suspendAnimationForAuthoring();
    try {
      return await exportModel3DGlb(this.contentScene, this.animations);
    } finally {
      this.resumeAnimationAfterAuthoring(animationState);
    }
  }

  async capturePng() {
    this.renderFrame(this.depthOfField.enabled);
    const blob = await new Promise((resolve) =>
      this.canvas.toBlob(resolve, "image/png", 1),
    );
    if (!blob?.size) throw new Error("3D 截图为空");
    return blob;
  }

  setSelectedNode(id) {
    this.cancelGesture();
    const next = id && this.contentScene
      ? this.contentScene.getObjectByProperty("uuid", id)
      : null;
    this.selected = next && next !== this.contentScene ? next : null;
    this.selectedMaterialIndex =
      editablePbrMaterials(this.selected)[0]?.index ?? 0;
    if (this.selected) this.transform.attach(this.selected);
    else this.transform.detach();
    this.emitSnapshot();
  }

  setTransformMode(mode) {
    if (!["translate", "rotate", "scale"].includes(mode)) return;
    this.transformMode = mode;
    this.transform.setMode(mode);
    this.emitSnapshot();
  }

  beginGesture(controlId) {
    if (this.editGesture) return false;
    if (
      /^(?:azimuth|elevation|zoom|exposure|environment-(?:url|intensity)|shadow-(?:intensity|softness)|background)$/.test(
        controlId,
      )
    ) {
      this.editGesture = {
        kind: "view",
        before: { ...this.view },
      };
      return true;
    }
    if (/^animation-(?:time|speed)$/.test(controlId)) {
      this.editGesture = {
        kind: "animation",
        before: {
          name: this.animationName,
          playing: this.animationPlaying,
          speed: this.animationSpeed,
          time: this.animationTime,
        },
      };
      return true;
    }
    if (!this.selected) return false;
    const object = this.selected;
    if (/^(?:position|rotation|scale)-|^transform-control$/.test(controlId)) {
      this.editGesture = {
        kind: "transform",
        object,
        before: transformSnapshot(object),
        animationState: this.suspendAnimationForAuthoring(),
      };
      return true;
    }
    if (/^material-(?:color|metallic|roughness)$/.test(controlId)) {
      const entry = editablePbrMaterials(object).find(
        (candidate) => candidate.index === this.selectedMaterialIndex,
      );
      if (!entry) return false;
      this.editGesture = {
        kind: "material",
        object,
        index: entry.index,
        before: entry.material,
        beforeValue: pbrSnapshot(entry.material),
        preview: null,
      };
      return true;
    }
    if (/^camera-/.test(controlId) && object.isCamera) {
      this.editGesture = {
        kind: "camera",
        object,
        before: cameraSnapshot(object),
      };
      return true;
    }
    if (/^light-/.test(controlId) && object.isLight) {
      this.editGesture = {
        kind: "light",
        object,
        before: lightSnapshot(object),
      };
      return true;
    }
    return false;
  }

  commitGesture() {
    const gesture = this.editGesture;
    if (!gesture) return false;
    this.editGesture = null;
    if (gesture.kind === "transform") {
      const after = transformSnapshot(gesture.object);
      this.resumeAnimationAfterAuthoring(gesture.animationState);
      if (sameTransform(gesture.before, after)) return false;
      this.history.record(
        "变换对象",
        () => {
          this.applyAuthoredTransform(gesture.object, gesture.before);
          this.pendingHistoryOperation = this.createOperation(
            "transform",
            gesture.object,
            { value: gesture.before },
          );
          this.emitSnapshot();
        },
        () => {
          this.applyAuthoredTransform(gesture.object, after);
          this.pendingHistoryOperation = this.createOperation(
            "transform",
            gesture.object,
            { value: after },
          );
          this.emitSnapshot();
        },
      );
      this.pendingHistoryOperation = this.createOperation(
        "transform",
        gesture.object,
        { value: after },
      );
    } else if (gesture.kind === "material") {
      const after = gesture.preview || gesture.before;
      if (sameValue(gesture.beforeValue, pbrSnapshot(after))) {
        replaceMeshMaterial(gesture.object, gesture.index, gesture.before);
        this.emitSnapshot();
        return false;
      }
      this.history.record(
        "编辑 PBR 材质",
        () => {
          replaceMeshMaterial(gesture.object, gesture.index, gesture.before);
          this.pendingHistoryOperation = this.createOperation(
            "material",
            gesture.object,
            { materialIndex: gesture.index, value: gesture.beforeValue },
          );
          this.emitSnapshot();
        },
        () => {
          replaceMeshMaterial(gesture.object, gesture.index, after);
          this.pendingHistoryOperation = this.createOperation(
            "material",
            gesture.object,
            {
              materialIndex: gesture.index,
              value: pbrSnapshot(after),
            },
          );
          this.emitSnapshot();
        },
      );
      this.pendingHistoryOperation = this.createOperation(
        "material",
        gesture.object,
        { materialIndex: gesture.index, value: pbrSnapshot(after) },
      );
    } else if (gesture.kind === "camera") {
      const after = cameraSnapshot(gesture.object);
      if (sameValue(gesture.before, after)) return false;
      this.history.record(
        "编辑模型相机",
        () => {
          applyCamera(gesture.object, gesture.before);
          this.pendingHistoryOperation = this.createOperation(
            "camera",
            gesture.object,
            { value: gesture.before },
          );
          this.emitSnapshot();
        },
        () => {
          applyCamera(gesture.object, after);
          this.pendingHistoryOperation = this.createOperation(
            "camera",
            gesture.object,
            { value: after },
          );
          this.emitSnapshot();
        },
      );
      this.pendingHistoryOperation = this.createOperation(
        "camera",
        gesture.object,
        { value: after },
      );
    } else if (gesture.kind === "light") {
      const after = lightSnapshot(gesture.object);
      if (sameValue(gesture.before, after)) return false;
      this.history.record(
        "编辑模型灯光",
        () => {
          applyLight(gesture.object, gesture.before);
          this.pendingHistoryOperation = this.createOperation(
            "light",
            gesture.object,
            { value: gesture.before },
          );
          this.emitSnapshot();
        },
        () => {
          applyLight(gesture.object, after);
          this.pendingHistoryOperation = this.createOperation(
            "light",
            gesture.object,
            { value: after },
          );
          this.emitSnapshot();
        },
      );
      this.pendingHistoryOperation = this.createOperation(
        "light",
        gesture.object,
        { value: after },
      );
    } else if (gesture.kind === "view") {
      if (sameValue(gesture.before, this.view)) return false;
      this.options.onViewCommit({ ...this.view });
      return true;
    } else if (gesture.kind === "animation") {
      const after = {
        name: this.animationName,
        playing: this.animationPlaying,
        speed: this.animationSpeed,
        time: this.animationTime,
      };
      if (sameValue(gesture.before, after)) return false;
      this.options.onViewCommit({ ...this.view });
      return true;
    }
    this.sceneEdited(this.pendingHistoryOperation);
    this.pendingHistoryOperation = null;
    return true;
  }

  cancelGesture() {
    const gesture = this.editGesture;
    if (!gesture) return false;
    this.editGesture = null;
    if (gesture.kind === "transform") {
      applyTransform(gesture.object, gesture.before);
      this.resumeAnimationAfterAuthoring(gesture.animationState);
    } else if (gesture.kind === "material") {
      replaceMeshMaterial(gesture.object, gesture.index, gesture.before);
    } else if (gesture.kind === "camera") {
      applyCamera(gesture.object, gesture.before);
    } else if (gesture.kind === "light") {
      applyLight(gesture.object, gesture.before);
    } else if (gesture.kind === "view") {
      this.setView(gesture.before, { emit: false });
      this.options.onViewChange({ ...this.view });
    } else if (gesture.kind === "animation") {
      this.selectAnimation(gesture.before.name, false);
      this.setAnimationSpeed(gesture.before.speed);
      this.setAnimationTime(gesture.before.time);
      this.setAnimationPlaying(gesture.before.playing);
    }
    this.emitSnapshot();
    return true;
  }

  get gestureActive() {
    return Boolean(this.editGesture);
  }

  patchSelectedTransform(patch) {
    if (!this.selected) return;
    if (this.editGesture?.kind === "transform") {
      const current = transformSnapshot(this.editGesture.object);
      applyTransform(this.editGesture.object, {
        position: patch.position || current.position,
        rotation: patch.rotation || current.rotation,
        scale: patch.scale || current.scale,
      });
      this.emitSnapshot();
      return;
    }
    if (this.beginGesture("transform-control")) {
      this.patchSelectedTransform(patch);
      this.commitGesture();
    }
  }

  suspendAnimationForAuthoring() {
    const clip = this.currentClip();
    if (!clip || !this.action || !this.mixer) return null;
    const state = {
      clip,
      root: this.contentScene,
      name: this.animationName,
      time: this.animationTime,
      playing: this.animationPlaying,
    };
    this.action.stop();
    return state;
  }

  resumeAnimationAfterAuthoring(state) {
    if (
      !state ||
      !this.mixer ||
      state.root !== this.contentScene ||
      state.name !== this.animationName
    ) {
      return;
    }
    this.action = this.mixer.clipAction(state.clip);
    this.action.reset().play();
    this.action.paused = !state.playing;
    this.action.time = clamp(state.time, 0, state.clip.duration || 0);
    this.animationTime = this.action.time;
    this.mixer.update(0);
  }

  applyAuthoredTransform(object, snapshot) {
    const animationState = this.suspendAnimationForAuthoring();
    applyTransform(object, snapshot);
    this.resumeAnimationAfterAuthoring(animationState);
  }

  selectMaterialSlot(index) {
    this.cancelGesture();
    if (
      editablePbrMaterials(this.selected).some((entry) => entry.index === index)
    ) {
      this.selectedMaterialIndex = index;
      this.emitSnapshot();
    }
  }

  patchSelectedMaterial(patch) {
    if (this.editGesture?.kind === "material") {
      const gesture = this.editGesture;
      if (!gesture.preview) {
        gesture.preview = gesture.before.clone();
        replaceMeshMaterial(gesture.object, gesture.index, gesture.preview);
      }
      const value = pbrSnapshot(gesture.preview);
      applyPbr(gesture.preview, {
        color: patch.color || value.color,
        metalness: patch.metalness ?? value.metalness,
        roughness: patch.roughness ?? value.roughness,
      });
      this.emitSnapshot();
      return;
    }
    const entry = editablePbrMaterials(this.selected).find(
      (candidate) => candidate.index === this.selectedMaterialIndex,
    );
    if (!entry) return;
    if (this.beginGesture("material-color")) {
      this.patchSelectedMaterial(patch);
      this.commitGesture();
    }
  }

  async replaceSelectedTexture(slot, url) {
    const properties = TEXTURE_SLOTS[slot];
    const entry = editablePbrMaterials(this.selected).find(
      (candidate) => candidate.index === this.selectedMaterialIndex,
    );
    if (!properties || !entry || !url) return;
    const texture = await new THREE.TextureLoader().loadAsync(
      this.options.resolveAssetUrl(url),
    );
    texture.flipY = false;
    texture.colorSpace =
      slot === "baseColor" || slot === "emissive"
        ? THREE.SRGBColorSpace
        : THREE.NoColorSpace;
    texture.userData.oceanleoSourceUrl = url;
    const object = this.selected;
    const before = entry.material;
    const beforeTexture = before[properties[0]] || null;
    const beforeValue = beforeTexture
      ? textureSource(beforeTexture) === "embedded"
        ? "checkpoint"
        : textureSource(beforeTexture)
      : null;
    const after = before.clone();
    for (const property of properties) after[property] = texture;
    after.needsUpdate = true;
    this.history.execute(
      "替换材质纹理",
      () => {
        replaceMeshMaterial(object, entry.index, after);
        this.pendingHistoryOperation = this.createOperation("texture", object, {
          materialIndex: entry.index,
          slot,
          value: url,
          requiresCheckpoint: true,
        });
      },
      () => {
        replaceMeshMaterial(object, entry.index, before);
        this.pendingHistoryOperation = this.createOperation("texture", object, {
          materialIndex: entry.index,
          slot,
          value: beforeValue,
          requiresCheckpoint: true,
        });
      },
    );
    this.sceneEdited(this.pendingHistoryOperation);
    this.pendingHistoryOperation = null;
  }

  clearSelectedTexture(slot) {
    const properties = TEXTURE_SLOTS[slot];
    const entry = editablePbrMaterials(this.selected).find(
      (candidate) => candidate.index === this.selectedMaterialIndex,
    );
    if (!properties || !entry) return;
    const object = this.selected;
    const before = entry.material;
    const beforeTexture = before[properties[0]] || null;
    const beforeValue = beforeTexture
      ? textureSource(beforeTexture) === "embedded"
        ? "checkpoint"
        : textureSource(beforeTexture)
      : null;
    const after = before.clone();
    for (const property of properties) after[property] = null;
    after.needsUpdate = true;
    this.history.execute(
      "移除材质纹理",
      () => {
        replaceMeshMaterial(object, entry.index, after);
        this.pendingHistoryOperation = this.createOperation("texture", object, {
          materialIndex: entry.index,
          slot,
          value: null,
          requiresCheckpoint: true,
        });
      },
      () => {
        replaceMeshMaterial(object, entry.index, before);
        this.pendingHistoryOperation = this.createOperation("texture", object, {
          materialIndex: entry.index,
          slot,
          value: beforeValue,
          requiresCheckpoint: true,
        });
      },
    );
    this.sceneEdited(this.pendingHistoryOperation);
    this.pendingHistoryOperation = null;
  }

  patchSelectedCamera(patch) {
    const camera = this.selected;
    if (!camera?.isCamera) return;
    if (this.editGesture?.kind === "camera") {
      applyCamera(camera, { ...cameraSnapshot(camera), ...patch });
      this.emitSnapshot();
      return;
    }
    if (this.beginGesture("camera-fov")) {
      this.patchSelectedCamera(patch);
      this.commitGesture();
    }
  }

  patchSelectedLight(patch) {
    const light = this.selected;
    if (!light?.isLight) return;
    if (this.editGesture?.kind === "light") {
      applyLight(light, { ...lightSnapshot(light), ...patch });
      this.emitSnapshot();
      return;
    }
    if (this.beginGesture("light-intensity")) {
      this.patchSelectedLight(patch);
      this.commitGesture();
    }
  }

  addCamera() {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1_000);
    camera.name = `Camera ${this.cameraCount() + 1}`;
    camera.position.copy(this.camera.position);
    camera.quaternion.copy(this.camera.quaternion);
    this.addAuthoredObject(camera, "添加模型相机");
  }

  addLight(kind) {
    let light;
    if (kind === "directional") light = new THREE.DirectionalLight(0xffffff, 3);
    else if (kind === "spot") light = new THREE.SpotLight(0xffffff, 10, 0, Math.PI / 4, 0.2, 2);
    else light = new THREE.PointLight(0xffffff, 10, 0, 2);
    light.name = `${light.type} ${this.lightCount() + 1}`;
    light.position.set(2, 3, 2);
    light.castShadow = this.view.shadowEnabled;
    this.addAuthoredObject(light, "添加模型灯光");
  }

  addAuthoredObject(object, label) {
    if (!this.contentScene) return;
    const parent = this.contentScene;
    const id = `added:${uniqueId("object")}`;
    object.userData.oceanleoEditorId = id;
    this.objectRegistry.set(id, object);
    const index = parent.children.length;
    const spec = this.objectSpec(object);
    this.history.execute(
      label,
      () => {
        parent.add(object);
        this.setSelectedNode(object.uuid);
        this.pendingHistoryOperation = this.createOperation("presence", object, {
          parent: this.editorId(parent),
          index,
          present: true,
          object: spec,
        });
      },
      () => {
        if (this.selected === object) this.setSelectedNode("");
        parent.remove(object);
        this.pendingHistoryOperation = this.createOperation("presence", object, {
          parent: this.editorId(parent),
          index,
          present: false,
        });
      },
    );
    this.sceneEdited(this.pendingHistoryOperation);
    this.pendingHistoryOperation = null;
  }

  deleteSelected() {
    const object = this.selected;
    const parent = object?.parent;
    if (!object || !parent || object === this.contentScene) return;
    const index = parent.children.indexOf(object);
    const parentId = this.editorId(parent);
    this.history.execute(
      "删除场景节点",
      () => {
        this.setSelectedNode("");
        parent.remove(object);
        this.pendingHistoryOperation = this.createOperation("presence", object, {
          parent: parentId,
          index,
          present: false,
        });
      },
      () => {
        parent.add(object);
        const current = parent.children.indexOf(object);
        parent.children.splice(current, 1);
        parent.children.splice(index, 0, object);
        object.parent = parent;
        this.setSelectedNode(object.uuid);
        this.pendingHistoryOperation = this.createOperation("presence", object, {
          parent: parentId,
          index,
          present: true,
        });
      },
    );
    this.sceneEdited(this.pendingHistoryOperation);
    this.pendingHistoryOperation = null;
  }

  setNodeVisible(visible) {
    const object = this.selected;
    if (!object || object.visible === visible) return;
    const before = object.visible;
    this.history.execute(
      visible ? "显示节点" : "隐藏节点",
      () => {
        applyVisibility(object, visible);
        this.pendingHistoryOperation = this.createOperation(
          "visibility",
          object,
          { visible },
        );
      },
      () => {
        applyVisibility(object, before);
        this.pendingHistoryOperation = this.createOperation(
          "visibility",
          object,
          { visible: before },
        );
      },
    );
    this.sceneEdited(this.pendingHistoryOperation);
    this.pendingHistoryOperation = null;
  }

  undo() {
    this.pendingHistoryOperation = null;
    if (this.history.undo()) {
      this.sceneEdited(this.pendingHistoryOperation);
      this.pendingHistoryOperation = null;
      return true;
    }
    return false;
  }

  redo() {
    this.pendingHistoryOperation = null;
    if (this.history.redo()) {
      this.sceneEdited(this.pendingHistoryOperation);
      this.pendingHistoryOperation = null;
      return true;
    }
    return false;
  }

  selectAnimation(name, commit = true) {
    this.action?.stop();
    this.animationName = this.animations.some((clip) => clip.name === name)
      ? name
      : "";
    this.animationTime = 0;
    this.action = this.animationName && this.mixer
      ? this.mixer.clipAction(
          this.animations.find((clip) => clip.name === this.animationName),
        )
      : null;
    if (this.action) {
      this.action.reset().play();
      this.action.paused = !this.animationPlaying;
    }
    this.emitSnapshot();
    if (commit) this.options.onViewCommit({ ...this.view });
  }

  setAnimationPlaying(playing) {
    this.animationPlaying = Boolean(playing && this.action);
    if (this.action) this.action.paused = !this.animationPlaying;
    this.emitSnapshot();
  }

  setAnimationSpeed(speed) {
    this.animationSpeed = clamp(speed, 0.1, 4);
    this.emitSnapshot();
  }

  setAnimationTime(time) {
    const duration = this.currentClip()?.duration || 0;
    this.animationTime = clamp(time, 0, duration);
    if (this.action) this.action.time = this.animationTime;
    this.mixer?.update(0);
    this.emitSnapshot();
  }

  setView(patch, { emit = true } = {}) {
    this.view = { ...this.view, ...patch };
    this.renderer.toneMappingExposure = clamp(this.view.exposure, 0.1, 4);
    this.renderScene.background = new THREE.Color(this.view.background);
    this.renderScene.environmentIntensity = clamp(
      this.view.environmentIntensity,
      0,
      5,
    );
    this.orbit.autoRotate = Boolean(this.view.autoRotate);
    this.applyShadows();
    this.applyOrbit();
    if (patch.environmentUrl !== undefined) {
      void this.loadEnvironment(this.view.environmentUrl);
    }
    if (emit) this.emitSnapshot();
  }

  async loadEnvironment(url) {
    const generation = ++this.environmentGeneration;
    const normalized = String(url || "").trim();
    try {
      let texture = null;
      if (normalized) {
        const resolved = this.options.resolveAssetUrl(normalized);
        texture = /\.hdr(?:$|[?#])/i.test(normalized)
          ? await new RGBELoader().loadAsync(resolved)
          : await new THREE.TextureLoader().loadAsync(resolved);
        texture.mapping = THREE.EquirectangularReflectionMapping;
      }
      if (generation !== this.environmentGeneration || this.disposed) {
        texture?.dispose();
        return;
      }
      this.environmentTexture?.dispose();
      this.environmentTexture = texture;
      this.renderScene.environment = texture;
      this.renderScene.environmentIntensity = clamp(
        this.view.environmentIntensity,
        0,
        5,
      );
    } catch (error) {
      if (generation === this.environmentGeneration) {
        this.options.onError(
          error instanceof Error ? error.message : "环境图加载失败",
        );
      }
    }
  }

  armAnnotationPlacement(armed = true) {
    this.annotationPlacementArmed = Boolean(armed);
    this.canvas.style.cursor = armed ? "crosshair" : "";
    this.emitSnapshot();
  }

  setAnnotations(annotations) {
    this.annotations = Array.isArray(annotations) ? annotations : [];
    for (const child of [...this.annotationGroup.children]) {
      this.annotationGroup.remove(child);
      child.geometry?.dispose();
      child.material?.dispose();
    }
    for (const annotation of this.annotations) {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(this.baseDistance * 0.008, 0.015), 12, 8),
        new THREE.MeshBasicMaterial({
          color: 0x7c3aed,
          depthTest: false,
          transparent: true,
          opacity: 0.95,
        }),
      );
      marker.position.set(annotation.x, annotation.y, annotation.z);
      marker.renderOrder = 10_000;
      marker.userData.oceanleoEditorHelper = true;
      marker.userData.annotationId = annotation.id;
      this.annotationGroup.add(marker);
    }
    this.emitAnnotationFrame(performance.now());
  }

  applyLegacyMaterialOverrides(overrides) {
    if (!this.contentScene || !Array.isArray(overrides) || !overrides.length) {
      return;
    }
    const materials = [];
    const seen = new Set();
    this.contentScene.traverse((node) => {
      for (const entry of editablePbrMaterials(node)) {
        if (!seen.has(entry.material)) {
          seen.add(entry.material);
          materials.push(entry.material);
        }
      }
    });
    for (const override of overrides) {
      const material = materials[override.index];
      if (!material) continue;
      material.color.set(override.color);
      material.metalness = clamp(override.metallic, 0, 1);
      material.roughness = clamp(override.roughness, 0, 1);
      material.needsUpdate = true;
    }
    this.emitSnapshot();
  }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth || 1);
    const height = Math.max(1, this.canvas.clientHeight || 1);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.composer?.setPixelRatio(pixelRatio);
    this.composer?.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    this.cancelLoad();
    cancelAnimationFrame(this.frameRequest);
    this.resizeObserver?.disconnect();
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.transform.detach();
    this.transform.dispose();
    this.orbit.dispose();
    this.bokehPass?.dispose?.();
    this.renderPass?.dispose?.();
    this.composer?.dispose?.();
    this.environmentTexture?.dispose();
    if (this.contentScene) disposeModel3DObject(this.contentScene);
    this.renderer.dispose();
  }

  sceneEdited(operation = null) {
    this.appendOperation(operation);
    this.emitSnapshot();
    this.options.onSceneEdited(operation);
  }

  emitSnapshot() {
    const clip = this.currentClip();
    const operationJournal = this.getOperationJournal();
    this.options.onSnapshot({
      loaded: Boolean(this.contentScene),
      nodes: sceneTreeSnapshot(this.contentScene),
      selection: selectionSnapshot(
        this.selected,
        this.contentScene,
        this.selectedMaterialIndex,
      ),
      transformAttached:
        Boolean(this.selected) && this.transform.object === this.selected,
      transformMode: this.transformMode,
      animations: this.animations.map((entry) => ({
        name: entry.name,
        duration: entry.duration,
      })),
      animationName: this.animationName,
      animationPlaying: this.animationPlaying,
      animationSpeed: this.animationSpeed,
      animationTime: this.animationTime,
      animationDuration: clip?.duration || 0,
      annotationPlacementArmed: this.annotationPlacementArmed,
      history: this.history.snapshot,
      operationJournal,
      operationCount: operationJournal.length,
      operationBytes: model3DJournalByteLength(operationJournal),
      view: { ...this.view },
    });
  }

  animate = () => {
    if (this.disposed) return;
    this.frameRequest = requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.1);
    this.orbit.update(delta);
    if (this.animationPlaying && this.mixer) {
      this.mixer.update(delta * this.animationSpeed);
      this.animationTime = this.action?.time || 0;
      const now = performance.now();
      if (now - this.lastAnimationAt > 100) {
        this.lastAnimationAt = now;
        this.emitSnapshot();
      }
    }
    const now = performance.now();
    if (this.annotations.length && now - this.lastOverlayAt > 100) {
      this.emitAnnotationFrame(now);
    }
    this.renderFrame();
  };

  handlePointerUp(event) {
    const start = this.pointerStart;
    this.pointerStart = null;
    if (
      !start ||
      this.transformDragging ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5
    ) {
      return;
    }
    const hit = this.pick(event);
    if (this.annotationPlacementArmed) {
      if (!hit) return;
      const normal = hit.face?.normal
        ?.clone()
        .transformDirection(hit.object.matrixWorld)
        .normalize() || new THREE.Vector3(0, 1, 0);
      this.annotationPlacementArmed = false;
      this.canvas.style.cursor = "";
      this.options.onAnnotationPoint({
        position: vectorArray(hit.point),
        normal: vectorArray(normal),
        nodePath: objectPath(hit.object, this.contentScene),
      });
      this.emitSnapshot();
      return;
    }
    this.setSelectedNode(hit?.object?.uuid || "");
  }

  pick(event) {
    if (!this.contentScene) return null;
    const bounds = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return (
      this.raycaster
        .intersectObject(this.contentScene, true)
        .find(
          (entry) =>
            entry.object.isMesh &&
            entry.object.visible &&
            !entry.object.userData?.oceanleoEditorHelper,
        ) || null
    );
  }

  handleOrbitChange() {
    const offset = this.camera.position.clone().sub(this.orbit.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    this.view = {
      ...this.view,
      azimuth: degrees(spherical.theta),
      elevation: degrees(spherical.phi),
      zoom: (spherical.radius / Math.max(this.baseDistance, 0.0001)) * 100,
    };
    this.options.onViewChange({ ...this.view });
  }

  applyOrbit() {
    const radius = this.baseDistance * clamp(this.view.zoom, 20, 500) / 100;
    const spherical = new THREE.Spherical(
      radius,
      radians(clamp(this.view.elevation, 1, 179)),
      radians(this.view.azimuth),
    );
    this.camera.position.copy(this.orbit.target).add(
      new THREE.Vector3().setFromSpherical(spherical),
    );
    this.camera.lookAt(this.orbit.target);
    this.orbit.update();
  }

  frameModel() {
    if (!this.contentScene) return;
    const box = new THREE.Box3().setFromObject(this.contentScene);
    const center = box.isEmpty()
      ? new THREE.Vector3()
      : box.getCenter(new THREE.Vector3());
    const sphere = box.isEmpty()
      ? new THREE.Sphere(center, 1)
      : box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 0.1);
    this.baseDistance =
      (radius / Math.tan(radians(this.camera.fov / 2))) * 1.35;
    this.camera.near = Math.max(radius / 1_000, 0.001);
    this.camera.far = Math.max(radius * 1_000, 1_000);
    this.camera.updateProjectionMatrix();
    this.orbit.target.copy(center);
    this.grid.position.y = box.isEmpty() ? 0 : box.min.y;
    this.grid.scale.setScalar(Math.max(radius / 10, 0.1));
    this.applyOrbit();
  }

  applyShadows() {
    this.renderer.shadowMap.enabled = Boolean(this.view.shadowEnabled);
    this.viewerKey.castShadow = Boolean(this.view.shadowEnabled);
    this.viewerKey.shadow.intensity = clamp(this.view.shadowIntensity, 0, 2);
    this.viewerKey.shadow.radius = clamp(this.view.shadowSoftness, 0, 1) * 8;
    this.contentScene?.traverse((node) => {
      if (node.isDirectionalLight || node.isPointLight || node.isSpotLight) {
        node.castShadow = Boolean(this.view.shadowEnabled);
        if (node.shadow) {
          node.shadow.intensity = clamp(this.view.shadowIntensity, 0, 2);
          node.shadow.radius = clamp(this.view.shadowSoftness, 0, 1) * 8;
        }
      }
    });
  }

  emitAnnotationFrame(now) {
    this.lastOverlayAt = now;
    const bounds = this.canvas.getBoundingClientRect();
    const entries = this.annotations.map((annotation) => {
      const projected = new THREE.Vector3(
        annotation.x,
        annotation.y,
        annotation.z,
      ).project(this.camera);
      return {
        id: annotation.id,
        x: ((projected.x + 1) / 2) * bounds.width,
        y: ((1 - projected.y) / 2) * bounds.height,
        visible: projected.z >= -1 && projected.z <= 1,
      };
    });
    this.options.onAnnotationFrame(entries);
  }

  currentClip() {
    return this.animations.find((clip) => clip.name === this.animationName);
  }

  cameraCount() {
    let count = 0;
    this.contentScene?.traverse((node) => {
      if (node.isCamera) count += 1;
    });
    return count;
  }

  lightCount() {
    let count = 0;
    this.contentScene?.traverse((node) => {
      if (node.isLight) count += 1;
    });
    return count;
  }
}

export { TEXTURE_SLOTS };
