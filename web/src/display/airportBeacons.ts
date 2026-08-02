// Airport beacons.
//
// Drawn from the built-in AIRPORT_COORDS table, so this costs nothing at
// runtime: no requests, no API quota, just a static object already in the
// bundle. Aerodrome beacons in the real world sweep a rotating light, which
// is what the animated arc here is imitating.

import type maplibregl from "maplibre-gl";
import { AIRPORT_COORDS } from "./airportCoords.js";

/** Airports whose label is worth showing even at wide zoom. */
const MAJOR = new Set([
  "DEL", "BOM", "BLR", "MAA", "HYD", "CCU", "COK", "AMD", "GOI", "PNQ",
  "DXB", "AUH", "DOH", "SIN", "BKK", "KUL", "HKG", "ICN", "NRT", "HND",
  "LHR", "CDG", "FRA", "AMS", "IST", "MAD", "FCO", "ZRH", "MUC",
  "JFK", "EWR", "LAX", "SFO", "ORD", "IAD", "YYZ", "YVR",
  "SYD", "MEL", "AKL", "JNB", "CAI", "ADD", "NBO", "GRU",
]);

/** Zoom below which only major airports appear at all. */
const MAJOR_ONLY_ZOOM = 6;
/** Zoom below which no labels are drawn, only the beacons themselves. */
const LABEL_ZOOM = 5;

const TAU = Math.PI * 2;
/** Beacon sweep, in revolutions per second. */
const SWEEP_HZ = 0.22;

interface Airport {
  code: string;
  lat: number;
  lon: number;
  major: boolean;
  /** Phase offset so beacons don't all sweep in lockstep. */
  phase: number;
}

const AIRPORTS: Airport[] = Object.entries(AIRPORT_COORDS).map(
  ([code, [lat, lon]], i) => ({
    code,
    lat,
    lon,
    major: MAJOR.has(code),
    phase: (i * 0.37) % 1,
  }),
);

/**
 * Paint every airport in view onto the given context. Called from the
 * aircraft canvas's animation loop so the beacons share its frame budget and
 * stay in step with the map camera.
 */
export function drawAirportBeacons(
  ctx: CanvasRenderingContext2D,
  map: maplibregl.Map,
  viewW: number,
  viewH: number,
  t: number,
): void {
  const zoom = map.getZoom();
  const majorOnly = zoom < MAJOR_ONLY_ZOOM;
  const showLabels = zoom >= LABEL_ZOOM;
  // Fade the whole layer in as you zoom past the threshold, rather than
  // popping it on.
  const layerAlpha = Math.min(1, Math.max(0.35, (zoom - 3) / 4));

  for (const ap of AIRPORTS) {
    if (majorOnly && !ap.major) continue;

    const px = map.project([ap.lon, ap.lat]);
    if (px.x < -40 || px.y < -40 || px.x > viewW + 40 || px.y > viewH + 40) {
      continue;
    }

    drawBeacon(ctx, px.x, px.y, t, ap.phase, ap.major, layerAlpha);

    if (showLabels && (ap.major || zoom >= 7)) {
      drawCode(ctx, px.x, px.y, ap.code, layerAlpha);
    }
  }
}

function drawBeacon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  phase: number,
  major: boolean,
  alpha: number,
): void {
  const r = major ? 5.5 : 4;
  const sweep = ((t * SWEEP_HZ + phase) % 1) * TAU;

  ctx.save();

  // Rotating sweep, brightest at its leading edge.
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
  grad.addColorStop(0, `rgba(93, 200, 255, ${0.28 * alpha})`);
  grad.addColorStop(1, "rgba(93, 200, 255, 0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, r * 3.2, sweep, sweep + 0.9);
  ctx.closePath();
  ctx.fill();

  // Ring.
  ctx.strokeStyle = `rgba(93, 200, 255, ${0.75 * alpha})`;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();

  // Cross-hairs through the ring — reads as an aerodrome symbol rather than
  // just another dot.
  ctx.strokeStyle = `rgba(93, 200, 255, ${0.5 * alpha})`;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(x - r * 1.5, y);
  ctx.lineTo(x + r * 1.5, y);
  ctx.moveTo(x, y - r * 1.5);
  ctx.lineTo(x, y + r * 1.5);
  ctx.stroke();

  // Core, pulsing gently in time with the sweep.
  const pulse = 0.55 + 0.45 * Math.sin(sweep);
  ctx.fillStyle = `rgba(180, 230, 255, ${(0.5 + 0.4 * pulse) * alpha})`;
  ctx.beginPath();
  ctx.arc(x, y, major ? 2 : 1.5, 0, TAU);
  ctx.fill();

  ctx.restore();
}

function drawCode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  code: string,
  alpha: number,
): void {
  ctx.save();
  ctx.font = '600 9.5px ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
  ctx.strokeText(code, x, y - 8);
  ctx.fillStyle = `rgba(140, 210, 245, ${0.9 * alpha})`;
  ctx.fillText(code, x, y - 8);
  ctx.restore();
}
