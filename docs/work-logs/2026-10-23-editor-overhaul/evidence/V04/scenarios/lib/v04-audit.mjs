// V04 theme audit helpers (D6 / D7).
// - themeState(page): site theme class + every [data-plugin-theme] root.
// - auditView(page, opts): light/dark islands + WCAG AA contrast on visible text,
//   computed in the page from getComputedStyle + elementsFromPoint.
// - pngStats(file, rect): decode a screenshot (zlib only) and report the mean colour
//   and the share of near-white / near-black pixels inside a rectangle.
import fs from "node:fs";
import zlib from "node:zlib";

/** Site theme and plugin theme roots as the page sees them now. */
export async function themeState(page) {
  return page.evaluate(() => {
    const roots = [...document.querySelectorAll("[data-plugin-theme]")].map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        theme: el.getAttribute("data-plugin-theme"),
        scope: el.getAttribute("data-plugin-theme-scope") || null,
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || "").slice(0, 80),
        w: Math.round(r.width),
        h: Math.round(r.height),
        bg: cs.backgroundColor,
        awbShell: cs.getPropertyValue("--awb-shell-bg").trim() || null,
      };
    });
    const pluginStore = {};
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && k.startsWith("oceanleo.plugin-theme.")) pluginStore[k] = localStorage.getItem(k);
      }
    } catch {}
    return {
      url: location.pathname + location.search,
      htmlClass: document.documentElement.className,
      htmlColorScheme: document.documentElement.style.colorScheme || null,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      themeCookie: (document.cookie.match(/(?:^|; )oceanleo-theme=([^;]*)/) || [])[1] || null,
      pluginStore,
      themeToggles: document.querySelectorAll("[data-plugin-theme-toggle]").length,
      roots,
    };
  });
}

/**
 * opts.theme: "light" | "dark" (expected appearance)
 * opts.scope: CSS selector to restrict the scan (default whole document)
 * opts.content: CSS selectors that are D6 "keep original colour" content
 *               (pages, slides, images, previews, canvases); islands inside are reported
 *               with content=true and are not counted as violations.
 */
