// 批次流程：EXIF 排序 → 偵測全部 → 沿時間接力選臉 → 對齊（鏡像背景）→ 統一亮度膚色
// 與 Python 版 face_align.choose_targets / FaceAligner.align_face / app._unify_tone 同一套規則
import { detectFaces, eyesOf, similarity, SIM_THRESHOLD, SIM_CONFIDENT, MARGIN, CHAIN_MEMORY } from "./engine.js";
import { loadImage, makeCanvas, ctxOf } from "./image.js";
import { shotDate } from "./exif.js";

export const FACE_RATIO = 0.35;
export const EYE_Y = 0.38;
export const MAX_PHOTOS = 150;
export const SIZES = {
  "1:1": [1080, 1080], "9:16": [1080, 1920], "16:9": [1920, 1080], "4:5": [1080, 1350],
};

// ── 選臉 ──
export function bestFace(faces, references) {
  if (!faces.length) return [null, "未偵測到臉部"];
  const scored = faces
    .map(f => [Math.max(...references.map(r => similarity(f.emb, r))), f])
    .sort((a, b) => b[0] - a[0]);
  const [bestSim, best] = scored[0];
  if (bestSim < SIM_THRESHOLD) return [null, `圖中有 ${faces.length} 張臉，但未匹配目標人物（相似度 ${bestSim.toFixed(2)}）`];
  if (scored.length >= 2 && bestSim < SIM_CONFIDENT && bestSim - scored[1][0] < MARGIN)
    return [null, `多人照片相似度差距不足（${bestSim.toFixed(2)} vs ${scored[1][0].toFixed(2)}）`];
  return [best, bestSim];
}

export function chooseTargets(scans, reference) {
  const n = scans.length;
  const out = new Array(n).fill(null).map(() => [null, "未偵測到臉部", 0]);
  if (!reference) {
    scans.forEach((sc, i) => { if (sc.faces.length) out[i] = [sc.faces[0], "最大的臉", 1]; });
    return out;
  }
  let anchor = -1, anchorSim = -1;
  scans.forEach((sc, i) => sc.faces.forEach(f => {
    const s = similarity(f.emb, reference);
    if (s > anchorSim) { anchor = i; anchorSim = s; }
  }));
  if (anchor < 0 || anchorSim < SIM_THRESHOLD) {
    scans.forEach((sc, i) => { if (sc.faces.length) out[i] = [null, "圖中有臉，但未匹配目標人物", 0]; });
    return out;
  }
  const orders = [[], []];
  for (let i = anchor; i >= 0; i--) orders[0].push(i);
  for (let i = anchor; i < n; i++) orders[1].push(i);
  for (const order of orders) {
    const recent = [];
    for (const i of order) {
      const [face, info] = bestFace(scans[i].faces, [reference, ...recent]);
      out[i] = [face, face === null ? info : `相似度 ${info.toFixed(2)}`, face === null ? 0 : info];
      if (face !== null && info >= SIM_CONFIDENT) {
        recent.push(face.emb);
        if (recent.length > CHAIN_MEMORY) recent.shift();
      }
    }
  }
  return out;
}

// ── 對齊 ──
export function alignFace(image, face, [outW, outH]) {
  const [le, re] = eyesOf(face);
  let angle = Math.atan2(re[1] - le[1], re[0] - le[0]);
  if (angle > Math.PI / 2) angle -= Math.PI;
  else if (angle < -Math.PI / 2) angle += Math.PI;
  const cx = (le[0] + re[0]) / 2, cy = (le[1] + re[1]) / 2;
  const eyeDist = Math.hypot(re[0] - le[0], re[1] - le[1]);
  // face_ratio = 臉部（下巴→頭頂）約佔輸出高度的比例；眼距 ≈ 臉高 × 0.30
  const scale = eyeDist > 1 ? (FACE_RATIO * outH * 0.30) / eyeDist : 1.0;

  const cv = makeCanvas(outW, outH), ctx = ctxOf(cv);
  const M = new DOMMatrix()
    .translate(outW / 2, outH * EYE_Y)
    .scale(scale)
    .rotate((-angle * 180) / Math.PI)
    .translate(-cx, -cy);
  // 輸出視窗落在原圖座標的範圍 → 需要哪些鏡像磁磚（等同 BORDER_REFLECT_101）
  const inv = M.inverse();
  const corners = [[0, 0], [outW, 0], [0, outH], [outW, outH]].map(([x, y]) => inv.transformPoint(new DOMPoint(x, y)));
  const w = image.width, h = image.height;
  const minX = Math.min(...corners.map(p => p.x)), maxX = Math.max(...corners.map(p => p.x));
  const minY = Math.min(...corners.map(p => p.y)), maxY = Math.max(...corners.map(p => p.y));
  for (let j = Math.floor(minY / h); j <= Math.floor(maxY / h); j++) {
    for (let i = Math.floor(minX / w); i <= Math.floor(maxX / w); i++) {
      const T = M.translate(i % 2 ? (i + 1) * w : i * w, j % 2 ? (j + 1) * h : j * h).scale(i % 2 ? -1 : 1, j % 2 ? -1 : 1);
      ctx.setTransform(T.a, T.b, T.c, T.d, T.e, T.f);
      ctx.drawImage(image.src, 0, 0, w, h);
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return cv;
}

// ── 統一亮度膚色（CIELAB，臉部橢圓區域為準）──
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const GAMMA_N = 4096, GAMMA = new Uint8ClampedArray(GAMMA_N + 1);
for (let i = 0; i <= GAMMA_N; i++) { const c = i / GAMMA_N; GAMMA[i] = Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)); }
const XN = 0.950456, ZN = 1.088754;
const flab = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
const finv = t => (t > 0.206893 ? t * t * t : (t - 16 / 116) / 7.787);

