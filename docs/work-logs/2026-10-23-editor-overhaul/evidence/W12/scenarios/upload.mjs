// W12: upload the given audio fixture(s) into the acceptance account's library.
// args: <file> [file…]  (copy fixtures to /tmp/w12-audio/"[W12] name.ext" first)
export default async function ({ page, log, shot, helpers, args }) {
  if (!args.length) throw new Error("usage: upload.mjs <file> [file…]");
  await helpers.uploadFiles(page, args);
  await page.waitForTimeout(3000);
  await shot("after-upload");
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll("[data-library-item], [data-artifact-id]")]
      .slice(0, 8)
      .map((el) => ({
        id: el.getAttribute("data-artifact-id") || el.getAttribute("data-library-item"),
        text: (el.textContent || "").trim().slice(0, 80),
      })),
  );
  log("cards", JSON.stringify(cards));
}
