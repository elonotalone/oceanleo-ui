// W10: upload "[W10] …" xlsx fixtures into the acceptance account's library, then list what landed.
// Usage: mint.sh | node harness/run.mjs evidence/W10/scenarios/w10-upload.mjs "/tmp/w10/[W10] a.xlsx" …
export default async function ({ page, log, shot, helpers, args }) {
  if (!args.length) throw new Error("pass file paths to upload");
  await helpers.uploadFiles(page, args);
  await page.waitForTimeout(3000);
  await shot("w10-upload-library");
  log("uploaded", JSON.stringify(args));
}
