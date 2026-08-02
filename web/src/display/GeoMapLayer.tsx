import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Aircraft } from "@shared/index.js";
import {
  bowForDistance,
  circlePoints,
  distSq,
  greatCircleKm,
  greatCirclePoints,
} from "@shared/index.js";
import { lookupAirport } from "./airportCoords.js";
import { MotionModel } from "../lib/motion.js";

interface Props {
  centerLat: number;
  centerLon: number;
  radiusMiles: number;
  aircraft: Aircraft[];
  selectedAircraft: Aircraft | null;
  /** Recent ground track per aircraft, oldest first. */
  trails: Map<string, [number, number][]>;
  /** Bumped by the caller to force a re-centre animation. */
  centerVersion: number;
  onClickAircraft: (hex: string | null) => void;
  /**
   * Handed the map instance and shared render state once ready, so the
   * aircraft canvas can sit above the map and stay locked to its camera.
   */
  onReady: (ctx: {
    map: maplibregl.Map;
    motion: MotionModel;
    labelled: Set<string>;
  }) => void;
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** Altitude bands, low to high - drives the glyph colour ramp. */
const ALT_COLORS: Array<[number, string]> = [
  [0, "#ff5f4d"],
  [5000, "#ff8a3d"],
  [15000, "#ffaa3d"],
  [25000, "#ffd166"],
  [35000, "#8ddfff"],
  [45000, "#b9a3ff"],
];

/** Grey for aircraft on the ground. */
const GROUND_COLOR = "#8b8b8b";

/**
 * One pre-tinted icon per colour. SDF tinting via `icon-color` needs a real
 * signed-distance-field bitmap; feeding it a plain alpha mask renders
 * inconsistently across GPUs, so we bake the colours instead.
 */
const ICON_COLORS = [...ALT_COLORS.map(([, c]) => c), GROUND_COLOR];
const iconId = (color: string) => `plane-${color.replace("#", "")}`;
const PLANE_PX = 44;
/** Only the closest N aircraft get a callsign label; more becomes noise. */
const LABEL_LIMIT = 14;

/**
 * The map: dark basemap, range ring, live aircraft, and the great-circle
 * route arc for the selected flight. Locked to the configured centre so the
 * HUD and the geography always agree.
 */
export function GeoMapLayer({
  centerLat,
  centerLon,
  radiusMiles,
  aircraft,
  selectedAircraft,
  trails,
  centerVersion,
  onClickAircraft,
  onReady,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  /** Source updates that arrived before the style finished loading. */
  const pendingRef = useRef<Array<(m: maplibregl.Map) => void>>([]);
  /** Dead-reckoning between polls, stepped by the aircraft canvas. */
  const motionRef = useRef(new MotionModel());
  /** Which aircraft get a callsign label. Mutated in place so the canvas,
   *  which holds the same Set, always sees the current selection. */
  const labelledRef = useRef<Set<string>>(new Set());
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // Refs so map handlers always see current values without re-binding.
  const aircraftRef = useRef(aircraft);
  const onClickRef = useRef(onClickAircraft);
  const selectedRef = useRef(selectedAircraft);
  aircraftRef.current = aircraft;
  onClickRef.current = onClickAircraft;
  selectedRef.current = selectedAircraft;

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        // Text layers need a glyph source. Request a SINGLE font per stack:
        // openmaptiles rejects comma-joined fallback stacks.
        glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
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
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });

    mapRef.current = map;
    map.touchZoomRotate.disableRotation();

    // Surface style/source problems instead of failing silently.
    map.on("error", (e) => console.error("[map]", e.error?.message ?? e));

    map.on("load", () => {
      for (const color of ICON_COLORS) {
        map.addImage(iconId(color), buildPlaneIcon(PLANE_PX, color), {
          pixelRatio: 2,
        });
      }

      // --- range ring around the configured centre ---
      map.addSource("range-ring", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "range-ring-fill",
        type: "fill",
        source: "range-ring",
        paint: { "fill-color": "#ffaa3d", "fill-opacity": 0.03 },
      });
      map.addLayer({
        id: "range-ring-line",
        type: "line",
        source: "range-ring",
        paint: {
          "line-color": "#ffaa3d",
          "line-width": 1,
          "line-opacity": 0.35,
          "line-dasharray": [3, 3],
        },
      });

      // --- centre marker ---
      map.addSource("center-pt", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "center-pt-ring",
        type: "circle",
        source: "center-pt",
        paint: {
          "circle-radius": 5,
          "circle-color": "#ffaa3d",
          "circle-opacity": 0.9,
          "circle-stroke-color": "#ffdca8",
          "circle-stroke-width": 1.5,
        },
      });

