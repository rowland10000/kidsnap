// YuNet 偵測 + SFace 特徵。前處理與解碼照 OpenCV FaceDetectorYN / FaceRecognizerSF：
// 偵測：BGR、不正規化、右下補零到 32 的倍數；辨識：RGB、不正規化、五點 Umeyama 對到 112×112。
import * as ort from "../vendor/ort.wasm.min.mjs";
import { makeCanvas, ctxOf } from "./image.js";

export const SIM_THRESHOLD = 0.363;
export const SIM_CONFIDENT = 0.45;
export const MARGIN = 0.08;
export const CHAIN_MEMORY = 8;
export const DETECT_MAX = 1280;

const SCORE_THR = 0.8, NMS_THR = 0.3, TOP_K = 50;
const STRIDES = [8, 16, 32];
const REF5 = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];

ort.env.wasm.wasmPaths = new URL("../vendor/", import.meta.url).href;
ort.env.wasm.numThreads = 1;

let det = null, rec = null;

async function fetchBytes(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下載失敗 ${res.status}: ${url}`);
  const total = Number(res.headers.get("Content-Length")) || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    onProgress?.(got, total);
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export function modelsReady() { return !!(det && rec); }

export async function loadModels(onProgress) {
  if (det && rec) return;
  const base = new URL("../models/", import.meta.url).href;
  const opt = { executionProviders: ["wasm"] };
  det = await ort.InferenceSession.create(await fetchBytes(base + "face_detection_yunet_2023mar.onnx"), opt);
  rec = await ort.InferenceSession.create(await fetchBytes(base + "face_recognition_sface_2021dec.onnx", onProgress), opt);
}

// ── 偵測 ──
function drawReplicated(ctx, image, x, y, w, h, pad) {
  // 中間放圖，四邊用 1px 邊緣拉伸補滿（等同 OpenCV BORDER_REPLICATE）
  const { src } = image, sw = image.width, sh = image.height;
  ctx.drawImage(src, x, y, w, h);
  if (pad <= 0) return;
  ctx.drawImage(src, 0, 0, 1, sh, x - pad, y, pad, h);
  ctx.drawImage(src, sw - 1, 0, 1, sh, x + w, y, pad, h);
  ctx.drawImage(src, 0, 0, sw, 1, x, y - pad, w, pad);
  ctx.drawImage(src, 0, sh - 1, sw, 1, x, y + h, w, pad);
  ctx.drawImage(src, 0, 0, 1, 1, x - pad, y - pad, pad, pad);
  ctx.drawImage(src, sw - 1, 0, 1, 1, x + w, y - pad, pad, pad);
  ctx.drawImage(src, 0, sh - 1, 1, 1, x - pad, y + h, pad, pad);
  ctx.drawImage(src, sw - 1, sh - 1, 1, 1, x + w, y + h, pad, pad);
}

function iou(a, b) {
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]), y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a[2] * a[3] + b[2] * b[3] - inter);
}

async function detectRows(image, padFrac) {
  const w = image.width, h = image.height;
  const pad = Math.round(Math.max(w, h) * padFrac);
  const fw = w + 2 * pad, fh = h + 2 * pad;
  const s = Math.min(1, DETECT_MAX / Math.max(fw, fh));
  const W = Math.max(1, Math.round(fw * s)), H = Math.max(1, Math.round(fh * s));
  const padW = (((W - 1) >> 5) + 1) * 32, padH = (((H - 1) >> 5) + 1) * 32;
  const cv = makeCanvas(padW, padH), ctx = ctxOf(cv);
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, padW, padH);
  const ps = Math.round(pad * s);
  drawReplicated(ctx, image, ps, ps, Math.max(1, W - 2 * ps), Math.max(1, H - 2 * ps), ps);
  const px = ctx.getImageData(0, 0, padW, padH).data;
  const n = padW * padH, blob = new Float32Array(3 * n);
  for (let i = 0, j = 0; i < n; i++, j += 4) { blob[i] = px[j + 2]; blob[n + i] = px[j + 1]; blob[2 * n + i] = px[j]; }
  const out = await det.run({ [det.inputNames[0]]: new ort.Tensor("float32", blob, [1, 3, padH, padW]) });

  const cand = [];
  STRIDES.forEach((stride, i) => {
    const cls = out[`cls_${stride}`].data, obj = out[`obj_${stride}`].data;
    const bbox = out[`bbox_${stride}`].data, kps = out[`kps_${stride}`].data;
    const cols = padW / stride, rows = padH / stride;
    for (let idx = 0; idx < rows * cols; idx++) {
      const score = Math.sqrt(Math.min(1, Math.max(0, cls[idx])) * Math.min(1, Math.max(0, obj[idx])));
      if (score < SCORE_THR) continue;
      const r = Math.floor(idx / cols), c = idx % cols;
      const cx = (c + bbox[idx * 4]) * stride, cy = (r + bbox[idx * 4 + 1]) * stride;
      const bw = Math.exp(bbox[idx * 4 + 2]) * stride, bh = Math.exp(bbox[idx * 4 + 3]) * stride;
      const row = [cx - bw / 2, cy - bh / 2, bw, bh];
      for (let k = 0; k < 5; k++) row.push((c + kps[idx * 10 + 2 * k]) * stride, (r + kps[idx * 10 + 2 * k + 1]) * stride);
      row.push(score);
      cand.push(row);
    }
  });
  cand.sort((a, b) => b[14] - a[14]);
  const keep = [];
  for (const row of cand) {
    if (keep.length >= TOP_K) break;
    if (keep.every(k => iou(k, row) <= NMS_THR)) keep.push(row);
  }
  for (const row of keep) {
    for (let k = 0; k < 14; k++) row[k] = row[k] / s - pad;
  }
  return keep;
}

export async function detectFaces(image, { withEmbedding = true } = {}) {
  let rows = await detectRows(image, 0);
  if (!rows.length) rows = await detectRows(image, 0.3);   // 臉塞滿畫面的特寫：補邊再試
  const faces = [];
  for (const r of rows) {
    const kps = [];
    for (let k = 0; k < 5; k++) kps.push([r[4 + 2 * k], r[5 + 2 * k]]);
    faces.push({
      box: r.slice(0, 4), kps, score: r[14], area: r[2] * r[3],
      emb: withEmbedding ? await embedFace(image, kps) : null,
    });
  }
  return faces.sort((a, b) => b.area - a.area);
}

// 圖中偏左的眼睛在前
export function eyesOf(face) {
  const [a, b] = face.kps;
  return a[0] <= b[0] ? [a, b] : [b, a];
}

// ── 辨識 ──
function similarityTransform(src, dst) {
  let sx = 0, sy = 0, dx = 0, dy = 0;
  for (let i = 0; i < 5; i++) { sx += src[i][0]; sy += src[i][1]; dx += dst[i][0]; dy += dst[i][1]; }
  sx /= 5; sy /= 5; dx /= 5; dy /= 5;
  let a = 0, b = 0, den = 0;
  for (let i = 0; i < 5; i++) {
    const x = src[i][0] - sx, y = src[i][1] - sy, u = dst[i][0] - dx, v = dst[i][1] - dy;
    a += x * u + y * v; b += x * v - y * u; den += x * x + y * y;
  }
  a /= den; b /= den;
  return { a, b, c: -b, d: a, e: dx - (a * sx - b * sy), f: dy - (b * sx + a * sy) };
}

export async function embedFace(image, kps) {
  const m = similarityTransform(kps, REF5);
  const cv = makeCanvas(112, 112), ctx = ctxOf(cv, "low");   // 純雙線性，貼近 OpenCV warpAffine
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
  ctx.drawImage(image.src, 0, 0, image.width, image.height);
  const px = ctx.getImageData(0, 0, 112, 112).data;
  const n = 112 * 112, blob = new Float32Array(3 * n);
  for (let i = 0, j = 0; i < n; i++, j += 4) { blob[i] = px[j]; blob[n + i] = px[j + 1]; blob[2 * n + i] = px[j + 2]; }
  const out = await rec.run({ [rec.inputNames[0]]: new ort.Tensor("float32", blob, [1, 3, 112, 112]) });
  const f = Float32Array.from(out[rec.outputNames[0]].data);
  let norm = 0;
  for (const v of f) norm += v * v;
  norm = Math.sqrt(norm) + 1e-9;
  for (let i = 0; i < f.length; i++) f[i] /= norm;
  return f;
}

export function similarity(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
