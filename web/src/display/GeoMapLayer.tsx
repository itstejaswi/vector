import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Aircraft } from "@shared/index.js";
import { lookupAirport } from "./airportCoords.js";

interface Props {
  centerLat: number;
  centerLon: number;
  radiusMiles: number;
  aircraft: Aircraft[];
  selectedAircraft: Aircraft | null;
  centerVersion: number;
  onClickAircraft: (hex: string | null) => void;
}

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

/**
 * Dark CartoDB basemap + great-circle arc + selection ring + click detection.
 * Free, no API key. Map is locked (no drag/zoom) for plane-geography sync.
 */
export function GeoMapLayer({
  centerLat,
  centerLon,
  radiusMiles,
  aircraft,
  selectedAircraft,
  centerVersion,
  onClickAircraft,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Refs so the click handler always reads fresh values.
  const aircraftRef = useRef(aircraft);
  const onClickRef = useRef(onClickAircraft);
  aircraftRef.current = aircraft;
  onClickRef.current = onClickAircraft;

  // Mount the map once.
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          "carto-dark": {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
              "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
              "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
              "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
            attribution: "(c) OpenStreetMap (c) CARTO",
          },
        },
        layers: [{ id: "carto-dark", type: "raster", source: "carto-dark" }],
      },
      center: [centerLon, centerLat],
      zoom: zoomFromRadius(radiusMiles),
      interactive: false,
      attributionControl: false,
    });

    mapRef.current = map;

    // Set up overlay layers once the style is ready.
    map.on("load", () => {
      // Origin -> destination arc (glow + dashed line on top)
      map.addSource("flight-arc", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "flight-arc-glow",
        type: "line",
        source: "flight-arc",
        paint: {
          "line-color": "#ffaa3d",
          "line-width": 8,
          "line-opacity": 0.15,
          "line-blur": 2,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "flight-arc-line",
        type: "line",
        source: "flight-arc",
        paint: {
          "line-color": "#ffaa3d",
          "line-width": 2,
          "line-opacity": 0.75,
          "line-dasharray": [2, 2],
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });

      // Origin/destination airport markers
      map.addSource("flight-endpoints", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "flight-origin-pt",
        type: "circle",
        source: "flight-endpoints",
        filter: ["==", ["get", "kind"], "origin"],
        paint: {
          "circle-radius": 12,
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": "#5fb3d4",
          "circle-stroke-width": 3,
          "circle-stroke-opacity": 0.9,
        },
      });
      map.addLayer({
        id: "flight-dest-pt",
        type: "circle",
        source: "flight-endpoints",
        filter: ["==", ["get", "kind"], "dest"],
        paint: {
          "circle-radius": 12,
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": "#ffaa3d",
          "circle-stroke-width": 3,
          "circle-stroke-opacity": 0.9,
        },
      });

      // Selection ring that follows the selected aircraft
      map.addSource("selected-aircraft", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "selected-aircraft-ring",
        type: "circle",
        source: "selected-aircraft",
        paint: {
          "circle-radius": 28,
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": "#ffaa3d",
          "circle-stroke-width": 2.5,
          "circle-stroke-opacity": 1,
        },
      });
    });

    // Click handler: hit-test against current aircraft positions
    map.on("click", (e) => {
      const list = aircraftRef.current;
      if (!list || list.length === 0) {
        onClickRef.current?.(null);
        return;
      }
      const tolerance = 60; // pixels
      let bestHex: string | null = null;
      let bestDist = Infinity;
      for (const ac of list) {
        if (ac.lat == null || ac.lon == null) continue;
        const px = map.project([ac.lon, ac.lat]);
        const d = Math.hypot(px.x - e.point.x, px.y - e.point.y);
        if (d < tolerance && d < bestDist) {
          bestDist = d;
          bestHex = ac.hex;
        }
      }
      onClickRef.current?.(bestHex);
    });

    // Cursor feedback on hover near a plane
    map.on("mousemove", (e) => {
      const list = aircraftRef.current;
      if (!list) return;
      let near = false;
      for (const ac of list) {
        if (ac.lat == null || ac.lon == null) continue;
        const px = map.project([ac.lon, ac.lat]);
        if (Math.hypot(px.x - e.point.x, px.y - e.point.y) < 60) {
          near = true;
          break;
        }
      }
      map.getCanvas().style.cursor = near ? "pointer" : "";
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Re-center via "RE-CENTER" button click (centerVersion increments)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      center: [centerLon, centerLat],
      zoom: zoomFromRadius(radiusMiles),
      duration: 1000,
    });
  }, [centerVersion]);

  // Re-center when location changes (control panel location hot-swap)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      center: [centerLon, centerLat],
      zoom: zoomFromRadius(radiusMiles),
      duration: 800,
    });
  }, [centerLat, centerLon, radiusMiles]);

  // Update the arc + endpoint markers when selection changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const sel = selectedAircraft;
      const arcSrc = map.getSource("flight-arc") as maplibregl.GeoJSONSource | undefined;
      const ptsSrc = map.getSource("flight-endpoints") as maplibregl.GeoJSONSource | undefined;
      if (!arcSrc || !ptsSrc) return;

      // Fallback: if API didn't provide coords, look them up locally.
      const originFallback = lookupAirport(sel?.origin);
      const destFallback = lookupAirport(sel?.destination);
      const oLat = sel?.originLat ?? originFallback?.[0];
      const oLon = sel?.originLon ?? originFallback?.[1];
      const dLat = sel?.destLat ?? destFallback?.[0];
      const dLon = sel?.destLon ?? destFallback?.[1];

      if (
        sel &&
        oLat != null && oLon != null &&
        dLat != null && dLon != null
      ) {
        const coords = greatCirclePoints(oLat, oLon, dLat, dLon, 80);
        arcSrc.setData({
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: coords },
          }],
        });

        const features: GeoJSON.Feature[] = [];
        // Show origin dot only if the origin airport is OUTSIDE the current radius.
        const originDistMiles = greatCircleMiles(oLat, oLon, centerLat, centerLon);
        if (originDistMiles > radiusMiles) {
          features.push({
            type: "Feature",
            properties: { kind: "origin" },
            geometry: { type: "Point", coordinates: [oLon, oLat] },
          });
        }
        const destDistMiles = greatCircleMiles(dLat, dLon, centerLat, centerLon);
        if (destDistMiles > radiusMiles) {
          features.push({
            type: "Feature",
            properties: { kind: "dest" },
            geometry: { type: "Point", coordinates: [dLon, dLat] },
          });
        }
        ptsSrc.setData({
          type: "FeatureCollection",
          features,
        });
      } else {
        arcSrc.setData(EMPTY_FC);
        ptsSrc.setData(EMPTY_FC);
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [selectedAircraft, centerLat, centerLon, radiusMiles]);

  // Selection ring follows the selected plane as it moves
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const src = map.getSource("selected-aircraft") as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      if (selectedAircraft && selectedAircraft.lat != null && selectedAircraft.lon != null) {
        src.setData({
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: [selectedAircraft.lon, selectedAircraft.lat] },
          }],
        });
      } else {
        src.setData(EMPTY_FC);
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [selectedAircraft?.hex, selectedAircraft?.lat, selectedAircraft?.lon]);

  return <div ref={containerRef} className="geomap-layer" />;
}

