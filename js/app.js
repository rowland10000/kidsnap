import { loadModels, detectFaces, modelsReady } from "./engine.js";
import { loadImage, makeCanvas, ctxOf } from "./image.js";
import { processBatch, renderFrame, SIZES, MAX_PHOTOS } from "./pipeline.js";
import { fmtDate } from "./exif.js";
import { encodeMp4, encodeGif, mp4Supported } from "./video.js";
import { makeStyler, loadFonts, loadCjkFont, needsCjkFont, cjkFontReady } from "./styles.js";

const $ = s => document.querySelector(s);
const REF_KEY = "kidsnap.reference";

const state = {
  reference: null,        // { emb: Float32Array, thumb: dataURL }
  size: "1:1",
  files: [],
  records: [],            // 對齊成功，使用者排好的順序
  skipped: [],
  fps: 12,
  fmt: "mp4",
  style: "無",
  seed: 1,
  num: "today",
  birthday: "",
  headline: "",
  latin: "草寫",
  cjk: "粗黑體",
  resultUrl: null,
  resultBlob: null,
};

// ── 共用 ──
function setStatus(el, msg, err = false) {
  el.textContent = msg || "";
  el.classList.toggle("err", !!err);
}
function progress(el, done, total, label) {
  el.hidden = false;
  el.querySelector(".bar").style.width = `${Math.round((100 * done) / Math.max(1, total))}%`;
  el.querySelector(".ptext").textContent = `${label} ${done}/${total}`;
}
function hideProgress(el) { el.hidden = true; }

document.querySelectorAll("nav.tabs .chip").forEach(btn => btn.addEventListener("click", () => showTab(btn.dataset.tab)));
function showTab(name) {
  document.querySelectorAll("nav.tabs .chip").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.dataset.panel === name));
  if (name === "order") renderOrder();
  if (name === "export") renderStylePreview();
}
function chipGroup(sel, attr, onPick) {
  const group = $(sel);
  group.addEventListener("click", e => {
    const b = e.target.closest(".chip");
    if (!b) return;
    group.querySelectorAll(".chip").forEach(x => x.classList.toggle("active", x === b));
    onPick(b.dataset[attr]);
  });
}

// ── 模型 ──
const modelStatus = $("#model-status");
(async () => {
  try {
    await loadModels((got, total) => {
      modelStatus.textContent = `模型載入中 ${(got / 1e6).toFixed(0)}／${(total / 1e6).toFixed(0)} MB（只有第一次要等）`;
    });
    modelStatus.textContent = "模型就緒，照片都在這台裝置處理。";
  } catch (e) {
    modelStatus.textContent = `模型載入失敗：${e.message}`;
    modelStatus.classList.add("err");
  }
})();
async function ensureModels() {
  if (modelsReady()) return true;
  await new Promise(r => setTimeout(r, 300));
  return modelsReady() || ensureModels();
}

