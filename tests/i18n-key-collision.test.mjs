import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const messagesDir = new URL("../src/i18n/ui/messages/", import.meta.url);
const indexSource = readFileSync(new URL("index.ts", messagesDir), "utf8");

function importedFragments() {
  const imports = new Map();
  const pattern = /import\s+\{([\s\S]*?)\}\s+from\s+["'](\.\/[^"']+)["'];/g;
  for (const match of indexSource.matchAll(pattern)) {
    for (const raw of match[1].split(",")) {
      const name = raw.trim();
      if (/^[A-Z][A-Z0-9_]*$/.test(name)) imports.set(name, match[2]);
    }
  }

  const block = indexSource.match(/\ben:\s*\{([\s\S]*?)\n\s*\},\n\s*ja:/)?.[1] ?? "";
  return [...block.matchAll(/\.\.\.([A-Z][A-Z0-9_]*)\.en/g)].map((match) => {
    const source = imports.get(match[1]);
    assert.ok(source, `index.ts 中 ${match[1]} 没有可解析的命名 import`);
    return { name: match[1], source };
  });
}

const ALLOWED_BASE_OVERRIDES = new Map([
  // 每一项都必须说明为什么同一中文键可以故意改写基础英文；无理由不得加白名单。
  [
    "RECENT_MODEL_AND_TASK_MESSAGES:新建",
    "任务列表按钮特指新建任务，基础表的 New 是无对象的通用动作。",
  ],
  [
    "CLOUD_BROWSER_MESSAGES:前进",
    "浏览器工具栏指页面导航 Forward，基础表的 Redo 属于编辑器重做动作。",
  ],
  [
    "EDITOR_PANELS_MESSAGES:中",
    "编辑器分表指居中对齐 Center，基础表的 Medium 指尺寸或强度档位。",
  ],
]);

test("分表不得悄悄改变基础词典里同一中文键的英文含义", async () => {
  const { default: baseEnglish } = await import(new URL("en.ts", messagesDir));
  const conflicts = [];
  const finalEnglish = { ...baseEnglish };

  for (const fragment of importedFragments()) {
    const module = await import(
      new URL(`${fragment.source.slice(2)}.ts`, messagesDir)
    );
    const dictionary = module[fragment.name]?.en;
    assert.ok(dictionary && typeof dictionary === "object", `${fragment.name}.en 不是词典`);
    for (const [key, translated] of Object.entries(dictionary)) {
      if (
        Object.prototype.hasOwnProperty.call(baseEnglish, key) &&
        baseEnglish[key] !== translated
      ) {
        const id = `${fragment.name}:${key}`;
        const reason = ALLOWED_BASE_OVERRIDES.get(id);
        if (!reason) {
          conflicts.push(
            `${id}\n  base: ${baseEnglish[key]}\n  fragment: ${translated}`,
          );
        } else {
          assert.ok(reason.trim().length >= 12, `${id} 的白名单理由不够具体`);
        }
      }
    }
    Object.assign(finalEnglish, dictionary);
  }

  assert.deepEqual(
    conflicts,
    [],
    `发现 ${conflicts.length} 个未说明的基础键覆盖：\n${conflicts.join("\n")}`,
  );
  assert.equal(baseEnglish["登录"], "Log in");
  assert.equal(finalEnglish["登录"], baseEnglish["登录"]);
});

// 服务器页三张卡的分表由集成 owner 注册进 shell-overhaul-copy.ts；注册前后都不许改写已有英文。
const PENDING_FRAGMENTS = [
  ["server-page-copy", "SERVER_PAGE_MESSAGES"],
  ["acp-card-copy", "ACP_CARD_MESSAGES"],
  ["terminal-card-copy", "TERMINAL_CARD_MESSAGES"],
];

