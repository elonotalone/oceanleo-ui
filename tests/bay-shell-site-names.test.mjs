// W03（oceanleo-bay）：站名只有一份——`baySiteName(siteKey)`，名字与门户 `lib/sites.tsx` 一致，产品名不翻译。
import test from "node:test";
import assert from "node:assert/strict";

import { compileModule } from "./helpers/module-bench.mjs";

const links = await import("../src/shell/bay/shell/bay-links.ts");
const { SITE_ICONS } = await import(await compileModule("src/shell/site-icons.tsx"));

/** 合同 §1.1 的 33 个功能站 key，顺序照抄。 */
const FUNCTION_SITE_KEYS = [
  "agent",
  "website",
  "prompt",
  "ecommerce",
  "ppt",
  "excel",
  "word",
  "converter",
  "aihuman",
  "image",
  "video",
  "resume",
  "bizdev",
  "logo",
  "interior",
  "chat",
  "threed",
  "music",
  "meeting",
  "paper",
  "notebook",
  "law",
  "study",
  "edu",
  "novel",
  "script",
  "design",
  "make",
  "search",
  "finance",
  "med",
  "travel",
  "game",
];

/** Bay 的全部站：清册 `scripts/oceanleo-sites.tsv` 去掉 talent（与网关 `app/talent/bay_sites.py` 的 BAY_SITE_KEYS 同序）。 */
const EXPECTED = {
  agent: "LeoAgent",
  website: "Website",
  prompt: "LeoPrompt",
  ecommerce: "LeoStudio",
  ppt: "LeoSlides",
  excel: "LeoSheet",
  word: "LeoDoc",
  converter: "LeoConvert",
  aihuman: "LeoHuman",
  image: "LeoImage",
  video: "LeoVideo",
  resume: "LeoResume",
  bizdev: "LeoBizDev",
  logo: "LeoLogo",
  interior: "LeoInterior",
  chat: "LeoChat",
  threed: "Leo3D",
  music: "LeoMusic",
  meeting: "LeoMeeting",
  paper: "LeoPaper",
  notebook: "LeoNote",
  law: "LeoLaw",
  study: "LeoStudy",
  edu: "LeoEdu",
  novel: "LeoNovel",
  script: "LeoScript",
  design: "LeoDesign",
  make: "LeoMake",
  search: "LeoSearch",
  finance: "LeoFinance",
  med: "LeoMed",
  travel: "LeoTravel",
  game: "LeoPlay",
  aitools: "AI 工具导航",
  asset: "LeoAsset",
  oceanleo: "OceanLeo",
};

test("全部 36 个站 key 都有产品名，且与门户站名一致", () => {
  assert.equal(Object.keys(EXPECTED).length, 36);
  for (const [key, name] of Object.entries(EXPECTED)) {
    assert.equal(links.baySiteName(key), name, key);
  }
});

test("站名不翻译：传了 tt 也原样；只有 aitools 经 tt 显示", () => {
  const seen = [];
  const tt = (zh) => {
    seen.push(zh);
    return `[${zh}]`;
  };
  assert.equal(links.baySiteName("ppt", tt), "LeoSlides");
  assert.equal(links.baySiteName("threed", tt), "Leo3D");
  assert.equal(links.baySiteName("oceanleo", tt), "OceanLeo");
  assert.equal(links.baySiteName("aitools", tt), "[AI 工具导航]");
  assert.deepEqual(seen, ["AI 工具导航"]);
});

test("大小写与空白按同一个 key 认；未知、talent、空值返回 null", () => {
  assert.equal(links.baySiteName("  PPT "), "LeoSlides");
  for (const bad of ["talent", "trade", "dev", "slide", "3d", "e-commerce", "", "   ", null, undefined, "toString", "__proto__", "constructor"]) {
    assert.equal(links.baySiteName(bad), null, JSON.stringify(bad));
  }
});

test("SITE_ICONS 覆盖合同 §1.1 的 33 个功能站；finance 与 money 都在", () => {
  assert.equal(FUNCTION_SITE_KEYS.length, 33);
  for (const key of FUNCTION_SITE_KEYS) {
    assert.ok(SITE_ICONS[key], key);
  }
  assert.ok(SITE_ICONS.finance);
  assert.ok(SITE_ICONS.money);
});

test("站名与子域标签各管各的：标签不同的三站名字照常", () => {
  assert.equal(links.baySubsiteLabel("ppt"), "slide");
  assert.equal(links.baySiteName("ppt"), "LeoSlides");
  assert.equal(links.baySubsiteLabel("ecommerce"), "e-commerce");
  assert.equal(links.baySiteName("ecommerce"), "LeoStudio");
  assert.equal(links.baySubsiteLabel("threed"), "3d");
  assert.equal(links.baySiteName("threed"), "Leo3D");
  assert.equal(links.baySubsiteLabel("oceanleo"), null);
});

test("类目标签去掉开头的 Leo；站点产品名不动", () => {
  assert.equal(links.stripLeoCategoryPrefix("LeoAgent"), "Agent");
  assert.equal(links.stripLeoCategoryPrefix("LeoSlides"), "Slides");
  assert.equal(links.stripLeoCategoryPrefix("Leo3D"), "3D");
  assert.equal(links.stripLeoCategoryPrefix("Website"), "Website");
  assert.equal(links.stripLeoCategoryPrefix("OceanLeo"), "OceanLeo");
  assert.equal(links.bayCategoryLabel("ppt"), "Slides");
  assert.equal(links.bayCategoryLabel("agent"), "Agent");
  assert.equal(links.bayCategoryLabel("website"), "Website");
  assert.equal(links.bayCategoryLabel("threed"), "3D");
  assert.equal(links.bayCategoryLabel("chat"), "Chat");
  assert.equal(links.baySiteName("ppt"), "LeoSlides");
  assert.equal(links.bayCategoryLabel("nope"), null);
});