// ── ① 選主角 ──
function loadReference() {
  try {
    const raw = localStorage.getItem(REF_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    if (Array.isArray(o.emb) && o.emb.length === 128) state.reference = { emb: Float32Array.from(o.emb), thumb: o.thumb || "" };
  } catch (e) { /* 壞掉就當沒有 */ }
}
function saveReference() {
  try {
    if (!state.reference) localStorage.removeItem(REF_KEY);
    else localStorage.setItem(REF_KEY, JSON.stringify({ emb: Array.from(state.reference.emb), thumb: state.reference.thumb }));
  } catch (e) { /* 隱私模式可能不能存，照常可用 */ }
}
function renderReference() {
  const img = $("#ref-thumb"), st = $("#ref-status");
  if (state.reference) {
    img.src = state.reference.thumb; img.hidden = false;
    setStatus(st, "已設定。接下來到「② 丟照片」。");
  } else {
    img.hidden = true;
    setStatus(st, "尚未設定目標人物，先選一張主角臉部清楚的照片。", true);
  }
}
function faceCrop(image, face, side = 192) {
  const [x, y, w, h] = face.box;
  const m = Math.max(w, h) * 0.25;
  const cx = x + w / 2, cy = y + h / 2, r = Math.max(w, h) / 2 + m;
  const cv = makeCanvas(side, side), ctx = ctxOf(cv);
  ctx.fillStyle = "#F4EDE2"; ctx.fillRect(0, 0, side, side);
  ctx.drawImage(image.src, cx - r, cy - r, 2 * r, 2 * r, 0, 0, side, side);
  return cv.toDataURL("image/jpeg", 0.85);
}
function setReference(image, face) {
  state.reference = { emb: face.emb, thumb: faceCrop(image, face) };
  saveReference(); renderReference();
  $("#ref-pick").hidden = true;
}
$("#ref-file").addEventListener("change", async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const st = $("#ref-status");
  setStatus(st, "偵測中…");
  await ensureModels();
  const image = await loadImage(file);
  if (!image) return setStatus(st, "無法讀取這張圖片。", true);
  const faces = await detectFaces(image);
  if (!faces.length) { image.release(); return setStatus(st, "這張照片偵測不到臉，換一張正面、清楚的。", true); }
  if (faces.length === 1) { setReference(image, faces[0]); image.release(); return; }
  // 多張臉：畫出來讓使用者點
  const cv = $("#ref-canvas"), maxW = 900, s = Math.min(1, maxW / image.width);
  cv.width = Math.round(image.width * s); cv.height = Math.round(image.height * s);
  const ctx = ctxOf(cv);
  ctx.drawImage(image.src, 0, 0, cv.width, cv.height);
  ctx.lineWidth = 4; ctx.strokeStyle = "#E8501E"; ctx.font = "bold 22px sans-serif"; ctx.fillStyle = "#E8501E";
  faces.forEach((f, i) => {
    const [x, y, w, h] = f.box.map(v => v * s);
    ctx.strokeRect(x, y, w, h); ctx.fillText(String(i + 1), x + 6, y + 26);
  });
  $("#ref-pick").hidden = false;
  setStatus(st, `偵測到 ${faces.length} 張臉，點一下主角。`);
  cv.onclick = ev => {
    const r = cv.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * image.width, py = ((ev.clientY - r.top) / r.height) * image.height;
    const hit = faces.find(f => px >= f.box[0] && px <= f.box[0] + f.box[2] && py >= f.box[1] && py <= f.box[1] + f.box[3]);
    if (hit) { setReference(image, hit); image.release(); cv.onclick = null; }
  };
});
$("#ref-clear").addEventListener("click", () => { state.reference = null; saveReference(); renderReference(); });
loadReference(); renderReference();