test("服务器页分表不改写全站词典，也不互相改写", async () => {
  const { UI_MESSAGES } = await import(new URL("index.ts", messagesDir));
  const seen = { ...UI_MESSAGES.en };
  const owner = {};
  const conflicts = [];
  for (const [file, name] of PENDING_FRAGMENTS) {
    const module = await import(new URL(`${file}.ts`, messagesDir));
    const dictionary = module[name]?.en;
    assert.ok(dictionary && typeof dictionary === "object", `${name}.en 不是词典`);
    for (const [key, translated] of Object.entries(dictionary)) {
      if (Object.prototype.hasOwnProperty.call(seen, key) && seen[key] !== translated) {
        conflicts.push(`${name}:${key}\n  ${owner[key] ?? "UI_MESSAGES"}: ${seen[key]}\n  ${name}: ${translated}`);
      }
      seen[key] = translated;
      owner[key] = name;
    }
  }
  assert.deepEqual(conflicts, [], `发现 ${conflicts.length} 个改写：\n${conflicts.join("\n")}`);
  assert.equal(seen["登录"], "Log in");
});

// work-chat（消息 / 多人同改 / 工作回放）11 张分表各归一个工作单元，互相不知道对方的
// 词典内容；汇总顺序见 work-chat-copy.ts 的 PARTS 数组（后者覆盖前者，Object.assign
// 语义）。同一个中文键在两张表里翻译不一样时，后汇总的会悄悄赢，界面哪边先渲染就看哪边
// 的表在 PARTS 里更靠后——这不是产品决定的，是巧合。2026-10-06 集成时发现过 9 处这种
// 重复登记（见 docs/work-logs/2026-10/work-chat/signals/PARENT-arbitration.md A-17），
// 8 处是同义重复（已删掉较早汇总、较晚覆盖那张表的重复登记，只留一份定义，不改行为）、
// 1 处是真的两种含义撞了同一个中文词（"群组"：创建会话对话框里指"群聊"这一种类型 vs
// 收件箱筛选页里指"群组"这一类对话的筛选 tab，已把前者的中文源串改成"群聊"拆开）。
const WORK_CHAT_FRAGMENTS = [
  ["im-shell-copy", "IM_SHELL_MESSAGES"],
  ["im-conversation-copy", "IM_CONVERSATION_MESSAGES"],
  ["im-people-copy", "IM_PEOPLE_MESSAGES"],
  ["im-notify-copy", "IM_NOTIFY_MESSAGES"],
  ["im-leo-copy", "IM_LEO_MESSAGES"],
  ["im-talent-copy", "IM_TALENT_MESSAGES"],
  ["collab-copy", "COLLAB_MESSAGES"],
  ["collab-docs-copy", "COLLAB_DOCS_MESSAGES"],
  ["collab-visual-copy", "COLLAB_VISUAL_MESSAGES"],
  ["collab-media-copy", "COLLAB_MEDIA_MESSAGES"],
  ["work-replay-copy", "WORK_REPLAY_MESSAGES"],
];

// 每一项都必须说明为什么同一中文键在两张 work-chat 分表里可以故意有不同英文——这代表
// 两处字面相同的中文背后其实是不同的产品含义，拆键成本大于加一条有说明的豁免时才用。
const WORK_CHAT_ALLOWED_OVERRIDES = new Map([]);

test("work-chat 11 张分表不改写全站词典，也不互相改写", async () => {
  const { UI_MESSAGES } = await import(new URL("index.ts", messagesDir));
  const seen = { ...UI_MESSAGES.en };
  const owner = {};
  const conflicts = [];
  for (const [file, name] of WORK_CHAT_FRAGMENTS) {
    const module = await import(new URL(`${file}.ts`, messagesDir));
    const dictionary = module[name]?.en;
    assert.ok(dictionary && typeof dictionary === "object", `${name}.en 不是词典`);
    for (const [key, translated] of Object.entries(dictionary)) {
      if (Object.prototype.hasOwnProperty.call(seen, key) && seen[key] !== translated) {
        const id = `${name}:${key}`;
        const reason = WORK_CHAT_ALLOWED_OVERRIDES.get(id);
        if (!reason) {
          conflicts.push(
            `${id}\n  ${owner[key] ?? "UI_MESSAGES"}: ${seen[key]}\n  ${name}: ${translated}`,
          );
        } else {
          assert.ok(reason.trim().length >= 12, `${id} 的白名单理由不够具体`);
        }
      }
      seen[key] = translated;
      owner[key] = name;
    }
  }
  assert.deepEqual(conflicts, [], `发现 ${conflicts.length} 个 work-chat 分表间的改写：\n${conflicts.join("\n")}`);
  assert.equal(seen["登录"], "Log in");
});
