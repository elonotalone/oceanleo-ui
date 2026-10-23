// V04: upload the [V04] fixtures into the acceptance account's library.
// args: absolute file paths.
export default async function ({ page, log, shot, helpers, args }) {
  if (!args.length) throw new Error("no files");
  await helpers.uploadFiles(page, args);
  await page.waitForTimeout(4000);
  await shot("library-after-upload");
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll("a, button, [role=button], article, li")]
      .map((el) => (el.textContent || "").trim().replace(/\s+/g, " "))
      .filter((t) => t.includes("[V04]"))
      .slice(0, 30),
  );
  log("v04-cards", JSON.stringify(cards));
}
