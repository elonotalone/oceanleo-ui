// W02: upload the [W02] fixtures (pdf / png / docx) into the acceptance account's library.
// Usage: bash harness/mint.sh | OUT_DIR=/tmp/w02-up node harness/run.mjs evidence/W02/scenarios/upload-fixtures.mjs
export default async function ({ page, log, shot, helpers }) {
  const files = [
    "/tmp/w02/[W02] sample.pdf",
    "/tmp/w02/[W02] sample.png",
    "/tmp/w02/[W02] sample.docx",
  ];
  await helpers.uploadFiles(page, files);
  await page.waitForTimeout(3000);
  await shot("after-upload");
  log("uploaded", files.length);
}
