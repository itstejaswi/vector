import { describe, expect, it } from "vitest";
import {
  bowForDistance,
  distSq,
  formatLatLon,
  greatCircleKm,
  greatCircleMiles,
  greatCirclePoints,
} from "../src/geo.js";

const BOM: [number, number] = [19.0887, 72.8679];
const DEL: [number, number] = [28.5562, 77.1];
const SFO: [number, number] = [37.6213, -122.379];

describe("great-circle distance", () => {
  it("measures Mumbai to Delhi", () => {
    // Published great-circle distance is ~1150 km.
    expect(greatCircleKm(...BOM, ...DEL)).toBeGreaterThan(1100);
    expect(greatCircleKm(...BOM, ...DEL)).toBeLessThan(1200);
  });

  it("agrees between miles and kilometres", () => {
    const km = greatCircleKm(...BOM, ...SFO);
    const mi = greatCircleMiles(...BOM, ...SFO);
    expect(km / mi).toBeCloseTo(1.609, 2);
  });

  it("is zero for identical points", () => {
    expect(greatCircleKm(...BOM, ...BOM)).toBe(0);
  });
});

describe("greatCirclePoints", () => {
  it("starts and ends exactly on the endpoints", () => {
    const pts = greatCirclePoints(...BOM, ...DEL, 32);
    expect(pts[0][0]).toBeCloseTo(BOM[1], 6);
    expect(pts[0][1]).toBeCloseTo(BOM[0], 6);
    expect(pts[pts.length - 1][0]).toBeCloseTo(DEL[1], 6);
    expect(pts[pts.length - 1][1]).toBeCloseTo(DEL[0], 6);
  });

  it("returns steps + 1 points", () => {
    expect(greatCirclePoints(...BOM, ...DEL, 32)).toHaveLength(33);
  });

  it("keeps the endpoints fixed even when bowed", () => {
    const pts = greatCirclePoints(...BOM, ...DEL, 32, 0.2);
    expect(pts[0][1]).toBeCloseTo(BOM[0], 6);
    expect(pts[pts.length - 1][1]).toBeCloseTo(DEL[0], 6);
  });

  it("pushes the midpoint off the direct line when bowed", () => {
    const straight = greatCirclePoints(...BOM, ...DEL, 32);
    const bowed = greatCirclePoints(...BOM, ...DEL, 32, 0.2);
    const mid = 16;
    const offset = Math.hypot(
      bowed[mid][0] - straight[mid][0],
      bowed[mid][1] - straight[mid][1],
    );
    expect(offset).toBeGreaterThan(0.3);
  });

  it("degrades to a two-point line for coincident endpoints", () => {
    expect(greatCirclePoints(...BOM, ...BOM, 32)).toHaveLength(2);
  });
});

describe("bowForDistance", () => {
  it("bows short hops the most", () => {
    expect(bowForDistance(300)).toBeGreaterThan(bowForDistance(2000));
  });

  it("leaves long-haul routes alone", () => {
    expect(bowForDistance(12000)).toBe(0);
    expect(bowForDistance(4000)).toBe(0);
  });

  it("never returns a negative bow", () => {
    for (const km of [0, 1, 500, 3999, 4000, 20000]) {
      expect(bowForDistance(km)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("distSq", () => {
  it("ranks a nearer point below a farther one", () => {
    const near = distSq(19.1, 72.9, ...BOM);
    const far = distSq(28.5, 77.1, ...BOM);
    expect(near).toBeLessThan(far);
  });

  it("is zero at the reference point", () => {
    expect(distSq(...BOM, ...BOM)).toBe(0);
  });
});

describe("formatLatLon", () => {
  it("labels each hemisphere", () => {
    expect(formatLatLon(19.0887, 72.8679)).toBe("19.0887°N 72.8679°E");
    expect(formatLatLon(-33.9461, -70.1)).toBe("33.9461°S 70.1000°W");
  });
});
