// ============================================================================
// 「tt 进 effect 依赖」机检的用例样本 —— 只被 tests/effect-tt-dependency.test.mjs 读，
// 永不被打包、永不被 tsc 收（tsconfig.json 的 include 只有 src/**）、也不被
// `npm test` 的 tests/*.test.mjs 通配符跑到。
//
// 这份文件就是机检的判据本身：
//   · 下面标「反面用例」的两处必须被判红——谁把规则改松让 src 变绿，这两处会同时
//     漏网，机检当场红。规则与数据拴在一起，改不动其中一边。
//   · 下面标「正面用例」的五处一处都不许误伤——那 119 处 useMemo/useCallback 带 tt
//     的真实写法（其中 89 处在体内写 state）全靠它挡住。
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../../src/i18n/ui/useUI";

// ---------------------------------------------------------------- 反面用例 1
// W13 在 dcc0a7d 修掉的那条死循环的完整形状：网络副作用 + 体内写 state + 依赖带 tt。
// 未记忆化的 locale provider 会让它「渲染→effect→fetch→setState→渲染」自锁。
export function LoopFuseFetch({ id }: { id: string }) {
  const tt = useUI();
  const [message, setMessage] = useState("");
  useEffect(() => {
    void fetch(`/api/thing/${id}`).catch(() => {
      setMessage(tt("加载失败"));
    });
  }, [id, tt]);
  return <p>{message}</p>;
}

// ---------------------------------------------------------------- 反面用例 2
// 白名单机制的样本：假设它「确实应该按语言重跑」。默认仍然判红——登记必须是显式动作，
// 且必须带得出理由；机检不会因为「看起来像该重跑」就自己放过。
export function LocaleDrivenCopy() {
  const tt = useUI();
  const [copy, setCopy] = useState("");
  useEffect(() => {
    setCopy(tt("按语言重新取的正文"));
  }, [tt]);
  return <p>{copy}</p>;
}

// ---------------------------------------------------------------- 正面用例 1
// useMemo 带 tt：只是重算一段文案，没有 effect、没有副作用。
export function MemoOnly() {
  const tt = useUI();
  const label = useMemo(() => tt("我的库"), [tt]);
  return <span>{label}</span>;
}

// ---------------------------------------------------------------- 正面用例 2
// useCallback 带 tt **且体内写 state** —— 全仓 89 处就是这个形状。
// 它只在用户点击时跑，身份变化不会自己起跑，不构成循环。
export function CallbackWritesState() {
  const tt = useUI();
  const [message, setMessage] = useState("");
  const onClick = useCallback(() => {
    setMessage(tt("保存失败"));
  }, [tt]);
  return <button onClick={onClick}>{message}</button>;
}

// ---------------------------------------------------------------- 正面用例 3
// effect 带 tt 但体内不写 state：会多跑几次，但没有回环，不是本机检要拦的东西。
export function EffectWithoutStateWrite() {
  const tt = useUI();
  useEffect(() => {
    document.title = tt("我的库");
  }, [tt]);
  return null;
}

// ---------------------------------------------------------------- 正面用例 4
// W13 定下的解法：ref 存最新 tt + 空依赖 useCallback 包一层。
// 依赖数组里那个 `translate` 身份恒定，不许误判成引信。
export function StableTranslateWrapper() {
  const tt = useUI();
  const [message, setMessage] = useState("");
  const translateRef = useRef(tt);
  useEffect(() => {
    translateRef.current = tt;
  }, [tt]);
  const translate = useCallback(
    (value: string) => translateRef.current(value),
    [],
  );
  useEffect(() => {
    setMessage(translate("加载失败"));
  }, [translate]);
  return <p>{message}</p>;
}

// ---------------------------------------------------------------- 正面用例 5
// setTimeout / setInterval 长得像 setState，但它们是计时器，不是 state 写入。
export function TimersLookLikeSetters() {
  const tt = useUI();
  useEffect(() => {
    const handle = setTimeout(() => {
      console.log(tt("超时"));
    }, 10);
    const ticker = setInterval(() => {
      console.log(tt("心跳"));
    }, 1_000);
    return () => {
      clearTimeout(handle);
      clearInterval(ticker);
    };
  }, [tt]);
  return null;
}
