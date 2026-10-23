// Explore one editor: optional upload, open from My library, list visible controls.
// args: <title needle> [file to upload first]
import { guardProduction, openFromLibrary, saveLauncher, visibleControls, writeJson } from "./_w04-lib.mjs";

export default async function ({ page, context, log, shot, helpers, args, outDir }) {
  await guardProduction(context, log);
  const [needle, upload] = args;
  if (upload) {
    await helpers.uploadFiles(page, [upload]);
    log("uploaded", upload);
  }
  await openFromLibrary(page, helpers, needle, log);
  await shot("explore-open");
  const controls = await visibleControls(page);
  writeJson(outDir, "explore-controls", { url: page.url(), save: await saveLauncher(page), controls });
  log("controls", controls.length, JSON.stringify(controls.slice(0, 80)));
}
