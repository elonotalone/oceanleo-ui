// 消息板块静态门禁（work-chat V11，第二轮）：只读源码，不渲染、不联网、不开浏览器。
// 覆盖验收条目：12（没有注入点 / iframe / postMessage）、11（境内没有入口、深链无效）、
// 18（二维码只用 <img> + data URL，只编码本站 https）、19（消息目录没有浏览器原生弹窗）、
// 17（群头像字段名与 https 校验）、境内与非管理员 Team 邀请的文案分支。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

/** 去掉注释（行注释与块注释），保留字符串；足够用来判定「代码里有没有」。 */
function stripComments(text) {
  let out = "";
  let i = 0;
  let quote = "";
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (quote) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (ch === quote) quote = "";
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    out += ch;
    i += 1;
  }
  return out;
}

const messageDirs = ["src/shell/messages", "src/lib/im"];
const wideDirs = [...messageDirs, "src/shell/collab", "src/shell/replay/work"];
const filesOf = (dirs) => dirs.flatMap((d) => walk(join(root, d)));
const codeOf = (file) => stripComments(readFileSync(file, "utf8"));
const hits = (files, re) =>
  files.flatMap((f) => {
    const lines = codeOf(f).split("\n");
    return lines.flatMap((line, n) => (re.test(line) ? [`${relative(root, f)}:${n + 1}: ${line.trim().slice(0, 100)}`] : []));
  });

test("目录都在、文件数合理（防止路径改了门禁变空）", () => {
  assert.ok(filesOf(["src/shell/messages"]).length >= 40);
  assert.ok(filesOf(["src/lib/im"]).length >= 8);
  assert.ok(filesOf(["src/shell/collab"]).length >= 5);
  assert.ok(filesOf(["src/shell/replay/work"]).length >= 5);
});

