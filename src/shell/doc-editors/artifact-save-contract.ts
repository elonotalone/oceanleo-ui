"use client";

// ============================================================================
// @oceanleo/ui — 编辑器保存契约（前端唯一出处）
// ----------------------------------------------------------------------------
// 十个编辑器过去各写一套 revision payload：chart / composite_image 发
// preview+full+editor_manifest，deck 只发 editor_manifest，document 把 docx 当
// full 交上去，grid 干脆不提交 revision。后端 `adapt_deployed_revision` 只有一套
// 断言（必须存在 preview 或 full，且必须是 image/video/audio/pdf/gltf），于是量最
// 大的三类办公文档全部 422。
//
// 这里把「每种 artifactType 保存时要交哪些 rendition」收成一张表 + 一个构造函数，
// 任何编辑器都不再自己拼 renditions 数组。表的唯一出处是
// `docs/work-logs/2026-07/oceanleo-site-materials-and-leoplay-ugc/02-save-contract-matrix.md`
// §3.2（W1 已定稿，选路线乙：后端按类型放开，办公字节可以直接当 cover）。
//
// 同时收敛保存失败文案：过去统一是「保存到我的库失败」，用户与排障都看不出断在哪
// 一步。`artifactSaveStepMessage` 强制每条失败都点名步骤。
// ============================================================================

import type { ArtifactType } from "../artifact-contract";

/** 保存链路上每一个可以独立失败的步骤。 */
export type ArtifactSaveStep =
  | "identity"
  | "contract"
  | "project-build"
  | "project-upload"
  | "delivery-build"
  | "delivery-upload"
  | "preview-render"
  | "preview-upload"
  | "revision-publish"
  | "revision-verify"
  | "creation-register";

export const ARTIFACT_SAVE_STEPS: readonly ArtifactSaveStep[] = [
  "identity",
  "contract",
  "project-build",
  "project-upload",
  "delivery-build",
  "delivery-upload",
  "preview-render",
  "preview-upload",
  "revision-publish",
  "revision-verify",
  "creation-register",
];

export const ARTIFACT_SAVE_STEP_LABEL: Readonly<
  Record<ArtifactSaveStep, string>
> = Object.freeze({
  identity: "确认素材身份",
  contract: "组装保存内容",
  "project-build": "生成可编辑工程",
  "project-upload": "上传可编辑工程",
  "delivery-build": "生成交付文件",
  "delivery-upload": "上传交付文件",
  "preview-render": "渲染封面预览图",
  "preview-upload": "上传封面预览图",
  "revision-publish": "提交新版本",
  "revision-verify": "校验服务端返回的新版本",
  "creation-register": "登记到我的库",
});

const STEP_MESSAGE_PREFIX = "保存失败：「";

/** 已经带过步骤的文案不再二次包裹，避免「保存失败：「X」…保存失败：「Y」…」。 */
export function isArtifactSaveStepMessage(value: unknown): boolean {
  return String(value ?? "").trimStart().startsWith(STEP_MESSAGE_PREFIX);
}

/**
 * 用户可见的失败文案。必须点名是哪一步没有完成——「保存到我的库失败」这种说法
 * 对用户没有信息量，对排障也无从下手。
 */
export function artifactSaveStepMessage(
  step: ArtifactSaveStep,
  detail?: unknown,
): string {
  const reason = String(detail ?? "").trim();
  if (isArtifactSaveStepMessage(reason)) return reason;
  const label = ARTIFACT_SAVE_STEP_LABEL[step] || step;
  return reason
    ? `${STEP_MESSAGE_PREFIX}${label}」这一步没有完成 —— ${reason}`
    : `${STEP_MESSAGE_PREFIX}${label}」这一步没有完成。`;
}

export type ArtifactSaveRenditionPurpose =
  | "preview"
  | "full"
  | "editor_manifest";