function rgb2lab(r, g, b, out) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const x = (0.412453 * R + 0.357580 * G + 0.180423 * B) / XN;
  const y = 0.212671 * R + 0.715160 * G + 0.072169 * B;
  const z = (0.019334 * R + 0.119193 * G + 0.950227 * B) / ZN;
  const fx = flab(x), fy = flab(y), fz = flab(z);
  out[0] = 116 * fy - 16; out[1] = 500 * (fx - fy); out[2] = 200 * (fy - fz);
}
function lab2rgb(L, a, b, out, o) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const x = finv(fx) * XN, y = finv(fy), z = finv(fz) * ZN;
  const R = 3.240479 * x - 1.537150 * y - 0.498535 * z;
  const G = -0.969256 * x + 1.875991 * y + 0.041556 * z;
  const B = 0.055648 * x - 0.204043 * y + 1.057311 * z;
  out[o] = GAMMA[Math.max(0, Math.min(GAMMA_N, Math.round(R * GAMMA_N)))];
  out[o + 1] = GAMMA[Math.max(0, Math.min(GAMMA_N, Math.round(G * GAMMA_N)))];
  out[o + 2] = GAMMA[Math.max(0, Math.min(GAMMA_N, Math.round(B * GAMMA_N)))];
}

function faceZone(w, h) {
  const fh = FACE_RATIO * h;
  return { cx: w / 2, cy: EYE_Y * h + fh * 0.12, rx: fh * 0.28, ry: fh * 0.36 };
}

