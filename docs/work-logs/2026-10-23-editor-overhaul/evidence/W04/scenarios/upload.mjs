// Upload W04 fixtures through My library (args: absolute file paths).
import { guardProduction } from "./_w04-lib.mjs";
export default async function ({ page, context, log, helpers, args }) {
  await guardProduction(context, log);
  await helpers.uploadFiles(page, args);
  log("uploaded", args.length);
}
