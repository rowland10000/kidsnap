import exifr from "../vendor/exifr.lite.esm.mjs";

// EXIF 拍攝日期；沒有（例如 LINE 傳過的照片）回傳 null
export async function shotDate(file) {
  try {
    const ex = await exifr.parse(file);
    const d = ex?.DateTimeOriginal || ex?.CreateDate;
    if (d instanceof Date && !isNaN(d)) return d;
    if (typeof d === "string") {
      const m = d.match(/^(\d{4}):(\d{2}):(\d{2})/);
      if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    }
  } catch (e) { /* 沒有 EXIF 或讀不到 */ }
  return null;
}

export function fmtDate(d) {
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
