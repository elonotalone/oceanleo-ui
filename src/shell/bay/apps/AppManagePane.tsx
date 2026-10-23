"use client";

// 「管理网站或软件」：作者在这里打理它的留言、登录、收费、更新日志、报错、来源、公开网址。
// 本文件只是外壳（分页条 + 归属核对）；七个分页各是一个单元的组件，按需加载，按文件路径引用。
import { lazy, Suspense, type ReactElement } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import { getBayApp } from "../../../lib/bay/apps";
import { BAY_APP_MANAGE_TABS, openBay, type BayAppManageTab, type BayPaneProps } from "../shell/bay-state";
import { PaneLoading, PaneMessage } from "../supply/parts";
import { useBayResource } from "../supply/use-bay-resource";

const FeedbackManagePanel = lazy(() => import("../appfeedback/FeedbackManagePanel").then((mod) => ({ default: mod.FeedbackManagePanel })));
const LoginManagePanel = lazy(() => import("../applogin/LoginManagePanel").then((mod) => ({ default: mod.LoginManagePanel })));
const PricingManagePanel = lazy(() => import("../apppaid/PricingManagePanel").then((mod) => ({ default: mod.PricingManagePanel })));
const ReleasesManagePanel = lazy(() => import("../appreleases/ReleasesManagePanel").then((mod) => ({ default: mod.ReleasesManagePanel })));
const ErrorsManagePanel = lazy(() => import("../appinsights/ErrorsManagePanel").then((mod) => ({ default: mod.ErrorsManagePanel })));
const SourcesManagePanel = lazy(() => import("../appinsights/SourcesManagePanel").then((mod) => ({ default: mod.SourcesManagePanel })));
const EndpointManagePanel = lazy(() => import("../appendpoint/EndpointManagePanel").then((mod) => ({ default: mod.EndpointManagePanel })));

/** 分页条上的字（中文原文，渲染时过 tt）。 */
export const APP_MANAGE_TAB_LABELS: Readonly<Record<BayAppManageTab, string>> = {
  feedback: "留言",
  // 不叫「账号登录」：那句原文在账户安全页已经有译文（Signed in），意思不同。
  login: "访客登录",
  pricing: "收费",
  releases: "更新日志",
  errors: "报错",
  sources: "访客来源",
  endpoint: "公开网址",
};

export function manageTabOf(target: BayPaneProps["target"]): BayAppManageTab {
  return target.kind === "app-manage" && target.tab ? target.tab : "feedback";
}

function Panel({ tab, appId }: { tab: BayAppManageTab; appId: string }): ReactElement {
  switch (tab) {
    case "login":
      return <LoginManagePanel appId={appId} />;
    case "pricing":
      return <PricingManagePanel appId={appId} />;
    case "releases":
      return <ReleasesManagePanel appId={appId} />;
    case "errors":
      return <ErrorsManagePanel appId={appId} />;
    case "sources":
      return <SourcesManagePanel appId={appId} />;
    case "endpoint":
      return <EndpointManagePanel appId={appId} />;
    default:
      return <FeedbackManagePanel appId={appId} />;
  }
}

export function AppManagePane(props: BayPaneProps): ReactElement | null {
  const tt = useUI();
  const appId = props.target.kind === "app-manage" ? props.target.appId : "";
  const tab = manageTabOf(props.target);
  const resource = useBayResource(appId ? `app-manage:${appId}` : null, () => getBayApp(appId));
  if (!appId) return null;
  if (resource.loading) return <PaneLoading />;
  if (!resource.data) {
    const text = resource.status === 404 || !resource.error ? tt("这个网站或软件不存在或已下架") : tt(resource.error);
    return <PaneMessage text={text} onRetry={resource.reload} />;
  }
  if (!resource.data.viewer.is_owner) return <PaneMessage text={tt("只有作者本人能管理这个网站或软件")} />;
  const app = resource.data.app;
  return (
    <div data-bay-pane="app-manage" className="p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 break-words text-[18px] font-semibold text-neutral-950">{app.title}</h2>
        <button
          type="button"
          data-bay-action="view-app"
          onClick={() => openBay({ kind: "app", id: app.id })}
          className="shrink-0 rounded-full border border-neutral-900 px-2 py-1 text-[12px] text-neutral-700 hover:bg-neutral-50"
        >
          {tt("查看详情页")}
        </button>
      </div>
      <div role="tablist" aria-label={tt("管理网站或软件")} className="mt-4 flex flex-wrap gap-1 border-b border-neutral-200">
        {BAY_APP_MANAGE_TABS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={value === tab}
            data-bay-manage-tab={value}
            onClick={() => openBay({ kind: "app-manage", appId: app.id, tab: value })}
            className={
              value === tab
                ? "-mb-px border-b-2 border-neutral-900 px-3 py-2 text-[13px] font-semibold text-neutral-950"
                : "-mb-px border-b-2 border-transparent px-3 py-2 text-[13px] text-neutral-500 hover:text-neutral-800"
            }
          >
            {tt(APP_MANAGE_TAB_LABELS[value])}
          </button>
        ))}
      </div>
      <div data-bay-manage-panel={tab} className="mt-4">
        <Suspense fallback={<PaneLoading />}>
          <Panel tab={tab} appId={app.id} />
        </Suspense>
      </div>
    </div>
  );
}
