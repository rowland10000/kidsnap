// 隨機美化風格（相框／色塊海報／弧形大字），移植自 styles.py。
// 同一個 seed 整支影片共用同一套版面；靜態圖層只畫一次，每張影格只換照片。
import { makeCanvas, ctxOf } from "./image.js";
import { EYE_Y, FACE_RATIO } from "./pipeline.js";

const FONT_DIR = new URL("../assets/fonts/", import.meta.url).href;
const LATIN = {
  heavy: ["KidSnap Poppins", "Poppins-ExtraBold.ttf"],
  poster: ["KidSnap Archivo", "ArchivoBlack-Regular.ttf"],
  chunky: ["KidSnap Bagel", "BagelFatOne-Regular.ttf"],
  condensed: ["KidSnap Anton", "Anton-Regular.ttf"],
  script: ["KidSnap Yellowtail", "Yellowtail-Regular.ttf"],
  micro: ["KidSnap Barlow", "BarlowCondensed-SemiBold.ttf"],
  mono: ["KidSnap DMMono", "DMMono-Medium.ttf"],
  hand: ["KidSnap Grace", "CoveredByYourGrace.ttf"],
};
// 中文字型是 Big5 子集的 woff2（web/tools/subset_cjk_fonts.py），主標有中文才載，一套 5–7 MB
const CJK = {
  cjk_heavy: ["KidSnap NotoSansTC", "NotoSansTC-Black.woff2", '"PingFang TC", "Microsoft JhengHei", sans-serif'],
  cjk_serif: ["KidSnap NotoSerifTC", "NotoSerifTC-Black.woff2", '"Songti TC", "PMingLiU", serif'],
  cjk_round: ["KidSnap GenSenRounded", "GenSenRounded2TW-H.woff2", '"PingFang TC", sans-serif'],
};
export const CJK_FONTS = { 粗黑體: "cjk_heavy", 粗明體: "cjk_serif", 粗圓體: "cjk_round" };
export const LATIN_FONTS = { 草寫: "script", 手寫: "hand", 粗體: "heavy", 海報: "poster", 圓胖: "chunky", 窄粗: "condensed" };
export const STYLE_NAMES = ["相框", "色塊海報", "弧形大字", "塗鴉描邊"];
export const STYLE_CHOICES = [...STYLE_NAMES, "隨機"];

let fontsLoaded = null;
export function loadFonts() {
  if (!fontsLoaded) {
    fontsLoaded = Promise.all(Object.values(LATIN).map(async ([family, file]) => {
      const ff = new FontFace(family, `url("${FONT_DIR + file}")`);
      document.fonts.add(await ff.load());
    }));
  }
  return fontsLoaded;
}
const cjkLoaded = {};
export const needsCjkFont = text => hasCjk(text || "");
export function loadCjkFont(name) {
  const kind = CJK_FONTS[name] || "cjk_heavy";
  if (!cjkLoaded[kind]) {
    const [family, file] = CJK[kind];
    cjkLoaded[kind] = new FontFace(family, `url("${FONT_DIR + file}")`).load().then(ff => { document.fonts.add(ff); });
    cjkLoaded[kind].catch(() => { delete cjkLoaded[kind]; });
  }
  return cjkLoaded[kind];
}
export const cjkFontReady = name => !!cjkLoaded[CJK_FONTS[name] || "cjk_heavy"];

const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const WHITE = [255, 255, 255], PAPER = rgb("#FBF8F2"), CREAM = rgb("#F4EDE2"), GREY = rgb("#E9E6E1");
const BUTTER = rgb("#F6E9C9"), PINK = rgb("#F3C9D2"), INK = rgb("#1A1A1A"), NAVY = rgb("#14213D");
const ORANGE = rgb("#E8501E"), RED = rgb("#C9281F"), COBALT = rgb("#1F3BB3"), YELLOW = rgb("#F2C230"), GREEN = rgb("#2FB457");

const FRAME_PALETTES = [[GREY, RED, INK], [CREAM, COBALT, COBALT], [BUTTER, ORANGE, INK], [COBALT, CREAM, CREAM], [ORANGE, CREAM, CREAM], [PINK, RED, RED]];
const BLOCK_PALETTES = [
  { deep: mix(COBALT, INK, .45), light: CREAM, panel: COBALT, ink: CREAM, spot: YELLOW },
  { deep: mix(ORANGE, INK, .60), light: mix(ORANGE, PAPER, .86), panel: ORANGE, ink: CREAM, spot: CREAM },
  { deep: NAVY, light: mix(GREEN, PAPER, .86), panel: GREEN, ink: NAVY, spot: NAVY },
  { deep: mix(YELLOW, INK, .78), light: mix(YELLOW, PAPER, .82), panel: YELLOW, ink: INK, spot: INK },
  { deep: mix(RED, INK, .55), light: PINK, panel: RED, ink: PINK, spot: PINK },
];
const ARC_PALETTES = [[CREAM, ORANGE, COBALT, INK], [ORANGE, CREAM, COBALT, CREAM], [COBALT, YELLOW, ORANGE, CREAM], [YELLOW, COBALT, RED, INK], [PAPER, RED, INK, INK]];
const SCRIPT_PAIRS = [["Still", "growing!"], ["One more", "year!"], ["Hello", "again!"], ["Good", "times!"], ["Day by", "day!"], ["Oh", "happy day!"], ["Little by", "little!"]];
const STACKED = [["still", "growing."], ["one more", "year."], ["same face,", "new year."], ["hello", "again."], ["good", "times."], ["day", "by day."]];
const ARC_LINES = ["YOU'RE STILL GROWING", "SAME FACE NEW YEAR", "ONE MORE YEAR OLDER", "GOOD TIMES ALL DAY", "HELLO AGAIN OLD FRIEND", "LITTLE BY LITTLE"];
const VERTICAL = ["GROWING", "TIMELAPSE", "FOREVER", "EVERYDAY", "HELLO AGAIN"];
const MICRO = ["FACE TIMELAPSE", "DAY BY DAY", "SINCE DAY ONE", "STILL GROWING", "ONE FRAME AT A TIME", "ALL DAY LONG"];
const PILL_COPY = ["SINCE DAY ONE", "STILL GROWING", "FRESH DAILY", "ALL SMILES", "DAY BY DAY"];
const BADGE_COPY = [["ONE", "MORE"], ["ALL", "GOOD"], ["OH", "YES"]];
const DOODLE_COLORS = [YELLOW, YELLOW, PAPER, PINK];
const DOODLE_LINES = ["KEEP ON GROWING", "LOOK WHO IS GROWING UP", "STILL ME JUST BIGGER", "ONE MORE YEAR AROUND THE SUN", "HELLO AGAIN IT IS ME"];