/**
 * 后端按 `02-save-contract-matrix.md` §3.2 解析 cover 时，这一类的主展示物从哪来。
 *
 * - `delivery`：交付字节本身就在 displayable 白名单里（位图 / 音视频 / pdf / gltf）。
 * - `bitmap`：cover 必须是位图，交付字节不算（chart / composite_image / game）。
 * - `native`：矩阵 §3.2 的「允许原生 cover」类型。docx / xlsx / pptx / html / json
 *   字节可以直接当 cover，cover 解析顺序是 `preview → full → source`，所以这几类
 *   永远有兜底、不会因为缺位图而保存失败。位图仍然值得发——只有位图 cover 才能过
 *   读侧的 `has_displayable_primary_cover()`，进而被 `/library/primary` 当货架封面。
 */
export type ArtifactSaveDisplayablePrimary = "delivery" | "bitmap" | "native";

export interface ArtifactSaveContractEntry {
  displayablePrimary: ArtifactSaveDisplayablePrimary;
  /**
   * `full` 装谁。
   *
   * 与 `displayablePrimary` 是两件事：后端只对 `preview` / `thumbnail` 跑
   * `_require_displayable_primary`，`full` 不参与。所以办公三件套应当是
   * 「`preview` 放位图、`full` 放真交付物（pptx/xlsx/docx）」——把 `full` 换成位图
   * 反而会让用户下载不到真文件。chart / composite_image 例外：它们的交付字节是
   * scene/option JSON，不是用户下载物，`full` 本来就该是那张 PNG。
   */
  fullSource: "delivery" | "bitmap";
  /** 缺任何一项就在本地拒绝提交，不把注定 422 的 payload 发出去。 */
  required: readonly ArtifactSaveRenditionPurpose[];
  /**
   * 矩阵 §3.2 的「`preview` 或 `full`」：至少要有一项，给哪一项都行。
   *
   * 这不是可有可无的糖。`video` 的成品渲染在服务端，保存那一刻客户端手里只有
   * 时间轴工程与一帧封面位图——若把 `full` 写成硬必需，这一类就永远提交不了
   * revision（这正是它至今没有提交路径的原因之一）。
   */
  requiredAnyOf: readonly ArtifactSaveRenditionPurpose[];
  /** 调用方能提供就带上，不能提供也不拦。 */
  optional: readonly ArtifactSaveRenditionPurpose[];
}

/**
 * 逐类型保存契约。
 *
 * 刻意用 `Partial<Record<...>>`：W9 会往 `ARTIFACT_TYPES` 里加第 14 个 `game`，
 * 那一行由 W9/W10 按矩阵 §4 补进来，不该让本文件先红。
 */
const ARTIFACT_SAVE_CONTRACT: Readonly<
  Partial<Record<ArtifactType, ArtifactSaveContractEntry>>
