import { describe, expect, it } from "vitest";
import { cleanCallsign } from "../src/lib/skyfeed.js";

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
    // readsb/dump1090 emit '@' and '_' where a character could not be decoded.
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
