const cache = new Map();

const FALLBACK = [
  [250, 36, 60],
  [88, 86, 214],
  [20, 20, 24],
];

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
}

/**
 * Pull a small ambient palette out of album art.
 *
 * Colours are bucketed into a coarse 5-bit-per-channel grid, then scored on
 * population *and* vividness — a large muddy background shouldn't beat the one
 * saturated accent that actually defines the cover. Near-black and near-white
 * are discarded because they produce grey, lifeless glows.
 */
export function extractPalette(src) {
  if (!src) return Promise.resolve(FALLBACK);
  if (cache.has(src)) return Promise.resolve(cache.get(src));

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';

    img.onerror = () => resolve(FALLBACK);
    img.onload = () => {
      try {
        const size = 40;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        const buckets = new Map();
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 125) continue;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const [h, s, l] = rgbToHsl(r, g, b);
          if (l < 0.12 || l > 0.94) continue;

          const key = `${r >> 3}-${g >> 3}-${b >> 3}`;
          const entry = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0, h, s, l };
          entry.r += r;
          entry.g += g;
          entry.b += b;
          entry.n += 1;
          buckets.set(key, entry);
        }

        if (!buckets.size) {
          cache.set(src, FALLBACK);
          return resolve(FALLBACK);
        }

        const scored = [...buckets.values()]
          .map((e) => {
            const avg = [Math.round(e.r / e.n), Math.round(e.g / e.n), Math.round(e.b / e.n)];
            const [h, s, l] = rgbToHsl(...avg);
            // Favour mid-lightness, saturated colours that also cover real area.
            const vividness = s * (1 - Math.abs(l - 0.55) * 1.15);
            return { rgb: avg, h, score: e.n * (0.35 + Math.max(0, vividness) * 2.2) };
          })
          .sort((a, b) => b.score - a.score);

        // Spread the picks around the hue wheel so the gradient has contrast
        // instead of three shades of the same colour.
        const chosen = [];
        for (const candidate of scored) {
          const tooClose = chosen.some((c) => {
            const delta = Math.abs(c.h - candidate.h);
            return Math.min(delta, 360 - delta) < 28;
          });
          if (!tooClose) chosen.push(candidate);
          if (chosen.length === 3) break;
        }
        while (chosen.length < 3) chosen.push(scored[chosen.length % scored.length]);

        const palette = chosen.map((c) => c.rgb);
        cache.set(src, palette);
        resolve(palette);
      } catch {
        // Tainted canvas or an odd image format — not worth failing the UI over.
        resolve(FALLBACK);
      }
    };

    img.src = src;
  });
}

/** Write a palette into the CSS custom properties the whole UI reads from. */
export function applyPalette(palette = FALLBACK, target = document.documentElement) {
  palette.slice(0, 3).forEach(([r, g, b], i) => {
    target.style.setProperty(`--art-${i + 1}`, `${r} ${g} ${b}`);
  });
}

export { FALLBACK as fallbackPalette };
