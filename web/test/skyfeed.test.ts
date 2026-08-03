import { describe, expect, it } from "vitest";
import { cleanCallsign, cleanTypeName, routeFits } from "../src/lib/skyfeed.js";

const JFK = { lat: 40.6398, lon: -73.7789 };
const IAH = { lat: 29.9844, lon: -95.3414 };
const DOH = { lat: 25.2731, lon: 51.608 };
const LHR = { lat: 51.4706, lon: -0.4619 };

const route = (o: { lat: number; lon: number }, d: { lat: number; lon: number }) => ({
  originLat: o.lat,
  originLon: o.lon,
  destLat: d.lat,
  destLon: d.lon,
});

describe("routeFits", () => {
  it("rejects a route the aircraft cannot possibly be flying", () => {
    // The real case: a Qatar 787 over the Arabian Sea, which adsbdb matched to
    // QTR5B and returned as JFK to Houston. The nearest endpoint was 13,238 km
    // from a route only 2,278 km long.
    expect(routeFits(12.96, 74.89, route(JFK, IAH))).toBe(false);
  });

  it("accepts an aircraft partway along its route", () => {
    // Somewhere over the Atlantic on a Doha to London run.
    expect(routeFits(38, 25, route(DOH, LHR))).toBe(true);
  });

  it("accepts an aircraft sitting at either endpoint", () => {
    expect(routeFits(JFK.lat, JFK.lon, route(JFK, IAH))).toBe(true);
    expect(routeFits(IAH.lat, IAH.lon, route(JFK, IAH))).toBe(true);
  });

  it("allows a generous diversion rather than discarding it", () => {
    // ~700 km off the JFK-IAH line: unusual, but a real aircraft could be
    // there, so the route stands.
    expect(routeFits(35, -88, route(JFK, IAH))).toBe(true);
  });

  it("passes anything it cannot verify", () => {
    // No position, or no route endpoints: unverifiable is not wrong.
    expect(routeFits(undefined, undefined, route(JFK, IAH))).toBe(true);
    expect(routeFits(12.96, 74.89, {})).toBe(true);
    expect(routeFits(12.96, 74.89, { originLat: 40, originLon: -73 })).toBe(true);
  });

  it("scales its allowance with the length of the route", () => {
    // A long-haul route tolerates a far larger offset than a short hop, since
    // the aircraft has more places it could legitimately be.
    expect(routeFits(20, 40, route(DOH, LHR))).toBe(true);
    expect(routeFits(20, 40, route(JFK, IAH))).toBe(false);
  });
});

describe("cleanTypeName", () => {
  it("hyphenates a model and its variant", () => {
    expect(cleanTypeName("A320 251N")).toBe("A320-251N");
    expect(cleanTypeName("787 8")).toBe("787-8");
    expect(cleanTypeName("777 36NER")).toBe("777-36NER");
  });

  it("drops sharklet and winglet fitment codes", () => {
    // Real values seen from adsbdb; neither suffix is worth the width.
    expect(cleanTypeName("A320 251NSL")).toBe("A320-251N");
    expect(cleanTypeName("737 36N/W")).toBe("737-36N");
  });

  it("closes up a single-letter sub-model", () => {
    expect(cleanTypeName("208 B")).toBe("208B");
  });

  it("leaves named types alone", () => {
    // These carry a name, not a variant code; hyphenating would be wrong.
    expect(cleanTypeName("PA-28 161 Cadet")).toBe("PA-28 161 Cadet");
    expect(cleanTypeName("182P Skylane")).toBe("182P Skylane");
    expect(cleanTypeName("Europa XS")).toBe("Europa XS");
    expect(cleanTypeName("Twin Star DA42 NG")).toBe("Twin Star DA42 NG");
  });

  it("normalises whitespace", () => {
    expect(cleanTypeName("  A320   251N  ")).toBe("A320-251N");
  });

  it("handles missing and empty input", () => {
    expect(cleanTypeName(undefined)).toBeUndefined();
    expect(cleanTypeName("   ")).toBeUndefined();
  });
});

describe("cleanCallsign", () => {
  it("keeps a normal callsign", () => {
    expect(cleanCallsign("AIC4174")).toBe("AIC4174");
  });

  it("trims padding whitespace", () => {
    expect(cleanCallsign("  UAE9706 ")).toBe("UAE9706");
  });

  it("uppercases", () => {
    expect(cleanCallsign("baw921")).toBe("BAW921");
  });

  it("strips decoder fill characters", () => {
    // Upstream decoders emit '@' and '_' where a character could not be read.
    expect(cleanCallsign("IGO5234@")).toBe("IGO5234");
    expect(cleanCallsign("BAW_921_")).toBe("BAW921");
  });

  it("discards an entirely garbled callsign", () => {
    expect(cleanCallsign("@@@@@@@@")).toBeUndefined();
    expect(cleanCallsign("________")).toBeUndefined();
  });

  it("discards anything too short to be real", () => {
    expect(cleanCallsign("A")).toBeUndefined();
    expect(cleanCallsign("   ")).toBeUndefined();
  });

  it("handles missing input", () => {
    expect(cleanCallsign(undefined)).toBeUndefined();
    expect(cleanCallsign("")).toBeUndefined();
  });
});
