// Upload W04 fixtures through My library and wait until each one has a library card.
// args: absolute file paths. The shared helper returns as soon as the busy label is gone,
// which can be before the upload requests start; closing then cancels them.
import path from "node:path";
import { guardProduction, sleep } from "./_w04-lib.mjs";

export default async function ({ page, context, log, shot, helpers, args }) {
  await guardProduction(context, log);
  page.on("response", (response) => {
    const method = response.request().method();
    if (method === "GET" || !/\/v1\//.test(response.url())) return;
    log("POST", response.status(), new URL(response.url()).pathname);
  });
  await helpers.uploadFiles(page, args);
  const titles = args.map((file) => path.basename(file));
  const started = Date.now();
  while (Date.now() - started < 240000) {
    const missing = [];
    for (const title of titles) {
      const found = await page.getByText(title, { exact: false }).first().isVisible().catch(() => false);
      if (!found) missing.push(title);
    }
    if (missing.length === 0) break;
    log("waiting for", missing.join(", "));
    await sleep(5000);
  }
  await sleep(5000);
  await shot("upload-done");
  log("uploaded", args.length);
}
