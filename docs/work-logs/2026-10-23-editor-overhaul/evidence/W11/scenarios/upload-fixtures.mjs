// W11: upload the W11-tagged video / image / audio fixtures into the acceptance account.
// Usage: bash harness/mint.sh | OUT_DIR=/tmp/w11-up node harness/run.mjs evidence/W11/scenarios/upload-fixtures.mjs [mp4|png|mp3 ...]
export default async function ({ page, log, shot, helpers, args }) {
  const all = {
    mp4: "/tmp/w11/[W11] sample.mp4",
    png: "/tmp/w11/[W11] sample.png",
    mp3: "/tmp/w11/[W11] sample.mp3",
  };
  const wanted = (args.length ? args : ["mp4"]).map((key) => all[key]).filter(Boolean);
  log("uploading", wanted.join(", "));
  await helpers.uploadFiles(page, wanted);
  await page.waitForTimeout(3000);
  await shot("after-upload");
  log("done");
}
