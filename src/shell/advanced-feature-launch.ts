"use client";

/**
 * 「空手点开一个功能」的派发协议。
 *
 * 刻意**不**并进 `workspace-actions.ts`：那条协议的每一枚信封都指向右栏五个固定槽位
 * 之一（`WorkspaceActionV1.tab`），而空手起手要挂的是前景层，不是槽位；把功能塞进
 * `tab` 会让「五个槽位」这条不变量在类型上先松掉一角。两条协议因此各走各的事件名，
 * 右栏各自监听，互不冒充。
 *
 * 与 `workspace-actions.ts` 同样 fail-closed：`version` 不对、功能不在可空手起手的
 * 五类之内，一律返回 `null`。未知功能永远不许静默变成一次编辑器启动。
 */

import {
  blankDraftFeatureIdForContentType,
  isBlankDraftFeatureId,
  type BlankDraftFeatureId,
} from "./blank-draft-items";

export interface AdvancedFeatureLaunchV1 {
  version: 1;
  featureId: BlankDraftFeatureId;
  /** 按钮文案取 L3 族中文名；起手件的标题跟着它走。 */
  title?: string;
}

export interface AdvancedFeatureLaunchEnvelope {
  nonce: string;
  launch: AdvancedFeatureLaunchV1;
}

export const ADVANCED_FEATURE_LAUNCH_EVENT =
  "oceanleo:advanced-feature-launch";

export function normalizeAdvancedFeatureLaunch(
  value: unknown,
): AdvancedFeatureLaunchV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (Number(raw.version) !== 1) return null;
  const featureId = String(raw.featureId || "").trim();
  if (!isBlankDraftFeatureId(featureId)) return null;
  const title =
    typeof raw.title === "string" ? raw.title.trim().slice(0, 200) : "";
  return { version: 1, featureId, ...(title ? { title } : {}) };
}

export function dispatchAdvancedFeatureLaunch(
  envelope: AdvancedFeatureLaunchEnvelope,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AdvancedFeatureLaunchEnvelope>(
      ADVANCED_FEATURE_LAUNCH_EVENT,
      { detail: envelope },
    ),
  );
}

/** `advancedFeatureLaunchForCapability` 认的最小输入:按键条映射行的两个字段。 */
export interface CapabilityLaunchSource {
  /** 映射行的 `artifactType`,如 `interactive_doc`。 */
  artifactType?: string;
  /** 按钮文案(L3 族中文名);起手件的标题跟着它走。 */
  label?: string;
}

/**
 * 把一枚**被点开的功能按钮**换成一份合法的启动信封 —— 入口侧与承载侧之间缺的那根线。
 *
 * 两半各自都能跑却接不上,原因是词表不同:按键条手上是 `artifactType`
 * (映射行的字段),总线只认 `featureId`(五类闭集)。换算走
 * `blankDraftFeatureIdForContentType`,它是从起手件表反查出来的,不是第二份手抄清单。
 *
 * 换不出来就返回 `null`,**这是正常路径而不是错误**:十六类载体里只有五类能空手起手,
 * 其余类型的按钮只承担素材库筛选,不启动编辑器。fail-closed 与本模块其余部分一致 ——
 * 未知功能永远不许静默变成一次编辑器启动。
 */
export function advancedFeatureLaunchForCapability(
  source: CapabilityLaunchSource | null | undefined,
  nonce: string,
): AdvancedFeatureLaunchEnvelope | null {
  const featureId = blankDraftFeatureIdForContentType(source?.artifactType);
  if (!featureId) return null;
  const title = String(source?.label || "").trim();
  return {
    nonce: String(nonce || "").trim() || "1",
    launch: { version: 1, featureId, ...(title ? { title } : {}) },
  };
}