export function toneStats(imageData) {
  const { width: w, height: h, data } = imageData;
  const z = faceZone(w, h), lab = new Float32Array(3);
  let n = 0, sl = 0, sl2 = 0, sa = 0, sb = 0;
  const step = w * h > 600 * 600 ? 2 : 1;
  for (let y = Math.max(0, Math.floor(z.cy - z.ry)); y < Math.min(h, z.cy + z.ry); y += step) {
    const dy = (y - z.cy) / z.ry, halfW = z.rx * Math.sqrt(Math.max(0, 1 - dy * dy));
    for (let x = Math.max(0, Math.floor(z.cx - halfW)); x < Math.min(w, z.cx + halfW); x += step) {
      const o = (y * w + x) * 4;
      rgb2lab(data[o], data[o + 1], data[o + 2], lab);
      n++; sl += lab[0]; sl2 += lab[0] * lab[0]; sa += lab[1]; sb += lab[2];
    }
  }
  if (!n) return { l: 50, s: 20, a: 0, b: 0 };
  const l = sl / n;
  return { l, s: Math.sqrt(Math.max(0, sl2 / n - l * l)), a: sa / n, b: sb / n };
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// 回傳每張的調整參數；套用時：L' = (L - l) * gain + l + dl，a' = a + da，b' = b + db
export function toneParams(statsList) {
  if (statsList.length < 2) return statsList.map(() => null);
  const tl = median(statsList.map(s => s.l)), ts = median(statsList.map(s => s.s));
  const ta = median(statsList.map(s => s.a)), tb = median(statsList.map(s => s.b));
  return statsList.map(({ l, s, a, b }) => ({
    l, gain: 1 + (Math.min(1.33, Math.max(0.75, ts / Math.max(s, 1e-3))) - 1) * 0.5,
    dl: (tl - l) * 0.85, da: (ta - a) * 0.8, db: (tb - b) * 0.8,
  }));
}

export function applyTone(imageData, p) {
  if (!p) return imageData;
  const d = imageData.data, lab = new Float32Array(3);
  for (let o = 0; o < d.length; o += 4) {
    rgb2lab(d[o], d[o + 1], d[o + 2], lab);
    lab2rgb((lab[0] - p.l) * p.gain + p.l + p.dl, lab[1] + p.da, lab[2] + p.db, d, o);
  }
  return imageData;
}

// ── 批次 ──
export function shortReason(msg) {
  for (const [key, short] of [["未匹配", "未匹配目標人物"], ["差距不足", "多人照片無法分辨"], ["未偵測", "未偵測到臉部"], ["無法讀取", "無法讀取圖片"]])
    if (msg.includes(key)) return short;
  return msg || "未知原因";
}

async function canvasToBlob(cv, type = "image/jpeg", quality = 0.92) {
  return new Promise(res => cv.toBlob(res, type, quality));
}

async function thumbOf(source, sw, sh, maxSide) {
  const s = Math.min(1, maxSide / Math.max(sw, sh));
  const cv = makeCanvas(Math.round(sw * s), Math.round(sh * s)), ctx = ctxOf(cv);
  ctx.drawImage(source, 0, 0, cv.width, cv.height);
  return cv.toDataURL("image/jpeg", 0.85);
}

export async function sortByDate(files) {
  const dated = await Promise.all(files.map(async (file, i) => ({ file, i, date: await shotDate(file) })));
  return dated.sort((p, q) => {
    if (!!p.date !== !!q.date) return p.date ? -1 : 1;
    if (p.date && q.date && p.date - q.date) return p.date - q.date;
    return p.i - q.i;
  });
}

/**
 * files: File[]；reference: Float32Array|null；size: [w,h]
 * onProgress(done, total, label)
 * 回傳 { ok: [{name, date, blob, thumb, stats}], skipped: [{name, date, thumb, error}] }
 */
export async function processBatch(files, reference, size, onProgress) {
  const items = await sortByDate(files);
  const total = items.length * 2;
  let done = 0;
  const tick = label => onProgress?.(++done, total, label);

  const scans = [];
  for (const it of items) {
    const img = await loadImage(it.file);
    if (!img) { scans.push({ faces: [], readable: false, thumb: null }); tick("偵測中"); continue; }
    const faces = await detectFaces(img);
    scans.push({ faces, readable: true, thumb: await thumbOf(img.src, img.width, img.height, 320) });
    img.release();
    tick("偵測中");
  }
  const picks = chooseTargets(scans, reference);

  const ok = [], skipped = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i], sc = scans[i], [face, info, sim] = picks[i];
    const name = it.file.name.replace(/\.[^.]+$/, "");
    if (!sc.readable) skipped.push({ name, date: it.date, thumb: null, error: "無法讀取圖片" });
    else if (!face) skipped.push({ name, date: it.date, thumb: sc.thumb, error: shortReason(info) });
    else {
      const img = await loadImage(it.file);
      const cv = alignFace(img, face, size);
      img.release();
      const stats = toneStats(ctxOf(cv).getImageData(0, 0, cv.width, cv.height));
      ok.push({ name, date: it.date, blob: await canvasToBlob(cv), stats, sim, faces: sc.faces.length });
    }
    tick("對齊中");
  }
  const params = toneParams(ok.map(r => r.stats));
  for (let i = 0; i < ok.length; i++) {
    ok[i].tone = params[i];
    ok[i].thumb = await renderThumb(ok[i], 360);
  }
  return { ok, skipped };
}

// 套上色調後的縮圖（排序卡片用）
export async function renderThumb(rec, maxSide) {
  const img = await loadImage(rec.blob);
  const s = Math.min(1, maxSide / Math.max(img.width, img.height));
  const cv = makeCanvas(Math.round(img.width * s), Math.round(img.height * s)), ctx = ctxOf(cv);
  ctx.drawImage(img.src, 0, 0, cv.width, cv.height);
  img.release();
  if (rec.tone) ctx.putImageData(applyTone(ctx.getImageData(0, 0, cv.width, cv.height), rec.tone), 0, 0);
  return cv.toDataURL("image/jpeg", 0.85);
}

// 輸出用的完整影格（套色調）
export async function renderFrame(rec) {
  const img = await loadImage(rec.blob);
  const cv = makeCanvas(img.width, img.height), ctx = ctxOf(cv);
  ctx.drawImage(img.src, 0, 0);
  img.release();
  if (rec.tone) ctx.putImageData(applyTone(ctx.getImageData(0, 0, cv.width, cv.height), rec.tone), 0, 0);
  return cv;
}
