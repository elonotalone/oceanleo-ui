// V03 exploration: open /library?item=<id>, show what the detail offers, try the edit entry.
// args: <artifactId> <label>
const visibleButtons = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("button, a[href]")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.left > 250;
      })
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || "").trim().slice(0, 40),
        aria: el.getAttribute("aria-label") || "",
        data: [...el.attributes]
          .filter((a) => a.name.startsWith("data-"))
          .map((a) => `${a.name}=${a.value}`.slice(0, 60))
          .join(" "),
      })),
  );

async function settle(page, log) {
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(2500);
    const state = await page.evaluate(() => ({
      account: document.querySelector("[data-account-trigger]")?.textContent?.trim() || "",
      loading: /Loading My Library|正在加载/.test(document.body.innerText),
      failed: Boolean(document.querySelector("[data-library-retry]")),
    }));
    if (state.failed) {
      log("library load failed banner; retry");
      await page.locator("[data-library-retry]").first().click().catch(() => {});
      continue;
    }
    if (!/Log in|登录/.test(state.account) && !state.loading) return true;
  }
  return false;
}

export default async function ({ page, log, shot, helpers, args }) {
  const [id, label = "item"] = args;
  await helpers.gotoApp(page, `/library?item=${id}`);
  log("settled", await settle(page, log));
  await page.waitForTimeout(3000);
  await shot(`${label}-1-landing`);
  log("buttons-1", JSON.stringify(await visibleButtons(page)));
  const preview = page.locator("button[aria-label^='预览「'], button[aria-label^='Preview']").first();
  if (await preview.count()) {
    await preview.click();
    await page.waitForTimeout(8000);
    await shot(`${label}-2-detail`);
    log("buttons-2", JSON.stringify(await visibleButtons(page)));
  }
  const edit = page
    .locator("button, a")
    .filter({ hasText: /^(编辑|Edit)$/ })
    .first();
  if (await edit.count()) {
    await edit.click();
    await page.waitForTimeout(15000);
    await shot(`${label}-3-editor`);
    log("buttons-3", JSON.stringify(await visibleButtons(page)));
  }
  const editBar = await page.locator("[data-workspace-edit-bar]").count();
  log("edit bar count", editBar, "url", page.url());
}
