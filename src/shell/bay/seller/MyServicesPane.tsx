"use client";

// Bay「我的」→「我的服务」：按状态分组（被隐藏 / 在架 / 已暂停 / 草稿），空状态给「发布第一个服务」。
// 全部内容按纯文本渲染。

import { useCallback, useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  BAY_SERVICE_GROUP_ORDER,
  groupMyServices,
  listMyConsults,
  listMyServices,
  type BayOwnConsult,
  type BayOwnService,
  type BayServiceGroup,
} from "../../../lib/bay/seller";
import { openBay, requireBayLogin, useBaySignedIn, type BayPaneProps } from "../shell/bay-state";

const GROUP_TITLES: Record<BayServiceGroup, string> = {
  hidden: "被平台隐藏",
  published: "已上架",
  paused: "已暂停",
  draft: "草稿",
};

interface Loaded {
  services: BayOwnService[];
  consults: BayOwnConsult[];
  error: string;
}

export function MyServicesPane(_props: BayPaneProps) {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => {
    setLoaded(null);
    setNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    void Promise.all([listMyServices(), listMyConsults().catch(() => ({ items: [] as BayOwnConsult[] }))]).then(
      ([services, consults]) => {
        if (alive) setLoaded({ services: services.items || [], consults: consults.items || [], error: "" });
      },
      (error: unknown) => {
        if (alive) setLoaded({ services: [], consults: [], error: error instanceof Error ? error.message : "" });
      },
    );
    return () => {
      alive = false;
    };
  }, [signedIn, nonce]);

  if (!signedIn) {
    return (
      <section data-bay-pane="mine-services" className="p-4 text-[13px] text-stone-600">
        <p>{tt("登录后管理你发布的服务。")}</p>
        <button type="button" onClick={() => requireBayLogin()} className="mt-3 rounded-xl bg-stone-900 px-4 py-2 text-[13px] font-semibold text-white">
          {tt("登录")}
        </button>
      </section>
    );
  }

  if (!loaded) return <section data-bay-pane="mine-services" className="p-4 text-[13px] text-stone-500">{tt("正在加载…")}</section>;

  if (loaded.error) {
    return (
      <section data-bay-pane="mine-services" role="alert" className="p-4 text-[13px] text-rose-700">
        <p>{tt(loaded.error)}</p>
        <button type="button" onClick={reload} className="mt-2 font-medium underline underline-offset-2">{tt("重试")}</button>
      </section>
    );
  }

  const groups = groupMyServices(loaded.services);
  const empty = loaded.services.length === 0 && loaded.consults.length === 0;

  return (
    <section data-bay-pane="mine-services" className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-stone-900">{tt("我的服务")}</h2>
        <button type="button" onClick={() => openBay({ kind: "service-editor" })} className="rounded-xl bg-stone-900 px-3 py-1.5 text-[12.5px] font-semibold text-white">
          {tt("发布服务")}
        </button>
      </div>
      {empty ? (
        <div data-bay-empty="services" className="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center">
          <p className="text-[13px] text-stone-600">{tt("还没有发布过服务。把一件你做得好的事变成别人能直接下单的服务。")}</p>
          <button type="button" onClick={() => openBay({ kind: "service-editor" })} className="mt-3 rounded-xl bg-stone-900 px-4 py-2 text-[13px] font-semibold text-white">
            {tt("发布第一个服务")}
          </button>
        </div>
      ) : (
        BAY_SERVICE_GROUP_ORDER.filter((group) => groups[group].length > 0).map((group) => (
          <div key={group} data-bay-group={group}>
            <h3 className="mb-2 text-[12px] font-semibold text-stone-500">
              {tt(GROUP_TITLES[group])} · {groups[group].length}
            </h3>
            <ul className="space-y-2">
              {groups[group].map((service) => (
                <li key={service.id}>
                  <button
                    type="button"
                    onClick={() => openBay({ kind: "service-editor", serviceId: service.id })}
                    className="block w-full rounded-2xl border border-stone-200 bg-white px-3.5 py-3 text-left hover:bg-stone-50"
                  >
                    <span className="block truncate text-[14px] font-semibold text-stone-800">{service.title || tt("未命名服务")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
