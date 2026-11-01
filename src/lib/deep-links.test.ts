import { describe, expect, it } from "vitest";
import { buildFlightLinks, type FlightQuery } from "./deep-links";

const base: FlightQuery = {
  originIata: "CNF",
  destinationIata: "SSA",
  departDate: "2027-07-10",
  returnDate: "2027-07-15",
  tripType: "round",
  passengers: 2,
  cabin: "economy",
};

function googleFlights(q: FlightQuery): string {
  const link = buildFlightLinks(q).find((l) => l.id === "google-flights");
  if (!link) throw new Error("Google Flights ausente");
  return link.url;
}

describe("Google Flights", () => {
  it("ida e volta leva os dois trechos e não marca só ida", () => {
    const url = googleFlights(base);
    expect(url).toContain("#flt=CNF.SSA.2027-07-10*SSA.CNF.2027-07-15");
    expect(url).not.toContain("tt:o");
  });

  it("só ida marca tt:o e não leva a volta", () => {
    const url = googleFlights({ ...base, tripType: "oneway" });
    expect(url).toContain("#flt=CNF.SSA.2027-07-10;tt:o");
    expect(url).not.toContain("SSA.CNF");
  });

  it("ida e volta sem data de volta vira só ida", () => {
    expect(googleFlights({ ...base, returnDate: undefined })).toContain(";tt:o");
  });
});
