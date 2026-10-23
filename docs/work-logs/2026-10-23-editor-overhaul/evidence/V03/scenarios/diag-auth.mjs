// V03 diagnostic: is the acceptance session picked up on the slot? Logs failing requests.
export default async function ({ page, log, shot, helpers }) {
  page.on("requestfailed", (req) =>
    log("requestfailed", req.method(), req.url().slice(0, 160), req.failure()?.errorText || ""),
  );
  page.on("response", (res) => {
    if (res.status() >= 400) log("http", res.status(), res.url().slice(0, 160));
  });
  await helpers.gotoApp(page, "/library");
  for (let i = 0; i < 12; i += 1) {
    await page.waitForTimeout(5000);
    const state = await page.evaluate(() => ({
      account: document.querySelector("[data-account-trigger]")?.textContent?.trim() || "",
      loading: /Loading My Library|正在加载/.test(document.body.innerText),
    }));
    log("t+", (i + 1) * 5, "s", JSON.stringify(state));
    if (!/Log in|登录/.test(state.account) && !state.loading) break;
  }
  await shot("diag-auth");
}
