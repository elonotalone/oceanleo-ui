"use client";

// 「我的」→「我发布的」：一张列表。现成文件、人工服务、网站与软件服务、课程、其他都在这里，每一行右边标明类别。
import { useUI } from "../../../i18n/ui/useUI";
import { deleteBayApp, listMyBayApps } from "../../../lib/bay/apps";
import { deleteBayLesson, listMyBayLessons } from "../../../lib/bay/lessons";
import { deleteMyConsult, deleteMyService, listMyConsults, listMyServices } from "../../../lib/bay/seller";
import { openBay, useBaySignedIn } from "../shell/bay-state";
import { useMineBundle, type MinePaneProps } from "./mine-bundle";
import { categoryOfListingKind, listingStatusText, mineEmptyText, rowMatchesCategory } from "./mine-category";
import { MineTradeList, type MineTradeRow } from "./MineTradeList";
import type { PublishedCategory } from "./PublishedCategoryTag";

type PublishedBundle = {
  services: Awaited<ReturnType<typeof listMyServices>>["items"];
  consults: Awaited<ReturnType<typeof listMyConsults>>["items"];
  apps: Awaited<ReturnType<typeof listMyBayApps>>["items"];
  lessons: Awaited<ReturnType<typeof listMyBayLessons>>["items"];
};

async function loadPublished(): Promise<PublishedBundle> {
  const [services, consults, apps, lessons] = await Promise.all([
    listMyServices(),
    listMyConsults().catch(() => ({ items: [] as PublishedBundle["consults"] })),
    listMyBayApps().catch(() => ({ items: [] as PublishedBundle["apps"] })),
    listMyBayLessons().catch(() => ({ items: [] as PublishedBundle["lessons"] })),
  ]);
  return {
    services: services.items || [],
    consults: consults.items || [],
    apps: apps.items || [],
    lessons: lessons.items || [],
  };
}

export function MyPublishedPane({ category = "all", query = "", display = "grid" }: MinePaneProps) {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const bundle = useMineBundle(signedIn, loadPublished, tt("列表没读出来，请稍后再试。"));
  const data = bundle.data;
  const rows: MineTradeRow[] = [];
  const hint = tt("确定删除这条帖子吗？删除后不能恢复。");
  // 删完重新读一遍列表；服务端不让删时（有进行中的订单等）错误文案由列表显示在这一行下面。
  const remover = (call: () => Promise<unknown>) => async () => {
    await call();
    bundle.reload();
  };
  if (data) {
    for (const service of data.services) {
      const kind: PublishedCategory = categoryOfListingKind(service.listing_kind);
      if (!rowMatchesCategory(category, kind)) continue;
      rows.push({
        id: `service:${service.id}`,
        title: service.title || tt("未命名"),
        subtitle: tt(listingStatusText(service.status, service.moderation_hidden)),
        coverUrl: service.cover_url,
        searchText: service.summary,
        category: kind,
        onOpen: () => openBay({ kind: "service-editor", serviceId: service.id }),
        onDelete: remover(() => deleteMyService(service.id)),
        deleteHint: hint,
      });
    }
    for (const consult of data.consults) {
      if (!rowMatchesCategory(category, "service")) continue;
      rows.push({
        id: `consult:${consult.id}`,
        title: consult.title || tt("未命名"),
        subtitle: tt(listingStatusText(consult.status, consult.moderation_hidden)),
        category: "service",
        onOpen: () => openBay({ kind: "consult", id: consult.id }),
        onDelete: remover(() => deleteMyConsult(consult.id)),
        deleteHint: hint,
      });
    }
    for (const app of data.apps) {
      if (!rowMatchesCategory(category, "app")) continue;
      rows.push({
        id: `app:${app.id}`,
        title: app.title || tt("未命名"),
        subtitle: tt(listingStatusText(app.status, app.moderation_hidden)),
        coverUrl: app.cover_url,
        searchText: app.summary,
        category: "app",
        onOpen: () => openBay({ kind: "app-editor", appId: app.id }),
        onDelete: remover(() => deleteBayApp(app.id)),
        deleteHint: hint,
      });
    }
    for (const lesson of data.lessons) {
      if (!rowMatchesCategory(category, "lesson")) continue;
      rows.push({
        id: `lesson:${lesson.id}`,
        title: lesson.title || tt("未命名课程"),
        subtitle: tt(listingStatusText(lesson.status, lesson.moderation_hidden)),
        coverUrl: lesson.cover_url,
        searchText: lesson.summary,
        category: "lesson",
        onOpen: () => openBay({ kind: "lesson-editor", lessonId: lesson.id }),
        onDelete: remover(() => deleteBayLesson(lesson.id)),
        deleteHint: hint,
      });
    }
  }
  return (
    <MineTradeList
      pane="mine-published"
      rows={rows}
      loading={bundle.loading}
      error={bundle.error}
      onRetry={bundle.reload}
      emptyText={mineEmptyText("published")}
      query={query}
      display={display}
    />
  );
}
