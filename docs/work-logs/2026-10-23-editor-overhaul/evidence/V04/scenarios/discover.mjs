// V04 discovery: open a route, run optional steps, dump chrome controls and theme roots.
// args: <label> <route> [step…]   step = click:<css> | text:<visible text> | wait:<ms> | shot:<name> | dump:<name>
import { themeState } from "./lib/v04-audit.mjs";

async function dump(page, log, tag) {
  log(`${tag} themeState`, JSON.stringify(await themeState(page)));
  const controls = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("button, [role=button], [role=tab], [role=menuitem], a[href]")) {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight || r.right < 256) continue;
      const data = [...el.attributes]
        .filter((a) => a.name.startsWith("data-"))
        .map((a) => (a.value && a.value.length < 32 ? `${a.name}=${a.value}` : a.name));
      out.push({
        y: Math.round(r.top),
        x: Math.round(r.left),
        w: Math.round(r.width),
        label: (el.getAttribute("aria-label") || el.getAttribute("title") || "").slice(0, 40),
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24),
        data: data.slice(0, 4).join(" "),
      });
    }
    return out.sort((a, b) => a.y - b.y || a.x - b.x);
  });
  for (const c of controls) log(`${tag} ctl`, JSON.stringify(c));
  const marks = await page.evaluate(() =>
    [...document.querySelectorAll("*")]
      .flatMap((el) => [...el.attributes].map((a) => a.name))
      .filter((n) => /^data-(plugin|edit-bar|selection|workspace|inline|advanced|library|pchrome|awb|material|mine)/.test(n))
      .reduce((acc, n) => ((acc[n] = (acc[n] || 0) + 1), acc), {}),
  );
  log(`${tag} data-attrs`, JSON.stringify(marks));
}

export default async function ({ page, log, shot, helpers, args }) {
  const [label = "probe", route = "/library", ...steps] = args;
  await helpers.gotoApp(page, route);
  await page.waitForTimeout(6000);
  for (const step of steps) {
    const i = step.indexOf(":");
    const op = step.slice(0, i);
    const val = step.slice(i + 1);
    if (op === "click") {
      await page.locator(val).first().click({ timeout: 60000 });
      log("clicked", val);
    } else if (op === "text") {
      await page.getByText(val, { exact: true }).first().click({ timeout: 60000 });
      log("clicked text", val);
    } else if (op === "wait") {
      await page.waitForTimeout(Number(val));
    } else if (op === "waitfor") {
      await page.locator(val).first().waitFor({ timeout: 120000 }).catch(() => log("waitfor timeout", val));
    } else if (op === "shot") {
      await shot(`${label}-${val}`);
    } else if (op === "dump") {
      await dump(page, log, val);
    } else if (op === "key") {
      await page.keyboard.press(val);
    }
  }
  await shot(`${label}-final`);
}