export async function auditView(page, opts = {}) {
  return page.evaluate((o) => {
    const theme = o.theme;
    const contentSel = (o.content || []).concat([
      "canvas",
      "img",
      "video",
      "iframe",
      "picture",
      "[data-v04-content]",
    ]);
    const scopeEls = o.scope ? [...document.querySelectorAll(o.scope)] : [document.body];
    const vw = innerWidth;
    const vh = innerHeight;
    const cvs = document.createElement("canvas");
    cvs.width = cvs.height = 1;
    const ctx = cvs.getContext("2d", { willReadFrequently: true });
    const cache = new Map();
    const rgba = (css) => {
      if (!css || css === "transparent" || css === "none") return [0, 0, 0, 0];
      if (cache.has(css)) return cache.get(css);
      let out = null;
      const m = css.match(/^rgba?\(([^)]+)\)$/);
      if (m) {
        const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
        out = [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
      }
      const s = !out && css.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)$/);
      if (s) out = [s[1] * 255, s[2] * 255, s[3] * 255, s[4] === undefined ? 1 : Number(s[4])];
      if (!out) {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "rgba(0,0,0,0)";
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        out = [d[0], d[1], d[2], d[3] / 255];
      }
      cache.set(css, out);
      return out;
    };
    const lin = (v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const over = (top, bottom) => {
      const a = top[3] + bottom[3] * (1 - top[3]);
      if (a <= 0) return [0, 0, 0, 0];
      const ch = (i) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a;
      return [ch(0), ch(1), ch(2), a];
    };
    const hex = (c) =>
      "#" + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
    const rootBg = (() => {
      const h = rgba(getComputedStyle(document.documentElement).backgroundColor);
      if (h[3] > 0.99) return h;
      const b = rgba(getComputedStyle(document.body).backgroundColor);
      if (b[3] > 0.99) return b;
      return document.documentElement.style.colorScheme === "dark" ? [18, 18, 18, 1] : [255, 255, 255, 1];
    })();
    const isContent = (el) => {
      for (const sel of contentSel) {
        try {
          if (el.closest(sel)) return sel;
        } catch {}
      }
      return null;
    };
    const desc = (el) => {
      const attrs = [...el.attributes]
        .filter((a) => a.name.startsWith("data-") || a.name === "role" || a.name === "aria-label")
        .map((a) => (a.value && a.value.length < 40 ? `${a.name}=${a.value}` : a.name))
        .slice(0, 6);
      const path = [];
      let p = el.parentElement;
      while (p && path.length < 4) {
        const da = [...p.attributes].find((a) => a.name.startsWith("data-"));
        if (da) path.push(`${p.tagName.toLowerCase()}[${da.name}${da.value && da.value.length < 30 ? "=" + da.value : ""}]`);
        p = p.parentElement;
      }
      return {
        tag: el.tagName.toLowerCase(),
        cls: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || "").slice(0, 120),
        attrs,
        path,
        text: (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40),
      };
    };
    // Effective background behind (x, y): composite the elementsFromPoint stack.
    const bgAt = (x, y, ignore) => {
      const stack = document.elementsFromPoint(x, y);
      const layers = [];
      let media = null;
      let gradient = null;
      for (const el of stack) {
        if (ignore && (el === ignore || ignore.contains(el)) && el !== ignore) continue;
        const tag = el.tagName;
        if (tag === "CANVAS" || tag === "IMG" || tag === "VIDEO" || tag === "IFRAME") {
          media = tag.toLowerCase();
          break;
        }
        const cs = getComputedStyle(el);
        if (cs.backgroundImage && cs.backgroundImage !== "none" && !gradient) gradient = el;
        const c = rgba(cs.backgroundColor);
        const op = Number(cs.opacity);
        if (c[3] > 0) layers.push([c[0], c[1], c[2], c[3] * (op < 1 ? op : 1)]);
        if (c[3] >= 0.999 && !(op < 1)) break;
      }
      let acc = rootBg;
      for (let i = layers.length - 1; i >= 0; i -= 1) acc = over(layers[i], acc);
      return { color: acc, media, gradient: gradient ? desc(gradient).tag + "." + desc(gradient).cls.slice(0, 40) : null };
    };
    const visibleRect = (el) => {
      const r = el.getBoundingClientRect();
      const x1 = Math.max(0, r.left);
      const y1 = Math.max(0, r.top);
      const x2 = Math.min(vw, r.right);
      const y2 = Math.min(vh, r.bottom);
      if (x2 - x1 < 1 || y2 - y1 < 1) return null;
      return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    };

    // ---- islands
    const islands = [];
    const seen = new Set();
    for (const scope of scopeEls) {
      for (const el of scope.querySelectorAll("*")) {
        if (seen.has(el)) continue;
        seen.add(el);
        const vr = visibleRect(el);
        if (!vr || vr.w < 40 || vr.h < 16 || vr.w * vr.h < 4000) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.05) continue;
        const c = rgba(cs.backgroundColor);
        if (c[3] < 0.85) continue;
        const L = lum(c);
        const kind = theme === "dark" ? (L > 0.4 ? "light-island" : null) : L < 0.1 ? "dark-island" : null;
        if (!kind) continue;
        // Visible share: 9 probe points; count points where el is the first opaque layer.
        let hits = 0;
        for (const fx of [0.15, 0.5, 0.85]) {
          for (const fy of [0.15, 0.5, 0.85]) {
            const px = vr.x + vr.w * fx;
            const py = vr.y + vr.h * fy;
            const stack = document.elementsFromPoint(px, py);
            for (const s of stack) {
              const sc = rgba(getComputedStyle(s).backgroundColor);
              if (s === el) {
                hits += 1;
                break;
              }
              if (sc[3] >= 0.85 || ["CANVAS", "IMG", "VIDEO", "IFRAME"].includes(s.tagName)) break;
            }
          }
        }
        if (hits < 2) continue;
        islands.push({
          kind,
          content: isContent(el),
          bg: hex(c),
          L: Number(L.toFixed(3)),
          rect: { x: Math.round(vr.x), y: Math.round(vr.y), w: Math.round(vr.w), h: Math.round(vr.h) },
          visibleShare: Number((hits / 9).toFixed(2)),
          ...desc(el),
        });
      }
    }
    // Keep outermost islands (drop ones nested inside a reported island of same kind).
    const outer = islands.filter(
      (a) =>
        !islands.some(
          (b) =>
            b !== a &&
            b.kind === a.kind &&
            b.rect.x <= a.rect.x &&
            b.rect.y <= a.rect.y &&
            b.rect.x + b.rect.w >= a.rect.x + a.rect.w &&
            b.rect.y + b.rect.h >= a.rect.y + a.rect.h &&
            b.rect.w * b.rect.h > a.rect.w * a.rect.h,
        ),
    );
    outer.sort((a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h);

    // ---- contrast on visible text
    const texts = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const perEl = new Set();
    let n;
    while ((n = walker.nextNode())) {
      const t = n.nodeValue.trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!el || perEl.has(el)) continue;
      if (o.scope && !scopeEls.some((s) => s.contains(el))) continue;
      perEl.add(el);
      const range = document.createRange();
      range.selectNodeContents(n);
      const rr = [...range.getClientRects()].find((r) => r.width > 2 && r.height > 4);
      if (!rr) continue;
      const cx = Math.min(vw - 1, Math.max(0, rr.left + Math.min(rr.width, 40) / 2));
      const cy = Math.min(vh - 1, Math.max(0, rr.top + rr.height / 2));
      if (rr.right < 0 || rr.bottom < 0 || rr.left > vw || rr.top > vh) continue;
      const top = document.elementFromPoint(cx, cy);
      if (!top || !(top === el || el.contains(top) || top.contains(el))) continue; // covered
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden") continue;
      let op = 1;
      for (let p = el; p; p = p.parentElement) op *= Number(getComputedStyle(p).opacity);
      let fg = rgba(cs.webkitTextFillColor && cs.webkitTextFillColor !== cs.color ? cs.webkitTextFillColor : cs.color);
      fg = [fg[0], fg[1], fg[2], fg[3] * op];
      if (fg[3] < 0.15) continue; // invisible selection layers (PDF text layer etc.)
      const bg = bgAt(cx, cy, null);
      if (bg.media) continue; // text over media: judged visually
      const fgc = over(fg, bg.color);
      const ratio = (Math.max(lum(fgc), lum(bg.color)) + 0.05) / (Math.min(lum(fgc), lum(bg.color)) + 0.05);
      const size = parseFloat(cs.fontSize);
      const weight = Number(cs.fontWeight) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const need = large ? 3 : 4.5;
      const disabled = !!el.closest("[disabled],[aria-disabled=true]");
      texts.push({
        text: t.replace(/\s+/g, " ").slice(0, 32),
        ratio: Number(ratio.toFixed(2)),
        need,
        pass: ratio >= need,
        disabled,
        content: isContent(el),
        fg: hex(fgc),
        bg: hex(bg.color),
        gradient: bg.gradient,
        size,
        weight,
        at: [Math.round(cx), Math.round(cy)],
        el: el.tagName.toLowerCase() + (el.getAttribute("data-testid") ? `[data-testid=${el.getAttribute("data-testid")}]` : ""),
      });
    }
    const fails = texts.filter((x) => !x.pass && !x.disabled);
    return {
      theme,
      scope: o.scope || null,
      islands: outer.slice(0, o.maxIslands || 25),
      islandCount: outer.length,
      violations: outer.filter((x) => !x.content).length,
      textCount: texts.length,
      contrastFails: fails.slice(0, o.maxFails || 25),
      contrastFailCount: fails.length,
      contrastMin: texts.length ? Math.min(...texts.filter((x) => !x.disabled).map((x) => x.ratio)) : null,
    };
  }, opts);
}