      // --- ground tracks (drawn beneath everything else) ---
      map.addSource("trails", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "trail-line",
        type: "line",
        source: "trails",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["case", ["get", "sel"], 2.2, 1.1],
          "line-opacity": ["case", ["get", "sel"], 0.85, 0.4],
          "line-blur": 0.4,
        },
      });

      // --- route arc for the selected flight ---
      map.addSource("flight-arc", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "flight-arc-glow",
        type: "line",
        source: "flight-arc",
        paint: {
          "line-color": "#ffaa3d",
          "line-width": 10,
          "line-opacity": 0.18,
          "line-blur": 6,
        },
        layout: { "line-cap": "round", "line-join": "round" },
      });
      map.addLayer({
        id: "flight-arc-line",
        type: "line",
        source: "flight-arc",
        paint: { "line-color": "#ffcb7a", "line-width": 1.6, "line-opacity": 0.85 },
        layout: { "line-cap": "round", "line-join": "round" },
      });

      // --- origin / destination pins ---
      map.addSource("flight-endpoints", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "endpoint-halo",
        type: "circle",
        source: "flight-endpoints",
        paint: {
          "circle-radius": 13,
          "circle-color": "#ffaa3d",
          "circle-opacity": 0.12,
        },
      });
      map.addLayer({
        id: "endpoint-dot",
        type: "circle",
        source: "flight-endpoints",
        paint: {
          "circle-radius": 4.5,
          "circle-color": "#0d0b08",
          "circle-stroke-color": "#ffaa3d",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "endpoint-label",
        type: "symbol",
        source: "flight-endpoints",
        layout: {
          "text-field": ["get", "code"],
          "text-font": ["Open Sans Semibold"],
          "text-size": 13,
          "text-offset": [0, -1.6],
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#ffd9a0",
          "text-halo-color": "#000000",
          "text-halo-width": 1.6,
        },
      });
      map.addLayer({
        id: "endpoint-city",
        type: "symbol",
        source: "flight-endpoints",
        layout: {
          "text-field": ["get", "city"],
          "text-font": ["Open Sans Regular"],
          "text-size": 10,
          "text-offset": [0, 1.9],
          "text-allow-overlap": true,
          "text-letter-spacing": 0.12,
        },
        paint: {
          "text-color": "#c9b79a",
          "text-halo-color": "#000000",
          "text-halo-width": 1.4,
        },
      });

      // --- selection ring ---
      // Aircraft themselves are drawn on a canvas above the map (see
      // AircraftCanvas) so their propellers and rotors can actually spin;
      // MapLibre symbol layers can only place static sprites.

      readyRef.current = true;
      // Flush anything that arrived while the style was still loading.
      const queued = pendingRef.current;
      pendingRef.current = [];
      for (const fn of queued) fn(map);

      onReadyRef.current({
        map,
        motion: motionRef.current,
        labelled: labelledRef.current,
      });
    });

    // Hit-test clicks against the animated positions, so a click lands where
    // the aircraft is actually drawn rather than at its last raw fix.
    map.on("click", (e) => {
      const motion = motionRef.current;
      let bestHex: string | null = null;
      let bestDist = Infinity;
      for (const ac of aircraftRef.current ?? []) {
        const pos = motion.positionOf(ac.hex);
        if (!pos) continue;
        const px = map.project([pos.lon, pos.lat]);
        const d = Math.hypot(px.x - e.point.x, px.y - e.point.y);
        if (d < 30 && d < bestDist) {
          bestDist = d;
          bestHex = ac.hex;
        }
      }
      onClickRef.current?.(bestHex);
    });

    map.on("mousemove", (e) => {
      const motion = motionRef.current;
      let near = false;
      for (const ac of aircraftRef.current ?? []) {
        const pos = motion.positionOf(ac.hex);
        if (!pos) continue;
        const px = map.project([pos.lon, pos.lat]);
        if (Math.hypot(px.x - e.point.x, px.y - e.point.y) < 30) {
          near = true;
          break;
        }
      }
      map.getCanvas().style.cursor = near ? "pointer" : "";
    });

    return () => {
      readyRef.current = false;
      pendingRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // Mount once; later prop changes are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Run `fn` against the map once our sources and layers exist.
   *
   * `isStyleLoaded()` goes false whenever tiles are streaming, and
   * `map.once("load")` never fires again once load has happened - combining
   * them silently drops updates. So we track readiness ourselves and hold a
   * queue for anything that arrives early.
   */
  const whenReady = (fn: (m: maplibregl.Map) => void) => {
    const map = mapRef.current;
    if (!map) return;
    if (readyRef.current) fn(map);
    else pendingRef.current.push(fn);
  };

  // Re-centre when the location or scope changes, or on explicit request.
  // A selected flight with a filed route takes over the view instead: the
  // whole point of picking a flight is seeing where it came from and where
  // it's going, which is usually far outside the local radius.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const sel = selectedAircraft;
    const oFall = lookupAirport(sel?.origin);
    const dFall = lookupAirport(sel?.destination);
    const oLat = sel?.originLat ?? oFall?.[0];
    const oLon = sel?.originLon ?? oFall?.[1];
    const dLat = sel?.destLat ?? dFall?.[0];
    const dLon = sel?.destLon ?? dFall?.[1];

    if (sel && oLat != null && oLon != null && dLat != null && dLon != null) {
      const bounds = new maplibregl.LngLatBounds([oLon, oLat], [oLon, oLat]);
      bounds.extend([dLon, dLat]);
      if (sel.lat != null && sel.lon != null) bounds.extend([sel.lon, sel.lat]);
      map.fitBounds(bounds, {
        padding: { top: 110, bottom: 90, left: 300, right: 320 },
        duration: 1100,
        maxZoom: 9,
      });
      return;
    }

    map.easeTo({
      center: [centerLon, centerLat],
      zoom: zoomFromRadius(radiusMiles),
      duration: 900,
    });
  }, [
    centerLat,
    centerLon,
    radiusMiles,
    centerVersion,
    selectedAircraft?.hex,
    selectedAircraft?.origin,
    selectedAircraft?.destination,
  ]);

  // Range ring + centre marker. Hidden while a route is on screen — at
  // world scale the ring is a meaningless dot around the origin airport.
  useEffect(() => {
    whenReady((map) => {
      const routeMode = routeView(selectedAircraft);
      const vis = routeMode ? "none" : "visible";
      for (const id of ["range-ring-fill", "range-ring-line", "center-pt-ring"]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
      }

      (map.getSource("range-ring") as maplibregl.GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Polygon",
              coordinates: [circlePoints(centerLat, centerLon, radiusMiles, 128)],
            },
          },
        ],
      });
      (map.getSource("center-pt") as maplibregl.GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: [centerLon, centerLat] },
          },
        ],
      });
    });
  }, [
    centerLat,
    centerLon,
    radiusMiles,
    selectedAircraft?.hex,
    selectedAircraft?.origin,
    selectedAircraft?.destination,
  ]);

  // Ground tracks. Hidden in route view: at continental zoom a 50 km track
  // collapses into a spiky blob around each aircraft.
  useEffect(() => {
    whenReady((map) => {
      const src = map.getSource("trails") as maplibregl.GeoJSONSource | undefined;
      if (!src) return;

      if (routeView(selectedAircraft)) {
        src.setData(EMPTY);
        return;
      }

      const features: GeoJSON.Feature[] = [];
      for (const ac of aircraft) {
        const path = trails.get(ac.hex);
        if (!path || path.length < 2) continue;
        features.push({
          type: "Feature",
          properties: {
            color: altitudeColor(ac),
            sel: ac.hex === selectedAircraft?.hex,
          },
          geometry: { type: "LineString", coordinates: path },
        });
      }
      src.setData({ type: "FeatureCollection", features });
    });
  }, [trails, aircraft, selectedAircraft?.hex]);

  // Feed each new snapshot into the motion model and recompute which aircraft
  // are close enough to deserve a label.
  useEffect(() => {
    motionRef.current.update(aircraft, Date.now());

    // Busy airspace turns a full label set into noise, so only the closest
    // few (plus the selection) get named; the rest are glyphs until picked.
    // Mutated in place: the canvas holds this same Set.
    const labelled = labelledRef.current;
    labelled.clear();
    aircraft
      .filter((ac) => ac.lat != null && ac.lon != null)
      .map((ac) => ({ hex: ac.hex, d: distSq(ac.lat!, ac.lon!, centerLat, centerLon) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, LABEL_LIMIT)
      .forEach((e) => labelled.add(e.hex));
    if (selectedAircraft) labelled.add(selectedAircraft.hex);
  }, [aircraft, selectedAircraft?.hex, centerLat, centerLon]);


  // Route arc + endpoint pins for the selected flight.
  useEffect(() => {
    whenReady((map) => {
      const arc = map.getSource("flight-arc") as maplibregl.GeoJSONSource | undefined;
      const pts = map.getSource("flight-endpoints") as maplibregl.GeoJSONSource | undefined;
      if (!arc || !pts) return;

      const sel = selectedAircraft;
      const oFall = lookupAirport(sel?.origin);
      const dFall = lookupAirport(sel?.destination);
      const oLat = sel?.originLat ?? oFall?.[0];
      const oLon = sel?.originLon ?? oFall?.[1];
      const dLat = sel?.destLat ?? dFall?.[0];
      const dLon = sel?.destLon ?? dFall?.[1];

      if (!sel || oLat == null || oLon == null || dLat == null || dLon == null) {
        arc.setData(EMPTY);
        pts.setData(EMPTY);
        return;
      }

      arc.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: greatCirclePoints(
                oLat,
                oLon,
                dLat,
                dLon,
                128,
                bowForDistance(greatCircleKm(oLat, oLon, dLat, dLon)),
              ),
            },
          },
        ],
      });

      pts.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              kind: "origin",
              code: sel.origin ?? "",
              city: sel.originName ?? "",
            },
            geometry: { type: "Point", coordinates: [oLon, oLat] },
          },
          {
            type: "Feature",
            properties: {
              kind: "dest",
              code: sel.destination ?? "",
              city: sel.destName ?? "",
            },
            geometry: { type: "Point", coordinates: [dLon, dLat] },
          },
        ],
      });
    });
  }, [
    selectedAircraft?.hex,
    selectedAircraft?.originLat,
    selectedAircraft?.destLat,
    selectedAircraft?.origin,
    selectedAircraft?.destination,
  ]);

  return <div ref={containerRef} className="geomap-layer" />;
}

