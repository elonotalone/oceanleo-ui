"use client";

// ============================================================================
// @oceanleo/ui — 功能页「使用指南」跨树上下文（单一事实源）
// ----------------------------------------------------------------------------
// 宗旨 v12.1：把 navigator 指南统一接到全家桶，各站零额外代码。三方通信：
//
//   OperatorConsole（提供者）
//     ├─ 把当前功能的 guide 配置放进 context；
//     └─ 暴露 useExample(ex)：点示例 → 灌进左栏（经 fill-bus 调到 FunctionAgentChat
//        / 站点表单注册的填充器）。
//   ResultCanvas（消费者）：ctx.guide 非空时，自动在右栏标签条最前面加一个「使用指南」
//     标签并默认选中——右版面首屏即导航页。
//   FunctionAgentChat / 站点操作台（填充器）：用 useRegisterOpsFiller 注册一个把
//     文本(+图片)灌进自己输入框的函数；示例点击时被调用。
//
// 之所以用 context + fill-bus 而非 props 直穿：右栏 ResultCanvas 与左栏填充器分属
// OperatorConsole 渲染的**不同子树**（中列 ops / 右列 canvas），无法用普通 props 互通。
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { type FunctionGuide, type GuideExample } from "./NavigatorGuide";
import {
  listWorkflows,
  saveWorkflow as persistWorkflow,
  deleteWorkflow as removeWorkflow,
  type SavedWorkflow,
  type WorkflowDraft,
} from "../lib/workflows";

/** 左栏填充器：把示例内容灌进当前功能的左栏输入框（+可选图片 / 参数 / 业务负载）。 */
export type OpsFiller = (
  text: string,
  opts?: {
    imageUrl?: string;
    /** 升级版 prompt（宗旨 v15）：一并 patch 进左栏操作台的其它参数（ratio/style/…）。 */
    set?: Record<string, unknown>;
    data?: unknown;
  },
) => void;

// ── 命令式填充 nonce（v20，2026-07-07）──────────────────────────────────────
// 「删空后再点同一张导航卡恢复不了」的中心化根治：每次触发一次导航/起手填充（useExample
// → filler 被调用），本 context 的 nonce 自增。LeoComposer 内嵌于操作台时自动消费它，透传给
// TemplateFillArea 的 fillNonce → 无条件重灌当前模板。**站点零改动**即获「重点同卡必重灌」。
// 与 agent 输入框无关（agent 的 LeoComposer 不在操作台 filler 语境里、不消费此 nonce）。
const FillNonceCtx = createContext<number>(0);
/** 供 LeoComposer 消费：当前操作台填充计数（每次点导航/起手卡自增）。 */
export function useFillNonce(): number {
  return useContext(FillNonceCtx);
}
/** FunctionAgentChat 用它把 fillNonce 供给其 opsContent 子树里的所有 LeoComposer。 */
export function FillNonceProvider({ nonce, children }: { nonce: number; children: ReactNode }) {
  return <FillNonceCtx.Provider value={nonce}>{children}</FillNonceCtx.Provider>;
}

interface GuideCtxValue {
  guide: FunctionGuide | null;
  /** 点示例 → 灌进左栏（内部经 fill-bus 转发给已注册的填充器）。 */
  useExample: (ex: GuideExample) => void;
  /** 供左栏（FunctionAgentChat / 站点表单）注册自己的填充器。 */
  registerFiller: (fn: OpsFiller | null) => void;
  // ── 「我的工作流」（宗旨 v16 补充）────────────────────────────────────────
  /** 当前成品 app 下已保存的工作流（新→旧）。右栏导航「我的」类别读它。 */
  workflows: SavedWorkflow[];
  /** 保存一条工作流（左栏「保存工作流」按钮调用）；成功后自动并入 workflows。 */
  saveWorkflow: (draft: WorkflowDraft) => Promise<SavedWorkflow | null>;
  /** 删除一条工作流（导航「我的」卡片的 ✕ 调用）。 */
  deleteWorkflow: (id: string) => Promise<void>;
}

