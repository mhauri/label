// Canvas -> 1-bit bitmap (black = 1), via threshold or Floyd–Steinberg dithering.
/** Convert a canvas into packed 1-bit rows (black = 1) using threshold or dithering. */
export function canvasToBitmap(canvas, { threshold = 128, dither = false } = {}) {
  const { width, height } = canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, width, height).data;
  // luminance with alpha over white
  const lum = new Float32Array(width * height);
  for (let i = 0; i < lum.length; i++) {
    const a = img[i * 4 + 3] / 255;
    const l = 0.299 * img[i * 4] + 0.587 * img[i * 4 + 1] + 0.114 * img[i * 4 + 2];
    lum[i] = l * a + 255 * (1 - a);
  }
  const bits = new Uint8Array(width * height);
  if (dither) {
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const old = lum[i];
        const nw = old < threshold ? 0 : 255;
        bits[i] = nw === 0 ? 1 : 0;
        const err = old - nw;
        if (x + 1 < width) lum[i + 1] += (err * 7) / 16;
        if (y + 1 < height) {
          if (x > 0) lum[i + width - 1] += (err * 3) / 16;
          lum[i + width] += (err * 5) / 16;
          if (x + 1 < width) lum[i + width + 1] += err / 16;
        }
      }
  } else {
    for (let i = 0; i < lum.length; i++) bits[i] = lum[i] < threshold ? 1 : 0;
  }
  const bpr = Math.ceil(width / 8);
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = new Uint8Array(bpr);
    for (let x = 0; x < width; x++) if (bits[y * width + x]) row[x >> 3] |= 0x80 >> (x & 7);
    rows.push(row);
  }
  return { width, height, rows, bits };
}
