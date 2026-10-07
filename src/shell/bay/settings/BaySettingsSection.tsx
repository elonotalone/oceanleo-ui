"use client";

// 设置窗「LeoBay」栏：卖家资料、资质审核、钱、规则与条款。境内不渲染。
import { useEffect, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { BaySellerProfileSection } from "../seller/BaySellerProfileSection";
import { BayVettingSection } from "../seller/BayVettingSection";
import { bayEnabledHere } from "../shell/bay-state";
import { BayMoneySection } from "./BayMoneySection";
import { BayTermsOverview } from "./BayTermsOverview";
import {
  BAY_SETTINGS_BLOCKS,
  isBaySettingsPane,
  subscribeBaySettingsPane,
  takeBaySettingsPane,
  type BaySettingsBlock,
  type BaySettingsPaneName,
} from "./settings-pane-store";

const BLOCK_LABEL: Readonly<Record<BaySettingsBlock, string>> = {
  profile: "卖家资料",
  vetting: "资质审核",
  money: "钱",
  terms: "规则与条款",
};

function initialBlock(pane?: BaySettingsPaneName): BaySettingsBlock {
  const taken = takeBaySettingsPane();
  if (taken) return taken;
  return pane && isBaySettingsPane(pane) ? pane : "profile";
}

export function BaySettingsSection({ pane }: { pane?: BaySettingsPaneName }) {
  const tt = useUI();
  const [block, setBlock] = useState<BaySettingsBlock>(() => initialBlock(pane));
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (pane && isBaySettingsPane(pane)) setBlock(pane);
  }, [pane]);

  useEffect(
    () =>
      subscribeBaySettingsPane(() => {
        const taken = takeBaySettingsPane();
        if (taken) setBlock(taken);
      }),
    [],
  );

  useEffect(() => {
    bodyRef.current?.scrollIntoView?.({ block: "start" });
  }, [block]);

  if (!bayEnabledHere()) return null;

  return (
    <div className="flex flex-col gap-4" data-bay-settings-section={block}>
      <nav className="flex flex-wrap gap-1" aria-label="LeoBay">
        {BAY_SETTINGS_BLOCKS.map((id) => {
          const active = block === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              data-bay-settings-tab={id}
              onClick={() => setBlock(id)}
              className={`rounded-lg px-3 py-1.5 text-[13px] ${
                active
                  ? "bg-sky-50 font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                  : "text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              {tt(BLOCK_LABEL[id])}
            </button>
          );
        })}
      </nav>
      <div ref={bodyRef} className="min-w-0">
        {block === "profile" ? <BaySellerProfileSection /> : null}
        {block === "vetting" ? <BayVettingSection /> : null}
        {block === "money" ? <BayMoneySection /> : null}
        {block === "terms" ? <BayTermsOverview /> : null}
      </div>
    </div>
  );
}
