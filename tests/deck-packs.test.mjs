import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import test from "node:test";

import { strFromU8, unzipSync } from "fflate";

import { DECK_PACKS, packById } from "../src/shell/doc-editors/deck-packs.ts";
import { buildDeckPptx } from "../src/shell/doc-editors/deck-ooxml-package.ts";

// 跨仓对账：套装调色板的权威在 asset 仓，副本只会两边一起漂移，所以这里读原件而不是
// 抄进 tests/fixtures/。这条路径按 `w25-tests-out-of-repo-paths.test.mjs` 的闸显式登记在
// 那份 `REGISTERED` 里（与后端仓那两条同一档）；缺仓时下面那条用例自己 skip。
const DNA_PATH = "/root/projects/asset/lib/template-dna.ts";
/**
 * What the writer produced for `baselineProject()` before named packs existed.
 * A change here means the no-`packId` path stopped being byte-for-byte the old
 * one, which is exactly what packs were not allowed to do.
 *
 * ⚠️ 这个常量被两个时区的人来回改过（`139c44e` 作者 +0800 钉成 `aa60868b…`，
 * `ce94416` 作者 +0000 改回 `caaeebef…`），双方都写「对方那个 sha 没有任何一版
 * 写出器产出过」。**两人都没错，也都没查到根因**（W34d / W38，2026-09-04）：
 * 写出器把 `Date.UTC(1980,0,1)` 交给 fflate，而 fflate 0.8.3 用**本地时间**取值写
 * zip 的 DOS mtime（`getHours()` 等），于是 +8 机器上 60 个部件 × 2 个头的 DOS 时间
 * 高字节从 `0x00` 变 `0x40`（共 120 字节），sha 就从 `caaeebef…` 变成 `aa60868b…`；
 * 格林尼治以西的机器则读成 1979-12-31，fflate 直接抛 `date not in range`。
 * `caaeebef…` 是「DOS 时间 = 1980-01-01 00:00:00」这个本意对应的包；W38 把写出器的
 * mtime 改成本地构造器 `new Date(1980, 0, 1)` 后，**这个 sha 在任意进程 TZ 下都应成立**。
 *
 * 所以：这条红了，先看下面那条时区无关性闸——
 *   - 它也红 ⇒ 写出器的 mtime 又随时区漂了（有人改回 `Date.UTC` 或换了 zip 库）；
 *   - 它绿、本条红 ⇒ 默认路径的字节真的变了。**别改这个常量**，先证明是有意的。
 *
 * 要重算就照这个来，别只开个 worktree 就动手：
 *   1. `git worktree add --detach <dir> 939af01` 并把 `node_modules` 软链进去；
 *   2. 用**本文件当前的** `baselineProject()`（无 `packId`）喂 `<dir>` 那份
 *      `buildDeckPptx`，取 sha256，**并且 `TZ=UTC` 跑**（老写出器只有在 UTC 下
 *      才产出它本意的字节）；
 *   3. 与今天的写出器产出的包 `cmp` 一遍，不是只比哈希。
 * `939af01` 是唯一合法的参照点：比它更早的写出器（`880dfd8` 及以前）会拿
 * `deck-hollow` 直接拒收这份夹具（`no chart part`），压根建不出包来比。
 */
const BEFORE_SHA256 = "caaeebef5b0021b0062aa40cc8a688415be0d662c96974ba7d12a7fbc739059d";

const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);

