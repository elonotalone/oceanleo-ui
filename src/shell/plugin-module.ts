import type { ReactNode } from "react";

/** 这件插件自己决定它出现在哪些 app 上。写不出理由的 app 不要列。 */
export type PluginPlacement = { site: string; app: string };

/** 平台给插件的全部能力面。插件想用就用，一个都不是必填的。 */
export type PluginHost = {
  siteKey: string;
  appId: string;
  /** 读所在 app 已经算出来的数（W6 实现）。app 没有可给的数时返回 null。 */
  appData: () => Promise<unknown | null>;
  /** 存插件自己的状态。形状由插件自己定，平台不校验。 */
  save: (state: unknown) => Promise<void>;
  load: () => Promise<unknown | null>;
  /** 导出物是素材，落进「我的库」。kind 由插件自己给，平台不枚举。 */
  exportArtifact: (bytes: Blob, kind: string, filename: string) => Promise<void>;
};

export type PluginModule = {
  /** 全平台唯一。 */
  id: string;
  /** 用户看到的中文名。不许含「插件」二字（那是内部概念名）。 */
  label: string;
  placements: PluginPlacement[];
  /**
   * 它自己画。canvas、WebGL、SVG、DOM、自带的渲染器 —— 全都行，
   * 平台不规定用哪一种，也不提供必须套的壳。
   */
  render: (host: PluginHost) => ReactNode;
};

/** 本波之后返回空数组：平台上一件插件都没有，这是预期状态。 */
export function pluginModules(): PluginModule[] {
  return [];
}

/** 位置层唯一需要指出的模块文案问题；这里不检查插件内容。 */
export function pluginModuleProblem(module: PluginModule): string | null {
  return module.label.includes("插件")
    ? `「${module.label}」含内部概念名“插件”，不能作为用户可见名称。`
    : null;
}

/**
 * 给位置层取当前 app 的模块。placements 为空自然不会产出按键；除此之外，
 * 平台不枚举、不审核模块内容。
 */
export function pluginModulesForPlacement(
  site: string,
  app: string,
  modules: readonly PluginModule[] = pluginModules(),
): PluginModule[] {
  return modules.filter(
    (module) =>
      !pluginModuleProblem(module) &&
      module.placements.some(
        (placement) => placement.site === site && placement.app === app,
      ),
  );
}
