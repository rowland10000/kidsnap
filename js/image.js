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

// 2×2 的 HEIC（sips 產生，506 bytes）；解得開才代表這個瀏覽器讀得到 iPhone 的 HEIC
const HEIC_PROBE = "data:image/heic;base64,AAAAJGZ0eXBoZWljAAAAAG1pZjFNaVBybWlhZk1pSEJoZWljAAABh21ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAADnBpdG0AAAAAAAEAAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABodmMxAAAAAOdpcHJwAAAAxmlwY28AAAATY29scm5jbHgAAgACAAaAAAAADGNsbGkAywBAAAAAFGlzcGUAAAAAAAAAAgAAAAIAAAAJaXJvdAAAAAAQcGl4aQAAAAADCAgIAAAAcmh2Y0MBA3AAAACwAAAAAAAe8AD8/fj4AAALA6AAAQAXQAEMAf//A3AAAAMAsAAAAwAAAwAecCShAAEAJEIBAQNwAAADALAAAAMAAAMAHqAUIEHAoQQYh7kWVTcCAgYAgKIAAQAJRAHAYXLIRFNkAAAAGWlwbWEAAAAAAAAAAQABBoECAwWGhAAAAB5pbG9jAAAAAEQAAAEAAQAAAAEAAAG7AAAAPwAAAAFtZGF0AAAAAAAAAE8AAAA7KAGvovpGgXz//drP//bl+y/QCj1X/7QnyPm7sv+mUPdMsmf6IPnCOd4c8OZz7/blQi9hX4K3CEmyK4A=";
let heicPromise = null;
export function heicSupported() {
  if (!heicPromise) heicPromise = loadImage(HEIC_PROBE).then(im => { if (im) im.release(); return !!im; });
  return heicPromise;
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