> = Object.freeze({
  // ---- 现成范本：结构化 source + 客户端位图 ----
  chart: {
    displayablePrimary: "bitmap",
    fullSource: "bitmap",
    required: ["preview", "full", "editor_manifest"],
    requiredAnyOf: [],
    optional: [],
  },
  // 矩阵 §3.2 第 2 行只要求 `preview`/`full` + scene 闭包，但
  // `artifact-client.createArtifactRevision` 对 composite 另有一道「preview 与 full
  // 必须同时在场」的既有前置断言。保持两项都必需，与线上行为逐字一致。
  composite_image: {
    displayablePrimary: "bitmap",
    fullSource: "bitmap",
    required: ["preview", "full"],
    requiredAnyOf: [],
    optional: ["editor_manifest"],
  },
  // ---- 交付字节本身可展示（矩阵 §3.2 第 1、3、8、10、11、12 行：「preview 或 full」）----
  single_file_image: {
    displayablePrimary: "delivery",
    fullSource: "delivery",
    required: [],
    requiredAnyOf: ["preview", "full"],
    optional: ["editor_manifest"],
  },
  vector_image: {
    displayablePrimary: "delivery",
    fullSource: "delivery",
    required: [],
    requiredAnyOf: ["preview", "full"],
    optional: ["editor_manifest"],
  },
  pdf: {
    displayablePrimary: "delivery",
    fullSource: "delivery",
    required: [],
    requiredAnyOf: ["preview", "full"],
    optional: ["editor_manifest"],
  },
  // 成品视频在服务端渲染，保存那一刻客户端只有时间轴工程 + 一帧封面位图。
  // 封面位图走 `preview` 就能满足契约；这一类不该被 `full` 卡死。
  video: {
    displayablePrimary: "delivery",
    fullSource: "delivery",
    required: [],
    requiredAnyOf: ["preview", "full"],
    optional: ["editor_manifest"],
  },
  audio: {
    displayablePrimary: "delivery",
    fullSource: "delivery",
    required: [],
    requiredAnyOf: ["preview", "full"],
    optional: ["editor_manifest"],
  },
  model_3d: {
    displayablePrimary: "delivery",
    fullSource: "delivery",
    required: [],
    requiredAnyOf: ["preview", "full"],
    optional: ["editor_manifest"],
  },
  // ---- 矩阵 §3.2 的「允许原生 cover」五类 ----
  //
  // `editor_manifest` 在后端是可选的，这里对办公三件套设成必需：这三个编辑器全都
  // 靠工程 JSON 重开，少了它下一次打开就只剩一份不可编辑的二进制。这是客户端比
  // 后端更严的一处，且不会误伤——三个编辑器每次保存都产出它。
  document: {
    displayablePrimary: "native",
    fullSource: "delivery",
    required: ["full", "editor_manifest"],
    requiredAnyOf: [],
    optional: ["preview"],
  },
  grid: {
    displayablePrimary: "native",
    fullSource: "delivery",
    required: ["full", "editor_manifest"],
    requiredAnyOf: [],
    optional: ["preview"],
  },
  deck: {
    displayablePrimary: "native",
    fullSource: "delivery",
    required: ["full", "editor_manifest"],
    requiredAnyOf: [],
    optional: ["preview"],
  },
  workflow: {
    displayablePrimary: "native",
    fullSource: "delivery",
    required: [],
    requiredAnyOf: ["preview", "full"],
    optional: ["editor_manifest"],
  },
  website: {
    displayablePrimary: "native",
    fullSource: "delivery",
    required: [],
    requiredAnyOf: ["preview", "full"],
    optional: ["editor_manifest"],
  },
  /**
   * 矩阵 §4 的初稿：`full` 是可玩 bundle、`preview` 是封面位图、
   * `editor_manifest` 带生成 prompt 与 engine API 版本。保存链本身属于 W9/W10；
   * 这里只保证它不是表里的一个洞。W1 定稿可以调整，但不得取消任何一项。
   */
  game: {
    displayablePrimary: "bitmap",
    fullSource: "delivery",
    required: ["preview", "full", "editor_manifest"],
    requiredAnyOf: [],
    optional: [],
  },
});

/**
 * 矩阵 §3.2 里「允许原生 cover」的类型。
 *
 * 这几类保存不会因为缺位图而失败，但它们的 cover 可能指向 docx/xlsx/pptx/html/json
 * 字节，读侧 `has_displayable_primary_cover()` 不认，货架封面会缺（矩阵 §5 的 H4，
 * 呈现兜底归 W3）。呈现层与门禁可以直接消费这份清单。
 */
export const ARTIFACT_SAVE_NATIVE_COVER_TYPES: readonly ArtifactType[] =
  Object.freeze(
    (Object.keys(ARTIFACT_SAVE_CONTRACT) as ArtifactType[]).filter(
      (artifactType) =>
        ARTIFACT_SAVE_CONTRACT[artifactType]?.displayablePrimary === "native",
    ),
  );

export function artifactSaveContractFor(
  artifactType: ArtifactType,
): ArtifactSaveContractEntry | null {
  return ARTIFACT_SAVE_CONTRACT[artifactType] || null;
}

export interface ArtifactSaveBlobRef {
  url: string;
  digest: string;
}

export interface ArtifactSaveRenditionSources {
  /** 用户可下载的交付字节，同时也是 artifact `source`。 */
  delivery?: ArtifactSaveBlobRef | null;
  /** 编辑器可重开的结构化工程 JSON。 */
  editorManifest?: ArtifactSaveBlobRef | null;
  /** 客户端渲染的可展示位图（PNG）。 */
  previewBitmap?: ArtifactSaveBlobRef | null;
}