// ── 亂數（mulberry32）──
function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  const next = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return {
    random: next,
    uniform: (lo, hi) => lo + (hi - lo) * next(),
    choice: arr => arr[Math.floor(next() * arr.length)],
    sample: (arr, k) => { const a = [...arr], out = []; while (out.length < k) out.push(a.splice(Math.floor(next() * a.length), 1)[0]); return out; },
  };
}

// ── 文字工具 ──
const MC = ctxOf(makeCanvas(8, 8));
function font(kind, size) {
  size = Math.max(1, Math.round(size));
  return { kind, size, css: kind in LATIN ? `${size}px "${LATIN[kind][0]}"` : `900 ${size}px "${CJK[kind][0]}", ${CJK[kind][2]}` };
}
function adv(f, text) { MC.font = f.css; return MC.measureText(text).width; }
function ink(f, text) {
  MC.font = f.css;
  const m = MC.measureText(text);
  return { w: m.actualBoundingBoxLeft + m.actualBoundingBoxRight, h: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent,
           cx: (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2, cy: (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2 };
}
function fit(kind, text, maxW, size) {
  while (size > 10) {
    const f = font(kind, size);
    if (adv(f, text) <= maxW) return f;
    size *= 0.94;
  }
  return font(kind, size);
}
const lum = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const on = fill => (lum(fill) > 150 ? INK : CREAM);
const hasCjk = s => /[⺀-鿿豈-﫿]/.test(s);
const kindOf = (text, cjk, latin) => (hasCjk(text) ? cjk : latin);
const minBy = (arr, key) => arr.reduce((a, b) => (key(b) < key(a) ? b : a));
const ints = (...v) => v.map(Math.round);

function split2(text) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    let best = 1, bestD = Infinity;
    for (let i = 1; i < words.length; i++) {
      const d = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
      if (d < bestD) { bestD = d; best = i; }
    }
    return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
  }
  if (hasCjk(text) && text.length > 3) { const h = Math.ceil(text.length / 2); return [text.slice(0, h), text.slice(h)]; }
  return [text];
}

function stampParts(stamp) {
  const [y, m, d] = stamp.split("-").map(Number);
  return [String(y), `${m}.${d}`, `${y}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}`];
}

// 以墨跡中心對到 (cx, cy)，angle 為逆時針角度（同 PIL rotate）
function drawText(ctx, text, f, fill, cx, cy, angle = 0, shadow = null) {
  const k = ink(f, text);
  ctx.save();
  ctx.font = f.css; ctx.fillStyle = css(fill); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.translate(cx, cy);
  if (angle) ctx.rotate((-angle * Math.PI) / 180);
  if (shadow) { ctx.shadowColor = `rgba(0,0,0,${shadow.opacity})`; ctx.shadowBlur = shadow.blur * 2; ctx.shadowOffsetY = shadow.dy || 0; }
  ctx.fillText(text, -k.cx, -k.cy);
  ctx.restore();
  return k;
}
function trackedSize(f, text, track) {
  let w = 0;
  for (const ch of text) w += adv(f, ch);
  w += track * (text.length - 1);
  const k = ink(f, text);
  return { w, h: k.h, cy: k.cy };
}
function drawTracked(ctx, text, f, fill, cx, cy, track, angle = 0) {
  const s = trackedSize(f, text, track);
  ctx.save();
  ctx.font = f.css; ctx.fillStyle = css(fill); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.translate(cx, cy);
  if (angle) ctx.rotate((-angle * Math.PI) / 180);
  let x = -s.w / 2;
  for (const ch of text) { ctx.fillText(ch, x, -s.cy); x += adv(f, ch) + track; }
  ctx.restore();
  return s;
}
// (x, y) 對到圖層的 (ax, ay) 比例位置：0=左/上、0.5=中、1=右/下
function placeText(ctx, text, f, fill, x, y, ax, ay, track = null) {
  const s = track === null ? ink(f, text) : trackedSize(f, text, track);
  const cx = x + s.w * (0.5 - ax), cy = y + s.h * (0.5 - ay);
  if (track === null) drawText(ctx, text, f, fill, cx, cy); else drawTracked(ctx, text, f, fill, cx, cy, track);
}
function textAt(ctx, text, f, fill, x, y, align, baseline) {
  ctx.save(); ctx.font = f.css; ctx.fillStyle = css(fill); ctx.textAlign = align; ctx.textBaseline = baseline; ctx.fillText(text, x, y); ctx.restore();
}
function stack(ctx, lines, f, x, lastBaseline, fill) {
  const lead = f.size * 0.98;
  lines.forEach((ln, i) => textAt(ctx, ln, f, fill, x, lastBaseline - lead * (lines.length - 1 - i), "left", "alphabetic"));
}

