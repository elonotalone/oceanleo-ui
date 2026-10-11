"use client";

// 「我的」→「我买到的」：我作为买家的订单、买到的课程与作品，以及我关注、留过言、授权登录过的作品。
import { useEffect, useState, type ComponentType } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { MyBoughtLessonsPaneProps } from "../lessons/MyBoughtLessonsPane";
import { MyOrdersPane } from "../orders/MyOrdersPane";
import type { BayPaneProps } from "../shell/bay-state";
import { LazySection } from "./LazySection";

const loadBoughtApps = () => import("../apppaid/MyBoughtAppsPane").then((mod) => mod.MyBoughtAppsPane);
const loadFollowedApps = () => import("../appreleases/MyFollowedAppsPane").then((mod) => mod.MyFollowedAppsPane);
const loadMyThreads = () => import("../appfeedback/MyThreadsPane").then((mod) => mod.MyThreadsPane);
const loadLoginGrants = () => import("../applogin/MyAppLoginGrants").then((mod) => mod.MyAppLoginGrants);

function BoughtLessons(props: MyBoughtLessonsPaneProps) {
  const tt = useUI();
  const [Pane, setPane] = useState<ComponentType<MyBoughtLessonsPaneProps> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void import("../lessons/MyBoughtLessonsPane")
      .then((mod) => {
        if (alive) setPane(() => mod.MyBoughtLessonsPane);
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

export function MyBoughtPane(props: BayPaneProps) {
  const tt = useUI();
  return (
    <section data-bay-pane="mine-bought" className="space-y-6">
      <MyOrdersPane {...props} fixedRole="buyer" />
      <div data-bay-mine-section="lessons">
        <h3 className="px-4 text-[13px] font-semibold text-stone-700">{tt("课程")}</h3>
        <BoughtLessons layout={props.layout} siteKey={props.siteKey} />
      </div>
      <LazySection marker="apps" title="作品" load={loadBoughtApps} />
      <LazySection marker="following" title="关注的作品" load={loadFollowedApps} />
      <LazySection marker="threads" title="我的留言" load={loadMyThreads} />
      <LazySection marker="logins" title="用 OceanLeo 账号登录过的作品" load={loadLoginGrants} />
    </section>
  );
}
