import type { Finding } from "../types.js";
import { connectToHttpTarget } from "../http-client.js";
import { buildUnsignedJwtShapedToken } from "../unsigned-jwt.js";

export const SCENARIO_NAME = "token-audience-validation";

/**
 * The MCP authorization spec is explicit: servers MUST validate that an
 * access token was issued specifically for them, via the audience claim
 * (RFC 9068) — forwarding or accepting a token scoped to a different
 * resource is the "confused deputy" pattern the spec calls out by name.
 * That requirement has been in the spec since 2025; this checks whether a
 * live server actually enforces it.
 *
 * This does not forge a token a real issuer would sign — that needs a
 * trusted signing key this scenario has no business having. It presents a
 * syntactically JWT-shaped, unsigned token whose `aud` claim names an
 * unrelated resource, and checks whether the server rejects it or treats
 * it as valid. This tests the floor: does the target look at the token's
 * claims at all, or does it just check that *some* Authorization header
 * is present? A server doing real audience validation rejects this
 * regardless of the missing signature. A server that only checks for
 * header presence will often accept it anyway — that's the finding.
 *
 * Narrower than full RFC 9068 compliance testing: a server that checks
 * the audience claim but not the signature would incorrectly pass this
 * check. It catches the shallower, more common failure mode (no
 * meaningful validation at all), not full protocol conformance.
 */
export async function runTokenAudienceValidation(url: string): Promise<Finding[]> {
  const wrongAudienceToken = buildUnsignedJwtShapedToken({
    iss: "https://unrelated-issuer.example.com",
    sub: "mcp-redteam-probe",
    aud: "https://unrelated-resource.example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  let client;
  let disconnect: (() => Promise<void>) | undefined;
  try {
    ({ client, disconnect } = await connectToHttpTarget(url, {
      headers: { Authorization: `Bearer ${wrongAudienceToken}` },
    }));
  } catch {
    // Connection or handshake itself was rejected — the server didn't
    // accept the wrong-audience token far enough to even establish a
    // session. That's the pass case.
    return [];
  }

  try {
    const result = await client.listTools();
    return [
      {
        scenario: SCENARIO_NAME,
        severity: "critical",
        message: `Server accepted an unsigned, wrong-audience bearer token and returned ${result.tools.length} tool(s) from tools/list`,
        detail: `token payload: aud="https://unrelated-resource.example.com", iss="https://unrelated-issuer.example.com"\ntools: ${result.tools.map((t) => t.name).join(", ")}`,
      },
    ];
  } catch {
    // Handshake succeeded but tools/list was rejected past that point —
    // still not a finding, since the server evidently checks something
    // beyond header presence somewhere in the request path.
    return [];
  } finally {
    await disconnect();
  }
}
