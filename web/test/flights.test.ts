import { describe, expect, it } from "vitest";
import { looksLikeFlight, queryKinds } from "../src/lib/flights.js";

describe("queryKinds", () => {
  it("recognises airline callsigns", () => {
    expect(queryKinds("IGO074")).toContain("callsign");
    expect(queryKinds("BA117")).toContain("callsign");
    expect(queryKinds("UAE504")).toContain("callsign");
  });

  it("is case and whitespace insensitive", () => {
    expect(queryKinds("igo074")).toContain("callsign");
    expect(queryKinds("  IGO 074 ")).toContain("callsign");
  });

  it("recognises registrations", () => {
    expect(queryKinds("VT-IBQ")).toContain("registration");
    expect(queryKinds("G-EUPT")).toContain("registration");
    expect(queryKinds("N12345")).toContain("registration");
  });

  it("recognises ICAO hex codes", () => {
    expect(queryKinds("8015CB")).toContain("hex");
    expect(queryKinds("4b1806")).toContain("hex");
  });

  it("classifies a single-letter prefix as a registration, not a callsign", () => {
    // Airline callsigns carry 2-3 letters (BA117, IGO074); US registrations
    // carry one (N12345). The letter count is what separates them.
    expect(queryKinds("N12345")).toEqual(["registration"]);
  });

  it("tries callsign first when a query matches both shapes", () => {
    // "BA1234" is a plausible callsign and a plausible registration. Callsign
    // is the commoner intent, so it should be attempted first.
    const kinds = queryKinds("BA1234");
    expect(kinds[0]).toBe("callsign");
    expect(kinds).toContain("registration");
  });

  it("rejects place names, so they fall through to geocoding", () => {
    expect(queryKinds("Mumbai")).toEqual([]);
    expect(queryKinds("New Delhi")).toEqual([]);
    expect(queryKinds("San Francisco")).toEqual([]);
  });

  it("rejects bare airport codes, which are places not flights", () => {
    // A callsign always carries a digit; IATA codes never do.
    expect(queryKinds("DEL")).toEqual([]);
    expect(queryKinds("BOM")).toEqual([]);
    expect(queryKinds("LHR")).toEqual([]);
  });

  it("rejects coordinates", () => {
    expect(queryKinds("28.6, 77.2")).toEqual([]);
    expect(queryKinds("-33.9461")).toEqual([]);
  });

  it("rejects empty input", () => {
    expect(queryKinds("")).toEqual([]);
    expect(queryKinds("   ")).toEqual([]);
  });
});

describe("looksLikeFlight", () => {
  it("gates the network call to plausible queries only", () => {
    expect(looksLikeFlight("IGO074")).toBe(true);
    expect(looksLikeFlight("VT-IBQ")).toBe(true);
    expect(looksLikeFlight("Mumbai")).toBe(false);
    expect(looksLikeFlight("DEL")).toBe(false);
  });
});
