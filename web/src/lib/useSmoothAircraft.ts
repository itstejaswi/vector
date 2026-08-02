// Smooth aircraft motion between fixes.
//
// The feed polls every few seconds, so raw positions arrive as discrete jumps.
// Rather than snapping, we dead-reckon each aircraft forward from its last
// known fix using its reported track and ground speed, and ease toward each
// new fix as it arrives. The result is continuous motion at display refresh
// rate with no extra network cost.

import { useEffect, useRef, useState } from "react";
import type { Aircraft } from "@shared/index.js";

/** Never extrapolate further than this past the last fix. */
const MAX_LEAD_SEC = 12;
/** How quickly a corrected position converges on the truth (0..1 per frame). */
const EASE = 0.16;
/** Below this ground speed there's nothing worth animating. */
const MIN_ANIMATE_KT = 30;

const DEG = Math.PI / 180;
/** Metres per degree of latitude. */
const M_PER_DEG_LAT = 111_320;
const KT_TO_MS = 0.514444;

interface Smoothed {
  lat: number;
  lon: number;
  /** Fix this estimate was last corrected against. */
  baseLat: number;
  baseLon: number;
  baseTs: number;
  trackDeg: number;
  speedKt: number;
}

/**
 * Project a position forward along its track.
 * Longitude degrees shrink with latitude, hence the cosine term.
 */
function project(
  lat: number,
  lon: number,
  trackDeg: number,
  speedKt: number,
  seconds: number,
): { lat: number; lon: number } {
  const dist = speedKt * KT_TO_MS * seconds;
  if (dist === 0) return { lat, lon };

  const rad = trackDeg * DEG;
  const dNorth = dist * Math.cos(rad);
  const dEast = dist * Math.sin(rad);

  const dLat = dNorth / M_PER_DEG_LAT;
  const cosLat = Math.cos(lat * DEG);
  const dLon = Math.abs(cosLat) < 1e-6 ? 0 : dEast / (M_PER_DEG_LAT * cosLat);

  return { lat: lat + dLat, lon: lon + dLon };
}

/**
 * Take the raw aircraft list and return a copy whose positions advance
 * smoothly at animation frame rate. Identity of the array changes each frame,
 * so map layers re-read it; the underlying Aircraft objects are cloned rather
 * than mutated.
 */
export function useSmoothAircraft(aircraft: Aircraft[], now: number): Aircraft[] {
  const [frame, setFrame] = useState<Aircraft[]>(aircraft);
  const stateRef = useRef(new Map<string, Smoothed>());
  const rawRef = useRef(aircraft);
  rawRef.current = aircraft;

  // Fold each new snapshot into the running estimates.
  useEffect(() => {
    const est = stateRef.current;
    const live = new Set<string>();

    for (const ac of aircraft) {
      if (ac.lat == null || ac.lon == null) continue;
      live.add(ac.hex);

      const prev = est.get(ac.hex);
      const base = {
        baseLat: ac.lat,
        baseLon: ac.lon,
        baseTs: now,
        trackDeg: ac.track ?? prev?.trackDeg ?? 0,
        speedKt: ac.onGround ? 0 : ac.gs ?? prev?.speedKt ?? 0,
      };

      if (!prev) {
        est.set(ac.hex, { lat: ac.lat, lon: ac.lon, ...base });
        continue;
      }
      // Keep the displayed position and let it ease onto the new fix, so a
      // correction reads as a smooth nudge rather than a teleport.
      est.set(ac.hex, { lat: prev.lat, lon: prev.lon, ...base });
    }

    for (const hex of est.keys()) {
      if (!live.has(hex)) est.delete(hex);
    }
  }, [aircraft, now]);

  // Advance the estimates once per animation frame.
  useEffect(() => {
    let raf = 0;

    const tick = () => {
      const est = stateRef.current;
      const t = Date.now();
      let moved = false;

      const next = rawRef.current.map((ac) => {
        const s = est.get(ac.hex);
        if (!s || ac.lat == null || ac.lon == null) return ac;

        const age = Math.min((t - s.baseTs) / 1000, MAX_LEAD_SEC);
        const target =
          s.speedKt >= MIN_ANIMATE_KT
            ? project(s.baseLat, s.baseLon, s.trackDeg, s.speedKt, age)
            : { lat: s.baseLat, lon: s.baseLon };

        const dLat = target.lat - s.lat;
        const dLon = target.lon - s.lon;
        if (Math.abs(dLat) > 1e-9 || Math.abs(dLon) > 1e-9) {
          s.lat += dLat * EASE;
          s.lon += dLon * EASE;
          moved = true;
        }

        return { ...ac, lat: s.lat, lon: s.lon };
      });

      if (moved) setFrame(next);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Structural changes (aircraft entering or leaving) apply immediately.
  useEffect(() => {
    setFrame((current) =>
      current.length === aircraft.length ? current : aircraft,
    );
  }, [aircraft]);

  return frame;
}