function baselineProject(packId, assets = [
  { id: "photo", sha256: "a".repeat(64), mediaType: "image/png", byteSize: PNG.length, width: 1, height: 1 },
]) {
  const image = { assetId: assets[0].id, alt: "一张用于确定性回归的图片", fit: "cover" };
  return {
    schema: "oceanleo.deck.v1",
    version: 1,
    title: "W1 写出器无套装基准",
    ...(packId ? { packId } : {}),
    theme: { accent: "1F6FEB", fontMajor: "Aptos" },
    master: { footerText: "OceanLeo", showPageNumber: true, creditsBar: false },
    slides: [
      { layout: "title", title: "写出器基准", subtitle: "没有 packId" },
      { layout: "image-full", title: "整幅图片", images: [image] },
      { layout: "image-left", title: "左图", images: [image], bullets: ["真实文本", "真实图片"] },
      { layout: "image-right", title: "右图", images: [image], bullets: ["保持结构", "只换整装"] },
      { layout: "image-grid", title: "图集", images: [image, image, image] },
      { layout: "bullets", title: "要点", bullets: ["第一条", "第二条", "第三条"] },
      { layout: "two-column", title: "并排", left: ["左一", "左二"], right: ["右一", "右二"] },
      { layout: "quote", quote: { text: "装是整套给的。", attribution: "OceanLeo" }, images: [image] },
      { layout: "kpi-row", title: "读数", kpis: [{ value: "33", label: "原始风格" }, { value: "11", label: "具名装" }] },
    ],
    assets,
    attribution: { entries: assets.map((asset) => ({ text: "OceanLeo", licenseCode: "OCEANLEO-AIGEN", licenseUrl: "https://oceanleo.com/license", assetId: asset.id })) },
  };
}

const DEFAULT_ASSET_BYTES = [{ id: "photo", bytes: PNG, width: 1, height: 1 }];

