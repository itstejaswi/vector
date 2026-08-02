import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  MAX_RADIUS_MILES,
  MIN_RADIUS_MILES,
  kmToMiles,
  mergeConfig,
  milesToKm,
  sanitizeConfig,
} from "../src/config.js";

describe("radius guard rails", () => {
  it("caps the radius at 200 km", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { radiusMiles: 5000 });
    expect(merged.radiusMiles).toBeCloseTo(MAX_RADIUS_MILES, 3);
    expect(milesToKm(merged.radiusMiles)).toBeCloseTo(200, 1);
  });

  it("enforces the lower bound", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { radiusMiles: 0.01 });
    expect(merged.radiusMiles).toBeCloseTo(MIN_RADIUS_MILES, 3);
  });

  it("leaves an in-range radius alone", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { radiusMiles: 50 });
    expect(merged.radiusMiles).toBe(50);
  });

  it("keeps the default inside the cap", () => {
    expect(DEFAULT_CONFIG.radiusMiles).toBeLessThanOrEqual(MAX_RADIUS_MILES);
    expect(DEFAULT_CONFIG.radiusMiles).toBeGreaterThanOrEqual(MIN_RADIUS_MILES);
  });
});

describe("coordinate guard rails", () => {
  it("clamps latitude to the poles", () => {
    expect(mergeConfig(DEFAULT_CONFIG, { centerLat: 130 }).centerLat).toBe(90);
    expect(mergeConfig(DEFAULT_CONFIG, { centerLat: -130 }).centerLat).toBe(-90);
  });

  it("wraps longitude rather than clamping it", () => {
    expect(mergeConfig(DEFAULT_CONFIG, { centerLon: 200 }).centerLon).toBe(-160);
    expect(mergeConfig(DEFAULT_CONFIG, { centerLon: -200 }).centerLon).toBe(160);
  });

  it("falls back to defaults for non-finite values", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, {
      centerLat: NaN,
      centerLon: Infinity,
    });
    expect(merged.centerLat).toBe(DEFAULT_CONFIG.centerLat);
    expect(merged.centerLon).toBe(DEFAULT_CONFIG.centerLon);
  });

  it("repairs a corrupt persisted config", () => {
    const corrupt = {
      ...DEFAULT_CONFIG,
      centerLat: 999,
      centerLon: NaN,
      radiusMiles: -4,
    };
    const fixed = sanitizeConfig(corrupt);
    expect(fixed.centerLat).toBe(90);
    expect(fixed.centerLon).toBe(DEFAULT_CONFIG.centerLon);
    expect(fixed.radiusMiles).toBeCloseTo(MIN_RADIUS_MILES, 3);
  });
});

describe("unit conversion", () => {
  it("round-trips miles and kilometres", () => {
    expect(kmToMiles(milesToKm(42))).toBeCloseTo(42, 6);
  });

  it("uses the international mile", () => {
    expect(milesToKm(1)).toBeCloseTo(1.609344, 6);
  });
});
