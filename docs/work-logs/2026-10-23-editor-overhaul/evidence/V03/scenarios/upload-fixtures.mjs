// V03: upload the [V03] fixture copies into the acceptance account's library.
// args: <dir containing "[V03] sample.*" files>
import fs from "node:fs";
import path from "node:path";

export default async function ({ page, log, shot, helpers, args }) {
  const dir = args[0] || "/tmp/v03/upload";
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith("[V03] "))
    .map((name) => path.join(dir, name));
  log("uploading", files.length, "files");
  await helpers.uploadFiles(page, files);
  await page.waitForTimeout(3000);
  await shot("after-upload");
  const titles = await page.evaluate(() =>
    [...document.querySelectorAll("h3, [title]")]
      .map((el) => (el.textContent || el.getAttribute("title") || "").trim())
      .filter((text) => text.includes("[V03]"))
      .slice(0, 40),
  );
  log("visible [V03] titles", JSON.stringify([...new Set(titles)]));
}