// ── 形狀 ──
function rrect(ctx, x0, y0, x1, y1, r) {
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0); ctx.lineTo(x1 - r, y0); ctx.arcTo(x1, y0, x1, y0 + r, r);
  ctx.lineTo(x1, y1 - r); ctx.arcTo(x1, y1, x1 - r, y1, r);
  ctx.lineTo(x0 + r, y1); ctx.arcTo(x0, y1, x0, y1 - r, r);
  ctx.lineTo(x0, y0 + r); ctx.arcTo(x0, y0, x0 + r, y0, r);
  ctx.closePath();
}
function circle(ctx, cx, cy, r, fill) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = css(fill); ctx.fill(); }
function scallops(ctx, [x0, y0, x1, y1], r, width, fill, rng) {
  const nx = Math.max(3, Math.round((x1 - x0) / (2 * r))), ny = Math.max(3, Math.round((y1 - y0) / (2 * r)));
  const rx = (x1 - x0) / (2 * nx), ry = (y1 - y0) / (2 * ny);
  ctx.save(); ctx.strokeStyle = css(fill); ctx.lineWidth = width;
  const arc = (cx, cy, ex, ey, a0, a1) => { ctx.beginPath(); ctx.ellipse(cx, cy, ex, ey, 0, (a0 * Math.PI) / 180, (a1 * Math.PI) / 180); ctx.stroke(); };
  for (let i = 0; i < nx; i++) {
    const cx = x0 + rx * (2 * i + 1);
    arc(cx, y0, rx, rx * rng.uniform(0.9, 1.1), 180, 360);
    arc(cx, y1, rx, rx * rng.uniform(0.9, 1.1), 0, 180);
  }
  for (let i = 0; i < ny; i++) {
    const cy = y0 + ry * (2 * i + 1);
    arc(x0, cy, ry * rng.uniform(0.9, 1.1), ry, 90, 270);
    arc(x1, cy, ry * rng.uniform(0.9, 1.1), ry, 270, 450);
  }
  ctx.restore();
}
function wobblyRect(ctx, [x0, y0, x1, y1], rng, amp, width, fill) {
  const rr = Math.min(x1 - x0, y1 - y0) * 0.05;
  const corners = [[x1 - rr, y0 + rr, -90], [x1 - rr, y1 - rr, 0], [x0 + rr, y1 - rr, 90], [x0 + rr, y0 + rr, 180]];
  const pts = [];
  for (const [cx, cy, a0] of corners) for (let k = 0; k < 7; k++) { const a = ((a0 + 15 * k) * Math.PI) / 180; pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
  const dense = [];
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length], steps = Math.max(1, Math.floor(Math.hypot(q[0] - p[0], q[1] - p[1]) / (rr * 0.8)));
    for (let s = 0; s < steps; s++) dense.push([p[0] + ((q[0] - p[0]) * s) / steps, p[1] + ((q[1] - p[1]) * s) / steps]);
  });
  const ph = [0, 1, 2, 3].map(() => rng.uniform(0, Math.PI * 2));
  const out = dense.map(([x, y], i) => {
    const t = (i / dense.length) * Math.PI * 2;
    return [x + amp * (Math.sin(3 * t + ph[0]) + 0.6 * Math.sin(7 * t + ph[1])), y + amp * (Math.sin(4 * t + ph[2]) + 0.6 * Math.sin(9 * t + ph[3]))];
  });
  ctx.save(); ctx.strokeStyle = css(fill); ctx.lineWidth = width; ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.beginPath(); [...out, ...out.slice(0, 4)].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.restore();
}
function sparkle(ctx, cx, cy, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const rad = i % 2 ? r * 0.30 : r, a = (Math.PI * i) / 4 - Math.PI / 2; const x = cx + rad * Math.cos(a), y = cy + rad * Math.sin(a); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.closePath(); ctx.fillStyle = css(fill); ctx.fill();
}
// 文字沿圓弧下緣排列（像微笑），基線在半徑 R，字頭朝圓心
function arcText(ctx, text, f, fill, cx, cy, R, track, shadow) {
  const advs = [...text].map(ch => adv(f, ch));
  const total = advs.reduce((a, b) => a + b, 0) + track * (text.length - 1);
  let theta = Math.PI / 2 + total / R / 2;
  ctx.save(); ctx.font = f.css; ctx.fillStyle = css(fill); ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  if (shadow) { ctx.shadowColor = `rgba(0,0,0,${shadow.opacity})`; ctx.shadowBlur = shadow.blur * 2; }
  [...text].forEach((ch, i) => {
    const a = theta - advs[i] / 2 / R;
    if (ch !== " ") {
      ctx.save(); ctx.translate(cx + R * Math.cos(a), cy + R * Math.sin(a)); ctx.rotate(a - Math.PI / 2); ctx.fillText(ch, 0, 0); ctx.restore();
    }
    theta -= (advs[i] + track) / R;
  });
  ctx.restore();
}
function drawBadge(ctx, b, parts, S) {
  const [small, big] = parts ? [parts[0], parts[1]] : b.default;
  const r = b.r, rw = r * (b.ring || 0), tc = on(b.fill);
  ctx.save(); ctx.translate(b.cx, b.cy); ctx.rotate((-b.angle * Math.PI) / 180);
  if (b.shadow) { ctx.shadowColor = "rgba(0,0,0,0.32)"; ctx.shadowBlur = S * 0.014; ctx.shadowOffsetY = S * 0.006; }
  if (rw) circle(ctx, 0, 0, r + rw, WHITE);
  ctx.shadowColor = "transparent";
  circle(ctx, 0, 0, r, b.fill);
  drawTracked(ctx, small, font("micro", r * 0.32), tc, 0, -r * 0.48, r * 0.04);
  drawText(ctx, big, fit("poster", big, r * 1.35, r * 0.95), tc, 0, r * 0.20);
  ctx.restore();
}
function drawPill(ctx, text, h, fill, cx, cy, angle, S) {
  const f = font("heavy", h * 0.44), s = trackedSize(f, text, h * 0.03), ring = h * 0.12;
  const w = s.w + h * 0.75 + 2 * ring, hh = h + 2 * ring;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate((-angle * Math.PI) / 180);
  ctx.shadowColor = "rgba(0,0,0,0.32)"; ctx.shadowBlur = S * 0.014; ctx.shadowOffsetY = S * 0.006;
  rrect(ctx, -w / 2, -hh / 2, w / 2, hh / 2, hh / 2); ctx.fillStyle = css(WHITE); ctx.fill();
  ctx.shadowColor = "transparent";
  rrect(ctx, -w / 2 + ring, -hh / 2 + ring, w / 2 - ring, hh / 2 - ring, h / 2); ctx.fillStyle = css(fill); ctx.fill();
  drawTracked(ctx, text, f, on(fill), 0, 0, h * 0.03);
  ctx.restore();
}
function drawSlot(ctx, slot, text) {
  if (!text) return;
  text += slot.suffix || "";
  const f = slot.maxw ? fit(slot.kind, text, slot.maxw, slot.size) : font(slot.kind, slot.size);
  const s = slot.track ? trackedSize(f, text, slot.track) : ink(f, text);
  const pad = slot.tag ? slot.pad : 0;
  const w = s.w + 2 * pad, h = s.h + 2 * pad;
  const cx = slot.x - w * slot.ax + w / 2, cy = slot.y - h * slot.ay + h / 2;
  ctx.save(); ctx.translate(cx, cy);
  if (slot.angle) ctx.rotate((-slot.angle * Math.PI) / 180);
  if (slot.tag) { ctx.fillStyle = css(slot.tag); ctx.fillRect(-w / 2, -h / 2, w, h); }
  if (slot.track) drawTracked(ctx, text, f, slot.color, 0, 0, slot.track); else drawText(ctx, text, f, slot.color, 0, 0);
  ctx.restore();
}
function vGradient(ctx, W, H, color, alphaFn, stops = 64) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  for (let i = 0; i <= stops; i++) { const y = i / stops; g.addColorStop(y, css(color, Math.max(0, Math.min(1, alphaFn(y))))); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
const clip01 = v => Math.max(0, Math.min(1, v));

// ── 風格 1：相框 ──
function planFrame(rng, W, H, headline, cjk, latin) {
  const [field, accent, micro] = rng.choice(FRAME_PALETTES);
  const ratio = 1.22;
  const ww = Math.min(W * (H > W * 1.2 ? 0.72 : 0.56), (H * 0.60) / ratio), wh = ww * ratio;
  const win = ints(W / 2 - ww / 2, H * 0.495 - wh / 2, W / 2 + ww / 2, H * 0.495 + wh / 2);
  let cropH = H * 0.74, cropW = cropH / ratio;
  if (cropW > W) { cropW = W; cropH = W * ratio; }
  const fcy = (EYE_Y + FACE_RATIO * 0.08) * H;
  const sy = Math.min(Math.max(fcy - cropH * 0.47, 0), H - cropH);
  const crop = ints((W - cropW) / 2, sy, (W + cropW) / 2, sy + cropH);
  const S = Math.min(W, H), m = S * 0.06, [x0, y0, x1, y1] = win;
  const over = makeCanvas(W, H), d = ctxOf(over), lw = Math.max(1, Math.round(S * 0.006));
  let kind = rng.choice(["scallop", "scallop", "loops", "stamp"]);
  if (kind === "stamp" && lum(field) > 200) kind = "scallop";
  if (kind === "scallop") {
    const g = S * 0.016;
    scallops(d, [x0 - g, y0 - g, x1 + g, y1 + g], S * 0.021, lw, accent, rng);
  } else if (kind === "loops") {
    for (const g of [S * 0.014, S * 0.028]) wobblyRect(d, [x0 - g, y0 - g, x1 + g, y1 + g], rng, S * 0.004, lw, accent);
  } else {
    const b = S * 0.028, bx0 = x0 - b, by0 = y0 - b, bx1 = x1 + b, by1 = y1 + b;
    d.fillStyle = css(PAPER); d.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
    d.clearRect(x0, y0, x1 - x0, y1 - y0);
    const pr = S * 0.010, nx = Math.round((bx1 - bx0) / (S * 0.034)), ny = Math.round((by1 - by0) / (S * 0.034));
    for (let i = 0; i <= nx; i++) { const x = bx0 + ((bx1 - bx0) * i) / nx; circle(d, x, by0, pr, field); circle(d, x, by1, pr, field); }
    for (let i = 0; i <= ny; i++) { const y = by0 + ((by1 - by0) * i) / ny; circle(d, bx0, y, pr, field); circle(d, bx1, y, pr, field); }
  }
  const parts = headline ? split2(headline) : [...rng.choice(SCRIPT_PAIRS)];
  const skind = kindOf(parts.join(""), cjk, latin);
  const f = minBy(parts.map(t => fit(skind, t, W * 0.50, S * 0.20)), x => x.size);
  const ang = rng.uniform(6, 10);
  const k1 = ink(f, parts[0]);
  drawText(d, parts[0], f, accent, Math.max(x0 + (x1 - x0) * 0.05, m * 0.8 + k1.w / 2), y0 - S * 0.015, ang);
  if (parts.length > 1) {
    const k2 = ink(f, parts[1]);
    drawText(d, parts[1], f, accent, Math.min(x1 - (x1 - x0) * 0.05, W - m * 0.8 - k2.w / 2), y1 + S * 0.02, ang);
  }
  const fm = font("micro", S * 0.027), [c1, c2, c3] = rng.sample(MICRO, 3);
  placeText(d, c2, fm, micro, W - m, m + S * 0.038, 1, 0, S * 0.004);
  placeText(d, c3, fm, micro, m, H - m, 0, 1, S * 0.004);
  if (rng.random() < 0.75) { sparkle(d, x1 + S * 0.055, y0 + S * 0.075, S * 0.032, accent); sparkle(d, x0 - S * 0.05, y1 - S * 0.10, S * 0.018, accent); }
  const slot = { x: W - m, y: m, ax: 1, ay: 0, kind: "micro", size: S * 0.027, color: micro, track: S * 0.004, default: c1 };
  return {
    apply(photo, parts) {
      const out = makeCanvas(W, H), ctx = ctxOf(out);
      ctx.fillStyle = css(field); ctx.fillRect(0, 0, W, H);
      const [cx0, cy0, cx1, cy1] = crop;
      ctx.drawImage(photo, cx0, cy0, cx1 - cx0, cy1 - cy0, x0, y0, x1 - x0, y1 - y0);
      ctx.drawImage(over, 0, 0);
      drawSlot(ctx, slot, parts ? parts[2] : slot.default);
      return out;
    },
  };
}

// ── 風格 2：色塊海報 ──
function planBlock(rng, W, H, headline, cjk, latin) {
  const pal = rng.choice(BLOCK_PALETTES), variant = rng.choice(["panel", "fade", "strip"]);
  const S = Math.min(W, H), m = S * 0.06;
  const over = makeCanvas(W, H), d = ctxOf(over);
  const micro = rng.sample(MICRO, 3), fmono = font("mono", S * 0.021);
  let badge = null, slot;
  if (variant === "panel") {
    const py = H * 0.70;
    d.fillStyle = css(pal.panel); d.fillRect(0, py, W, H - py);
    const lines = headline ? split2(headline) : rng.choice(STACKED);
    const kind = kindOf(lines.join(""), cjk, latin);
    const size = Math.min((H - py - m * 1.3) / (lines.length * 0.98), S * 0.15);
    const f = minBy(lines.map(ln => fit(kind, ln, W * 0.60, size)), x => x.size);
    const block = f.size * (0.98 * (lines.length - 1) + 0.74);
    stack(d, lines, f, m, py + (H - py + block) / 2, pal.ink);
    micro.slice(1).forEach((t, i) => textAt(d, t, fmono, pal.ink, W - m, H - m - (1 - i) * S * 0.034, "right", "alphabetic"));
    slot = { x: W - m, y: H - m - 2 * S * 0.034, ax: 1, ay: 1, kind: "mono", size: S * 0.021, color: pal.ink, default: micro[0] };
    if (rng.random() < 0.6) badge = { cx: W - m - S * 0.072, cy: py, r: S * 0.072, fill: pal.spot !== pal.panel ? pal.spot : pal.ink, angle: rng.uniform(-14, -8), ring: 0, default: rng.choice(BADGE_COPY) };
  } else if (variant === "fade") {
    vGradient(d, W, H, pal.deep, y => Math.max(Math.pow(clip01((y - 0.46) / 0.54), 1.25) * 0.95, clip01((0.16 - y) / 0.16) * 0.55));
    const c = lum(pal.spot) > 150 ? pal.spot : pal.light;
    if (rng.random() < 0.45) {
      const [a, b] = rng.choice(SCRIPT_PAIRS);
      const text = headline || `${a} ${b}`.replace(/!+$/, "");
      const f = fit(kindOf(text, cjk, latin), text, W * 0.84, S * 0.24);
      drawText(d, text, f, c, W / 2, H * 0.81, 5);
      textAt(d, micro[2], fmono, pal.light, W / 2, H - m * 0.85, "center", "alphabetic");
    } else {
      const lines = headline ? split2(headline) : rng.choice(STACKED);
      const kind = kindOf(lines.join(""), cjk, latin);
      const f = minBy(lines.map(ln => fit(kind, ln, W * 0.60, S * 0.15)), x => x.size);
      stack(d, lines, f, m, H - m * 1.15, c);
      textAt(d, micro[2], fmono, pal.light, W - m, H - m * 1.15, "right", "alphabetic");
    }
    slot = { x: m, y: m, ax: 0, ay: 0, kind: "mono", size: S * 0.021, color: pal.light, default: micro[0] };
    textAt(d, micro[1], fmono, pal.light, W - m, m, "right", "top");
    d.strokeStyle = css(pal.light); d.lineWidth = Math.max(2, Math.round(S * 0.0016));
    d.beginPath(); d.moveTo(m, m + S * 0.042); d.lineTo(W - m, m + S * 0.042); d.stroke();
  } else {
    const sw = Math.min(W * 0.15, W / 2 - FACE_RATIO * H * 0.55 - W * 0.012);
    d.fillStyle = css(pal.panel); d.fillRect(0, 0, sw, H);
    let word = rng.choice(VERTICAL);
    if (headline) word = headline.toUpperCase();
    if (hasCjk(word)) {
      const chars = [...word.replace(/\s/g, "")];
      const f = font(cjk, Math.min(sw * 0.62, (H * 0.84) / (chars.length * 1.08)));
      chars.forEach((ch, i) => textAt(d, ch, f, pal.ink, sw / 2, H / 2 + (i - (chars.length - 1) / 2) * f.size * 1.08, "center", "middle"));
    } else {
      let size = sw * 0.95, f = font(latin, size);
      while (size > 10) { f = font(latin, size); const k = ink(f, word); if (k.w <= H * 0.84 && k.h <= sw * 0.64) break; size *= 0.95; }
      drawText(d, word, f, pal.ink, sw / 2, H / 2, 90);
    }
    slot = { x: W - m, y: H - m, ax: 1, ay: 1, kind: "mono", size: S * 0.021, color: pal.ink, default: micro[0], suffix: `  —  ${micro[1]}`, tag: pal.panel, pad: S * 0.016 };
  }
  return {
    apply(photo, parts) {
      const out = makeCanvas(W, H), ctx = ctxOf(out);
      ctx.drawImage(photo, 0, 0, W, H);
      ctx.drawImage(over, 0, 0);
      if (badge) drawBadge(ctx, badge, parts, S);
      drawSlot(ctx, slot, parts ? parts[2] : slot.default);
      return out;
    },
  };
}

// ── 風格 3：弧形大字 ──
function planArc(rng, W, H, headline, cjk, latin) {
  const [mat, cBadge, cPill, cMat] = rng.choice(ARC_PALETTES);
  const S = Math.min(W, H), m = S * 0.045;
  const over = makeCanvas(W, H), d = ctxOf(over);
  d.save(); rrect(d, m, m, W - m, H - m, S * 0.04); d.clip();
  vGradient(d, W, H, [0, 0, 0], y => Math.pow(clip01((y - 0.52) / 0.48), 1.3) * 0.36);
  d.restore();
  const text = headline ? headline.toUpperCase() : rng.choice(ARC_LINES);
  const kind = kindOf(text, cjk, latin);
  const fh = FACE_RATIO * H;
  let cx = W / 2, cy = EYE_Y * H + fh * 0.10;
  let R = Math.min(S * 0.455, H - m - S * 0.035 - cy, W / 2 - m - S * 0.02);
  let span = (150 * Math.PI) / 180;
  if (R - S * 0.11 < fh * 0.76 + S * 0.02) {
    R = W * 0.75;
    cy = Math.min(EYE_Y * H + fh * 0.62 + S * 0.17, H - m - S * 0.05) - R;
    span = 2 * Math.asin((W / 2 - m - S * 0.05) / R);
  }
  const size = Math.min(S * 0.135, (200 * R * span) / (adv(font(kind, 200), text) * 1.04));
  arcText(d, text, font(kind, size), WHITE, cx, cy, R, size * 0.04, { blur: S * 0.012, opacity: 0.45 });
  const badge = { cx: W - m - S * 0.075, cy: m + S * 0.085, r: S * 0.085, fill: cBadge, angle: rng.uniform(8, 16), ring: 0.10, shadow: true, default: rng.choice(BADGE_COPY) };
  drawPill(d, rng.choice(PILL_COPY), S * 0.058, cPill, m + S * 0.135, m + S * 0.05, rng.uniform(-10, -5), S);
  const line = rng.sample(MICRO, 3).join("   ·   ");
  placeText(d, line, font("micro", m * 0.50), cMat, W / 2, H - m / 2, 0.5, 0.5, m * 0.07);
  return {
    apply(photo, parts) {
      const out = makeCanvas(W, H), ctx = ctxOf(out);
      ctx.fillStyle = css(mat); ctx.fillRect(0, 0, W, H);
      ctx.save(); rrect(ctx, m, m, W - m, H - m, S * 0.04); ctx.clip();
      if ("filter" in ctx) ctx.filter = "saturate(92%) contrast(106%)";
      ctx.drawImage(photo, 0, 0, W, H);
      ctx.restore();
      ctx.drawImage(over, 0, 0);
      drawBadge(ctx, badge, parts, S);
      return out;
    },
  };
}


// ── 風格 4：塗鴉描邊 ──
// 人像遮罩用 MediaPipe selfie segmenter（只在選了這個風格時才載入，約 14 MB）
const MP_DIR = new URL("../vendor/mediapipe/", import.meta.url).href;
const SEG_MODEL = new URL("../models/selfie_segmenter.tflite", import.meta.url).href;
const SEG_MAX = 320;
let segmenterPromise = null;
function getSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const { FilesetResolver, ImageSegmenter } = await import(MP_DIR + "vision_bundle.mjs");
      const files = await FilesetResolver.forVisionTasks(MP_DIR + "wasm");
      return ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: SEG_MODEL },
        runningMode: "IMAGE", outputConfidenceMasks: true, outputCategoryMask: false,
      });
    })();
  }
  return segmenterPromise;
}
export function preloadSegmenter() { return getSegmenter(); }

