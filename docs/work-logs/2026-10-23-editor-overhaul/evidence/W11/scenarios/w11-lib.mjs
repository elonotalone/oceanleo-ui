// Shared helpers for W11 scenarios (video timeline editor).

export function watchApi(page, log) {
  page.on("response", (response) => {
    const url = response.url();
    if (response.status() >= 400 && /\/v1\/|\/api\//.test(url)) {
      log("http", response.status(), response.request().method(), url.replace(/\/artifact-renditions\/access\/[^/?]+/, "/artifact-renditions/access/[redacted]").replace(/\?.*$/, "").slice(0, 160));
    }
  });
}

/** Open a library item by root id and enter the video timeline editor. */
export async function openVideoEditor(page, helpers, log, rootId, { timeout = 180000 } = {}) {
  await helpers.gotoApp(page, `/library?item=${encodeURIComponent(rootId)}`);
  const started = Date.now();
  let clicked = 0;
  while (Date.now() - started < timeout) {
    const state = await page.evaluate(() => ({
      editor: Boolean(document.querySelector("[data-editor-adapter='video-timeline']")),
      canvas: Boolean(document.querySelector("[data-editor-adapter='video-timeline'] canvas")),
      ready: Boolean(document.querySelector("[data-video-timeline-content]")),
    }));
    if (state.editor && state.canvas && state.ready) break;
    // The viewer may not be hydrated on the first click: retry every 10 s until the editor mounts.
    if (!state.editor && Date.now() - clicked > 10000) {
      const edit = page.locator("button[aria-label^='编辑「'], button[aria-label^='Edit ']").first();
      if (await edit.isVisible().catch(() => false)) {
        await edit.click().catch(() => {});
        clicked = Date.now();
        log("clicked edit");
      }
    }
    await page.waitForTimeout(1000);
  }
  // Let the source probe and first frame settle.
  const frameStarted = Date.now();
  while (Date.now() - frameStarted < 60000) {
    const loading = await page.evaluate(() =>
      /正在载入素材|正在验证时间线工程|Loading media/.test(document.body.innerText || ""),
    );
    if (!loading) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(2500);
}

/** Pixel stats of the preview canvas (mean RGB + a small signature) for before/after comparison. */
export async function canvasStats(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("[data-editor-adapter='video-timeline'] canvas");
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let r = 0, g = 0, b = 0, n = 0;
    const grid = [];
    for (let gy = 0; gy < 6; gy += 1) {
      for (let gx = 0; gx < 8; gx += 1) {
        const x = Math.floor(((gx + 0.5) / 8) * width);
        const y = Math.floor(((gy + 0.5) / 6) * height);
        const i = (y * width + x) * 4;
        grid.push(`${data[i] >> 4}${data[i + 1] >> 4}${data[i + 2] >> 4}`);
      }
    }
    for (let i = 0; i < data.length; i += 64) {
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1;
    }
    return {
      width,
      height,
      mean: [Math.round(r / n), Math.round(g / n), Math.round(b / n)],
      signature: grid.join(""),
    };
  });
}

export function statsDiffer(before, after) {
  if (!before || !after) return false;
  if (before.width !== after.width || before.height !== after.height) return true;
  if (before.signature !== after.signature) return true;
  return before.mean.some((value, index) => Math.abs(value - after.mean[index]) > 2);
}

/** Click a clip block on the timeline whose label contains `text` (or the nth clip of a track kind). */
export async function selectClip(page, { trackIndex = 0, clipIndex = 0 } = {}) {
  const box = await page.evaluate(({ trackIndex, clipIndex }) => {
    const content = document.querySelector("[data-video-timeline-content]");
    if (!content) return null;
    const rows = [...content.children].filter((el) => !el.hasAttribute("data-ruler") && el.querySelector);
    const row = rows[trackIndex];
    const clip = row ? [...row.children].filter((el) => el.classList.contains("group"))[clipIndex] : null;
    if (!clip) return null;
    const rect = clip.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, { trackIndex, clipIndex });
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(600);
  return true;
}

/** Control ids currently visible in the edit bar plus the More overflow. */
export async function editBarControls(page) {
  return page.evaluate(() => {
    const bar = document.querySelector("[data-selection-visible-controls]");
    return {
      kind: bar?.getAttribute("data-selection-kind") || null,
      visible: (bar?.getAttribute("data-selection-visible-controls") || "").split(" ").filter(Boolean),
      overflow: (bar?.getAttribute("data-selection-overflow-controls") || "").split(" ").filter(Boolean),
    };
  });
}
