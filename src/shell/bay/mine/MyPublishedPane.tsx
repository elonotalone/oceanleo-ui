"use client";

// 「我的」→「我发布的」：我上架的素材与服务一段，我发的需求一段。右上角一个「发布」。
import { useUI } from "../../../i18n/ui/useUI";
import { MyNeedsPane } from "../needs/MyNeedsPane";
import { MyServicesPane } from "../seller/MyServicesPane";
import { openBay, type BayPaneProps } from "../shell/bay-state";

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
    </section>
  );
}