function zoomFromRadius(radiusMiles: number): number {
  if (radiusMiles <= 3) return 13;
  if (radiusMiles <= 5) return 12;
  if (radiusMiles <= 10) return 11;
  if (radiusMiles <= 25) return 10;
  if (radiusMiles <= 50) return 9;
  if (radiusMiles <= 100) return 8;
  if (radiusMiles <= 200) return 7;
  if (radiusMiles <= 400) return 6;
  if (radiusMiles <= 800) return 5;
  if (radiusMiles <= 1500) return 4;
  return 3;
}

/** Spherical interpolation between two GPS points. Returns [lon, lat] pairs. */
function greatCirclePoints(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
  steps: number,
): [number, number][] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1r = toRad(lat1), lon1r = toRad(lon1);
  const lat2r = toRad(lat2), lon2r = toRad(lon2);

  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((lat2r - lat1r) / 2) ** 2 +
    Math.cos(lat1r) * Math.cos(lat2r) * Math.sin((lon2r - lon1r) / 2) ** 2
  ));

  if (d === 0 || !isFinite(d)) {
    return [[lon1, lat1], [lon2, lat2]];
  }

  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1r) * Math.cos(lon1r) + B * Math.cos(lat2r) * Math.cos(lon2r);
    const y = A * Math.cos(lat1r) * Math.sin(lon1r) + B * Math.cos(lat2r) * Math.sin(lon2r);
    const z = A * Math.sin(lat1r) + B * Math.sin(lat2r);
    const lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
    const lon = toDeg(Math.atan2(y, x));
    out.push([lon, lat]);
  }
  return out;
}

function greatCircleMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const DEG = Math.PI / 180;
  const f1 = lat1 * DEG;
  const f2 = lat2 * DEG;
  const df = (lat2 - lat1) * DEG;
  const dl = (lon2 - lon1) * DEG;
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}