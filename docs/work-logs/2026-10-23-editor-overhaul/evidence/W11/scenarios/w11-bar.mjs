// W11: click every edit-bar control of the selected clip, compare preview pixels and
// timeline text before / after, then undo and check the change goes away.
// args: <rootId> [trackIndex=0] [tag]
import { canvasStats, editBarControls, openVideoEditor, selectClip, statsDiffer, watchApi } from "./w11-lib.mjs";

async function timelineText(page) {
  return page.evaluate(() => document.querySelector("[data-video-timeline-content]")?.innerText || "");
}

async function snapshot(page) {
  return { canvas: await canvasStats(page), text: await timelineText(page) };
}

function changed(a, b) {
  return { pixels: statsDiffer(a.canvas, b.canvas), timeline: a.text !== b.text };
}

async function openPopover(page) {
  return page.evaluate(() => Boolean(document.querySelector("[data-anchored-popover][data-leo-overlay-state='open']")));
}

/** In an open popover pick an option that is not the current one. */
async function pickOtherOption(page) {
  return page.evaluate(() => {
    const pop = document.querySelector("[data-anchored-popover][data-leo-overlay-state='open']");
    if (!pop) return null;
    const options = [...pop.querySelectorAll("[role=option], [role=menuitemradio], [role=menuitem], button")].filter(
      (el) => el.getAttribute("aria-selected") !== "true" && el.getAttribute("aria-checked") !== "true" && !el.disabled,
    );
    const target = options[options.length - 1];
    if (!target) return null;
    const label = target.textContent?.trim().slice(0, 40) || "";
    target.click();
    return label;
  });
}

async function undo(page) {
  const button = page.locator("button[aria-label='Undo'], button[aria-label='撤销']").first();
  if (!(await button.isEnabled().catch(() => false))) return false;
  await button.click();
  await page.waitForTimeout(900);
  return true;
}

async function closeOverlays(page) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(250);
}

