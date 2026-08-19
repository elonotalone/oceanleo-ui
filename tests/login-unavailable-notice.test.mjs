// 登不上的时候到底跟用户说什么。
//
// 2026-08-19 操作员截图 `oceanleo.cn/account`：页面上是一句
// 「Login service isn't configured yet (missing Supabase environment variables)」。
// 那句话是给运维看的，境内访客看到的却是它。而境内登不上不是故障——境内版按
// 「暂不开放注册」上线（见 oceandino 仓
// `docs/work-logs/2026-08/oceanleo-cn-launch/OPERATOR-BLOCKERS.md`），
// 镜像刻意不带 Supabase 变量。
//
// 判据是「按家族分开答」：
//   · cn 家族 → 产品状态那句人话，且**不许**提到 Supabase / 环境变量；
//   · 其他 host（本地开发、有人漏配 Vercel）→ 保留技术说明，看的人正需要它；
//   · 配好了 → 不出提示。
//
// 还有一条：四处「登不上」的界面（账户页、设置页、AI 模型页、登录框）必须都走
// 这一个判据，不许有第五份自己写的文案 —— 上一次就是这么漂移出去的。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { compileModule } from "./helpers/module-bench.mjs";

const { loginUnavailableNoticeFor } = await import(
  await compileModule("src/lib/auth/config.ts", {})
);

test("境内版说的是「还没开放」，一个字都不提环境变量", () => {
  const notice = loginUnavailableNoticeFor("cn", false);
  assert.ok(notice, "境内版登不上，必须给一句说明");
  assert.match(notice.title, /还没有开放|尚未开放/);
  const whole = `${notice.title}${notice.detail}`;
  for (const leak of ["Supabase", "环境变量", "env", "配置"]) {
    assert.equal(
      whole.includes(leak),
      false,
      `境内访客看到的话里不该出现「${leak}」：${whole}`,
    );
  }
  assert.match(notice.detail, /浏览|公开内容/, "要告诉用户现在还能做什么");
});

test("海外/本地没配上时保留技术说明", () => {
  for (const family of ["com", undefined]) {
    const notice = loginUnavailableNoticeFor(family, false);
    assert.ok(notice);
    assert.match(notice.title, /登录服务尚未配置/);
  }
});

test("配好了就不出提示", () => {
  assert.equal(loginUnavailableNoticeFor("cn", true), null);
  assert.equal(loginUnavailableNoticeFor("com", true), null);
});

test("四处登不上的界面都走同一个判据，没有第五份文案", async () => {
  const files = [
    "src/pages/AccountPage.tsx",
    "src/pages/SettingsPage.tsx",
    "src/pages/ApiPage.tsx",
    "src/pages/AuthDialog.tsx",
  ];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.match(
      source,
      /loginUnavailableNotice\(\)/,
      `${file} 没走统一判据`,
    );
    assert.equal(
      source.includes("登录服务尚未配置（缺少 Supabase 环境变量）。"),
      false,
      `${file} 还在把「缺少 Supabase 环境变量」甩给用户`,
    );
  }
});
