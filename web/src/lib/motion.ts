// Smooth aircraft motion between fixes.
//
// The feed polls every few seconds, so raw positions arrive as discrete jumps.
// Rather than snapping, we dead-reckon each aircraft forward from its last
// known fix using its reported track and ground speed, easing onto each new
// fix as it lands.
//
// This is deliberately NOT a React hook. Driving component state at frame rate
// would re-render the whole tree 60 times a second and thrash the map layers;
// instead the map calls `sample()` from its own animation loop and pushes the
// result straight into a GeoJSON source.

import type { Aircraft } from "@shared/index.js";

/** Never extrapolate further than this past the last fix. */
const MAX_LEAD_SEC = 15;
/** Convergence rate onto the dead-reckoned target, per frame at 60 Hz. */
const EASE = 0.12;
/** Below this ground speed there's nothing worth animating. */
const MIN_ANIMATE_KT = 30;
/** A correction larger than this is a re-acquisition, not drift: snap to it. */
const SNAP_DEG = 0.5;

const DEG = Math.PI / 180;
/** Metres per degree of latitude. */
const M_PER_DEG_LAT = 111_320;
const KT_TO_MS = 0.514444;

interface Estimate {
  /** Currently displayed position. */
  lat: number;
  lon: number;
  /** Last fix received, and when we received it. */
  baseLat: number;
  baseLon: number;
  baseTs: number;
  trackDeg: number;
  speedKt: number;
}

/**
 * Keeps a dead-reckoned position per aircraft. Feed it each snapshot with
 * `update()`, then call `sample()` as often as you like to render.
 */
export class MotionModel {
  private est = new Map<string, Estimate>();

  /** Fold a fresh snapshot in, keeping displayed positions for easing. */
  update(aircraft: Aircraft[], now: number): void {
    const live = new Set<string>();

    for (const ac of aircraft) {
      if (ac.lat == null || ac.lon == null) continue;
      live.add(ac.hex);

      const prev = this.est.get(ac.hex);
      const base = {
        baseLat: ac.lat,
        baseLon: ac.lon,
        baseTs: now,
        trackDeg: ac.track ?? prev?.trackDeg ?? 0,
        speedKt: ac.onGround ? 0 : ac.gs ?? prev?.speedKt ?? 0,
      };

      // First sight, or a jump big enough that easing would look like a slide
      // across the map — start clean at the reported position.
      const jumped =
        prev != null &&
        (Math.abs(prev.lat - ac.lat) > SNAP_DEG ||
          Math.abs(prev.lon - ac.lon) > SNAP_DEG);

      this.est.set(ac.hex, {
        lat: prev && !jumped ? prev.lat : ac.lat,
        lon: prev && !jumped ? prev.lon : ac.lon,
        ...base,
      });
    }

    for (const hex of this.est.keys()) {
      if (!live.has(hex)) this.est.delete(hex);
    }
  }

  /**
   * Advance every estimate and return the interpolated position for `hex`.
   * Call `step()` once per frame first, then `positionOf()` per aircraft.
   */
  step(nowMs: number): void {
    for (const s of this.est.values()) {
      const age = Math.min((nowMs - s.baseTs) / 1000, MAX_LEAD_SEC);
      const target =
        s.speedKt >= MIN_ANIMATE_KT
          ? project(s.baseLat, s.baseLon, s.trackDeg, s.speedKt, age)
          : { lat: s.baseLat, lon: s.baseLon };

      s.lat += (target.lat - s.lat) * EASE;
      s.lon += (target.lon - s.lon) * EASE;
    }
  }

  positionOf(hex: string): { lat: number; lon: number } | null {
    const s = this.est.get(hex);
    return s ? { lat: s.lat, lon: s.lon } : null;
  }

  clear(): void {
    this.est.clear();
  }
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
  const dLat = (dist * Math.cos(rad)) / M_PER_DEG_LAT;
  const cosLat = Math.cos(lat * DEG);
  const dLon =
    Math.abs(cosLat) < 1e-6 ? 0 : (dist * Math.sin(rad)) / (M_PER_DEG_LAT * cosLat);

  return { lat: lat + dLat, lon: lon + dLon };
}
