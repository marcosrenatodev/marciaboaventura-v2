const localFixtureHosts = new Set(["127.0.0.1", "localhost", "10.0.2.2"]);

export type DjenGateResult = "disabled" | "fixture_not_local" | "schema_unverified" | "ready";

export function djenGate(input: {
  enabled: string | undefined;
  schemaVerified: string | undefined;
  testFixtures: string | undefined;
  requestHostname: string;
}): DjenGateResult {
  if (input.enabled !== "true") return "disabled";
  if (input.testFixtures === "true") {
    return localFixtureHosts.has(input.requestHostname) ? "ready" : "fixture_not_local";
  }
  return input.schemaVerified === "true" ? "ready" : "schema_unverified";
}

export function djenExternalProviderEnabled(enabled: string | undefined, schemaVerified: string | undefined): boolean {
  return enabled === "true" && schemaVerified === "true";
}
