"use client";

// 「我的」各块里按需加载的一段：标题 + 一个别的目录里的窗格。
// 按需加载是因为静态 import 会经那些窗格 → BayMine → mine/index 绕回来。
import { useEffect, useState, type ComponentType, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";

export function LazySection({
  marker,
  title,
  load,
}: {
  marker: string;
  /** 中文原文，渲染时过 tt。 */
  title: string;
  load: () => Promise<ComponentType>;
}): ReactElement {
  const tt = useUI();
  const [Pane, setPane] = useState<ComponentType | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void load()
      .then((found) => {
        if (alive) setPane(() => found);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
    // load 是模块级的常量函数，不随渲染变化。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div data-bay-mine-section={marker}>
      <h3 className="px-4 text-[13px] font-semibold text-stone-700">{tt(title)}</h3>
      {failed ? <p className="px-4 py-3 text-[13px] text-stone-500">{tt("这一段没加载出来，请刷新页面再试。")}</p> : null}
      {Pane ? <Pane /> : null}
    </div>
  );
}
