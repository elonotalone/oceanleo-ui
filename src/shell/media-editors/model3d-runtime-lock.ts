/**
 * §1.2 运行时版本锁 + §0.3 实测存在的 addon 文件名。
 *
 * 契约只许点名 §0.3 里实测存在的 loader；`USDZLoader` / `FBXLoader` 之类未核实的
 * 名字 MUST NOT 出现（§0.3 末）。每个条目的 `addonPath` 都是 `three` 包内的真实
 * 相对路径，`tests/model3d-carrier-contract.test.mjs` 会在本仓
 * `node_modules/three/` 下逐条 stat 出真实文件作为凭据。
 */

/**
 * §1.1 四元组(不变)。注册面(`artifact-contract.ts` /
 * `workbench-capability-registry.ts`)归 W3 独占,本载体只把契约值落成可对账的
 * 数据,由 W3 对齐。
 */
export const MODEL3D_CARRIER_CONTRACT = {
  featureId: "model_3d",
  artifactType: "model_3d",
  sourceFormat: "gltf",
  sourceMediaType: "model/gltf+json",
  editorCapability: "model-3d-editor",
  adapter: "threed",
  projectSchema: "oceanleo.model-view@1",
  editability: "bounded",
  sourceIntegrity: "complete_dependency_closure",
  openMode: "native-file",
  requirementKind: "manifest",
  requirementSchema: "gltf/2.0",
  requirementPaths: ["asset.version", "buffers"],
  dependencyClosure: "complete",
} as const;

/**
 * §1.1:`glb` / `obj` / `fbx` / `stl` / `usdz` 只是**入库容忍**,以这些格式落库的
 * MUST 为 `view_only`,MUST NOT 声明 `editor_capability`。
 */
export const MODEL3D_VIEW_ONLY_TOLERATED_FORMATS = [
  "glb",
  "obj",
  "fbx",
  "stl",
  "usdz",
] as const;

export const MODEL3D_THREE_VERSION = "0.183.2";

/** §0.3 实测 `examples/jsm` 全树 `.js` 计数。 */
export const MODEL3D_THREE_ADDON_FILE_COUNT = 394;

export interface Model3DThreeAddon {
  /** §1.2 表中的组件名。 */
  name: string;
  /** `three` 包内的真实相对路径。 */
  addonPath: string;
  /** 应用侧 import specifier（`three` 的 `./addons/*` export 映射到同一文件）。 */
  specifier: string;
}

/** §1.2 的六个锁定组件。 */
export const MODEL3D_THREE_ADDONS: readonly Model3DThreeAddon[] = [
  {
    name: "GLTFLoader",
    addonPath: "examples/jsm/loaders/GLTFLoader.js",
    specifier: "three/addons/loaders/GLTFLoader.js",
  },
  {
    name: "DRACOLoader",
    addonPath: "examples/jsm/loaders/DRACOLoader.js",
    specifier: "three/addons/loaders/DRACOLoader.js",
  },
  {
    name: "KTX2Loader",
    addonPath: "examples/jsm/loaders/KTX2Loader.js",
    specifier: "three/addons/loaders/KTX2Loader.js",
  },
  {
    name: "RGBELoader",
    addonPath: "examples/jsm/loaders/RGBELoader.js",
    specifier: "three/addons/loaders/RGBELoader.js",
  },
  {
    name: "EXRLoader",
    addonPath: "examples/jsm/loaders/EXRLoader.js",
    specifier: "three/addons/loaders/EXRLoader.js",
  },
] as const;

/** §0.3 `examples/jsm/loaders/` 下实测存在、本契约允许点名的全部 loader。 */
export const MODEL3D_ALLOWED_LOADER_FILES = [
  "GLTFLoader.js",
  "DRACOLoader.js",
  "KTX2Loader.js",
  "EXRLoader.js",
  "RGBELoader.js",
  "HDRLoader.js",
  "HDRCubeTextureLoader.js",
  "UltraHDRLoader.js",
] as const;

/**
 * §0.3 明文禁令。合同 §2.9 记录 `Phaser` / `Tone` / `matter-js` / `cannon-es` /
 * `rapier` / `howler` 全部不在库，因此 3D 运行时只许点名 `three`。
 */
export const MODEL3D_FORBIDDEN_LOADER_FILES = [
  "USDZLoader.js",
  "FBXLoader.js",
] as const;

/** §5.4 可移植性：压缩与贴图扩展各自的消费侧 loader。 */
export const MODEL3D_EXTENSION_LOADERS: Readonly<Record<string, string>> = {
  KHR_draco_mesh_compression: "DRACOLoader.js",
  KHR_texture_basisu: "KTX2Loader.js",
};

export function assertModel3DLoaderFile(file: string): string {
  const name = String(file || "").trim();
  if (!(MODEL3D_ALLOWED_LOADER_FILES as readonly string[]).includes(name)) {
    throw new Error(
      `3D loader ${name || "(空)"} 不在 model-3d 契约 §0.3 实测存在的文件清单内`,
    );
  }
  return name;
}