const GuideCtx = createContext<GuideCtxValue | null>(null);

/**
 * OperatorConsole 为每个功能包一层：提供 guide + fill-bus。activeKey 变化（切功能）时
 * 自动重置填充器，避免把示例灌进上一个功能的输入框。
 */
export function GuideProvider({
  guide,
  siteId = "",
  activeKey,
  children,
}: {
  guide: FunctionGuide | null;
  /** 本站 site_id（工作流按 site + app 分区存取）。宗旨 v16 补充。 */
  siteId?: string;
  activeKey: string;
  children: ReactNode;
}) {
  const fillerRef = useRef<OpsFiller | null>(null);
  // 切功能时清空已注册填充器（新功能的左栏会重新注册）。
  useEffect(() => {
    fillerRef.current = null;
  }, [activeKey]);

  // 「我的工作流」：按 site + 当前成品 app 拉取。切成品自动重载。
  const [workflows, setWorkflows] = useState<SavedWorkflow[]>([]);
  useEffect(() => {
    if (!siteId) {
      setWorkflows([]);
      return;
    }
    let cancelled = false;
    void listWorkflows(siteId, activeKey).then((ws) => {
      if (!cancelled) setWorkflows(ws);
    });
    return () => {
      cancelled = true;
    };
  }, [siteId, activeKey]);

  const saveWorkflow = useCallback(
    async (draft: WorkflowDraft) => {
      if (!siteId || !(draft.prompt || "").trim()) return null;
      const w = await persistWorkflow({
        site_id: siteId,
        app_id: activeKey,
        label: draft.label,
        prompt: draft.prompt,
        params: draft.params,
      });
      if (w) setWorkflows((cur) => [w, ...cur]);
      return w;
    },
    [siteId, activeKey],
  );

  const deleteWorkflow = useCallback(async (id: string) => {
    await removeWorkflow(id);
    setWorkflows((cur) => cur.filter((w) => w.id !== id));
  }, []);

  const value = useMemo<GuideCtxValue>(
    () => ({
      guide,
      useExample: (ex) => {
        fillerRef.current?.(ex.prompt, {
          imageUrl: ex.imageUrl,
          set: ex.set,
          data: ex.data,
        });
      },
      registerFiller: (fn) => {
        fillerRef.current = fn;
      },
      workflows,
      saveWorkflow,
      deleteWorkflow,
    }),
    [guide, workflows, saveWorkflow, deleteWorkflow],
  );

  return <GuideCtx.Provider value={value}>{children}</GuideCtx.Provider>;
}

/** 右栏 ResultCanvas 读取：拿 guide + useExample（渲染「使用指南」标签）。 */
export function useFunctionGuide(): GuideCtxValue | null {
  return useContext(GuideCtx);
}

/**
 * 「我的工作流」读写（左栏「保存工作流」按钮 + 右栏导航「我的」类别共用）。
 * 返回 null 表示不在 GuideProvider 内（不支持工作流）。
 */
export function useGuideWorkflows(): Pick<
  GuideCtxValue,
  "workflows" | "saveWorkflow" | "deleteWorkflow" | "useExample"
> | null {
  const ctx = useContext(GuideCtx);
  if (!ctx) return null;
  const { workflows, saveWorkflow, deleteWorkflow, useExample } = ctx;
  return { workflows, saveWorkflow, deleteWorkflow, useExample };
}

export type { SavedWorkflow, WorkflowDraft } from "../lib/workflows";

/**
 * 左栏（FunctionAgentChat / 站点操作台表单）注册填充器：示例点击时，把 text(+image)
 * 灌进自己的输入框。组件卸载 / 依赖变化时自动注销。
 */
export function useRegisterOpsFiller(filler: OpsFiller | null): void {
  const ctx = useContext(GuideCtx);
  useEffect(() => {
    if (!ctx) return;
    ctx.registerFiller(filler);
    return () => ctx.registerFiller(null);
  }, [ctx, filler]);
}
