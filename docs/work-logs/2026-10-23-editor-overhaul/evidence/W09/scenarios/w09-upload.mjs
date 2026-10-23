// W09: upload one or more "[W09] …" fixtures into the acceptance account's library.
// Usage: mint.sh | node harness/run.mjs evidence/W09/scenarios/w09-upload.mjs /tmp/w09/[W09]\ sample.png …
export default async function ({ page, log, shot, helpers, args }) {
  if (!args.length) throw new Error("pass file paths to upload");
  await helpers.uploadFiles(page, args);
  await page.waitForTimeout(3000);
  await shot("w09-upload-library");
  log("uploaded", JSON.stringify(args));
}
