import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, mergeConfig } from "../src/config.js";

describe("mergeConfig", () => {
  it("applies top-level values", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { radiusMiles: 42 });
    expect(merged.radiusMiles).toBe(42);
    expect(merged.centerLat).toBe(DEFAULT_CONFIG.centerLat);
  });

  it("moves the centre and its name together", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, {
      centerLat: 51.47,
      centerLon: -0.4543,
      locationName: "London (LHR)",
    });
    expect(merged.centerLat).toBe(51.47);
    expect(merged.centerLon).toBe(-0.4543);
    expect(merged.locationName).toBe("London (LHR)");
  });

  it("leaves the base untouched", () => {
    const before = DEFAULT_CONFIG.radiusMiles;
    mergeConfig(DEFAULT_CONFIG, { radiusMiles: 99 });
    expect(DEFAULT_CONFIG.radiusMiles).toBe(before);
  });

  it("survives an empty patch", () => {
    expect(mergeConfig(DEFAULT_CONFIG, {})).toEqual(DEFAULT_CONFIG);
  });

  it("replaces a non-string location name", () => {
    const merged = mergeConfig(DEFAULT_CONFIG, {
      locationName: undefined as never,
    });
    expect(typeof merged.locationName).toBe("string");
  });
});
