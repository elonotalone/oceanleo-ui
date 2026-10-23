"use client";

import { useMemo, type CSSProperties } from "react";
import { Puck, type Config, type Data, type Overrides } from "@puckeditor/core";
// no-external.css = the same Puck stylesheet without remote font imports (offline-safe).
import "@puckeditor/core/no-external.css";
import { useUI } from "../../i18n/ui/useUI";
import {
  WEBSITE_PUCK_OVERRIDES,
  WEBSITE_PUCK_THEME_VARS,
  type WebsiteFace,
} from "./website-puck-faces";

/**
 * OceanLeo-composed normal face: pick a block in the page, edit its fields on the
 * right; add blocks (drag from the list) and reorder / remove them from the outline.
 * Everything is a Puck composition part, so it edits the same data as the Pro face.
 */
export function WebsiteNormalLayout() {
  const tt = useUI();
  return (
    <div
      className="grid h-full min-h-0 grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,18rem)] bg-[var(--awb-stage-bg)] text-[var(--awb-text)]"
      data-testid="website-normal-layout"
    >
      <aside
        className="min-h-0 overflow-auto border-r border-[var(--awb-border)] bg-[var(--awb-chrome-bg)] p-3"
        data-testid="website-normal-blocks"
      >
        <h3 className="mb-2 text-[12px] font-medium">{tt("添加区块")}</h3>
        <Puck.Components />
        <h3 className="mb-2 mt-4 text-[12px] font-medium">{tt("页面结构")}</h3>
        <Puck.Outline />
      </aside>
      <main className="min-h-0 overflow-auto" data-testid="website-normal-preview">
        <Puck.Preview />
      </main>
      <aside
        className="min-h-0 overflow-auto border-l border-[var(--awb-border)] bg-[var(--awb-chrome-bg)] p-3"
        data-testid="website-normal-fields"
      >
        <h3 className="mb-2 text-[12px] font-medium">{tt("编辑内容")}</h3>
        <Puck.Fields />
      </aside>
    </div>
  );
}

export function WebsitePuckStage({
  face,
  config,
  data,
  onChange,
  puckWrapper,
}: {
  face: WebsiteFace;
  config: Config;
  data: Partial<Data>;
  onChange: (data: Data) => void;
  /** Site documents mount their Puck bridge here; the header stays empty in both faces. */
  puckWrapper?: Overrides["puck"];
}) {
  const overrides = useMemo<Partial<Overrides>>(
    () => (puckWrapper ? { ...WEBSITE_PUCK_OVERRIDES, puck: puckWrapper } : WEBSITE_PUCK_OVERRIDES),
    [puckWrapper],
  );
  return (
    <div
      className="h-full min-h-0"
      data-testid="website-puck-stage"
      data-website-face={face}
      style={WEBSITE_PUCK_THEME_VARS as CSSProperties}
    >
      <Puck
        config={config}
        data={data}
        iframe={{ enabled: false }}
        overrides={overrides}
        height="100%"
        onChange={onChange}
      >
        {face === "normal" ? <WebsiteNormalLayout /> : undefined}
      </Puck>
    </div>
  );
}