// 8 連通的洪水填充；回傳只含 (sx, sy) 所在那塊的遮罩，起點不在遮罩內回傳 null
function component(bin, w, h, sx, sy) {
  if (!bin[sy * w + sx]) return null;
  const out = new Uint8Array(w * h), stack = [sy * w + sx];
  out[sy * w + sx] = 1;
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (bin[j] && !out[j]) { out[j] = 1; stack.push(j); }
    }
  }
  return out;
}
function dilate(bin, w, h, r) {
  const out = new Uint8Array(w * h), R = Math.ceil(r), r2 = r * r;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!bin[y * w + x]) continue;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) out[ny * w + nx] = 1;
    }
  }
  return out;
}
// 三次 box blur ≈ 高斯（sigma 換算成 box 半徑）
function blurFloat(src, w, h, sigma) {
  const r = Math.max(1, Math.round(sigma * 0.9));
  let a = Float32Array.from(src), b = new Float32Array(w * h);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        b[y * w + x] = acc / (2 * r + 1);
        acc += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / (2 * r + 1);
        acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}
// Moore 鄰域外輪廓追蹤（Jacob 停止條件），回傳 [[x,y],…]
function traceContour(bin, w, h) {
  let sx = -1, sy = -1;
  for (let i = 0; i < w * h && sx < 0; i++) if (bin[i]) { sx = i % w; sy = (i - sx) / w; }
  if (sx < 0) return [];
  const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && bin[y * w + x];
  const N = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const pts = [[sx, sy]];
  let x = sx, y = sy, dir = 0;    // 起點是最上排最左的像素，視為從西邊走進來
  const maxLen = w * h * 2;
  for (let step = 0; step < maxLen; step++) {
    let found = -1;
    for (let k = 0; k < 8; k++) {
      const d = (dir + 5 + k) % 8;  // 從「上一個方向的後方」順時針掃
      if (at(x + N[d][0], y + N[d][1])) { found = d; break; }
    }
    if (found < 0) break;
    x += N[found][0]; y += N[found][1]; dir = found;
    if (x === sx && y === sy) break;
    pts.push([x, y]);
  }
  return pts;
}
async function personMask(photo, W, H) {
  const seg = await getSegmenter();
  const s = SEG_MAX / Math.max(W, H);
  const w = Math.max(16, Math.round(W * s)), h = Math.max(16, Math.round(H * s));
  const cv = makeCanvas(w, h);
  ctxOf(cv).drawImage(photo, 0, 0, w, h);
  const res = seg.segment(cv);
  const masks = res.confidenceMasks || [];
  let best = null, bestV = -1;
  for (const m of masks) {
    const d = m.getAsFloat32Array();
    const v = d[Math.min(m.height - 1, Math.floor((EYE_Y + FACE_RATIO * 0.1) * m.height)) * m.width + Math.floor(m.width / 2)];
    if (v > bestV) { bestV = v; best = { d: Float32Array.from(d), w: m.width, h: m.height }; }
  }
  res.close();
  if (!best) return null;
  const invert = masks.length === 1 && bestV < 0.5;   // 單層模型且臉處偏低＝那層是背景
  const bin = new Uint8Array(best.w * best.h);
  for (let i = 0; i < bin.length; i++) bin[i] = (invert ? 1 - best.d[i] : best.d[i]) > 0.5 ? 1 : 0;
  const fx = Math.floor(best.w / 2), fy = Math.min(best.h - 1, Math.floor((EYE_Y + FACE_RATIO * 0.1) * best.h));
  const comp = component(bin, best.w, best.h, fx, fy);
  return comp ? { data: comp, w: best.w, h: best.h, fx, fy, scale: best.w / W } : null;
}
function softAlpha(mask, W, H, sigmaLow) {
  // 低解析度模糊後放大到成品尺寸，取 alpha
  const f = blurFloat(mask.data, mask.w, mask.h, sigmaLow);
  const id = new ImageData(mask.w, mask.h);
  for (let i = 0; i < f.length; i++) id.data[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, f[i])) * 255);
  const lo = makeCanvas(mask.w, mask.h); lo.getContext("2d").putImageData(id, 0, 0);
  const hi = makeCanvas(W, H), ctx = ctxOf(hi); ctx.drawImage(lo, 0, 0, W, H);
  return ctx.getImageData(0, 0, W, H).data;
}
function planDoodle(rng, W, H, headline, cjk, latin) {
  const color = rng.choice(DOODLE_COLORS);
  const text = headline ? headline.toUpperCase() : rng.choice(DOODLE_LINES);
  const kind = kindOf(text, cjk, latin);
  const S = Math.min(W, H), m = S * 0.06, fh = FACE_RATIO * H;
  const fx1 = W / 2 + fh * 0.55 + S * 0.02, cw = W - m - fx1;
  const over = makeCanvas(W, H), d = ctxOf(over);
  let slot;
  if (cw >= S * 0.22) {
    const words = text.includes(" ") ? text.split(/\s+/) : split2(text);
    const half = Math.ceil(words.length / 2);
    const f = minBy(words.map(wd => fit(kind, wd, cw, S * 0.125)), x => x.size);
    const lead = f.size * 1.02;
    for (const [col, x] of [[words.slice(0, half), m + cw / 2], [words.slice(half), fx1 + cw / 2]]) {
      col.forEach((wd, i) => drawText(d, wd, f, color, x + rng.uniform(-1, 1) * S * 0.008, m + f.size * 0.55 + i * lead, rng.uniform(-5, 5)));
    }
    slot = { x: fx1 + cw / 2, y: m + f.size * 0.40 + (words.length - half) * lead, ax: 0.5, ay: 0.5, kind: "hand", size: S * 0.055, maxw: cw, color, angle: -3, default: "" };
  } else {
    const band = EYE_Y * H - fh * 0.70 - m;
    const f = fit(kind, text, W * 0.86, band * 0.55);
    drawText(d, text, f, color, W / 2, m + band * 0.30, rng.uniform(-3, 3));
    slot = { x: W / 2, y: m + band * 0.80, ax: 0.5, ay: 0.5, kind: "hand", size: Math.min(band * 0.30, S * 0.05), color, angle: -2, default: "" };
  }
  const ph = [0, 1, 2, 3].map(() => rng.uniform(0, Math.PI * 2));
  return {
    async apply(photo, parts) {
      const out = makeCanvas(W, H), ctx = ctxOf(out);
      ctx.drawImage(photo, 0, 0, W, H);
      const mask = await personMask(photo, W, H);
      if (mask) {
        const sc = mask.scale;
        const soft = softAlpha(mask, W, H, S * 0.006 * sc);
        const px = ctx.getImageData(0, 0, W, H), dd = px.data;
        for (let o = 0; o < dd.length; o += 4) {
          const r = dd[o], g = dd[o + 1], b = dd[o + 2], gray = (r + g + b) / 3, t = soft[o + 3] / 255;
          const br = (gray + (r - gray) * 0.45) * 0.62, bg = (gray + (g - gray) * 0.45) * 0.62, bb = (gray + (b - gray) * 0.45) * 0.62;
          dd[o] = br + (r - br) * t; dd[o + 1] = bg + (g - bg) * t; dd[o + 2] = bb + (b - bb) * t;
        }
        ctx.putImageData(px, 0, 0);
        // 沿輪廓畫手繪線：先長胖、模糊、再取外輪廓
        const grown = dilate(mask.data, mask.w, mask.h, (S * 0.035 * sc) / 2);
        const blurred = blurFloat(grown, mask.w, mask.h, S * 0.015 * sc);
        const bin = new Uint8Array(blurred.length);
        for (let i = 0; i < bin.length; i++) bin[i] = blurred[i] > 0.5 ? 1 : 0;
        const comp = component(bin, mask.w, mask.h, mask.fx, mask.fy) || bin;
        const raw = traceContour(comp, mask.w, mask.h);
        const step = Math.max(1, Math.round(S * 0.010 * sc));
        let pts = raw.filter((_, i) => i % step === 0).map(([x, y]) => [x / sc, y / sc]);
        if (pts.length > 8) {
          const n = pts.length;
          const sm = pts.map((_, i) => { let x = 0, y = 0; for (let k = -2; k <= 2; k++) { const q = pts[(i + k + n) % n]; x += q[0]; y += q[1]; } return [x / 5, y / 5]; });
          pts = sm.map(([x, y], i) => {
            const t = (i / n) * Math.PI * 2;
            return [x + S * 0.004 * (Math.sin(5 * t + ph[0]) + 0.6 * Math.sin(11 * t + ph[1])), y + S * 0.004 * (Math.sin(6 * t + ph[2]) + 0.6 * Math.sin(13 * t + ph[3]))];
          });
          const bd = S * 0.012;
          const inside = pts.map(([x, y]) => x > bd && x < W - bd && y > bd && y < H - bd);
          ctx.save(); ctx.strokeStyle = css(color); ctx.lineWidth = Math.max(2, Math.round(S * 0.009)); ctx.lineJoin = "round"; ctx.lineCap = "round";
          if (inside.every(Boolean)) {
            ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();
          } else {
            // 貼著畫面邊緣的線段不畫：人物出鏡的地方留開口
            const start = inside.indexOf(false);
            let open = false;
            ctx.beginPath();
            for (let k = 0; k <= n; k++) {
              const i = (start + k) % n;
              if (inside[i]) { const [x, y] = pts[i]; if (open) ctx.lineTo(x, y); else { ctx.moveTo(x, y); open = true; } }
              else open = false;
            }
            ctx.stroke();
          }
          ctx.restore();
        }
      }
      ctx.drawImage(over, 0, 0);
      drawSlot(ctx, slot, parts ? parts[2] : "");
      return out;
    },
  };
}

const PLANNERS = { 相框: planFrame, 色塊海報: planBlock, 弧形大字: planArc, 塗鴉描邊: planDoodle };

export function resolveStyle(style, seed) {
  return style === "隨機" ? makeRng(seed * 7919 + 1).choice(STYLE_NAMES) : style;
}

/**
 * 回傳 { name, apply(photoCanvas) → canvas | Promise<canvas> }；style 為「無」或未知時回傳 null。
 * stamp：ISO 日期字串（圖上的數字），空字串＝不放；headline 空字串＝風格自己挑預設句。
 */
export function makeStyler({ style, seed, W, H, stamp = "", headline = "", cjk = "粗黑體", latin = "草寫" }) {
  const name = resolveStyle(style, seed);
  const planner = PLANNERS[name];
  if (!planner) return null;
  const parts = stamp ? stampParts(stamp) : null;
  const plan = planner(makeRng(seed), W, H, (headline || "").trim(), CJK_FONTS[cjk] || "cjk_heavy", LATIN_FONTS[latin] || "script");
  return { name, apply: photo => plan.apply(photo, parts) };
}