// ── ② 丟照片 ──
chipGroup("#size-chips", "size", v => { state.size = v; });
const drop = $("#drop"), batchFiles = $("#batch-files"), batchCount = $("#batch-count"), runBtn = $("#batch-run");
function takeFiles(list) {
  state.files = Array.from(list).filter(f => f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
  if (!state.files.length) { setStatus(batchCount, "沒有可用的圖片檔。", true); runBtn.disabled = true; return; }
  if (state.files.length > MAX_PHOTOS) { setStatus(batchCount, `一次最多 ${MAX_PHOTOS} 張，這次選了 ${state.files.length} 張。`, true); runBtn.disabled = true; return; }
  setStatus(batchCount, `已選 ${state.files.length} 張。`);
  runBtn.disabled = false;
}
batchFiles.addEventListener("change", e => takeFiles(e.target.files));
["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => takeFiles(e.dataTransfer.files));

function tile(rec, { skip = false, index = null } = {}) {
  const d = document.createElement("div");
  d.className = "tile" + (skip ? " skip" : "");
  const img = new Image(); img.src = rec.thumb || ""; img.alt = rec.name;
  d.appendChild(img);
  const cap = document.createElement("div"); cap.className = "cap";
  cap.innerHTML = `<span class="n">${index !== null ? index + 1 : ""}</span><span>${fmtDate(rec.date) || "無日期"}</span>`;
  d.appendChild(cap);
  if (skip) { const w = document.createElement("div"); w.className = "why"; w.textContent = rec.error; d.appendChild(w); }
  return d;
}
runBtn.addEventListener("click", async () => {
  const st = $("#batch-status"), prog = $("#batch-progress"), grid = $("#batch-grid");
  if (!state.reference) { setStatus(st, "還沒設定目標人物，先到「① 選主角」。", true); return; }
  runBtn.disabled = true; grid.innerHTML = ""; setStatus(st, "");
  await ensureModels();
  try {
    const res = await processBatch(state.files, state.reference.emb, SIZES[state.size], (d, t, l) => progress(prog, d, t, l));
    state.records = res.ok; state.skipped = res.skipped;
    const msg = `完成 ${res.ok.length} 張  ·  略過 ${res.skipped.length} 張`;
    setStatus(st, res.ok.length ? msg : msg + "\n沒有一張認出目標人物，確認「① 選主角」用的是同一個人。", !res.ok.length);
    res.ok.forEach((r, i) => grid.appendChild(tile(r, { index: i })));
    res.skipped.forEach(r => grid.appendChild(tile(r, { skip: true })));
    clearResult();
  } catch (e) {
    setStatus(st, `處理失敗：${e.message}`, true);
  } finally {
    hideProgress(prog); runBtn.disabled = false;
  }
});

// ── ③ 排順序 ──
function renderOrder() {
  const grid = $("#order-grid"), st = $("#order-status");
  grid.innerHTML = "";
  if (!state.records.length) { setStatus(st, "還沒有對齊好的照片，先到「② 丟照片」。", true); return; }
  setStatus(st, `${state.records.length} 張，順序就是影片播放順序。`);
  state.records.forEach((rec, i) => {
    const d = tile(rec, { index: i });
    d.draggable = true; d.dataset.i = i;
    const tools = document.createElement("div"); tools.className = "tools";
    tools.innerHTML = `<button data-act="left">◀</button><button data-act="right">▶</button><button data-act="del" class="del">✕</button>`;
    tools.addEventListener("click", e => {
      const act = e.target.dataset.act; if (!act) return;
      const arr = state.records;
      if (act === "del") arr.splice(i, 1);
      else if (act === "left" && i > 0) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      else if (act === "right" && i < arr.length - 1) [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
      clearResult(); renderOrder();
    });
    d.appendChild(tools);
    d.addEventListener("dragstart", e => { e.dataTransfer.setData("text/plain", String(i)); d.classList.add("dragging"); });
    d.addEventListener("dragend", () => d.classList.remove("dragging"));
    d.addEventListener("dragover", e => { e.preventDefault(); d.classList.add("over"); });
    d.addEventListener("dragleave", () => d.classList.remove("over"));
    d.addEventListener("drop", e => {
      e.preventDefault(); d.classList.remove("over");
      const from = Number(e.dataTransfer.getData("text/plain"));
      if (Number.isNaN(from) || from === i) return;
      const [m] = state.records.splice(from, 1);
      state.records.splice(i, 0, m);
      clearResult(); renderOrder();
    });
    grid.appendChild(d);
  });
}
$("#order-reset").addEventListener("click", () => {
  state.records.sort((p, q) => {
    if (!!p.date !== !!q.date) return p.date ? -1 : 1;
    return (p.date && q.date) ? p.date - q.date : 0;
  });
  clearResult(); renderOrder();
});

// ── ④ 輸出 ──
chipGroup("#speed-chips", "fps", v => { state.fps = Number(v); });
chipGroup("#fmt-chips", "fmt", v => { state.fmt = v; });
function clearResult() {
  if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
  state.resultUrl = null; state.resultBlob = null;
  $("#export-result").hidden = true;
}
function resolveStamp() {
  if (state.num === "today") {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  if (state.num === "birthday") {
    let parts = (state.birthday || "").match(/\d+/g) || [];
    if (parts.length === 1 && parts[0].length === 8) parts = [parts[0].slice(0, 4), parts[0].slice(4, 6), parts[0].slice(6)];
    if (parts.length < 3) return "";
    const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    if (isNaN(d) || d.getMonth() !== +parts[1] - 1) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return "";
}
function resolveHeadline() {
  return (state.headline || "").trim() || (state.num === "birthday" ? "Happy Birthday" : "");
}
async function currentStyler() {
  if (state.style === "無") return null;
  await loadFonts();
  const headline = resolveHeadline();
  if (needsCjkFont(headline)) {
    if (!cjkFontReady(state.cjk)) setStatus($("#style-status"), `第一次用「${state.cjk}」，下載中文字型中（約 5–7 MB）…`);
    await loadCjkFont(state.cjk);
  }
  const [W, H] = SIZES[state.size];
  return makeStyler({ style: state.style, seed: state.seed, W, H, stamp: resolveStamp(), headline, cjk: state.cjk, latin: state.latin });
}
let previewToken = 0;
async function renderStylePreview() {
  const img = $("#style-preview"), st = $("#style-status");
  if (!state.records.length) { img.hidden = true; setStatus(st, "還沒有對齊好的照片，先到「② 丟照片」。", true); return; }
  const token = ++previewToken;
  setStatus(st, "預覽產生中…");
  try {
    const styler = await currentStyler();
    let cv = await renderFrame(state.records[0]);
    if (styler) cv = await styler.apply(cv);
    if (token !== previewToken) return;
    const s = Math.min(1, 720 / Math.max(cv.width, cv.height));
    const small = makeCanvas(Math.round(cv.width * s), Math.round(cv.height * s));
    ctxOf(small).drawImage(cv, 0, 0, small.width, small.height);
    img.src = small.toDataURL("image/jpeg", 0.85); img.hidden = false;
    let msg = `第 1 張的效果。`;
    if (styler) msg += `　風格：${styler.name}`;
    if (state.num === "birthday" && !resolveStamp()) { setStatus(st, msg + "\n生日請填成 2019-03-14 這樣的格式", true); return; }
    setStatus(st, msg);
  } catch (e) {
    setStatus(st, `預覽失敗：${e.message}`, true);
  }
}
chipGroup("#style-chips", "style", v => { state.style = v; state.seed = 1 + Math.floor(Math.random() * 999999); clearResult(); renderStylePreview(); });
chipGroup("#num-chips", "num", v => { state.num = v; $("#birthday-row").hidden = v !== "birthday"; clearResult(); renderStylePreview(); });
chipGroup("#latin-chips", "latin", v => { state.latin = v; clearResult(); renderStylePreview(); });
chipGroup("#cjk-chips", "cjk", v => { state.cjk = v; clearResult(); renderStylePreview(); });
$("#style-reroll").addEventListener("click", () => { state.seed = 1 + Math.floor(Math.random() * 999999); clearResult(); renderStylePreview(); });
let typingTimer = null;
for (const [id, key] of [["#birthday", "birthday"], ["#headline", "headline"]]) {
  $(id).addEventListener("input", e => {
    state[key] = e.target.value; clearResult();
    clearTimeout(typingTimer); typingTimer = setTimeout(renderStylePreview, 500);
  });
}

async function* frameSource(records, styler) {
  for (const rec of records) {
    const cv = await renderFrame(rec);
    yield styler ? await styler.apply(cv) : cv;
  }
}
$("#export-run").addEventListener("click", async () => {
  const st = $("#export-status"), prog = $("#export-progress"), btn = $("#export-run");
  if (!state.records.length) { setStatus(st, "還沒有對齊好的照片，先到「② 丟照片」。", true); return; }
  const [w, h] = SIZES[state.size];
  const useMp4 = state.fmt === "mp4";
  if (useMp4 && !mp4Supported()) { setStatus(st, "這個瀏覽器不支援在本機編 MP4，請改選 GIF，或改用 Safari 16.4／Chrome 94 以上。", true); return; }
  btn.disabled = true; clearResult(); setStatus(st, "");
  try {
    const styler = await currentStyler();
    const n = state.records.length, src = frameSource(state.records, styler);
    const label = useMp4 ? "編碼 MP4" : "編碼 GIF";
    const blob = useMp4
      ? await encodeMp4(src, n, w, h, state.fps, (d, t) => progress(prog, d, t, label))
      : await encodeGif(src, n, w, h, state.fps, (d, t) => progress(prog, d, t, label));
    state.resultBlob = blob; state.resultUrl = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `KidSnap_${stamp}.${useMp4 ? "mp4" : "gif"}`;
    const v = $("#export-video"), g = $("#export-gif");
    v.hidden = !useMp4; g.hidden = useMp4;
    if (useMp4) v.src = state.resultUrl; else g.src = state.resultUrl;
    const a = $("#export-download"); a.href = state.resultUrl; a.download = name;
    const file = new File([blob], name, { type: blob.type });
    const share = $("#export-share");
    share.hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
    share.onclick = () => navigator.share({ files: [file], title: "KidSnap" }).catch(() => {});
    $("#export-result").hidden = false;
    setStatus(st, `完成：${n} 張、每秒 ${state.fps} 張，約 ${(n / state.fps).toFixed(1)} 秒，檔案 ${(blob.size / 1e6).toFixed(1)} MB。`);
  } catch (e) {
    setStatus(st, `輸出失敗：${e.message}`, true);
  } finally {
    hideProgress(prog); btn.disabled = false;
  }
});
