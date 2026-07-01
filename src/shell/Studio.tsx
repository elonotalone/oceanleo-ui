"use client";

// ============================================================================
// @oceanleo/ui — 统一「工作台」模板 Studio（单一事实源）
// ----------------------------------------------------------------------------
// 操作员 2026-06-17 定稿版式（= image.oceanleo.com）：中=操作区 / 右=结果。
// 2026-06-19 升级（操作员）：工作台的中+右两栏改为与 agent 工作界面 *完全一样*
// 的可拖动分栏骨架 —— 复用 <SplitWorkspace>：
//   - 中间竖线可左右拖动改比例（按 storageKey 记进 localStorage）；
//   - 左右两栏各有「大屏」按钮，点击该栏独占全宽（再点恢复）；
//   - 移动端上下堆叠。
//
//   ┌──────────┊──────────────────────────────┐
//   │ 中：操作  ┊ 右：结果 / 素材               │
//   │  [大屏]   ┊  [大屏]                       │
//   └──────────┊──────────────────────────────┘
//             ↑ 拖动竖线改比例
//
// 与 agent 的区别只在「内容」：工作台左栏=固定模板操控（StudioSection），
// agent 左栏=对话流。版式骨架两者从此共用 <SplitWorkspace>，单一事实源。
//
// 向后兼容：props（ops / canvas / opsWidth / headerHeight）保持不变，旧的
// `opsWidth`（px 固定宽）现在映射为分栏的初始比例，消费端无需改任何代码。
// ============================================================================

import { useMemo, type ReactNode } from "react";
import { SplitWorkspace, type SplitLibraryConfig } from "./SplitWorkspace";
import { useUI } from "../i18n/ui/useUI";

export interface StudioProps {
  /** 左侧操作列内容（通常是若干 <StudioSection> + 底部主按钮）。 */
  ops: ReactNode;
  /** 右侧结果/素材列内容（通常是 <ResultCanvas>）。 */
  canvas: ReactNode;
  /**
   * 操作列「初始宽度」（px），默认 380。仅用于推导分栏初始比例；拖动后以
   * 用户拖动结果为准（并按 storageKey 记忆）。保留此 prop 为向后兼容。
   */
  opsWidth?: number;
  /**
   * 操作列初始占比（0–1）。给了它就忽略 opsWidth。默认按 opsWidth 在
   * ~1280px 基准宽度上折算，并夹在合理范围内。
   */
  defaultRatio?: number;
  /** 比例记忆 key（按站区分），如 "image_studio_split"。不传则不持久化。 */
  storageKey?: string;
  /** 左栏标题（大屏按钮旁的小标签），默认「操作台」。 */
  opsLabel?: ReactNode;
  /** 右栏标题，默认「结果」。 */
  canvasLabel?: ReactNode;
  /** 强调色（拖动条 hover / 大屏激活态），默认 indigo。 */
  accent?: string;
  /** 顶部 header 高度（px），用于算可视高度，默认 56（= AppShell header）。 */
  headerHeight?: number;
  className?: string;
  /**
   * 操作员 2026-07-01：内建「库」开关（透传给 SplitWorkspace）。给了它，操作台左栏
   * 标题右侧出现「库」按钮（默认关）；点击 → 右栏切换为共享文件库，agent/操作台生成
   * 的作品可在此查看。全 OceanLeo 系列统一。 */
  library?: SplitLibraryConfig;
  /**
   * 操作员 2026-07-01：单栏（库关闭）时操作台内容最大宽度并居中，防止表单铺满整页
   * （横向范围与 agent 对话框一致）。透传给 SplitWorkspace，默认 48rem。 */
  soloMaxWidth?: string | null;
}

const BASELINE_WIDTH = 1280; // 折算 opsWidth→ratio 的基准视口宽度

export function Studio({
  ops,
  canvas,
  opsWidth = 380,
  defaultRatio,
  storageKey,
  opsLabel,
  canvasLabel,
  accent = "#4f46e5",
  headerHeight = 56,
  className = "",
  library,
  soloMaxWidth = "48rem",
}: StudioProps) {
  const tt = useUI();
  // 把旧的 px 固定宽近似成初始比例（夹在 SplitWorkspace 的 18%–82% 内）。
  const initialRatio = useMemo(() => {
    if (typeof defaultRatio === "number") return defaultRatio;
    const r = opsWidth / BASELINE_WIDTH;
    return Math.max(0.22, Math.min(0.45, r));
  }, [defaultRatio, opsWidth]);

  return (
    <SplitWorkspace
      left={
        <div className="v-scroll-stable h-full space-y-3 overflow-y-auto px-4 py-4">{ops}</div>
      }
      // 宗旨 v11：右栏不再外包一层带内边距的 div——canvas（ResultCanvas）自己挂右栏
      // 标题位、自管内边距与滚动，避免「框中框」。canvas 直接填右栏 body。
      right={<div className="flex h-full min-h-0 flex-col">{canvas}</div>}
      defaultRatio={initialRatio}
      storageKey={storageKey}
      leftLabel={opsLabel ?? tt("操作台")}
      rightLabel={canvasLabel ?? tt("结果")}
      accent={accent}
      headerHeight={headerHeight}
      className={className}
      library={library}
      soloMaxWidth={soloMaxWidth}
    />
  );
}
