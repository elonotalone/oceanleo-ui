// Example scenario: open My library signed in, report what is on screen.
export default async function ({ page, log, shot, helpers }) {
  await helpers.gotoApp(page, "/library");
  await page.waitForTimeout(4000);
  await shot("library");
  const info = await page.evaluate(() => ({
    url: location.href,
    signInVisible: [...document.querySelectorAll("button, a")].some((el) =>
      /^(Sign in|Log in|登录)$/i.test((el.textContent || "").trim()),
    ),
    headings: [...document.querySelectorAll("h1, h2")].map((el) => el.textContent?.trim()).slice(0, 6),
    cards: document.querySelectorAll("[data-library-item], [data-artifact-id]").length,
    htmlClass: document.documentElement.className,
  }));
  log("info", JSON.stringify(info));
}
