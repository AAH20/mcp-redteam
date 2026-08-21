/**
 * Builds a syntactically JWT-shaped token with an arbitrary payload and an
 * unsigned/garbage signature segment — deliberately not cryptographically
 * valid. This scenario isn't trying to forge a token a real issuer would
 * sign; it's testing the floor: does the target even look at the token's
 * claims (audience included), or does it just check that some
 * Authorization header is present? A server doing real validation rejects
 * this regardless of the missing signature; a server that doesn't will
 * often accept it anyway.
 */
export function buildUnsignedJwtShapedToken(payload: Record<string, unknown>): string {
  const header = { alg: "none", typ: "JWT" };
  const encode = (obj: unknown): string =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${encode(header)}.${encode(payload)}.`;
}
