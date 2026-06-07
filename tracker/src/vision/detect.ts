// Plane detection against sky: the aircraft is a small high-contrast blob on
// a smooth background (blue sky / haze / cloud). Strategy: downscale to luma,
// estimate the local background with a coarse block grid, threshold the
// residual adaptively, extract connected components, and pick the most
// plane-like blob nearest the expected position (we always roughly know where
// the plane should be — ADS-B got us here).
//
// Pure core (findBlob) operates on raw luma for testability; the sharp
// wrapper decodes JPEG frames from the video stream.

import sharp from "sharp";

export interface Detection {
  /** Blob centroid in frame fractions (0..1, x right, y down). */
  cx: number;
  cy: number;
  /** Blob size in detector pixels (after downscale). */
  areaPx: number;
  /** Peak |residual| in sigma units — confidence proxy. */
  contrastSigma: number;
  /** Bounding box in frame fractions. */
  box: { x: number; y: number; w: number; h: number };
  /** Detector ranking score (contrast × compactness ÷ distance). */
  score: number;
}

/** A sub-rectangle of the frame, in frame fractions. */
export interface RoiFrac {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DetectOptions {
  /** Expected position in frame fractions (defaults to center). */
  expectedX?: number;
  expectedY?: number;
  /** Minimum residual threshold in sigma units. */
  minSigma?: number;
  /** Blob area limits in detector pixels. */
  minArea?: number;
  maxArea?: number;
  /** Hard reject blobs farther than this from the expected position. */
  maxDistFrac?: number;
  /**
   * Apply the sky mask (default true). Disable when zoomed in: the frame is
   * sky by construction and a large plane would mask itself.
   */
  useMask?: boolean;
}

const W = 480;
const H = 270;
/** Background grid block size (detector pixels). */
const BLOCK = 24;
/** Sky-mask energy blur radius (detector pixels). A plane-sized speck
 *  dilutes to nothing over this window; trees/buildings/wires stay hot. */
const ENERGY_R = 12;
/** Floor for the adaptive "not sky" energy threshold. */
const ENERGY_T_MIN = 4;

/**
 * Sky segmentation: per-pixel gradient energy, box-blurred over a large
 * window (integral image). Large textured regions (trees, roofs, wires,
 * cloud edges in aggregate) exceed the threshold and are masked out
 * WHOLESALE; an isolated plane-sized speck survives because its energy
 * spreads thin. Returns 1 = sky, 0 = clutter.
 */
export function skyMask(luma: Uint8Array, width: number, height: number): Uint8Array {
  // Gradient magnitude (cheap |dx| + |dy|).
  const g = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      g[i] =
        Math.abs(luma[i + 1] - luma[i - 1]) +
        Math.abs(luma[i + width] - luma[i - width]);
    }
  }
  // Integral image for an O(1) box mean.
  const ii = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += g[y * width + x];
      ii[(y + 1) * (width + 1) + (x + 1)] = ii[y * (width + 1) + (x + 1)] + row;
    }
  }
  // Blurred energy per pixel, then an ADAPTIVE threshold: the sky's own
  // noise floor (25th percentile) scaled up — JPEG/sensor noise varies.
  const energy = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - ENERGY_R);
    const y1 = Math.min(height, y + ENERGY_R + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - ENERGY_R);
      const x1 = Math.min(width, x + ENERGY_R + 1);
      const sum =
        ii[y1 * (width + 1) + x1] -
        ii[y0 * (width + 1) + x1] -
        ii[y1 * (width + 1) + x0] +
        ii[y0 * (width + 1) + x0];
      energy[y * width + x] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  const sample: number[] = [];
  for (let i = 0; i < width * height; i += 7) sample.push(energy[i]);
  sample.sort((a, b) => a - b);
  const p25 = sample[Math.floor(sample.length * 0.25)] ?? 0;
  const thresh = Math.max(ENERGY_T_MIN, p25 * 2.5 + 3);

  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    mask[i] = energy[i] < thresh ? 1 : 0;
  }
  return mask;
}

export function findBlob(
  luma: Uint8Array,
  width: number,
  height: number,
  opts: DetectOptions = {},
): Detection | null {
  return findBlobs(luma, width, height, opts)[0] ?? null;
}

