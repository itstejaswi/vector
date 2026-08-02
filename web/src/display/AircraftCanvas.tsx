import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";
import type { Aircraft } from "@shared/index.js";
import { classifyGlyph, drawAircraftGlyph, GLYPH_SCALE } from "./aircraftGlyph.js";
import { drawAirportBeacons } from "./airportBeacons.js";
import type { MotionModel } from "../lib/motion.js";

interface Props {
  /** The map whose viewport this canvas tracks. */
  map: maplibregl.Map | null;
  /** Live aircraft list; positions come from the motion model, not from here. */
  aircraft: Aircraft[];
  /** Dead-reckoned positions, stepped by this component's animation loop. */
  motion: MotionModel;
  selectedHex: string | null;
  /** Hex codes that should carry a callsign label. */
  labelled: Set<string>;
  /** Base glyph size in CSS pixels, at the reference zoom. */
  glyphSize: number;
  /** Draw the airport beacon layer. */
  showAirports: boolean;
}

/**
 * Glyph size relative to the base, per zoom level. Aircraft that look right
 * over a single airport become an unreadable orange mass at country scale, so
 * they shrink as you pull back.
 */
function scaleForZoom(zoom: number): number {
  if (zoom >= 10) return 1.15;
  if (zoom >= 8.5) return 1;
  if (zoom >= 7) return 0.82;
  if (zoom >= 6) return 0.68;
  if (zoom >= 5) return 0.56;
  if (zoom >= 4) return 0.46;
  return 0.4;
}

/** Altitude bands, low to high, as RGB triples for the glyph painter. */
const ALT_COLORS: Array<[number, [number, number, number]]> = [
  [0, [255, 95, 77]],
  [5000, [255, 138, 61]],
  [15000, [255, 170, 61]],
  [25000, [255, 209, 102]],
  [35000, [141, 223, 255]],
  [45000, [185, 163, 255]],
];
const GROUND_COLOR: [number, number, number] = [140, 140, 140];

/**
 * Canvas overlay that draws the aircraft themselves: type-aware silhouettes
 * with spinning propellers and rotors.
 *
 * MapLibre symbol layers can only place static sprites, so anything animated
 * has to be painted by us. The canvas sits above the map, matches its viewport
 * every frame, and projects each aircraft through `map.project()` so the two
 * stay locked together while panning and zooming.
 */
export function AircraftCanvas({
  map,
  aircraft,
  motion,
  selectedHex,
  labelled,
  glyphSize,
  showAirports,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Refs so the animation loop never needs re-binding.
  const aircraftRef = useRef(aircraft);
  const selectedRef = useRef(selectedHex);
  const labelledRef = useRef(labelled);
  const sizeRef = useRef(glyphSize);
  const showAirportsRef = useRef(showAirports);
  aircraftRef.current = aircraft;
  selectedRef.current = selectedHex;
  labelledRef.current = labelled;
  sizeRef.current = glyphSize;
  showAirportsRef.current = showAirports;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let dpr = 1;

    const resize = () => {
      const c = map.getCanvas();
      // Lay out in CSS pixels, back it with device pixels for a crisp draw.
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = c.clientWidth;
      const h = c.clientHeight;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };

    resize();
    map.on("resize", resize);

    const start = performance.now();

    const frame = () => {
      raf = requestAnimationFrame(frame);

      const w = canvas.width;
      const h = canvas.height;
      if (w === 0 || h === 0) return;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.scale(dpr, dpr);

      // Advance the dead-reckoning, then draw wherever each aircraft now is.
      const nowMs = Date.now();
      motion.step(nowMs);

      const t = (performance.now() - start) / 1000;
      const selected = selectedRef.current;
      const labels = labelledRef.current;
      // Scale with zoom so a busy terminal area stays legible.
      const zoomScale = scaleForZoom(map.getZoom());
      const base = sizeRef.current * zoomScale;
      const viewW = canvas.clientWidth;
      const viewH = canvas.clientHeight;

      // Airports first, so aircraft always fly over their beacons.
      if (showAirportsRef.current) {
        drawAirportBeacons(ctx, map, viewW, viewH, t);
      }

      // Painted label boxes, so a later label can skip a spot that's taken.
      const labelBoxes: Array<[number, number, number, number]> = [];

      for (const ac of aircraftRef.current) {
        const pos = motion.positionOf(ac.hex);
        if (!pos) continue;

        const px = map.project([pos.lon, pos.lat]);
        // Cull off-screen aircraft with a margin for glyph and label overhang.
        if (px.x < -80 || px.y < -80 || px.x > viewW + 80 || px.y > viewH + 80) {
          continue;
        }

        const kind = classifyGlyph(ac);
        const isSel = ac.hex === selected;
        const size = base * GLYPH_SCALE[kind] * (isSel ? 1.35 : 1);
        const color = altitudeColor(ac);
        // A per-aircraft phase offset stops every propeller spinning in unison.
        const seed = hashHex(ac.hex);

        ctx.save();
        ctx.translate(px.x, px.y);
        // Glyphs are drawn nose-up, so rotate by the track to point them along
        // their heading.
        ctx.rotate(((ac.track ?? 0) * Math.PI) / 180);
        drawAircraftGlyph(ctx, kind, size / 2, color, isSel ? 1 : 0.92, t, seed);
        ctx.restore();

        if (isSel) drawSelectionRing(ctx, px.x, px.y, size, t);

        // Climb/descent chevron, upright regardless of heading.
        const vs = verticalMarker(ac);
        if (vs) drawVertical(ctx, px.x + size * 0.5, px.y - size * 0.42, vs);

        if (labels.has(ac.hex)) {
          const text = (ac.flight || ac.hex).toUpperCase();
          const ly = px.y + size * 0.62;
          // Approximate the box: measureText per label per frame is costly.
          const halfW = text.length * 3.1 + 2;
          const box: [number, number, number, number] = [
            px.x - halfW,
            ly,
            px.x + halfW,
            ly + 11,
          ];
          if (!labelBoxes.some((b) => overlaps(b, box))) {
            labelBoxes.push(box);
            drawLabel(ctx, px.x, ly, text);
          }
        }
      }
    };

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      map.off("resize", resize);
    };
  }, [map, motion]);

  return <canvas ref={canvasRef} className="aircraft-canvas" />;
}

