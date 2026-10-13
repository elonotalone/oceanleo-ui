"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useUI } from "../../../i18n/ui/useUI";
import { BayListingPreview } from "./BayListingPreview";
import {
  builtinTemplates,
  deleteSavedTemplate,
  DIGITAL_MATERIAL_LABEL,
  loadSavedTemplates,
  saveTemplateFromSnapshot,
  snapshotDisplayTitle,
  type BayPostKind,
  type BayPostSnapshot,
  type SavedPostTemplate,
} from "./post-templates";

type Dock = "templates" | "mine" | null;
type Device = "desktop" | "phone";

/** 闲鱼那种右侧胶囊：定宽、高度跟两个键走，绝不拉满。 */
const RAIL_WIDTH = 56;
/** 胶囊放在白板（LeoBayPage 的 data-bay-page-paper）里面，紧贴右边缘，隔一个小空隙；白板位置按实际布局量，不按窗口中心猜。 */
const RAIL_GAP = 8;
const RAIL_MIN_RIGHT = 16;

const RAIL_STYLE: CSSProperties = {
  position: "fixed",
  top: "50%",
  transform: "translateY(-50%)",
  zIndex: 80,
  width: RAIL_WIDTH,
  height: "auto",
  display: "flex",
  flexDirection: "column",
  flexShrink: 0,
  overflow: "hidden",
  borderRadius: 9999,
  border: "1px solid #e5e5e5",
  background: "#fff",
  boxShadow: "0 8px 24px rgba(15,15,15,0.12)",
};

const DOCK_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 70,
};

const PANEL_STYLE: CSSProperties = {
  position: "fixed",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  zIndex: 71,
  width: "1240px",
  height: "900px",
  maxWidth: "calc(100vw - 80px)",
  maxHeight: "calc(100vh - 24px)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  background: "#fff",
  borderRadius: 16,
  border: "1px solid #e5e5e5",
  boxShadow: "0 16px 48px rgba(15,15,15,0.18)",
};

const BACKDROP_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  border: "none",
  background: "rgba(0, 0, 0, 0.45)",
  cursor: "pointer",
};

/**
 * 发帖右侧「模板 / 我的post显示」。
 * 必须挂到 document.body、用 viewport fixed：挂进 Bay 页或表单列时，
 * overflow 裁切 + 百分比宽度会把抽屉挤成左侧一列竖字，胶囊也会被 flex 拉满。
 * 预览本身在页面正中放大，并同时给出手机版 / 电脑版。
 */
