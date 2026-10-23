// W08: upload "[W08] …" fixtures into the acceptance account's library.
// Usage: bash harness/mint.sh | OUT_DIR=/tmp/w08-up node harness/run.mjs evidence/W08/scenarios/upload.mjs <file>…
export default async function ({ page, log, shot, helpers, args }) {
  if (!args.length) throw new Error("pass at least one file path");
  await helpers.uploadFiles(page, args);
  await page.waitForTimeout(3000);
  await shot("library-after-upload");
  const titles = await page.evaluate(() =>
    [...document.querySelectorAll("[data-library-item], [data-artifact-id]")]
      .map((el) => (el.textContent || "").trim().slice(0, 80))
      .filter((text) => text.includes("[W08]"))
      .slice(0, 12),
  );
  log("w08-cards", JSON.stringify(titles));
}