/** All plane-like blobs, best-scored first (capped at `limit`). */
export function findBlobs(
  luma: Uint8Array,
  width: number,
  height: number,
  opts: DetectOptions = {},
  limit = 8,
): Detection[] {
  const exX = opts.expectedX ?? 0.5;
  const exY = opts.expectedY ?? 0.5;
  const minSigma = opts.minSigma ?? 3.5;
  const minArea = opts.minArea ?? 1;
  const maxArea = opts.maxArea ?? 600;
  const maxDistFrac = opts.maxDistFrac ?? 0.35;

  // Sky-only search: everything textured (trees, wires, roofs) is excluded
  // before any blob logic runs.
  const mask =
    (opts.useMask ?? true) ? skyMask(luma, width, height) : null;

  // --- coarse background: block means, bilinearly interpolated ---
  const gw = Math.ceil(width / BLOCK);
  const gh = Math.ceil(height / BLOCK);
  const grid = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let sum = 0;
      let n = 0;
      const y1 = Math.min(height, (gy + 1) * BLOCK);
      const x1 = Math.min(width, (gx + 1) * BLOCK);
      for (let y = gy * BLOCK; y < y1; y++) {
        for (let x = gx * BLOCK; x < x1; x++) {
          sum += luma[y * width + x];
          n++;
        }
      }
      grid[gy * gw + gx] = sum / n;
    }
  }
  const bgAt = (x: number, y: number): number => {
    const fx = Math.min(gw - 1.001, Math.max(0, x / BLOCK - 0.5));
    const fy = Math.min(gh - 1.001, Math.max(0, y / BLOCK - 0.5));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const ax = fx - x0;
    const ay = fy - y0;
    const g = (xx: number, yy: number) => grid[Math.min(gh - 1, yy) * gw + Math.min(gw - 1, xx)];
    return (
      g(x0, y0) * (1 - ax) * (1 - ay) +
      g(x0 + 1, y0) * ax * (1 - ay) +
      g(x0, y0 + 1) * (1 - ax) * ay +
      g(x0 + 1, y0 + 1) * ax * ay
    );
  };

  // --- residual + robust sigma ---
  const resid = new Float32Array(width * height);
  let sumAbs = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const r = luma[y * width + x] - bgAt(x, y);
      resid[y * width + x] = r;
      sumAbs += Math.abs(r);
    }
  }
  // Mean absolute deviation -> sigma (×1.2533 for Gaussian); floor vs JPEG noise.
  const sigma = Math.max(1.5, (sumAbs / (width * height)) * 1.2533);
  const thresh = minSigma * sigma;

  // --- connected components over |resid| > thresh ---
  const seen = new Uint8Array(width * height);
  const found: Detection[] = [];
  const stack: number[] = [];

  for (let i = 0; i < width * height; i++) {
    if (seen[i] || (mask && !mask[i]) || Math.abs(resid[i]) < thresh) continue;
    // flood fill
    let area = 0;
    let sx = 0;
    let sy = 0;
    let peak = 0;
    let minX = width, maxX = 0, minY = height, maxY = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const px = p % width;
      const py = (p / width) | 0;
      area++;
      sx += px;
      sy += py;
      peak = Math.max(peak, Math.abs(resid[p]));
      minX = Math.min(minX, px); maxX = Math.max(maxX, px);
      minY = Math.min(minY, py); maxY = Math.max(maxY, py);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const np = ny * width + nx;
          if (!seen[np] && (!mask || mask[np]) && Math.abs(resid[np]) >= thresh) {
            seen[np] = 1;
            stack.push(np);
          }
        }
      }
    }

    if (area < minArea || area > maxArea) continue;
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const aspect = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh));
    if (aspect > 8) continue; // cloud edges / wires
    // Solid clouds pass the area cap but are diffuse; planes are compact.
    const fill = area / (bw * bh);
    if (fill < 0.25) continue;

    const cx = sx / area / width;
    const cy = sy / area / height;
    const dist = Math.hypot(cx - exX, cy - exY);
    if (dist > maxDistFrac) continue; // we know roughly where the plane is

    // A plane sits in clean sky; a tree branch / roof edge sits inside
    // texture. Require the ring AROUND the blob to be locally smooth.
    {
      const pad = Math.max(3, Math.max(bw, bh));
      const rx0 = Math.max(0, minX - pad);
      const rx1 = Math.min(width - 1, maxX + pad);
      const ry0 = Math.max(0, minY - pad);
      const ry1 = Math.min(height - 1, maxY + pad);
      let ringSum = 0;
      let ringN = 0;
      for (let y = ry0; y <= ry1; y++) {
        for (let x = rx0; x <= rx1; x++) {
          if (x >= minX && x <= maxX && y >= minY && y <= maxY) continue;
          ringSum += Math.abs(resid[y * width + x]);
          ringN++;
        }
      }
      const ringMean = ringN ? ringSum / ringN : 0;
      if (ringMean > 2 * sigma) continue; // embedded in clutter, not sky
    }

    const score = (peak / sigma) * Math.min(1, area / 6) / (0.15 + dist);
    found.push({
      cx,
      cy,
      areaPx: area,
      contrastSigma: peak / sigma,
      box: { x: minX / width, y: minY / height, w: bw / width, h: bh / height },
      score,
    });
  }
  found.sort((a, b) => b.score - a.score);
  return found.slice(0, limit);
}

