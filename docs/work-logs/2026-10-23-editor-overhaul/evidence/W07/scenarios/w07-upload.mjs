// W07: upload "[W07] sample.pptx" into the acceptance account's library and report the new card.
// args: <file path>…
export default async function ({ page, log, shot, helpers, args }) {
  const files = args.length ? args : ["/tmp/w07/[W07] sample.pptx"];
  await helpers.uploadFiles(page, files);
  await page.waitForTimeout(3000);
  await shot("w07-upload-library");
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll("[data-library-item], [data-artifact-id]")]
      .map((el) => ({
        id: el.getAttribute("data-artifact-id") || el.getAttribute("data-library-item") || "",
        text: (el.textContent || "").trim().slice(0, 80),
      }))
      .filter((card) => /W07/.test(card.text))
      .slice(0, 10),
  );
  log("cards", JSON.stringify(cards));
}
