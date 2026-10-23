// W02: upload the [W02] fixtures (pdf / png / docx) into the acceptance account's library.
// Usage: bash harness/mint.sh | OUT_DIR=/tmp/w02-up node harness/run.mjs evidence/W02/scenarios/upload-fixtures.mjs
export default async function ({ page, log, shot, helpers }) {
  const files = [
    "/tmp/w02/[W02] sample.pdf",
    "/tmp/w02/[W02] sample.png",
    "/tmp/w02/[W02] sample.docx",
  ];
  await helpers.gotoApp(page, "/library");
  // The dev slot compiles on first hit; wait until the library list is really loaded.
  const loadedBy = Date.now() + 180000;
  while (Date.now() < loadedBy) {
    const loading = await page
      .getByText(/Loading My Library|正在加载我的库/)
      .first()
      .isVisible()
      .catch(() => false);
    if (!loading) break;
    await page.waitForTimeout(1000);
  }
  await helpers.uploadFiles(page, files);
  const titles = ["[W02] sample.pdf", "[W02] sample.png", "[W02] sample.docx"];
  const seenBy = Date.now() + 120000;
  let seen = [];
  while (Date.now() < seenBy) {
    const text = await page.locator("body").innerText().catch(() => "");
    seen = titles.filter((title) => text.includes(title.replace(/\.[a-z]+$/, "")));
    if (seen.length === titles.length) break;
    await page.waitForTimeout(1500);
  }
  await shot("after-upload");
  log("visible-after-upload", JSON.stringify(seen));
}