export interface ArtifactSaveRenditionPlan {
  ok: boolean;
  renditions: {
    purpose: ArtifactSaveRenditionPurpose;
    url: string;
    digest: string;
  }[];
  /** 契约要求但本次拿不出来的 rendition。 */
  missing: ArtifactSaveRenditionPurpose[];
  /** 本次实际充当后端 displayable primary 的来源。 */
  displayablePrimary: "bitmap" | "delivery" | "none";
  /** cover 会落在原生字节上（矩阵 §3.2「允许原生 cover」且这次没有位图）。 */
  nativeCover: boolean;
  error: string;
}

function usableBlob(
  value: ArtifactSaveBlobRef | null | undefined,
): ArtifactSaveBlobRef | null {
  const url = String(value?.url || "").trim();
  const digest = String(value?.digest || "")
    .trim()
    .toLowerCase()
    .replace(/^sha256:/, "");
  return url && digest ? { url, digest } : null;
}

/**
 * 按类型契约拼出这一次 revision 要提交的 renditions。
 *
 * 唯一出口：任何编辑器都不许再自己写 `renditions: [...]`。
 */
export function planArtifactSaveRenditions(
  artifactType: ArtifactType,
  sources: ArtifactSaveRenditionSources,
): ArtifactSaveRenditionPlan {
  const contract = artifactSaveContractFor(artifactType);
  if (!contract) {
    return {
      ok: false,
      renditions: [],
      missing: [],
      displayablePrimary: "none",
      nativeCover: false,
      error: `保存契约里没有 ${artifactType} 这个类型，拒绝提交无契约的 revision。`,
    };
  }
  const delivery = usableBlob(sources.delivery);
  const manifest = usableBlob(sources.editorManifest);
  const bitmap = usableBlob(sources.previewBitmap);

  const full = contract.fullSource === "bitmap" ? bitmap : delivery;

  const available: Partial<
    Record<ArtifactSaveRenditionPurpose, ArtifactSaveBlobRef>
  > = {
    ...(bitmap ? { preview: bitmap } : {}),
    ...(full ? { full } : {}),
    ...(manifest ? { editor_manifest: manifest } : {}),
  };

  const missing = contract.required.filter((purpose) => !available[purpose]);
  if (missing.length > 0) {
    return {
      ok: false,
      renditions: [],
      missing,
      displayablePrimary: "none",
      nativeCover: false,
      error: `${artifactType} 保存契约要求的 ${missing.join(
        " / ",
      )} rendition 这次没有产出。`,
    };
  }
  const anyOfSatisfied =
    contract.requiredAnyOf.length === 0 ||
    contract.requiredAnyOf.some((purpose) => Boolean(available[purpose]));
  if (!anyOfSatisfied) {
    return {
      ok: false,
      renditions: [],
      missing: [...contract.requiredAnyOf],
      displayablePrimary: "none",
      nativeCover: false,
      error: `${artifactType} 保存契约要求 ${contract.requiredAnyOf.join(
        " 或 ",
      )} 至少有一项，这次一项都没有产出。`,
    };
  }

  const order: ArtifactSaveRenditionPurpose[] = [
    "preview",
    "full",
    "editor_manifest",
  ];
  const emitted = new Set<ArtifactSaveRenditionPurpose>([
    ...contract.required,
    ...contract.requiredAnyOf.filter((purpose) => Boolean(available[purpose])),
    ...contract.optional.filter((purpose) => Boolean(available[purpose])),
  ]);
  return {
    ok: true,
    renditions: order
      .filter((purpose) => emitted.has(purpose) && available[purpose])
      .map((purpose) => ({
        purpose,
        url: available[purpose]!.url,
        digest: available[purpose]!.digest,
      })),
    missing: [],
    // cover 解析顺序是 preview → full →（原生类型再回落到）source。
    displayablePrimary: bitmap ? "bitmap" : full ? "delivery" : "none",
    nativeCover: !bitmap && contract.displayablePrimary === "native",
    error: "",
  };
}
