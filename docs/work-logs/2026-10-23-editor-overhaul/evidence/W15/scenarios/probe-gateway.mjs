// W15: which gateway host does the LeoDev slot call, and is the acceptance account signed in?
// Logs request hosts only (never headers, never tokens).
export default async function ({ page, log, shot, helpers }) {
  const hosts = new Map();
  page.on("request", (request) => {
    try {
      const url = new URL(request.url());
      if (!/^https?:$/.test(url.protocol)) return;
      const key = url.host;
      hosts.set(key, (hosts.get(key) || 0) + 1);
    } catch {}
  });
  await helpers.gotoApp(page, "/library");
  await page.waitForTimeout(6000);
  await shot("probe-library");
  const info = await page.evaluate(() => ({
    url: location.href,
    htmlClass: document.documentElement.className,
    signInVisible: [...document.querySelectorAll("button, a")].some((el) =>
      /^(Sign in|Log in|登录)$/i.test((el.textContent || "").trim()),
    ),
  }));
  log("info", JSON.stringify(info));
  log("hosts", JSON.stringify([...hosts.entries()].sort((a, b) => b[1] - a[1])));
}
