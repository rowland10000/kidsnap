// 影片輸出：MP4 走 WebCodecs（H.264）+ mp4-muxer；GIF 走 gifenc。都在瀏覽器內完成。
import { Muxer, ArrayBufferTarget } from "../vendor/mp4-muxer.mjs";
import { GIFEncoder, quantize, applyPalette } from "../vendor/gifenc.esm.js";
import { makeCanvas, ctxOf } from "./image.js";

export function mp4Supported() {
  return typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
}

async function pickCodec(width, height, fps, bitrate) {
  for (const codec of ["avc1.64002a", "avc1.4d002a", "avc1.42002a", "avc1.640028", "avc1.42001f"]) {
    const cfg = { codec, width, height, framerate: fps, bitrate, avc: { format: "avc" } };
    try {
      const r = await VideoEncoder.isConfigSupported(cfg);
      if (r.supported) return cfg;
    } catch (e) { /* 試下一個 */ }
  }
  return null;
}

/**
 * frames(): async generator 逐張回傳 canvas（同尺寸）
 */
export async function encodeMp4(frames, count, width, height, fps, onProgress) {
  const bitrate = Math.round(width * height * fps * 0.12);
  const cfg = await pickCodec(width, height, fps, Math.min(bitrate, 20_000_000));
  if (!cfg) throw new Error("這個瀏覽器不支援 H.264 編碼，請改輸出 GIF");
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width, height, frameRate: fps },
    fastStart: "in-memory",
  });
  let failure = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => { failure = e; },
  });
  encoder.configure(cfg);
  let i = 0;
  const us = 1e6 / fps;
  for await (const cv of frames) {
    if (failure) throw failure;
    const frame = new VideoFrame(cv, { timestamp: Math.round(i * us), duration: Math.round(us) });
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    i++;
    onProgress?.(i, count);
    if (encoder.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 0));
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: "video/mp4" });
}

export const GIF_MAX = 720;

export async function encodeGif(frames, count, width, height, fps, onProgress) {
  const s = Math.min(1, GIF_MAX / Math.max(width, height));
  const w = Math.round(width * s), h = Math.round(height * s);
  const gif = new GIFEncoder();
  const cv = makeCanvas(w, h), ctx = ctxOf(cv);
  let i = 0;
  const delay = Math.round(1000 / fps);
  for await (const src of frames) {
    ctx.drawImage(src, 0, 0, w, h);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const palette = quantize(rgba, 256);
    const index = applyPalette(rgba, palette);
    gif.writeFrame(index, w, h, { palette, delay, repeat: 0 });
    i++;
    onProgress?.(i, count);
    await new Promise(r => setTimeout(r, 0));
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: "image/gif" });
}
