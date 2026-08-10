"use client";

// ============================================================================
// @oceanleo/ui — 入口(按键条)到承载(右栏前景层)之间的那根线
// ----------------------------------------------------------------------------
// H 波把「空手点开一个功能」拆成两半:入口侧把选中态写进 context 与 URL 的 `?cap=`,
// 承载侧监听 `oceanleo:advanced-feature-launch` 总线。两半各自都能跑,中间这一跳
// 一开始没有人写,于是按钮点下去什么都不会发生 —— 本模块就是那一跳。
//
// **刻意不放在 `app-capability-context.tsx` 里。** 那是个 `.tsx`,而仓里的测试装载器
// (`tests/ts-extension-loader.mjs` + `--experimental-strip-types`)转译不了 JSX,
// 于是任何 `.tsx` 都只能靠各自搭编译台的重型测试去覆盖。这道缝上一次就是因为
// 「两侧各自可测、缝本身没人测」而漏掉的,所以这一跳单独落在不含 JSX 的 `.ts` 里,
// 让 `tests/app-capability-launch.test.mjs` 能直接 import 真模块来判。
// ============================================================================

import { useEffect, useRef } from "react";
import {
  advancedFeatureLaunchForCapability,
  dispatchAdvancedFeatureLaunch,
  type CapabilityLaunchSource,
} from "./advanced-feature-launch";

/** 这根线认的最小输入:选中的那枚按键,外加它所属的 app 身份(用来判「换了没有」)。 */
export interface CapabilityLaunchTarget extends CapabilityLaunchSource {
  siteKey?: string;
  appId?: string;
}

/**
 * 选中态每变成一枚**新的**按键,就往总线上投一次启动。
 *
 * 三条约定:
 *   · **深链也算数**:带 `?cap=` 载入页面时,首帧就投一次,不必亲手点。React 的子
 *     effect 先于父 effect 跑,承载层的监听在本 effect 之前已挂上,不会漏投。
 *   · **重渲染不重投**:同一枚按键只投一次;关掉(选中态回空)再点开算新的一次,
 *     并且换一枚新 nonce,好让右栏重挂一份干净实例。
 *   · **换不出插件身份就不投**:载荷带的是 `pluginId`,不再从 `artifactType`
 *     反查通用模板。没有身份的选中态不许猜一个回退编辑器。
 */
export function useAdvancedFeatureLaunchBridge(
  target: CapabilityLaunchTarget | null | undefined,
): void {
  const launchedKeyRef = useRef<string>("");
  const seqRef = useRef(0);
  const pluginId = target?.pluginId || "";
  const key = target
    ? `${target.siteKey || ""}/${target.appId || ""}/${pluginId}`
    : "";
  const label = target?.label || "";
  useEffect(() => {
    if (!key) {
      launchedKeyRef.current = "";
      return;
    }
    if (launchedKeyRef.current === key) return;
    launchedKeyRef.current = key;
    seqRef.current += 1;
    const envelope = advancedFeatureLaunchForCapability(
      { pluginId, label },
      `cap:${key}:${seqRef.current}`,
    );
    if (envelope) dispatchAdvancedFeatureLaunch(envelope);
  }, [key, label, pluginId]);
}