/* ---------------- helpers ---------------- */

function altitudeColor(ac: Aircraft): string {
  if (ac.onGround) return GROUND_COLOR;
  const alt = ac.altBaro ?? ac.altGeom;
  if (alt == null) return "#ffaa3d";
  let color = ALT_COLORS[0][1];
  for (const [floor, c] of ALT_COLORS) {
    if (alt >= floor) color = c;
  }
  return color;
}

/**
 * True when a selected flight has both endpoints resolvable, meaning the map
 * is showing its whole route rather than the local radius. Several layers key
 * off this: the range ring and ground tracks are meaningless at that scale.
 */
function routeView(sel: Aircraft | null): boolean {
  if (!sel) return false;
  const hasOrigin = sel.originLat != null || lookupAirport(sel.origin) != null;
  const hasDest = sel.destLat != null || lookupAirport(sel.destination) != null;
  return hasOrigin && hasDest;
}

/** Nose-up aircraft silhouette in a fixed colour, with a dark outline so it
 *  reads against both land and water. */
function buildPlaneIcon(size: number, color: string): ImageData {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const s = size / 34;

  ctx.translate(size / 2, size / 2);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, -13); // nose
  ctx.lineTo(2.2, -6);
  ctx.lineTo(2.2, -1.5);
  ctx.lineTo(13, 4); // starboard wing
  ctx.lineTo(13, 6.4);
  ctx.lineTo(2.2, 4.2);
  ctx.lineTo(2.2, 9);
  ctx.lineTo(5.2, 11.6); // starboard tailplane
  ctx.lineTo(5.2, 13);
  ctx.lineTo(0, 11.4);
  ctx.lineTo(-5.2, 13);
  ctx.lineTo(-5.2, 11.6);
  ctx.lineTo(-2.2, 9);
  ctx.lineTo(-2.2, 4.2);
  ctx.lineTo(-13, 6.4);
  ctx.lineTo(-13, 4);
  ctx.lineTo(-2.2, -1.5);
  ctx.lineTo(-2.2, -6);
  ctx.closePath();

  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
  ctx.lineWidth = 2.2;
  ctx.lineJoin = "round";
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.fill();

  return ctx.getImageData(0, 0, size, size);
}

function zoomFromRadius(radiusMiles: number): number {
  if (radiusMiles <= 3) return 12.5;
  if (radiusMiles <= 5) return 11.5;
  if (radiusMiles <= 10) return 10.5;
  if (radiusMiles <= 25) return 9.3;
  if (radiusMiles <= 50) return 8.4;
  if (radiusMiles <= 100) return 7.4;
  if (radiusMiles <= 200) return 6.4;
  if (radiusMiles <= 400) return 5.4;
  if (radiusMiles <= 800) return 4.4;
  return 3.4;
}

