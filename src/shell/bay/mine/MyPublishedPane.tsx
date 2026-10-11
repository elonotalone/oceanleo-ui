"use client";

// 「我的」→「我发布的」：我上架的素材与服务一段，我发的需求一段，我上架的作品一段。右上角一个「发布」。
import { useEffect, useState, type ComponentType } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { MyAppsPaneProps } from "../apps";
import { MyNeedsPane } from "../needs/MyNeedsPane";
import { MyServicesPane } from "../seller/MyServicesPane";
import { openBay, type BayPaneProps } from "../shell/bay-state";

// 按需加载：静态 import ../apps 会经 MyAppsPane → BayMine → mine/index 绕回本文件。
// 测试编译台把 index.ts 当原生模块，再去拉未编译的 tsx 会炸；加载失败时这一段先空着，供给 / 需求仍能画。
function PublishedApps(props: MyAppsPaneProps) {
  const tt = useUI();
  const [Pane, setPane] = useState<ComponentType<MyAppsPaneProps> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void import("../apps/MyAppsPane")
      .then((mod) => {
        if (alive) setPane(() => mod.MyAppsPane);
      })
      .catch(() => {
        // 这一段没加载出来要说出来，不能看上去像「你没有作品」。
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  if (failed) return <p className="px-4 py-3 text-[13px] text-stone-500">{tt("作品没加载出来，请刷新页面再试。")}</p>;
  return Pane ? <Pane layout={props.layout} siteKey={props.siteKey} /> : null;
}

export function MyPublishedPane(props: BayPaneProps) {
  const tt = useUI();
  return (
    <section data-bay-pane="mine-published" className="space-y-6">
      <div className="flex justify-end px-4 pt-4">
        <button
          type="button"
          data-bay-mine-publish
          onClick={() => openBay({ kind: "publish" })}
          className="rounded-xl bg-stone-900 px-3 py-1.5 text-[13px] font-semibold text-white transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-stone-800"
        >
          {tt("发布")}
        </button>
      </div>
      <div data-bay-mine-section="supply">
        <h3 className="px-4 text-[13px] font-semibold text-stone-700">{tt("素材与服务")}</h3>
        <MyServicesPane {...props} hideNew />
      </div>
      <div data-bay-mine-section="needs">
        <h3 className="px-4 text-[13px] font-semibold text-stone-700">{tt("需求")}</h3>
        <MyNeedsPane {...props} target={{ kind: "mine", tab: "published" }} />
      </div>
      <div data-bay-mine-section="apps">
        <h3 className="px-4 text-[13px] font-semibold text-stone-700">{tt("作品")}</h3>
        <PublishedApps layout={props.layout} siteKey={props.siteKey} />
      </div>
    </section>
  );
}
