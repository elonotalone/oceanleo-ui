// 安全矩阵：UC-4（更新日志是不可信文本，只按文本渲染；本文件断言没有注入点）
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  applyFollowFromReleasePage,
  getFollowSnapshot,
  optimisticFollow,
  resetFollowStore,
  rollbackFollow,
  subscribeFollowStore,
  writeFollowSnapshot,
} from "../src/shell/bay/appreleases/follow-store.ts";
import {
  emptyReleaseDraft,
  foldedReleaseBody,
  formatReleaseDay,
  publishReleaseNotice,
  releaseBodyNeedsFold,
  releaseFormProblem,
  toReleaseCreateInput,
  toReleasePatch,
} from "../src/shell/bay/appreleases/releases-model.ts";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const src = (rel) => readFileSync(join(REPO, rel), "utf8");

const FILES = [
  "src/shell/bay/appreleases/AppReleases.tsx",
  "src/shell/bay/appreleases/FollowButton.tsx",
  "src/shell/bay/appreleases/ReleasesManagePanel.tsx",
  "src/shell/bay/appreleases/MyFollowedAppsPane.tsx",
  "src/shell/bay/appreleases/releases-model.ts",
  "src/shell/bay/appreleases/follow-store.ts",
];

test("releaseFormProblem：版本超长、标题过短过长、正文空或超长", () => {
  assert.equal(releaseFormProblem({ version: "", title: "标题够了", body: "有内容" }), null);
  assert.equal(releaseFormProblem({ version: "v".repeat(41), title: "标题够了", body: "有内容" }), "版本号最多 40 个字");
  assert.equal(releaseFormProblem({ version: "1.0", title: "一", body: "有内容" }), "标题至少 2 个字");
  assert.equal(releaseFormProblem({ version: "", title: "标".repeat(121), body: "有内容" }), "标题最多 120 个字");
  assert.equal(releaseFormProblem({ version: "", title: "标题够了", body: "   " }), "内容至少 1 个字");
  assert.equal(releaseFormProblem({ version: "", title: "标题够了", body: "字".repeat(4001) }), "内容最多 4000 个字");
  assert.equal(releaseFormProblem({ version: "1.2.0", title: "  两个  ", body: "  x  " }), null);
});

test("折叠判断：超过 6 行才折，折后只留前 6 行", () => {
  const six = ["1", "2", "3", "4", "5", "6"].join("\n");
  const seven = `${six}\n7`;
  assert.equal(releaseBodyNeedsFold(six), false);
  assert.equal(releaseBodyNeedsFold(seven), true);
  assert.equal(foldedReleaseBody(seven), six);
  assert.equal(foldedReleaseBody(six), six);
});

test("publishReleaseNotice：勾了且发出去 / 勾了但 0 / 没勾", () => {
  assert.equal(publishReleaseNotice({ notify: true, notified: 3 }), "已发布，通知了 {n} 人");
  assert.equal(publishReleaseNotice({ notify: true, notified: 0 }), "已发布。这次没有发通知：没有人关注，或者 24 小时内已经通知过");
  assert.equal(publishReleaseNotice({ notify: false, notified: 9 }), "已发布");
});

test("toReleaseCreateInput 空版本号不传；日期只取 ISO 日", () => {
  const draft = { ...emptyReleaseDraft(), version: "  ", title: "  标题  ", body: "  正文  ", notify: true };
  assert.deepEqual(toReleaseCreateInput(draft), { title: "标题", body: "正文", notify: true });
  assert.deepEqual(toReleasePatch({ version: " 1.0 ", title: " 标题 ", body: " 正文 " }), {
    version: "1.0",
    title: "标题",
    body: "正文",
  });
  assert.equal(formatReleaseDay("2026-10-11T08:00:00.000Z"), "2026-10-11");
  assert.equal(formatReleaseDay("not-a-date"), "");
  assert.equal(formatReleaseDay(null), "");
});