function pptx(project, assets = DEFAULT_ASSET_BYTES) {
  return buildDeckPptx(project, { assets }).bytes;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("the registry is a frozen set of eleven whole packs covering the 33 measured styles", () => {
  assert.equal(DECK_PACKS.length, 11);
  assert.equal(Object.isFrozen(DECK_PACKS), true);
  assert.equal(new Set(DECK_PACKS.map((pack) => pack.id)).size, DECK_PACKS.length);

  const styles = DECK_PACKS.flatMap((pack) => pack.sourceStyles);
  assert.equal(styles.length, 33);
  assert.equal(new Set(styles).size, 33, "every source style belongs to exactly one pack");

  for (const pack of DECK_PACKS) {
    assert.equal(Object.isFrozen(pack), true, pack.id);
    assert.equal(Object.isFrozen(pack.palette), true, `${pack.id}.palette`);
    assert.equal(Object.isFrozen(pack.scrim.verticalBands), true, `${pack.id}.scrim`);
    assert.equal(packById(pack.id), pack);
    assert.match(pack.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(pack.label.length >= 2);
    assert.ok(pack.sourceFiles.length >= 2);

    for (const role of ["lt1", "dk1", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6"]) {
      assert.match(pack.palette[role], /^[0-9A-F]{6}$/, `${pack.id}.${role}`);
    }
    const accents = [1, 2, 3, 4, 5, 6].map((number) => pack.palette[`accent${number}`]);
    assert.equal(new Set(accents).size, 6, `${pack.id} repeats a theme accent`);
    assert.match(pack.surface.color, /^[0-9A-F]{6}$/);
    assert.match(pack.scrim.color, /^[0-9A-F]{6}$/);
    assert.equal(pack.scrim.verticalBands.length, 3);
    for (const alpha of pack.scrim.verticalBands) assert.ok(alpha >= 0 && alpha <= 100);
  }
  assert.equal(packById("not-a-pack"), undefined);
});

// These values cross a repository boundary. As with the website appearance
// preset drift test, a present asset checkout turns silent drift into failure.
//
// ⚠️ `W49` 2026-09-01 实测：这条对账**已经空转**，而且不会自己恢复。
// `asset` 仓还在，但 `lib/template-dna.ts` 在那边的 `29e4d21`（2026-08-26,
// 「把 asset 站剥成纯素材下载站」）里被**删掉**了（502 行，非改名）。
// 十个调色板 key（amber/crimson/mocha/paper/glacier/ocean/neon-violet/jade-gold/
// gold/mauve）在被删的那一版里各有一条，在今天的 `asset` 仓里**一条都不剩**。
// ⇒ 权威副本已不存在，`deck-packs.ts` 的调色板现在是这些色值的唯一出处，
// 这条用例守不住任何东西了；`skip` 原来的语义是「仓没检出、暂时跳过」，
// 现在它掩盖的是「对账对象被刻意删了」。把理由写进 `skip` 让 TAP 自己说出来，
// 别再让它伪装成一次无害的跳过。恢复条件：`asset` 仓重新提供权威副本。
const DNA_SKIP = existsSync(DNA_PATH)
  ? false
  : `asset 仓的 lib/template-dna.ts 已在 asset:29e4d21 (2026-08-26) 被删除，跨仓对账无对象；这不是「缺检出」，不要当无害跳过`;
test("reused palette keys, labels and values still match the asset DNA", { skip: DNA_SKIP }, () => {
  const dna = readFileSync(DNA_PATH, "utf8");
  for (const pack of DECK_PACKS) {
    const line = dna
      .split("\n")
      .find((row) => row.includes(`{ key: "${pack.palette.key}"`));
    assert.ok(line, `palette ${pack.palette.key} is gone from the DNA`);
    assert.equal(line.match(/label:\s*"([^"]+)"/)?.[1], pack.palette.label);
    const authoritativeHex = new Set(
      [...line.matchAll(/#[0-9A-Fa-f]{6}/g)].map((match) => match[0].slice(1).toUpperCase()),
    );
    for (const role of ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6"]) {
      assert.ok(
        authoritativeHex.has(pack.palette[role]),
        `${pack.id}.${role}=${pack.palette[role]} drifted from ${pack.palette.key}`,
      );
    }
  }
});

test("omitting or missing packId preserves the pre-change PPTX bytes exactly", () => {
  const unchanged = pptx(baselineProject());
  assert.equal(sha256(unchanged), BEFORE_SHA256);
  const unknown = pptx(baselineProject("not-a-pack"));
  assert.deepEqual(unknown, unchanged);
});

// ——— 时区无关性 ———
// 「导出可复现」是产品承诺：同一份稿在任何机器上导出的 pptx 逐字节相同。它曾在
// 用户机器上不成立（见 BEFORE_SHA256 上方），所以这里在**子进程**里带明确的 `TZ=`
// 各导一次再比。子进程自带 TZ，所以这条闸不依赖父进程当前处于哪个时区。

const LOADER_URL = new URL("./ts-extension-loader.mjs", import.meta.url).href;
const WRITER_URL = new URL("../src/shell/doc-editors/deck-ooxml-package.ts", import.meta.url).href;

/** 在 `tz` 时区的子进程里，用同一份夹具、同一个写出器导出，拿回原始字节。 */
function exportPptxInTimezone(tz) {
  const probe = `
    import { readFileSync } from "node:fs";
    const { buildDeckPptx } = await import(${JSON.stringify(WRITER_URL)});
    const { project, png } = JSON.parse(readFileSync(0, "utf8"));
    const bytes = Uint8Array.from(Buffer.from(png, "base64"));
    const out = buildDeckPptx(project, { assets: [{ id: "photo", bytes, width: 1, height: 1 }] }).bytes;
    process.stdout.write(Buffer.from(out).toString("base64"));
  `;
  const child = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", "--experimental-loader", LOADER_URL, "--input-type=module", "-e", probe],
    {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 16,
      input: JSON.stringify({ project: baselineProject(), png: Buffer.from(PNG).toString("base64") }),
      env: { ...process.env, TZ: tz },
    },
  );
  // 子进程炸了（比如写出器在这个时区下抛 `date not in range`）必须红成断言，
  // 不许两边都空字符串然后「相等」假绿。
  assert.equal(child.status, 0, `TZ=${tz} 下导出进程非零退出：${child.stderr}`);
  const bytes = Uint8Array.from(Buffer.from(child.stdout.trim(), "base64"));
  assert.ok(bytes.length > 1024, `TZ=${tz} 下导出的包只有 ${bytes.length} 字节`);
  return bytes;
}

/** 顺着 zip 的本地文件头走一遍，取出每个部件的 DOS 修改时间与日期两个 16 位字。 */
function dosStampsOfLocalHeaders(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const stamps = [];
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const time = view.getUint16(offset + 10, true);
    const date = view.getUint16(offset + 12, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    stamps.push({ time, date });
    offset += 30 + nameLength + extraLength + compressedSize;
  }
  return stamps;
}

test("the same deck exports byte-identical PPTX on machines in different timezones", () => {
  const zones = [
    { tz: "UTC", label: "UTC" },
    { tz: "Asia/Shanghai", label: "+8" },
    // 格林尼治以西：老写出器在这里把 1980-01-01 00:00Z 读成 1979-12-31，fflate 直接拒收。
    { tz: "America/Los_Angeles", label: "−8" },
    // 1980-01-01 正处夏令时（+11）：DST 地区也必须落到同一个 DOS 时间。
    { tz: "Australia/Sydney", label: "+11（夏令时中）" },
  ];
  const exported = zones.map((zone) => ({ ...zone, bytes: exportPptxInTimezone(zone.tz) }));

  for (const { tz, bytes } of exported) {
    const stamps = dosStampsOfLocalHeaders(bytes);
    // 走头的结果要和 fflate 自己解出的部件数对上，否则循环跑零次会假绿。
    assert.equal(stamps.length, Object.keys(unzipSync(bytes)).length, `TZ=${tz} 下本地文件头数与部件数不符`);
    assert.ok(stamps.length >= 2, `TZ=${tz} 下只有 ${stamps.length} 个部件，夹具太小`);
    stamps.forEach(({ time, date }, index) => {
      // DOS 日期 1980-01-01 = (年-1980)<<9 | 月<<5 | 日 = 0x0021；DOS 时间 00:00:00 = 0x0000。
      assert.equal(date, 0x0021, `TZ=${tz} 下部件 ${index} 的 zip 修改日期不是 1980-01-01（0x${date.toString(16)}）`);
      assert.equal(time, 0x0000, `TZ=${tz} 下部件 ${index} 的 zip 修改时间不是 00:00:00（0x${time.toString(16)}）`);
    });
  }

  const [utc, ...others] = exported;
  const utcSha = sha256(utc.bytes);
  for (const { tz, label, bytes } of others) {
    assert.equal(
      sha256(bytes),
      utcSha,
      `同一份稿在 ${label} 机器和 UTC 机器导出的 PPTX 字节不同：TZ=${tz} ${sha256(bytes)} ≠ TZ=UTC ${utcSha}`,
    );
  }
});

test("a named pack writes a valid package with solid alpha bands and no shape gradients", () => {
  const source = baselineProject("cyber-neon");
  delete source.theme.fontMajor;
  const bytes = pptx(source);
  const zip = unzipSync(bytes);
  for (const part of [
    "[Content_Types].xml",
    "ppt/presentation.xml",
    "ppt/theme/theme1.xml",
    "ppt/slideMasters/slideMaster1.xml",
    "ppt/slides/slide2.xml",
  ]) {
    assert.ok(zip[part], `${part} is missing`);
  }

  const theme = strFromU8(zip["ppt/theme/theme1.xml"]);
  assert.match(theme, /<a:accent1><a:srgbClr val="A855F7"\/>/);
  assert.match(theme, /<a:latin typeface="Orbitron"\/>/);
  assert.match(theme, /<a:ea typeface="Noto Sans SC"\/>/);

  const fullBleedSlide = strFromU8(zip["ppt/slides/slide2.xml"]);
  assert.match(fullBleedSlide, /<p:bg><p:bgPr><a:solidFill><a:srgbClr val="0A0714">/);
  assert.match(fullBleedSlide, /name="scrim-band-1"/);
  assert.match(fullBleedSlide, /<a:alpha val="68000"\/>/);
  assert.match(fullBleedSlide, /<a:alpha val="44000"\/>/);
  assert.match(fullBleedSlide, /<a:alpha val="24000"\/>/);

  const slideXml = Object.entries(zip)
    .filter(([name]) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .map(([, value]) => strFromU8(value))
    .join("\n");
  assert.doesNotMatch(slideXml, /<a:gradFill\b/);
});

/**
 * 样张生成器的图片来源由调用方给：`W1_SAMPLE_SOURCE=<某份真实 pptx>`。
 *
 * 原来这里写死了一份 2026-07-27 验收会话的 `scratch/` blob。那正是
 * `w25-tests-out-of-repo-paths.test.mjs` 这道闸要根除的形状：那份文件在写测试的人手边
 * 活着，在别人的会话里、在明天都不活着；而 `scratch/` 里的东西从不进版本库，所以它既
 * 不能登记（不是长期存在），也不值得把 500 KB 二进制搬进 `tests/fixtures/`（样张生成
 * 不是套件的一部分，`W1_SAMPLE_DIR` 不设就一行都不跑）。改成由调用方指名。
 */
function sampleAssets() {
  const source = process.env.W1_SAMPLE_SOURCE || "";
  assert.ok(
    source,
    "生成样张要指名图片来源：W1_SAMPLE_SOURCE=<一份带三张以上真实图片的 pptx>",
  );
  const zip = unzipSync(readFileSync(source));
  const media = Object.entries(zip)
    .filter(([name]) => /^ppt\/media\/.*\.(?:png|jpe?g)$/i.test(name))
    .slice(0, 3);
  assert.equal(media.length, 3, "sample source must provide three real pictures");
  const assets = media.map(([name, bytes], index) => ({
    id: `sample-${index + 1}`,
    sha256: sha256(bytes),
    mediaType: /\.png$/i.test(name) ? "image/png" : "image/jpeg",
    byteSize: bytes.length,
  }));
  const assetBytes = media.map(([, bytes], index) => ({ id: `sample-${index + 1}`, bytes }));
  return { assets, assetBytes };
}

function sampleProject(packId, assets) {
  const project = baselineProject(packId, assets);
  const image = (index, caption) => ({
    assetId: assets[index % assets.length].id,
    alt: `风格样张图片 ${index + 1}`,
    fit: "cover",
    ...(caption ? { caption } : {}),
  });
  return {
    ...project,
    title: `W1 具名装样张 · ${packId}`,
    slides: [
      { layout: "image-full", title: "从一张主图开始", images: [image(0)] },
      { layout: "image-left", title: "图片承担一半叙事", images: [image(1)], bullets: ["结论先行", "图片给证据"] },
      { layout: "image-right", title: "节奏交替", images: [image(2)], bullets: ["视线换边", "文字保持短"] },
      { layout: "image-grid", title: "三个现场", images: [image(0, "场景一"), image(1, "场景二"), image(2, "场景三")] },
      { layout: "quote", quote: { text: "图片不是装饰，是页面的证据。", attribution: "OceanLeo" }, images: [image(1)] },
      { layout: "mixed-triptych", title: "一页看全貌", images: [image(2)], bullets: ["主图", "要点", "结论"], note: "构成不再只剩白底文字" },
      { layout: "image-grid", title: "第二组证据", images: [image(2, "细节一"), image(0, "细节二"), image(1, "细节三")] },
      { layout: "image-full", title: "整幅转场", images: [image(2)] },
      { layout: "image-grid", title: "以图收束", images: [image(1, "结果一"), image(2, "结果二"), image(0, "结果三")] },
    ],
  };
}

if (process.env.W1_SAMPLE_DIR) {
  const { assets, assetBytes } = sampleAssets();
  mkdirSync(process.env.W1_SAMPLE_DIR, { recursive: true });
  for (const id of ["paper-cut-amber", "cyber-neon", "botanical-jade"]) {
    writeFileSync(
      `${process.env.W1_SAMPLE_DIR}/${id}.pptx`,
      pptx(sampleProject(id, assets), assetBytes),
    );
  }
}
