"use client";

import dynamic from "next/dynamic";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { WorkbenchRouteLoading } from "./WorkbenchRouteLoading";

/**
 * 表格件路由：**只有 Univer 一条路**（2026-09-07 起，`core-swap:delete grid`）。
 *
 * 普通模式 = 同一个 Univer 实例关掉 ribbon / 公式栏，专业模式 = 打开它们；
 * 两种模式在 `GridUniverStage` 里切 chrome，不在这里换组件
 * （五层规范第 10 行：同一文档、同一内核实例切模式）。
 *
 * `import()` 的字面量必须写在这一层：它是打包器切 chunk 的唯一依据。
 * `ssr: false` 是硬要求——Univer 碰 DOM / canvas，服务端渲染时不存在。
 * 抽成具名函数，是为了让闸能真的调用它——`return null` 必须当场红。
 */
export async function loadGridUniverStage() {
  const module = await import("../doc-editors/GridUniverStage");
  return module.GridUniverStage ?? null;
}

/**
 * 重内核只能在懒加载叶子里。chunk 没到之前舞台不能留白——
 * 用与外层路由同一块加载态，用户看到的是「正在加载编辑器」而不是空白。
 */
const GridUniverStage = dynamic(loadGridUniverStage, {
  ssr: false,
  loading: () => <WorkbenchRouteLoading />,
});

export function GridRoute(props: AdvancedContentWorkbenchProps) {
  return <GridUniverStage {...props} />;
}
