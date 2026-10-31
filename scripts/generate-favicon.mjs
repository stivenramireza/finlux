/**
 * Dev-time favicon generator — NO runtime/dev dependency (built-in modules only:
 * node:zlib, node:fs). Draws the Finlux brand mark (soft brand-tint rounded
 * square, brand-green border, bold green "F") procedurally into RGBA buffers at
 * 16/32/48 px, encodes each as PNG, and packs them into a real multi-size ICO
 * (PNG-compressed entries). Keeps the .ico byte-for-byte consistent with the
 * hand-written src/app/icon.svg, using brand green only (#16a34a).
 *
 * Run from the repo root:  node scripts/generate-favicon.mjs
 * Output:  frontend/src/app/favicon.ico
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Brand palette (light-scheme values from globals.css). Favicons are static, so
// we bake the light-scheme look; the SVG likewise uses the brand green.
const BRAND = [0x16, 0xa3, 0x4a]; // #16a34a — green-600, the only accent
const TINT = [0xea, 0xf6, 0xef]; // soft brand tint over white (matches icon.svg)

/** Alpha-over composite of `src` (with alpha a in 0..1) onto `dst` RGB. */
function over(dst, src, a) {
  return [
    Math.round(src[0] * a + dst[0] * (1 - a)),
    Math.round(src[1] * a + dst[1] * (1 - a)),
    Math.round(src[2] * a + dst[2] * (1 - a)),
  ];
}

/**
 * Render the icon at `size` px into an RGBA Buffer. Supersampled 4x for smooth,
 * anti-aliased edges that stay crisp at 16 px. Transparent outside the rounded
 * square so the mark sits cleanly on any tab background.
 */
function render(size) {
  const SS = 4;
  const S = size * SS;
  // Geometry proportional to a 32-unit viewBox (matches icon.svg).
  const u = S / 32;
  const margin = 1.5 * u;
  const radius = 8 * u;
  const stroke = 2.5 * u;
  const x0 = margin;
  const y0 = margin;
  const x1 = S - margin;
  const y1 = S - margin;

  // Rounded-rect signed-distance helper: distance from point to the rect's
  // rounded boundary (<0 inside, >0 outside).
  function roundRectSDF(px, py) {
    const rx0 = x0 + radius;
    const ry0 = y0 + radius;
    const rx1 = x1 - radius;
    const ry1 = y1 - radius;
    const cx = Math.min(Math.max(px, rx0), rx1);
    const cy = Math.min(Math.max(py, ry0), ry1);
    const inCore =
      px >= x0 && px <= x1 && py >= y0 && py <= y1 && (px >= rx0 || px <= rx1);
    if (px >= rx0 && px <= rx1) {
      // Vertical band: distance to top/bottom edges.
      return Math.max(y0 - py, py - y1);
    }
    if (py >= ry0 && py <= ry1) {
      // Horizontal band: distance to left/right edges.
      return Math.max(x0 - px, px - x1);
    }
    // Corner region: distance to the corner arc center.
    const dx = px - cx;
    const dy = py - cy;
    void inCore;
    return Math.hypot(dx, dy) - radius;
  }

  // "F" glyph path (same coordinates as icon.svg, scaled by u). Built from
  // three rectangles: the vertical stem, the top arm, and the middle arm.
  const stem = { x: 11.5, y: 8.5, w: 3.7, h: 16.6 };
  const top = { x: 11.5, y: 8.5, w: 10.0, h: 3.4 };
  const mid = { x: 11.5, y: 15.6, w: 5.6, h: 3.3 };
  function inRect(px, py, r) {
    const rx = r.x * u;
    const ry = r.y * u;
    return (
      px >= rx && px <= rx + r.w * u && py >= ry && py <= ry + r.h * u
    );
  }
  function inF(px, py) {
    return inRect(px, py, stem) || inRect(px, py, top) || inRect(px, py, mid);
  }

  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let aAcc = 0;
      // Supersample.
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x * SS + sx + 0.5;
          const py = y * SS + sy + 0.5;
          const d = roundRectSDF(px, py);
          let col = null;
          let a = 0;
          if (d <= 0) {
            // Inside the rounded square: tint fill or border ring.
            const borderBand = d > -stroke; // within `stroke` of the edge
            if (inF(px, py)) {
              col = BRAND;
              a = 1;
            } else if (borderBand) {
              col = BRAND;
              a = 1;
            } else {
              col = TINT;
              a = 1;
            }
          }
          if (a > 0) {
            r += col[0];
            g += col[1];
            b += col[2];
            aAcc += 1;
          }
        }
      }
      const samples = SS * SS;
      const coverage = aAcc / samples;
      const idx = (y * size + x) * 4;
      if (coverage === 0) {
        rgba[idx] = 0;
        rgba[idx + 1] = 0;
        rgba[idx + 2] = 0;
        rgba[idx + 3] = 0;
      } else {
        rgba[idx] = Math.round(r / aAcc);
        rgba[idx + 1] = Math.round(g / aAcc);
        rgba[idx + 2] = Math.round(b / aAcc);
        rgba[idx + 3] = Math.round(coverage * 255);
      }
    }
  }
  return rgba;
}

/** CRC32 (PNG). */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Encode an RGBA buffer as a PNG (filter type 0 per row). */
function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // no filter
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Pack PNG entries into a multi-size ICO container. */
function buildICO(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);
  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  const dataBufs = [];
  entries.forEach((e, i) => {
    const d = i * 16;
    dir[d] = e.size >= 256 ? 0 : e.size; // width (0 means 256)
    dir[d + 1] = e.size >= 256 ? 0 : e.size; // height
    dir[d + 2] = 0; // palette
    dir[d + 3] = 0; // reserved
    dir.writeUInt16LE(1, d + 4); // color planes
    dir.writeUInt16LE(32, d + 6); // bits per pixel
    dir.writeUInt32LE(e.png.length, d + 8); // size of data
    dir.writeUInt32LE(offset, d + 12); // offset
    offset += e.png.length;
    dataBufs.push(e.png);
  });
  return Buffer.concat([header, dir, ...dataBufs]);
}

const sizes = [16, 32, 48];
const entries = sizes.map((size) => ({ size, png: encodePNG(size, render(size)) }));
const ico = buildICO(entries);

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'frontend', 'src', 'app', 'favicon.ico');
writeFileSync(out, ico);
console.log(
  `Wrote ${out} (${ico.length} bytes, sizes: ${sizes.join('/')} px, PNG-compressed ICO).`,
);
