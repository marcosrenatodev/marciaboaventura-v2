import { describe, expect, it } from "vitest";
import { djenExternalProviderEnabled, djenGate } from "./djen-gate";

describe("DJEN provider gate", () => {
  it("requires both the feature switch and a manual schema verification for real requests", () => {
    expect(djenExternalProviderEnabled("false", "true")).toBe(false);
    expect(djenExternalProviderEnabled("true", undefined)).toBe(false);
    expect(djenExternalProviderEnabled("true", "false")).toBe(false);
    expect(djenExternalProviderEnabled("true", "true")).toBe(true);
  });

  it("blocks external requests while the OpenAPI contract is unverified", () => {
    expect(djenGate({ enabled: "true", schemaVerified: "false", testFixtures: "false", requestHostname: "127.0.0.1" }))
      .toBe("schema_unverified");
  });

  it("keeps synthetic fixtures loopback-only and independent of the external schema gate", () => {
    expect(djenGate({ enabled: "true", schemaVerified: "false", testFixtures: "true", requestHostname: "localhost" }))
      .toBe("ready");
    expect(djenGate({ enabled: "true", schemaVerified: "true", testFixtures: "true", requestHostname: "example.com" }))
      .toBe("fixture_not_local");
  });

  it("leaves the provider disabled unless explicitly enabled", () => {
    expect(djenGate({ enabled: undefined, schemaVerified: "true", testFixtures: "false", requestHostname: "127.0.0.1" }))
      .toBe("disabled");
  });
});
