import { useEffect, useRef } from "react";
import type { Config } from "@shared/index.js";
import { useStream } from "../lib/useStream.js";

/**
 * Auto-tuner for the geomap theme.
 * On entry: hides sky elements, restores amber plane color, widens radius,
 *           keeps trails long, and re-enables runway drawing (the airports
 *           file now has correct Indian coordinates).
 * On exit:  restores all originals.
 */
export function GeomapTuner() {
  const { state, conn } = useStream("display");
  const prevRef = useRef<Partial<Config> | null>(null);
  const lastThemeRef = useRef<string | null>(null);
  const cfg = state.config;

  useEffect(() => {
    if (!cfg) return;
    const theme = cfg.theme;
    const last = lastThemeRef.current;
    // Auto-adjust airport overlay + label density when radius changes while in geomap.


    if (theme === "geomap" && last !== "geomap") {
prevRef.current = {
        showStars: cfg.showStars,
        showSun: cfg.showSun,
        showMoon: cfg.showMoon,
        showPlanets: cfg.showPlanets,
        showSatellites: cfg.showSatellites,
        showAirport: cfg.showAirport,
        showHud: cfg.showHud,
        altitudeColor: cfg.altitudeColor,
        trailSeconds: cfg.trailSeconds,
        showDestArc: cfg.showDestArc,
        showRouteDetail: cfg.showRouteDetail,
        labelDensity: cfg.labelDensity,
        nearestN: cfg.nearestN,
//      radiusMiles: cfg.radiusMiles,
        staleSec: cfg.staleSec,
      };

      const wideView = (cfg.radiusMiles ?? 25) > 200;
      conn.patchConfig({
        showStars: false,
        showSun: false,
        showMoon: false,
        showPlanets: false,
        showSatellites: false,
        showAirport: !wideView,    // hide runway labels at country zoom (projection drift)
        showHud: false,
        altitudeColor: true,
        trailSeconds: 900,
        showDestArc: true,
        showRouteDetail: true,
        labelDensity: "nearestN",
        nearestN: wideView ? 3 : 5,  // fewer labels in busy country view
        staleSec: 600,
      });
    }

    if (theme !== "geomap" && last === "geomap" && prevRef.current) {
      conn.patchConfig(prevRef.current);
      prevRef.current = null;
    }

    lastThemeRef.current = theme;
  }, [cfg, conn]);

  return null;
}
