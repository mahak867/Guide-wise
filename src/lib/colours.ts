// Dominant colours by coarse quantisation (4 bits per channel), averaged within each bucket, then nearby buckets merged.
// Pure function on RGBA pixels: the browser passes canvas pixels, the image evaluation passes decoded PNGs.
const hex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();

export function dominantFromPixels(data: Uint8ClampedArray | Uint8Array): { hex: string; share: number }[] {
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = bins.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    bins.set(k, e);
    total++;
  }
  const list = [...bins.values()].map((e) => ({ n: e.n, r: e.r / e.n, g: e.g / e.n, b: e.b / e.n })).sort((a, b) => b.n - a.n);
  const merged: typeof list = [];
  for (const e of list) {
    const m = merged.find((x) => Math.hypot(x.r - e.r, x.g - e.g, x.b - e.b) < 28);
    if (m) {
      const n = m.n + e.n;
      m.r = (m.r * m.n + e.r * e.n) / n; m.g = (m.g * m.n + e.g * e.n) / n; m.b = (m.b * m.n + e.b * e.n) / n; m.n = n;
    } else merged.push({ ...e });
  }
  return merged
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
    .map((e) => ({ hex: hex(e.r, e.g, e.b), share: Math.round((e.n / Math.max(1, total)) * 1000) / 1000 }))
    .filter((e) => e.share >= 0.02);
}
