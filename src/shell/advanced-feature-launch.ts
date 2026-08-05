"use client";

/**
 * 「点开一枚按键」的派发协议。
 *
 * 刻意**不**并进 `workspace-actions.ts`：那条协议的每一枚信封都指向右栏五个固定槽位
 * 之一（`WorkspaceActionV1.tab`），而按键要挂的是前景层，不是槽位；塞进 `tab`
 * 会让「五个槽位」这条不变量在类型上先松掉一角。两条协议因此各走各的事件名，
 * 右栏各自监听，互不冒充。
 *
 * **载荷带的是插件身份（`pluginId`），不是载体类型。** 旧协议带的是从
 * `artifactType` 反查出来的 `featureId`，一共只有 5 个取值，于是全平台两千多枚
 * 按键在运行时只对应 5 份通用空白模板；点地图、点台账、点换算器打开的都是同一份
 * 「输入 A / 输入 B」。身份换成插件本身之后，承载层查的是这枚插件自己的第一屏
 * （`plugin-initial-state.ts`），通用模板那条路整条不再存在。
 *
 * fail-closed 一如既往：`version` 不对、`pluginId` 不成形，一律返回 `null`。
 * 未知按键永远不许静默变成一次编辑器启动。
 */

import { normalizePluginId } from "./plugin-initial-state";

export interface AdvancedFeatureLaunchV1 {
  version: 1;
  /** L3 族 id，与清册里那一枚按键的 `id` 同一个值。 */
  pluginId: string;
  /** 按键文案取插件中文名；实例标题跟着它走。 */
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
  const pluginId = normalizePluginId(raw.pluginId);
  if (!pluginId) return null;
  const title =
    typeof raw.title === "string" ? raw.title.trim().slice(0, 200) : "";
  return { version: 1, pluginId, ...(title ? { title } : {}) };
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

/** `advancedFeatureLaunchForCapability` 认的最小输入：按键自己的身份与文案。 */
export interface CapabilityLaunchSource {
  /**
   * 清册里这一枚按键的 `id`，也就是插件 id。
   *
   * `family` 是同一个标识符的旧名字（`_COMMON.md` §4.3：非编辑类插件就是那 21 个
   * L3 族），入口层还没切到清册时用它兜一手，不是第二份词表。
   */
  pluginId?: string;
  family?: string;
  /** 按键文案（插件中文名）；实例标题跟着它走。 */
  label?: string;
}

/**
 * 把一枚**被点开的按键**换成一份合法的启动信封 —— 入口侧与承载侧之间的那根线。
 *
 * 换不出插件身份就返回 `null`：没有身份的按键不许静默变成一次编辑器启动。
 * 至于「这枚插件有没有第一屏」，判在承载侧（`plugin-initial-state.ts` 的注册表）
 * 与入口侧的按键过滤上——这里只管身份成不成形，不在两个地方各判一次。
 */
export function advancedFeatureLaunchForCapability(
  source: CapabilityLaunchSource | null | undefined,
  nonce: string,
): AdvancedFeatureLaunchEnvelope | null {
  const pluginId =
    normalizePluginId(source?.pluginId) || normalizePluginId(source?.family);
  if (!pluginId) return null;
  const title = String(source?.label || "").trim();
  return {
    nonce: String(nonce || "").trim() || "1",
    launch: { version: 1, pluginId, ...(title ? { title } : {}) },
  };
}
