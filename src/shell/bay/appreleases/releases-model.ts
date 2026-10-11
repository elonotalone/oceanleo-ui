// 更新日志表单校验、正文折叠、发布结果提示。纯函数，测试直接 import。

export const RELEASE_TITLE_MIN = 2;
export const RELEASE_TITLE_MAX = 120;
export const RELEASE_BODY_MIN = 1;
export const RELEASE_BODY_MAX = 4000;
export const RELEASE_VERSION_MAX = 40;
export const RELEASE_BODY_FOLD_LINES = 6;
export const RELEASE_PAGE_FIRST = 3;
export const RELEASE_PAGE_MORE = 10;

export type ReleaseDraft = {
  version: string;
  title: string;
  body: string;
  notify: boolean;
};

export function emptyReleaseDraft(): ReleaseDraft {
  return { version: "", title: "", body: "", notify: false };
}

export function trimReleaseField(value: string | undefined | null): string {
  return String(value ?? "").trim();
}

export function releaseFormProblem(input: { version?: string; title: string; body: string }): string | null {
  const version = trimReleaseField(input.version);
  if (version.length > RELEASE_VERSION_MAX) return "版本号最多 40 个字";
  const title = trimReleaseField(input.title);
  if (title.length < RELEASE_TITLE_MIN) return "标题至少 2 个字";
  if (title.length > RELEASE_TITLE_MAX) return "标题最多 120 个字";
  const body = trimReleaseField(input.body);
  if (body.length < RELEASE_BODY_MIN) return "内容至少 1 个字";
  if (body.length > RELEASE_BODY_MAX) return "内容最多 4000 个字";
  return null;
}

export function releaseBodyNeedsFold(body: string): boolean {
  return String(body ?? "").split("\n").length > RELEASE_BODY_FOLD_LINES;
}

export function foldedReleaseBody(body: string): string {
  const text = String(body ?? "");
  const lines = text.split("\n");
  if (lines.length <= RELEASE_BODY_FOLD_LINES) return text;
  return lines.slice(0, RELEASE_BODY_FOLD_LINES).join("\n");
}

/** 勾了通知且真的发出去了 / 勾了但人数为 0 / 没勾。返回给 tt() 的中文原文。 */
export function publishReleaseNotice(input: { notify: boolean; notified: number }): string {
  const notified = Number.isFinite(input.notified) ? Math.max(0, Math.floor(input.notified)) : 0;
  if (input.notify && notified > 0) return "已发布，通知了 {n} 人";
  if (input.notify) return "已发布。这次没有发通知：没有人关注，或者 24 小时内已经通知过";
  return "已发布";
}

export function formatReleaseDay(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function toReleaseCreateInput(draft: ReleaseDraft): { version?: string; title: string; body: string; notify: boolean } {
  const version = trimReleaseField(draft.version);
  return {
    ...(version ? { version } : {}),
    title: trimReleaseField(draft.title),
    body: trimReleaseField(draft.body),
    notify: Boolean(draft.notify),
  };
}

export function toReleasePatch(draft: Pick<ReleaseDraft, "version" | "title" | "body">): { version: string; title: string; body: string } {
  return {
    version: trimReleaseField(draft.version),
    title: trimReleaseField(draft.title),
    body: trimReleaseField(draft.body),
  };
}