test("follow-store：写入、相同值不通知、乐观更新与回滚", () => {
  resetFollowStore();
  let ticks = 0;
  const stop = subscribeFollowStore(() => {
    ticks += 1;
  });
  assert.equal(getFollowSnapshot("app-1"), null);
  writeFollowSnapshot("app-1", { following: false, follower_count: 2 });
  assert.deepEqual(getFollowSnapshot("app-1"), { following: false, follower_count: 2 });
  assert.equal(ticks, 1);
  writeFollowSnapshot("app-1", { following: false, follower_count: 2 });
  assert.equal(ticks, 1);

  const prev = optimisticFollow("app-1", true);
  assert.deepEqual(prev, { following: false, follower_count: 2 });
  assert.deepEqual(getFollowSnapshot("app-1"), { following: true, follower_count: 3 });
  assert.equal(ticks, 2);
  rollbackFollow("app-1", prev);
  assert.deepEqual(getFollowSnapshot("app-1"), { following: false, follower_count: 2 });
  assert.equal(ticks, 3);

  applyFollowFromReleasePage("app-1", { viewer_following: true, follower_count: 8 });
  assert.deepEqual(getFollowSnapshot("app-1"), { following: true, follower_count: 8 });

  const emptyPrev = optimisticFollow("app-missing", true);
  assert.equal(emptyPrev, null);
  assert.deepEqual(getFollowSnapshot("app-missing"), { following: true, follower_count: 1 });
  rollbackFollow("app-missing", emptyPrev);
  assert.equal(getFollowSnapshot("app-missing"), null);
  stop();
  resetFollowStore();
});

// UC-4：更新日志是不可信文本，只按文本渲染。
test("组件只走 app-releases 客户端，没有 fetch /v1/ 或注入点", () => {
  for (const file of FILES) {
    const text = src(file);
    assert.doesNotMatch(text, /\bfetch\s*\(/, `${file} 不得自己 fetch`);
    assert.doesNotMatch(text, /\/v1\//, `${file} 不得写 /v1/`);
    assert.doesNotMatch(text, /dangerouslySetInnerHTML/, `${file} 不得注入 HTML`);
    assert.doesNotMatch(text, /\.innerHTML\s*=/, `${file} 不得写 innerHTML`);
    assert.doesNotMatch(text, /<iframe/, `${file} 不得加 iframe`);
  }
  const app = src("src/shell/bay/appreleases/AppReleases.tsx");
  const follow = src("src/shell/bay/appreleases/FollowButton.tsx");
  const manage = src("src/shell/bay/appreleases/ReleasesManagePanel.tsx");
  const mine = src("src/shell/bay/appreleases/MyFollowedAppsPane.tsx");
  assert.match(app, /listBayAppReleases/);
  assert.match(app, /data-bay-app-releases/);
  assert.match(app, /whitespace-pre-wrap/);
  assert.match(app, /openBay\(\{ kind: "app-manage", appId, tab: "releases" \}\)/);
  assert.match(follow, /listBayAppReleases/);
  assert.match(follow, /followBayApp/);
  assert.match(follow, /unfollowBayApp/);
  assert.match(follow, /requireBayLogin/);
  assert.match(follow, /data-bay-app-follow/);
  assert.match(follow, /optimisticFollow/);
  assert.match(follow, /rollbackFollow/);
  assert.match(manage, /createBayAppRelease/);
  assert.match(manage, /updateBayAppRelease/);
  assert.match(manage, /deleteBayAppRelease/);
  assert.match(manage, /listBayAppReleases/);
  assert.match(mine, /listFollowedBayApps/);
  assert.match(mine, /unfollowBayApp/);
  assert.match(mine, /rememberBayAppEntry\(appId, "follow"\)/);
  assert.match(mine, /from "\.\.\/appinsights\/app-source"/);
  assert.match(mine, /openBay\(\{ kind: "app", id: appId \}\)/);
  assert.match(mine, /referrerPolicy="no-referrer"/);
});

test("更新日志发布表用展开表单，不摆事先提示小字", () => {
  const manage = src("src/shell/bay/appreleases/ReleasesManagePanel.tsx");
  assert.match(manage, /BayRevealForm/);
  assert.match(manage, /from ["']\.\.\/form["']/);
  assert.match(manage, /id:\s*"version"/);
  assert.match(manage, /id:\s*"title"/);
  assert.match(manage, /id:\s*"body"/);
  assert.match(manage, /optional:\s*true/);
  assert.doesNotMatch(manage, /placeholder=/);
  assert.doesNotMatch(manage, /Please enter/i);
  assert.doesNotMatch(manage, /例如 1\.2\.0/);
  assert.doesNotMatch(manage, /可选，最多 40 个字/);
  assert.doesNotMatch(manage, /text-neutral-400|text-stone-400/);
  assert.doesNotMatch(manage, /bg-white\/95/);
  assert.doesNotMatch(manage, /-mx-4/);
});