/* ---------------- painting helpers ---------------- */

function altitudeColor(ac: Aircraft): [number, number, number] {
  if (ac.onGround) return GROUND_COLOR;
  const alt = ac.altBaro ?? ac.altGeom;
  if (alt == null) return ALT_COLORS[2][1];
  let color = ALT_COLORS[0][1];
  for (const [floor, c] of ALT_COLORS) {
    if (alt >= floor) color = c;
  }
  return color;
}

/** Pulsing ring around the selected aircraft. */
function drawSelectionRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  t: number,
): void {
  const r = size * 0.95 + Math.sin(t * 2.2) * 1.6;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 170, 61, 0.9)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();

  // Tick marks at the cardinals, like a targeting reticle.
  ctx.strokeStyle = "rgba(255, 170, 61, 0.55)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * (r + 2), y + Math.sin(a) * (r + 2));
    ctx.lineTo(x + Math.cos(a) * (r + 6), y + Math.sin(a) * (r + 6));
    ctx.stroke();
  }
  ctx.restore();
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
): void {
  ctx.save();
  ctx.font =
    '500 10.5px ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = "rgba(232, 220, 200, 0.95)";
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Climb / descent state, or null when level or on the ground. */
function verticalMarker(ac: Aircraft): "up" | "down" | null {
  if (ac.onGround || ac.baroRate == null) return null;
  if (ac.baroRate > 250) return "up";
  if (ac.baroRate < -250) return "down";
  return null;
}

/** Small chevron marking a departure or an arrival at a glance. */
function drawVertical(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: "up" | "down",
): void {
  const r = 3.4;
  const up = dir === "up";
  ctx.save();
  ctx.beginPath();
  if (up) {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y + r * 0.8);
    ctx.lineTo(x - r, y + r * 0.8);
  } else {
    ctx.moveTo(x, y + r);
    ctx.lineTo(x + r, y - r * 0.8);
    ctx.lineTo(x - r, y - r * 0.8);
  }
  ctx.closePath();
  ctx.fillStyle = up ? "rgba(50, 215, 75, 0.95)" : "rgba(255, 154, 106, 0.95)";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

/** Axis-aligned box overlap test, used to keep labels from colliding. */
function overlaps(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

/** Cheap stable hash, used only to de-phase the propeller animations. */
function hashHex(hex: string): number {
  let h = 0;
  for (let i = 0; i < hex.length; i++) {
    h = (h * 31 + hex.charCodeAt(i)) >>> 0;
  }
  return (h % 1000) / 1000 * Math.PI * 2;
}