/** Minimal PNG decoder (8-bit RGB/RGBA, non-interlaced; Playwright screenshots). */
export function decodePng(file) {
  const buf = fs.readFileSync(file);
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
      if (data[8] !== 8 || data[12] !== 0) throw new Error("unsupported png");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!bpp) throw new Error("unsupported colour type " + colorType);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i += 1) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 255;
    }
    for (let x = 0; x < width; x += 1) {
      out[(y * width + x) * 4] = line[x * bpp];
      out[(y * width + x) * 4 + 1] = line[x * bpp + 1];
      out[(y * width + x) * 4 + 2] = line[x * bpp + 2];
      out[(y * width + x) * 4 + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { width, height, data: out };
}

/** Mean colour + near-white / near-black share inside rect of a decoded screenshot. */
export function pngStats(img, rect) {
  const x0 = Math.max(0, Math.round(rect.x));
  const y0 = Math.max(0, Math.round(rect.y));
  const x1 = Math.min(img.width, Math.round(rect.x + rect.w));
  const y1 = Math.min(img.height, Math.round(rect.y + rect.h));
  let r = 0;
  let g = 0;
  let b = 0;
  let white = 0;
  let black = 0;
  let count = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * img.width + x) * 4;
      const pr = img.data[i];
      const pg = img.data[i + 1];
      const pb = img.data[i + 2];
      r += pr;
      g += pg;
      b += pb;
      if (pr > 225 && pg > 225 && pb > 225) white += 1;
      if (pr < 45 && pg < 45 && pb < 45) black += 1;
      count += 1;
    }
  }
  if (!count) return null;
  const hex = (v) => Math.round(v / count).toString(16).padStart(2, "0");
  return {
    mean: `#${hex(r)}${hex(g)}${hex(b)}`,
    white: Number((white / count).toFixed(3)),
    black: Number((black / count).toFixed(3)),
  };
}

/** Compact one-line summary for the scenario log. */
export function summarize(label, a) {
  const isl = a.islands
    .filter((x) => !x.content)
    .slice(0, 6)
    .map((x) => `${x.kind}:${x.tag}${x.attrs[0] ? "[" + x.attrs[0] + "]" : ""}${x.bg}@${x.rect.x},${x.rect.y} ${x.rect.w}x${x.rect.h}`)
    .join(" | ");
  const cf = a.contrastFails
    .slice(0, 6)
    .map((x) => `"${x.text}" ${x.ratio}<${x.need} ${x.fg}/${x.bg}`)
    .join(" | ");
  return `${label} theme=${a.theme} islands(non-content)=${a.violations}/${a.islandCount} contrastFails=${a.contrastFailCount}/${a.textCount} min=${a.contrastMin} :: ${isl} :: ${cf}`;
}
