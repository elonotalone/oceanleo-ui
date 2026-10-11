import type { HostedSite } from "../../../api/hosted-sites";
import type { BayAppMine, BayAppPatchInput } from "../../../lib/bay/apps";

export type AppDraft = {
  title: string;
  summary: string;
  description: string;
  coverUrl: string;
  category: string;
  embedMode: "embed" | "link";
  url: string;
};

const TITLE_LIMIT = 80;
const SUMMARY_LIMIT = 200;
const DESCRIPTION_LIMIT = 4000;

export function draftFromApp(app: BayAppMine): AppDraft {
  return {
    title: app.title || "",
    summary: app.summary || "",
    description: app.description || "",
    coverUrl: app.cover_url || "",
    category: app.category || "",
    embedMode: app.embed_mode === "link" ? "link" : "embed",
    url: app.url || "",
  };
}

export function patchFromDraft(draft: AppDraft, app: BayAppMine): BayAppPatchInput {
  const patch: BayAppPatchInput = {};
  if (draft.title !== (app.title || "")) patch.title = draft.title;
  if (draft.summary !== (app.summary || "")) patch.summary = draft.summary;
  if (draft.description !== (app.description || "")) patch.description = draft.description;
  const nextCover = draft.coverUrl.trim() === "" ? null : draft.coverUrl;
  if (nextCover !== (app.cover_url || null)) patch.cover_url = nextCover;
  if (draft.category !== (app.category || "")) patch.category = draft.category;
  if (draft.embedMode !== app.embed_mode) patch.embed_mode = draft.embedMode;
  if (app.source_kind === "external" && draft.url !== (app.url || "")) patch.url = draft.url;
  return patch;
}

export function draftProblems(draft: AppDraft): string[] {
  const problems: string[] = [];
  if (!draft.title.trim()) problems.push("请填写名称");
  else if (draft.title.length > TITLE_LIMIT) problems.push("名称不能超过 80 个字");
  if (!draft.summary.trim()) problems.push("请写一句话简介");
  else if (draft.summary.length > SUMMARY_LIMIT) problems.push("一句话简介不能超过 200 个字");
  if (draft.description.length > DESCRIPTION_LIMIT) problems.push("详细介绍不能超过 4000 个字");
  if (draft.coverUrl.trim() && !draft.coverUrl.startsWith("https://")) {
    problems.push("封面图需要是 https 开头的图片地址");
  }
  if (!draft.category.trim()) problems.push("请选择一个站点类目");
  return problems;
}

export function statusLabel(app: Pick<BayAppMine, "status" | "moderation_hidden">): string {
  if (app.moderation_hidden) return "已被平台隐藏";
  if (app.status === "published") return "已上架";
  if (app.status === "offline") return "已下架";
  return "草稿";
}

export function embedNote(app: Pick<BayAppMine, "embed_ok">): string {
  if (app.embed_ok === true) return "这个网站可以在页内窗口里显示";
  if (app.embed_ok === false) return '这个网站不允许被嵌入，访客会看到"打开网站"按钮';
  return "还没检测";
}

export function liveHostedSites(items: HostedSite[]): HostedSite[] {
  return items.filter((item) => item.status === "live");
}
