"use client";

/**
 * 「点开一枚按键」的派发协议。
 *
 * 刻意**不**并进 `workspace-actions.ts`：那条协议的每一枚信封都指向右栏五个固定槽位
 * 之一（`WorkspaceActionV1.tab`），而按键要挂的是前景层，不是槽位；塞进 `tab`
 * 会让「五个槽位」这条不变量在类型上先松掉一角。两条协议因此各走各的事件名，
 * 右栏各自监听，互不冒充。
 *
 * **载荷带的是模块身份（`pluginId`），不是载体类型。** 平台不再从族身份或内容类型
 * 换算出五种通用起手件；按键只能指向插件自己声明的模块。
 *
 * fail-closed 一如既往：`version` 不对、`pluginId` 不成形，一律返回 `null`。
 * 未知按键永远不许静默变成一次编辑器启动。
 */

function normalizePluginModuleId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

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
  const pluginId = normalizePluginModuleId(raw.pluginId);
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
  /** 插件模块自己的 id。 */
  pluginId?: string;
  /** 按键文案（插件中文名）；实例标题跟着它走。 */
  label?: string;
}

/**
 * 把一枚**被点开的按键**换成一份合法的启动信封 —— 入口侧与承载侧之间的那根线。
 *
 * 换不出插件身份就返回 `null`：没有身份的按键不许静默变成一次编辑器启动。
 * 至于模块是否出现在当前 app，只由模块自己的 placements 与位置层决定；这里不枚举
 * 运行时，也不把身份换算成任何通用起手件。
 */
export function advancedFeatureLaunchForCapability(
  source: CapabilityLaunchSource | null | undefined,
  nonce: string,
): AdvancedFeatureLaunchEnvelope | null {
  const pluginId = normalizePluginModuleId(source?.pluginId);
  if (!pluginId) return null;
  const title = String(source?.label || "").trim();
  return {
    nonce: String(nonce || "").trim() || "1",
    launch: { version: 1, pluginId, ...(title ? { title } : {}) },
  };
}