export function BayPublishShell(props: {
  kind: BayPostKind;
  snapshot: BayPostSnapshot;
  onApply: (snapshot: BayPostSnapshot) => void;
  children: ReactNode;
}): ReactElement {
  const tt = useUI();
  const [dock, setDock] = useState<Dock>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [selectedId, setSelectedId] = useState("");
  const [saved, setSaved] = useState<SavedPostTemplate[]>(() => loadSavedTemplates(props.kind));
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);
  const [railRight, setRailRight] = useState(RAIL_MIN_RIGHT);
  const presets = builtinTemplates(props.kind);

  useLayoutEffect(() => {
    setReady(true);
  }, []);

  useLayoutEffect(() => {
    function syncRail() {
      const board = document.querySelector<HTMLElement>("[data-bay-page-paper]");
      if (!board) return;
      const viewportWidth = document.documentElement.clientWidth;
      const fromRight = viewportWidth - board.getBoundingClientRect().right + RAIL_GAP;
      setRailRight(Math.max(RAIL_MIN_RIGHT, fromRight));
    }
    syncRail();
    window.addEventListener("resize", syncRail);
    return () => window.removeEventListener("resize", syncRail);
  }, []);

  useEffect(() => {
    setSelectedId(builtinTemplates(props.kind)[0]?.id || "");
  }, [props.kind]);

  useEffect(() => {
    if (!dock) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDock(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dock]);

  const refreshSaved = useCallback(() => {
    setSaved(loadSavedTemplates(props.kind));
  }, [props.kind]);

  const catalog = useMemo(() => {
    const mine = saved.map((row) => ({
      id: row.id,
      snapshot: { ...row.snapshot, id: row.id, title: row.title },
      saved: true as const,
    }));
    return [...presets.map((snapshot) => ({ id: snapshot.id || "", snapshot, saved: false as const })), ...mine].filter(
      (row) => row.id,
    );
  }, [presets, saved]);

  const selected = catalog.find((row) => row.id === selectedId) || catalog[0] || null;

  function open(next: Dock) {
    setNotice("");
    setDock((current) => (current === next ? null : next));
    if (next === "templates") {
      refreshSaved();
      setDevice("desktop");
    }
  }

  function apply(snapshot: BayPostSnapshot) {
    props.onApply(snapshot);
    setNotice("");
    setDock(null);
  }

  function saveMine() {
    saveTemplateFromSnapshot(props.snapshot);
    refreshSaved();
    setNotice(tt("已保存为我的模板"));
    setDock("templates");
  }

  function remove(id: string) {
    deleteSavedTemplate(id);
    refreshSaved();
    if (selectedId === id) setSelectedId(presets[0]?.id || "");
  }

  const chrome =
    ready && typeof document !== "undefined"
      ? createPortal(
          <>
            <aside data-bay-post-rail="" style={{ ...RAIL_STYLE, right: railRight }}>
              <RailButton
                name="templates"
                active={dock === "templates"}
                label={tt("模板")}
                onClick={() => open("templates")}
                icon="grid"
              />
              <RailButton
                name="mine"
                active={dock === "mine"}
                label={tt("我的post显示")}
                onClick={() => open("mine")}
                icon="eye"
              />
            </aside>
            {dock ? (
              <div data-bay-preview-dock={dock} style={DOCK_STYLE}>
                <button type="button" aria-label={tt("关闭")} onClick={() => setDock(null)} style={BACKDROP_STYLE} />
                <div data-bay-preview-panel="" data-bay-preview-device={device} style={PANEL_STYLE}>
                  <header className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3">
                    <h2 className="text-sm font-semibold text-neutral-900">{dock === "templates" ? tt("模板") : tt("我的post显示")}</h2>
                    <button type="button" onClick={() => setDock(null)} className="rounded-lg px-2 py-1 text-xs text-neutral-600">
                      {tt("关闭")}
                    </button>
                  </header>
                  {notice ? (
                    <p data-bay-template-notice="" className="border-b border-neutral-100 px-4 py-2 text-xs text-emerald-700">
                      {notice}
                    </p>
                  ) : null}
                  {dock === "mine" ? (
                    <div className="flex min-h-0 flex-1 flex-col">
                      <DeviceToggle device={device} onChange={setDevice} phoneLabel={tt("手机版")} desktopLabel={tt("电脑版")} />
                      <div className="grid min-h-0 flex-1 place-items-center overflow-auto p-4">
                        <p className="mb-3 w-full text-center text-sm text-neutral-600">{tt("别人看到的页面")}</p>
                        <DeviceFrame device={device}>
                          <BayListingPreview snapshot={props.snapshot} live />
                        </DeviceFrame>
                      </div>
                      <footer className="flex shrink-0 justify-center border-t border-neutral-200 px-4 py-3">
                        <button
                          type="button"
                          data-bay-template-save=""
                          onClick={saveMine}
                          className="inline-flex items-center rounded-full border border-neutral-900 bg-white px-4 py-2 text-sm font-medium text-neutral-900"
                        >
                          {tt("保存为我的模板")}
                        </button>
                      </footer>
                    </div>
                  ) : (
                    <div className="flex min-h-0 flex-1">
                      <nav className="w-[220px] shrink-0 overflow-y-auto border-r border-neutral-200 p-2">
                        <p className="px-2 py-2 text-xs font-semibold text-neutral-500">{tt("预制模板")}</p>
                        {presets.map((row) => (
                          <TemplateNavButton
                            key={row.id}
                            snapshot={row}
                            active={selected?.id === row.id}
                            onClick={() => setSelectedId(row.id || "")}
                          />
                        ))}
                        <p className="mt-4 px-2 py-2 text-xs font-semibold text-neutral-500">{tt("我保存的")}</p>
                        {saved.length === 0 ? (
                          <p data-bay-template-empty="" className="px-2 py-1 text-sm text-neutral-600">
                            {tt("还没有保存过模板")}
                          </p>
                        ) : (
                          saved.map((row) => (
                            <TemplateNavButton
                              key={row.id}
                              snapshot={{ ...row.snapshot, id: row.id, title: row.title }}
                              active={selected?.id === row.id}
                              onClick={() => setSelectedId(row.id)}
                            />
                          ))
                        )}
                      </nav>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <DeviceToggle device={device} onChange={setDevice} phoneLabel={tt("手机版")} desktopLabel={tt("电脑版")} />
                        <div className="grid min-h-0 flex-1 place-items-center overflow-auto p-4">
                          {selected ? (
                            <DeviceFrame device={device}>
                              <BayListingPreview snapshot={selected.snapshot} />
                            </DeviceFrame>
                          ) : null}
                        </div>
                        {selected ? (
                          <footer className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-neutral-200 px-4 py-3">
                            <button
                              type="button"
                              data-bay-template-apply=""
                              data-bay-template={selected.id}
                              onClick={() => apply(selected.snapshot)}
                              className="inline-flex items-center rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
                            >
                              {tt("用这个填表")}
                            </button>
                            {selected.saved ? (
                              <button
                                type="button"
                                data-bay-template-delete=""
                                onClick={() => remove(selected.id)}
                                className="inline-flex items-center rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-600"
                              >
                                {tt("删除此模板")}
                              </button>
                            ) : null}
                          </footer>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </>,
          document.body,
        )
      : null;

  return (
    <div data-bay-publish-shell="">
      {props.children}
      {chrome}
    </div>
  );
}

function TemplateNavButton(props: { snapshot: BayPostSnapshot; active: boolean; onClick: () => void }): ReactElement {
  const kindLabel = props.snapshot.materialKind ? DIGITAL_MATERIAL_LABEL[props.snapshot.materialKind] : "";
  return (
    <button
      type="button"
      data-bay-template={props.snapshot.id || "saved"}
      data-bay-template-kind={props.snapshot.materialKind || ""}
      onClick={props.onClick}
      className={
        "mb-1 flex w-full flex-col items-start rounded-lg px-2 py-2 text-left text-[12px] " +
        (props.active ? "bg-neutral-900 text-white" : "text-neutral-800 hover:bg-neutral-100")
      }
    >
      {kindLabel ? <span className={props.active ? "text-[10px] text-neutral-300" : "text-[10px] text-neutral-500"}>{kindLabel}</span> : null}
      <span className="font-medium leading-5">{snapshotDisplayTitle(props.snapshot)}</span>
    </button>
  );
}

function DeviceToggle(props: {
  device: Device;
  onChange: (device: Device) => void;
  phoneLabel: string;
  desktopLabel: string;
}): ReactElement {
  return (
    <div className="flex shrink-0 justify-center gap-2 border-b border-neutral-100 px-4 py-2">
      <button
        type="button"
        data-bay-preview-device-btn="desktop"
        aria-pressed={props.device === "desktop"}
        onClick={() => props.onChange("desktop")}
        className={
          "rounded-full px-3 py-1 text-[12px] font-medium " +
          (props.device === "desktop" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700")
        }
      >
        {props.desktopLabel}
      </button>
      <button
        type="button"
        data-bay-preview-device-btn="phone"
        aria-pressed={props.device === "phone"}
        onClick={() => props.onChange("phone")}
        className={
          "rounded-full px-3 py-1 text-[12px] font-medium " +
          (props.device === "phone" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700")
        }
      >
        {props.phoneLabel}
      </button>
    </div>
  );
}

function DeviceFrame(props: { device: Device; children: ReactNode }): ReactElement {
  if (props.device === "phone") {
    return (
      <div
        data-bay-device-frame="phone"
        style={{
          width: 390,
          maxWidth: "100%",
          borderRadius: 36,
          border: "8px solid #171717",
          background: "#171717",
          padding: "12px 10px 16px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", height: 18, marginBottom: 8 }}>
          <span style={{ width: 72, height: 6, borderRadius: 99, background: "#404040" }} />
        </div>
        <div style={{ maxHeight: 720, overflow: "auto", borderRadius: 24, background: "#fff" }}>{props.children}</div>
      </div>
    );
  }
  return (
    <div
      data-bay-device-frame="desktop"
      style={{
        width: "100%",
        maxWidth: 980,
        borderRadius: 12,
        border: "1px solid #e5e5e5",
        background: "#fff",
        boxShadow: "0 8px 28px rgba(15,15,15,0.08)",
        overflow: "auto",
        maxHeight: 740,
      }}
    >
      <div
        style={{
          display: "flex",
          height: 36,
          alignItems: "center",
          gap: 6,
          borderBottom: "1px solid #e5e5e5",
          background: "#fafafa",
          padding: "0 12px",
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: 99, background: "#d4d4d4" }} />
        <span style={{ width: 8, height: 8, borderRadius: 99, background: "#d4d4d4" }} />
        <span style={{ width: 8, height: 8, borderRadius: 99, background: "#d4d4d4" }} />
      </div>
      <div style={{ padding: 16 }}>{props.children}</div>
    </div>
  );
}

function RailButton(props: {
  name: "templates" | "mine";
  active: boolean;
  label: string;
  onClick: () => void;
  icon: "grid" | "eye";
}): ReactElement {
  return (
    <button
      type="button"
      data-bay-rail={props.name}
      aria-pressed={props.active}
      onClick={props.onClick}
      aria-label={props.label}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        width: RAIL_WIDTH,
        height: "auto",
        padding: "12px 4px",
        border: "none",
        cursor: "pointer",
        background: props.active ? "#171717" : "transparent",
        color: props.active ? "#fff" : "#404040",
      }}
    >
      {props.icon === "grid" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="20" height="20" aria-hidden="true">
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="20" height="20" aria-hidden="true">
          <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="2.4" />
        </svg>
      )}
      <span
        style={{
          width: 48,
          fontSize: 11,
          lineHeight: 1.15,
          fontWeight: 500,
          textAlign: "center",
          wordBreak: "break-word",
        }}
      >
        {props.label}
      </span>
    </button>
  );
}