/** Decode a JPEG frame and run the detector at reduced scale. */
export async function detectInJpeg(
  jpeg: Buffer,
  opts: DetectOptions = {},
): Promise<Detection | null> {
  return (await detectCandidatesInJpeg(jpeg, opts))[0] ?? null;
}

/**
 * Candidate blobs from a JPEG frame, best first. With `roi` (frame
 * fractions), only that region is decoded — at (near-)native resolution
 * instead of the full-frame downscale, which makes a distant plane ~2.7×
 * larger to the detector. All returned coordinates (and the expected-position
 * / distance options) stay in FULL-frame fractions regardless.
 */
export async function detectCandidatesInJpeg(
  jpeg: Buffer,
  opts: DetectOptions = {},
  roi?: RoiFrac,
): Promise<Detection[]> {
  let img = sharp(jpeg);
  let effRoi: RoiFrac = { x: 0, y: 0, w: 1, h: 1 };
  if (roi) {
    const meta = await img.metadata();
    const nw = meta.width ?? 1280;
    const nh = meta.height ?? 720;
    const left = Math.min(nw - 16, Math.max(0, Math.round(roi.x * nw)));
    const top = Math.min(nh - 16, Math.max(0, Math.round(roi.y * nh)));
    const w = Math.max(16, Math.min(nw - left, Math.round(roi.w * nw)));
    const h = Math.max(16, Math.min(nh - top, Math.round(roi.h * nh)));
    img = img.extract({ left, top, width: w, height: h });
    effRoi = { x: left / nw, y: top / nh, w: w / nw, h: h / nh };
  }
  const { data, info } = await img
    .resize(W, H, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Translate full-frame expectations into ROI space for the search.
  const roiOpts: DetectOptions = {
    ...opts,
    expectedX: opts.expectedX != null ? (opts.expectedX - effRoi.x) / effRoi.w : undefined,
    expectedY: opts.expectedY != null ? (opts.expectedY - effRoi.y) / effRoi.h : undefined,
    maxDistFrac: opts.maxDistFrac != null ? opts.maxDistFrac / effRoi.w : undefined,
  };
  const dets = findBlobs(
    new Uint8Array(data.buffer, data.byteOffset, data.length),
    info.width,
    info.height,
    roiOpts,
  );
  // ...and the results back into full-frame fractions.
  return dets.map((d) => ({
    ...d,
    cx: effRoi.x + d.cx * effRoi.w,
    cy: effRoi.y + d.cy * effRoi.h,
    box: {
      x: effRoi.x + d.box.x * effRoi.w,
      y: effRoi.y + d.box.y * effRoi.h,
      w: d.box.w * effRoi.w,
      h: d.box.h * effRoi.h,
    },
  }));
}

/**
 * Debug rendering: the frame as the detector sees it — non-sky regions
 * tinted red, the winning blob boxed in green. Served at /vision-debug.jpg.
 */
export async function renderDebug(jpeg: Buffer, opts: DetectOptions = {}): Promise<Buffer> {
  const { data, info } = await sharp(jpeg)
    .resize(W, H, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const luma = new Uint8Array(data.buffer, data.byteOffset, data.length);
  const mask = (opts.useMask ?? true) ? skyMask(luma, w, h) : null;
  const det = findBlob(luma, w, h, opts);

  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const v = luma[i];
    if (!mask || mask[i]) {
      rgb[i * 3] = v;
      rgb[i * 3 + 1] = v;
      rgb[i * 3 + 2] = v;
    } else {
      rgb[i * 3] = Math.min(255, v * 0.7 + 80); // red tint = excluded
      rgb[i * 3 + 1] = v * 0.3;
      rgb[i * 3 + 2] = v * 0.3;
    }
  }
  if (det) {
    const x0 = Math.max(0, Math.round(det.box.x * w) - 3);
    const y0 = Math.max(0, Math.round(det.box.y * h) - 3);
    const x1 = Math.min(w - 1, Math.round((det.box.x + det.box.w) * w) + 3);
    const y1 = Math.min(h - 1, Math.round((det.box.y + det.box.h) * h) + 3);
    for (let x = x0; x <= x1; x++) {
      for (const y of [y0, y1]) {
        rgb[(y * w + x) * 3] = 0;
        rgb[(y * w + x) * 3 + 1] = 255;
        rgb[(y * w + x) * 3 + 2] = 60;
      }
    }
    for (let y = y0; y <= y1; y++) {
      for (const x of [x0, x1]) {
        rgb[(y * w + x) * 3] = 0;
        rgb[(y * w + x) * 3 + 1] = 255;
        rgb[(y * w + x) * 3 + 2] = 60;
      }
    }
  }
  return sharp(rgb, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 85 })
    .toBuffer();
}
