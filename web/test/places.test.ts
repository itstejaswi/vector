import { describe, expect, it } from "vitest";
import { formatCoords, parseCoords } from "../src/lib/places.js";

describe("parseCoords", () => {
  it("reads a comma-separated pair", () => {
    expect(parseCoords("12.9613, 74.89")).toEqual({ lat: 12.9613, lon: 74.89 });
  });

  it("reads a space-separated pair", () => {
    expect(parseCoords("40.6398 -73.7789")).toEqual({ lat: 40.6398, lon: -73.7789 });
  });

  it("applies hemisphere letters", () => {
    expect(parseCoords("33.94S 151.17E")).toEqual({ lat: -33.94, lon: 151.17 });
    expect(parseCoords("51.47N 0.45W")).toEqual({ lat: 51.47, lon: -0.45 });
  });

  it("tolerates surrounding whitespace and degree signs", () => {
    expect(parseCoords("  19.0887, 72.8679  ")).toEqual({ lat: 19.0887, lon: 72.8679 });
  });

  it("rejects out-of-range values", () => {
    expect(parseCoords("91, 0")).toBeNull();
    expect(parseCoords("0, 181")).toBeNull();
  });

  it("rejects non-coordinate input", () => {
    expect(parseCoords("Mangaluru")).toBeNull();
    expect(parseCoords("IXE")).toBeNull();
    expect(parseCoords("")).toBeNull();
  });
});

describe("formatCoords", () => {
  it("labels each hemisphere", () => {
    expect(formatCoords(12.9613, 74.89)).toContain("N");
    expect(formatCoords(12.9613, 74.89)).toContain("E");
    expect(formatCoords(-33.9461, -70.1)).toContain("S");
    expect(formatCoords(-33.9461, -70.1)).toContain("W");
  });

  it("shows four decimal places", () => {
    expect(formatCoords(12.9613, 74.89)).toContain("12.9613");
    expect(formatCoords(12.9613, 74.89)).toContain("74.8900");
  });
});
