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
