// W11 — `TemplateMaterial.previewUrl` 的两个源头必须产出同一条可用直链（合同 §9.35）。
//
// 这个字段有两个供给方，两边都是 `string`，所以 typecheck 和既有用例都抓不到差异：
//
//   站点 catalog      `tpl-material/image-poster-1`                  → 拼出来 200
//   后端 list/detail  `assets/image/tpl-material/image-poster-1.webp` → 双前缀双扩展名 404
//
// 前者是裸 key，后者是注册表里存的 **OSS 对象路径**（`preview_key` 490/490 行都是这个形状）。
// 两者都交给同一个取值函数 `assetThumbUrl` / `assetPreviewUrl`，结果一个能取到图一个 404。
// 裁决是后端统一吐裸 key，所以这里断言的是**值**：真站点 catalog 里的取值，与**真后端
// 序列化**（跑 `app.template_materials.parse_record().to_wire()`，不是本地复刻）出来的取值，
// 经同一个函数必须逐字相等。
//
// 只要后端把前缀/扩展名放回 `previewUrl`，本用例立刻变红——这正是它存在的理由。
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { assetPreviewUrl, assetThumbUrl } from "../src/lib/asset-thumb.ts";

const BACKEND_DIR = "/root/projects/oceanleo/backend";
const BACKEND_PY = `${BACKEND_DIR}/.venv/bin/python`;
const SITES_ROOT = "/root/projects";

/** 站点 catalog 是 30 个独立仓，本机有哪些就读哪些，不写死站名。 */
function siteCatalogPaths() {
  const out = [];
  let entries = [];
  try {
    entries = readdirSync(SITES_ROOT, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    for (const suffix of ["lib/app-catalog.ts", "frontend/lib/app-catalog.ts"]) {
      const candidate = `${SITES_ROOT}/${entry.name}/${suffix}`;
      if (existsSync(candidate)) out.push(candidate);
    }
  }
  return out;
}

/** catalog 里 `templates[]` 的 previewUrl 取值，去重后返回。 */
function catalogPreviewKeys() {
  const keys = new Set();
  for (const file of siteCatalogPaths()) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(
      /previewUrl:\s*"(tpl-material\/[^"]+)"/g,
    )) {
      keys.add(match[1]);
    }
  }
  return [...keys].sort();
}

/**
 * 真后端序列化。跑的是 `parse_record(row).to_wire()` 本体——本文件不复刻它的任何一行，
 * 否则「两处真相」就搬到测试里来了。
 */
function backendPreviewUrls(storedPreviewKeys) {
  const program = `
import json, sys
sys.path.insert(0, ${JSON.stringify(BACKEND_DIR)})
from app.template_materials import parse_record

ARTIFACT = "07d735eb-cede-4fe3-8241-c01d018040cd"
out = []
for stored in json.loads(sys.argv[1]):
    row = {
        "id": "tpl-x",
        "site_key": "image",
        "app_id": "poster",
        "position": 1,
        "title": "t",
        "summary": "",
        "tags": [],
        "preview_key": stored,
        "artifact_id": ARTIFACT,
        "artifact_revision_id": ARTIFACT,
        "artifact_type": "single_file_image",
        "owner_principal_id": "platform",
        "download_kind": "artifact_rendition",
        "source_revision_id": None,
        "status": "published",
    }
    record = parse_record(row)
    out.append(None if record is None else record.to_wire()["previewUrl"])
print(json.dumps(out))
`;
  const stdout = execFileSync(
    BACKEND_PY,
    ["-c", program, JSON.stringify(storedPreviewKeys)],
    { encoding: "utf8" },
  );
  return JSON.parse(stdout);
}

const backendAvailable = existsSync(BACKEND_PY);
const catalogKeys = catalogPreviewKeys();

test("catalog 形状与 API 形状经同一取值函数得到同一条直链", (t) => {
  // 后端仓不在本机时跳过而不是假绿；本机有就必须逐字对上。
  if (!backendAvailable) {
    t.skip(`backend not on this host: ${BACKEND_PY}`);
    return;
  }
  assert.ok(
    catalogKeys.length > 0,
    "没有从任何站点 catalog 里读到 tpl-material 取值，用例会空转",
  );

  // 注册表存的是 OSS 对象路径，也就是取值函数产出的那条 URL 的 pathname。
  // 从函数本身推导，避免把「后端返回什么」写成本文件自己假设的常量。
  const stored = catalogKeys.map((key) =>
    new URL(assetPreviewUrl(key)).pathname.replace(/^\/+/, ""),
  );
  const fromApi = backendPreviewUrls(stored);
  assert.equal(fromApi.length, catalogKeys.length);

  for (const [index, catalogKey] of catalogKeys.entries()) {
    const apiValue = fromApi[index];
    assert.equal(
      assetThumbUrl(apiValue),
      assetThumbUrl(catalogKey),
      `缩略图直链不一致：catalog=${catalogKey} api=${apiValue}`,
    );
    assert.equal(
      assetPreviewUrl(apiValue),
      assetPreviewUrl(catalogKey),
      `大图直链不一致：catalog=${catalogKey} api=${apiValue}`,
    );
    // 双前缀双扩展名是这条缺陷的原始症状，单独钉一遍。
    const url = assetThumbUrl(apiValue);
    assert.equal(url.match(/assets\/image\//g).length, 1, url);
    assert.equal(url.match(/\.webp/g).length, 1, url);
  }
});

test("取值函数本身不吃 OSS 对象路径——所以后端必须归一，不能靠前端兜底", () => {
  // 若这条变红，说明有人把兜底加进了取值函数：那时上面那条断言就不再证明后端做对了，
  // 得重新设计判据，而不是把这条删掉了事。
  const key = "tpl-material/image-poster-1";
  const objectPath = new URL(assetPreviewUrl(key)).pathname.replace(/^\/+/, "");
  assert.equal(objectPath, "assets/image/tpl-material/image-poster-1.webp");
  assert.notEqual(assetThumbUrl(objectPath), assetThumbUrl(key));
  assert.match(
    assetThumbUrl(objectPath),
    /assets\/image\/assets\/image\/.*\.webp\.thumb\.webp$/,
  );
});
