// V02: upload [V02]-tagged fixtures into the acceptance account's My library.
// args: <file> [file…]   (absolute paths, e.g. "/tmp/v02/r0/[V02] R0 pdf.pdf")
export default async function ({ page, log, shot, helpers, args }) {
  if (!args.length) throw new Error("no files");
  await helpers.uploadFiles(page, args);
  await page.waitForTimeout(3000);
  await shot("after-upload");
  log("uploaded", args.length, "files");
}
