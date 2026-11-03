// 圖片載入：交給瀏覽器解碼（會自動套 EXIF 方向；Safari 也能直接讀 HEIC）
export async function loadImage(source) {
  const isBlob = source instanceof Blob;
  const url = isBlob ? URL.createObjectURL(source) : source;
  const img = new Image();
  const ok = await new Promise(resolve => {
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
  if (!ok) {
    if (isBlob) URL.revokeObjectURL(url);
    return null;
  }
  return {
    src: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    release() { if (isBlob) URL.revokeObjectURL(url); img.src = ""; },
  };
}

export function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

export function ctxOf(canvas, quality = "high") {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = quality;
  return ctx;
}
