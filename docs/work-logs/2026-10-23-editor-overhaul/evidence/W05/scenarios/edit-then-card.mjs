// W05: edit a [W05] txt in the document editor, save, return to the library:
// the card must still be a text card (no PNG, no spinner) with the new first line.
export default async ({ page, log, shot, helpers, args }) => {
  const [title = "[W05] 卡片a.txt", marker = `W05 edit ${Date.now() % 100000}`] = args;
  await helpers.gotoApp(page, "/library");
  const card = page.locator(`[data-document-cover][aria-label="${title}"]`).first();
  await card.waitFor({ timeout: 60000 });
  await card.click();
  const edit = page.locator("button[aria-label='编辑'], button[aria-label='Edit'], [data-artifact-action='edit']").first();
  await edit.waitFor({ timeout: 30000 });
  await edit.click();
  const editor = page.locator(".ProseMirror[contenteditable=true]:not([data-oc-slot-editor])").first();
  await editor.waitFor({ timeout: 90000 });
  await editor.click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.type(`${marker}`);
  await page.keyboard.press("Enter");
  const state = await helpers.waitSaved(page, { timeout: 90000 }).catch((error) => `error:${error.message}`);
  log("info", JSON.stringify({ saveState: state, url: page.url() }));
  await shot("edited");
  await helpers.gotoApp(page, "/library");
  const started = Date.now();
  let result = null;
  while (Date.now() - started < 20000) {
    result = await page.evaluate((t) => {
      const node = document.querySelector(`[data-document-cover][aria-label="${t}"]`);
      const host = node?.closest("[data-cover-state]");
      return node ? {
        state: node.getAttribute("data-document-cover"),
        img: Boolean(host?.querySelector("img")),
        spinner: Boolean(host?.querySelector(".v-spinner,[role=status]")),
        text: (node.textContent || "").replace(/\s+/g, " ").slice(0, 160),
      } : null;
    }, title);
    if (result?.state === "excerpt") break;
    await page.waitForTimeout(500);
  }
  log("info", JSON.stringify({ marker, card: result }));
  await shot("card-after-edit");
};
