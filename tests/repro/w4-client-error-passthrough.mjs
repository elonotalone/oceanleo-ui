// R1b: artifact-client 拿到浏览器那个 TypeError 之后，往上交的是什么字符串？
// 编的是**真模块**，只把 auth 两条依赖换成桩，fetch 换成浏览器的真实失败形状。
import { compileModule, dataModule } from "../helpers/module-bench.mjs";

const calls = [];
globalThis.fetch = async (url) => {
  calls.push(String(url));
  // Chromium 实测形状（见 browser-fetch-message.mjs 的三个 case）
  throw new TypeError("Failed to fetch");
};

// `W4_SRC_ROOT` 指向 `w4-before-tree.mjs` 搭的影子树时跑的是**改前**的这一层。
const SRC_ROOT = process.env.W4_SRC_ROOT || "src";
const client = await import(
  await compileModule(`${SRC_ROOT}/shell/artifact-client.ts`, {
    "../lib/auth/client": dataModule(
      `export async function accessToken(){ return "token-for-repro"; }`,
    ),
    "../lib/auth/config": dataModule(
      `export const GATEWAY_BASE = "https://api.oceanleo.com";`,
    ),
  })
);

const out = {};
out.getCurrentArtifactItem = await client.getCurrentArtifactItem("artifact-1");
out.searchArtifactLibrary = await client.searchArtifactLibrary?.({});
out.getArtifactDownload = await client.getArtifactDownload({
  key: "artifact:artifact-1:revision-1",
  source: "artifact",
  id: "artifact-1",
  artifactId: "artifact-1",
  revisionId: "revision-1",
  artifactType: "single_file_image",
  title: "t",
  kind: "image",
  siteId: "image",
  favorite: false,
  meta: {},
  artifact: {
    artifactId: "artifact-1",
    revisionId: "revision-1",
    artifactType: "single_file_image",
    access: { canRead: true, canPreview: true, canExportSource: true },
    integrity: { ok: true, reason: "" },
    renditions: {
      source: { purpose: "source", revisionId: "revision-1", url: "https://x/y" },
    },
  },
});

console.log(JSON.stringify({ fetchCalls: calls, out }, null, 2));
