// W09 probe: what does /library?item=<id> render, and which buttons open the editor?
export default async function ({ page, log, shot, helpers, args }) {
  const [rootId] = args;
  page.on("response", (response) => {
    const url = response.url();
    if (response.status() >= 400 && /\/v1\//.test(url)) {
      log("api-error", response.request().method(), url.replace(/^https?:\/\/[^/]+/, "").slice(0, 160), response.status());
    }
  });
  await helpers.gotoApp(page, `/library?item=${rootId}`);
  await page.waitForTimeout(8000);
  await shot("probe-item");
  const dump = async (tag) => {
    const info = await page.evaluate(() => {
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      return {
        url: location.href,
        alert: [...document.querySelectorAll("[role=alert]")].map((el) => el.textContent?.trim().slice(0, 120)),
        editor: Boolean(document.querySelector("[data-editor-loading]")),
        buttons: [...document.querySelectorAll("button, a")]
          .filter(visible)
          .map((el) => `${el.tagName}|${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40)}|${el.getAttribute("data-artifact-action") || ""}`)
          .slice(0, 80),
      };
    });
    log("dump", tag, JSON.stringify(info));
  };
  await dump("item");
  const retry = page.getByRole("button", { name: /^(Retry|重试)$/ }).first();
  if (await retry.isVisible().catch(() => false)) {
    await retry.click();
    await page.waitForTimeout(8000);
    await shot("probe-after-retry");
    await dump("after-retry");
  }
}
