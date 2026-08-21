import type { Finding } from "../types.js";
import { connectToHttpTarget } from "../http-client.js";

export const SCENARIO_NAME = "unauthenticated-tool-exposure";

/**
 * Modeled on RufRoot (CVE-2026-59726): Ruflo's MCP bridge exposed 233 tools
 * over HTTP with zero authentication, giving full command execution from a
 * single unauthenticated request. This scenario makes an independent
 * connection attempt to the target with no credentials at all and checks
 * whether the server responds to tools/list anyway.
 *
 * Only meaningful for HTTP(S) targets — stdio has no authentication
 * boundary to test in the first place, since the client that spawns the
 * process already has full local access by construction.
 *
 * This is read-only: it lists tools, it never calls one. Listing alone is
 * sufficient to demonstrate the server accepted an unauthenticated
 * request; invoking a tool would add real side-effect risk for no
 * additional evidence value.
 */
export async function runUnauthenticatedToolExposure(url: string): Promise<Finding[]> {
  let client;
  let disconnect: (() => Promise<void>) | undefined;
  try {
    ({ client, disconnect } = await connectToHttpTarget(url, { headers: {} }));
  } catch {
    // Connection or the initial handshake itself was rejected without
    // credentials — that's the pass case, not a finding.
    return [];
  }

  try {
    const result = await client.listTools();
    return [
      {
        scenario: SCENARIO_NAME,
        severity: "critical",
        message: `Server accepted an unauthenticated connection and returned ${result.tools.length} tool(s) from tools/list with no credentials presented`,
        detail: `tools: ${result.tools.map((t) => t.name).join(", ")}`,
      },
    ];
  } catch {
    // Handshake succeeded but tools/list was rejected — server enforces
    // authorization past the connection itself. Not a finding.
    return [];
  } finally {
    await disconnect();
  }
}