export default async function ({ page, log, shot, helpers, args }) {
  watchApi(page, log);
  const [rootId, trackArg = "0", tag = "video"] = args;
  const trackIndex = Number(trackArg) || 0;
  await openVideoEditor(page, helpers, log, rootId);
  const diag = await page.evaluate(() => ({
    clips: document.querySelectorAll("[data-video-timeline-content] .group").length,
    alerts: [...document.querySelectorAll("[role=alert]")].map((el) => el.textContent?.trim().slice(0, 160)),
  }));
  log("open", JSON.stringify(diag));
  await shot(`${tag}-open`);
  if (tag === "text" && !(await selectClip(page, { trackIndex, clipIndex: 0 }))) {
    await page.locator('[data-video-timeline-content]').click({ position: { x: 700, y: 200 } });
    await page.getByRole('button', { name: /媒体与轨道|Media.*tracks/i }).first().click();
    await page.getByRole('button', { name: /添加文字|Add text/i, exact: true }).click();
    await page.waitForTimeout(1000);
  }
  if (!(await selectClip(page, { trackIndex, clipIndex: 0 }))) {
    log("no clip on track", trackIndex);
    return;
  }
  const bar = await editBarControls(page);
  log("bar", JSON.stringify(bar));
  await shot(`${tag}-selected`);
  const results = [];
  for (const id of bar.visible) {
    if (id === "more" || id.startsWith("selection-more")) continue;
    await selectClip(page, { trackIndex, clipIndex: 0 });
    const root = page.locator(`[data-selection-control-id="${id}"]`).first();
    if (!(await root.count())) {
      results.push({ id, result: "missing" });
      continue;
    }
    if (id === "delete" || id === "duplicate") {
      const before = await snapshot(page);
      await root.locator("button").first().click();
      await page.waitForTimeout(900);
      const after = await snapshot(page);
      const effect = changed(before, after);
      const undone = await undo(page);
      const back = await snapshot(page);
      results.push({ id, effect, undone, restored: back.text === before.text });
      continue;
    }
    if (id.startsWith("selection-inspector-") || id === "adjust" || id === "position") {
      await root.locator("button").first().click();
      await page.waitForTimeout(900);
      const panel = await page.evaluate(() => {
        const host = document.querySelector("[data-selection-inspector]");
        if (!host) return null;
        const rect = host.getBoundingClientRect();
        return {
          visible: rect.width > 0 && rect.height > 0,
          inputs: [...host.querySelectorAll("input")].map((el) => ({
            type: el.type,
            label: el.getAttribute("aria-label") || "",
            value: el.value,
          })),
        };
      });
      await shot(`${tag}-${id.replace("selection-inspector-", "panel-")}`);
      const sub = [];
      const textarea = page.locator('[data-selection-inspector] textarea').first();
      if (await textarea.count()) {
        const before = await snapshot(page);
        await textarea.fill('W11 saved caption');
        await textarea.blur();
        await page.waitForTimeout(800);
        const after = await snapshot(page);
        const undone = await undo(page);
        sub.push({ text: true, effect: changed(before, after), undone });
      }
      const option = page.locator('[data-selection-inspector] button[aria-pressed="false"]').first();
      if (await option.count()) {
        const before = await snapshot(page);
        const label = await option.innerText();
        await option.click();
        await page.waitForTimeout(800);
        const after = await snapshot(page);
        const undone = await undo(page);
        sub.push({ option: label, effect: changed(before, after), undone });
      }
      const inputs = page.locator("[data-selection-inspector] input");
      const count = await inputs.count();
      for (let index = 0; index < count; index += 1) {
        const input = inputs.nth(index);
        const type = await input.getAttribute("type");
        const label = (await input.getAttribute("aria-label")) || String(index);
        if (type === "checkbox" || type === "color" || type === "text") continue;
        const before = await snapshot(page);
        const value = Number(await input.inputValue().catch(() => "0")) || 0;
        const max = Number((await input.getAttribute("max")) || value + 50);
        const min = Number((await input.getAttribute("min")) || value - 50);
        const step = Number((await input.getAttribute("step")) || 1);
        const target = id === 'selection-inspector-video-timing'
          ? (index === 1 ? Math.max(0.1, value / 2) : value + 1)
          : value + (max - value > value - min ? Math.max(step, (max - value) / 2) : -Math.max(step, (value - min) / 2));
        if (type === "range") {
          await input.evaluate((el, next) => {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
            setter.call(el, String(next));
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
          }, target);
        } else {
          await input.fill(String(Math.round(target * 100) / 100));
          await input.press("Enter");
        }
        await page.waitForTimeout(900);
        const after = await snapshot(page);
        const effect = changed(before, after);
        await page.keyboard.press("Escape");
        const undone = await undo(page);
        const back = await snapshot(page);
        sub.push({ label, type, from: value, to: target, effect, undone, restored: !statsDiffer(before.canvas, back.canvas) && before.text === back.text });
        if (!(await page.locator("[data-selection-inspector]").isVisible().catch(() => false))) {
          await root.locator("button").first().click();
          await page.waitForTimeout(300);
        }
      }
      results.push({ id, panel, sub });
      log("panel-result", JSON.stringify({ id, panel, sub }));
      await closeOverlays(page);
      continue;
    }
    const before = await snapshot(page);
    const directNumber = root.locator('input[type="number"]');
    const directColor = root.locator('input[type="color"]');
    if (await directColor.count()) {
      await directColor.fill('#ff0000');
      await directColor.blur();
    } else if (await directNumber.count()) {
      const input = directNumber.first();
      const value = Number(await input.inputValue());
      await input.fill(String(value + 20));
      await input.blur();
    } else {
      await root.locator("button").first().click();
    }
    await page.waitForTimeout(700);
    let picked = null;
    if (await openPopover(page)) {
      picked = await pickOtherOption(page);
      await page.waitForTimeout(900);
    }
    const after = await snapshot(page);
    await shot(`${tag}-after-${id}`);
    await closeOverlays(page);
    const effect = changed(before, after);
    const undone = await undo(page);
    const back = await snapshot(page);
    results.push({
      id,
      picked,
      effect,
      undone,
      restored: !statsDiffer(before.canvas, back.canvas) && back.text === before.text,
    });
  }
  for (const entry of results) log("result", JSON.stringify(entry));
}
