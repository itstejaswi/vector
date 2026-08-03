import { describe, expect, it } from "vitest";
import { cleanCallsign, cleanTypeName } from "../src/lib/skyfeed.js";

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