test("12 注入点：代码里没有 dangerouslySetInnerHTML / innerHTML / outerHTML / insertAdjacentHTML / document.write", () => {
  const found = hits(filesOf(wideDirs), /dangerouslySetInnerHTML|\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write\(/);
  assert.deepEqual(found, []);
});

test("12 没有 iframe、eval、new Function；消息目录不收发 postMessage", () => {
  assert.deepEqual(hits(filesOf(messageDirs), /<iframe|\beval\(|new Function\(/), []);
  // 唯一的例外：Service Worker 通知点击桥（navigator.serviceWorker 的 message），它必须校验来源与脚本路径
  const bridge = "src/shell/messages/notify/push-subscribe.ts";
  const found = hits(filesOf(messageDirs), /\.postMessage\(|addEventListener\(\s*["']message["']/).filter((h) => !h.startsWith(bridge));
  assert.deepEqual(found, []);
  const code = codeOf(join(root, bridge));
  assert.match(code, /const container = navigator\.serviceWorker/);
  assert.match(code, /event\.origin !== window\.location\.origin/);
  assert.match(code, /script\.origin !== window\.location\.origin \|\| script\.pathname !== IM_SW_PATH/);
  assert.match(code, /data\.type !== "im\.open"/);
});

test("19 消息目录没有浏览器原生弹窗：window.confirm / alert / prompt、裸 confirm( alert( prompt(", () => {
  const found = hits(filesOf(messageDirs), /\bwindow\.(confirm|alert|prompt)\b|(^|[^.\w])(confirm|alert|prompt)\s*\(/);
  assert.deepEqual(found, []);
});

test("19 撤回确认是站内对话框：MessageItem 渲染 ConfirmDialog，onRecall 里没有原生确认", () => {
  const item = codeOf(join(root, "src/shell/messages/conversation/MessageItem.tsx"));
  assert.match(item, /<ConfirmDialog/);
  assert.match(item, /import\s*\{[^}]*ConfirmDialog[^}]*\}\s*from\s*["']\.\.\/\.\.\/\.\.\/ui["']/);
});

test("19 标签页标题：99+ 封顶、有前缀去重逻辑；提示音有节流常量", () => {
  const title = codeOf(join(root, "src/shell/messages/notify/title-badge.ts"));
  assert.match(title, /99\+/);
  assert.match(title, /document\.title/);
  const sound = codeOf(join(root, "src/shell/messages/notify/sound.ts"));
  assert.match(sound, /2000|2_000|THROTTLE/i, "提示音应有 2 秒节流");
});

test("12 外链：消息目录里每个 target=_blank 的链接都带 rel=noopener", () => {
  const bad = [];
  for (const file of filesOf(messageDirs)) {
    const code = codeOf(file);
    for (const m of code.matchAll(/<a\b[^>]*>/gs)) {
      if (/target="_blank"/.test(m[0]) && !/rel="noopener noreferrer"/.test(m[0]) && !/rel=\{/.test(m[0])) bad.push(relative(root, file));
    }
  }
  assert.deepEqual(bad, []);
});

test("18 二维码：只用 <img> + data:image/png URL；不用 svg 字符串；只编码本站 https 地址", () => {
  const code = codeOf(join(root, "src/shell/messages/people/InviteQrCode.tsx"));
  assert.match(code, /<img\b/);
  assert.match(code, /startsWith\("data:image\/png;base64,"\)/);
  assert.match(code, /toDataURL/);
  assert.doesNotMatch(code, /toString\(\{?\s*type|<svg|dangerouslySetInnerHTML|innerHTML|toCanvas/);
  assert.match(code, /protocol !== "https:"/);
  assert.match(code, /parsed\.origin !== new URL\(origin\)\.origin/);
  assert.match(code, /parsed\.username \|\| parsed\.password/);
  // 二维码只经这一个组件出码：其它文件不得直接 import qrcode
  const direct = hits(filesOf(["src/shell/messages"]).filter((f) => !f.endsWith("InviteQrCode.tsx")), /from\s*["']qrcode["']|import\(\s*["']qrcode["']/);
  assert.deepEqual(direct, []);
});

test("18 Team 邀请：管理员看到「邀请同事加入 Team」，非管理员看到「请 Team 管理员邀请」，两处都以 Team 管理员判定为准", () => {
  const panel = codeOf(join(root, "src/shell/messages/groups/ConversationInfoPanel.tsx"));
  assert.match(panel, /isTeamAdminOf\(myOrgs\.data, teamOrgId\)[\s\S]{0,200}data-action="invite-team"/);
  assert.match(panel, /!isTeamAdminOf\(myOrgs\.data, teamOrgId\)[\s\S]{0,400}请 Team 管理员邀请/);
  assert.match(panel, /邀请同事加入 Team/);
  const copy = read("src/i18n/ui/messages/im-people-copy.ts");
  assert.match(copy, /请 Team 管理员邀请/);
});

test("17 群头像：字段名 avatar_members；成员头像地址只认 https", () => {
  const types = codeOf(join(root, "src/lib/im/types.ts"));
  assert.match(types, /avatar_members/);
  assert.match(types, /AVATAR_MEMBERS_MAX = 4/);
  assert.match(types, /export function httpsAvatarUrl/);
  const httpsFn = types.slice(types.indexOf("export function httpsAvatarUrl"));
  assert.match(httpsFn.slice(0, 400), /https:/);
  const avatar = codeOf(join(root, "src/shell/messages/groups/GroupAvatar.tsx"));
  assert.match(avatar, /httpsAvatarUrl/);
  assert.match(avatar, /AVATAR_MEMBERS_MAX/);
});

test("11 境内：家族 cn / 未登录不显示消息；界面外壳默认不带消息入口；深链只在 enabled 时生效", () => {
  const family = codeOf(join(root, "src/shell/messages/messages-family.ts"));
  assert.match(family, /family === "cn"\) return false/);
  const host = codeOf(join(root, "src/shell/messages/MessagesHost.tsx"));
  assert.match(host, /useImEnabled\(\)/);
  assert.match(
    host,
    /if \(!enabled\) return null|!enabled\b[\s\S]{0,80}return null|!enabled\) return bayEnabledHere\(\) \? <BayGuestHost \/> : null/,
  );
  const client = codeOf(join(root, "src/lib/im/client.ts"));
  assert.match(client, /imEnabledFor\(family, signedIn\)/);
  const nav = codeOf(join(root, "src/shell/nav-source/index.ts"));
  assert.match(nav, /withMessages/);
});

test("11 境内：实时通道与接口调用在 imEnabledHere() 为假时不发起", () => {
  const realtime = codeOf(join(root, "src/shell/messages/realtime/hooks.ts"));
  assert.match(realtime, /imEnabledHere\(\)/);
});

test("15 链接：界面里没有自己拼门户地址（oceanleo.com / oceanbizs.com 字面量）", () => {
  const found = hits(filesOf(messageDirs), /https?:\/\/(www\.)?(oceanleo\.(com|cn)|oceanbizs\.com)/);
  assert.deepEqual(found, []);
});
