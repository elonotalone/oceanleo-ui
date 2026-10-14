"use client";

// 「我的」→「我发布的」：一张列表。成品文件、人工服务、网站与软件服务、课程都在这里，每一行右边标明类别。
// 没有需求、没有套餐、没有分区标题；右上角一个「发布」。
import { useEffect, useState, type ComponentType } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { MyAppsPaneProps } from "../apps";
import type { MyLessonsPaneProps } from "../lessons/MyLessonsPane";
import { MyServicesPane } from "../seller/MyServicesPane";
import { openBay } from "../shell/bay-state";
import { type MinePaneProps } from "./MineCategoryBar";

// 按需加载：静态 import ../apps 会经 MyAppsPane → BayMine → mine/index 绕回本文件。
// 加载失败时这一段要说出来，不能看上去像「你没有作品」。
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
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  if (failed) return <p className="px-4 py-3 text-[13px] text-stone-500">{tt("作品没加载出来，请刷新页面再试。")}</p>;
  return Pane ? <Pane layout={props.layout} siteKey={props.siteKey} /> : null;
}

function PublishedLessons(props: MyLessonsPaneProps) {
  const tt = useUI();
  const [Pane, setPane] = useState<ComponentType<MyLessonsPaneProps> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void import("../lessons/MyLessonsPane")
      .then((mod) => {
        if (alive) setPane(() => mod.MyLessonsPane);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  if (failed) return <p className="px-4 py-3 text-[13px] text-stone-500">{tt("课程没加载出来，请刷新页面再试。")}</p>;
  return Pane ? <Pane layout={props.layout} siteKey={props.siteKey} /> : null;
}

export function MyPublishedPane({ category = "all", ...props }: MinePaneProps) {
  const tt = useUI();
  // 成品文件、人工服务、其他都是服务表里的行；作品、课程各有自己的一段。
  const showServices = category !== "app" && category !== "lesson";
  const showApps = category === "all" || category === "app";
  const showLessons = category === "all" || category === "lesson";
  return (
    <section data-bay-pane="mine-published" className="space-y-4">
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
      {showServices ? (
        <div data-bay-mine-section="supply">
          <MyServicesPane {...props} hideNew category={category} />
        </div>
      ) : null}
      {showApps ? (
        <div data-bay-mine-section="apps">
          <PublishedApps layout={props.layout} siteKey={props.siteKey} />
        </div>
      ) : null}
      {showLessons ? (
        <div data-bay-mine-section="lessons">
          <PublishedLessons layout={props.layout} siteKey={props.siteKey} />
        </div>
      ) : null}
    </section>
  );
}
