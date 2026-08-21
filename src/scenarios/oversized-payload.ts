import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { Finding } from "../types.js";
import { listToolSnapshots } from "../client.js";

export const SCENARIO_NAME = "oversized-payload";

const DEFAULT_PAYLOAD_BYTES = 1_000_000; // 1MB — enough to test bounding without being a real DoS attempt
const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Sends an oversized string argument to a tool the server itself has
 * annotated `readOnlyHint: true`, and checks whether the server bounds or
 * rejects it rather than hanging or crashing. An unbounded-argument-size
 * gap on a "safe" read tool is still a real resource-exhaustion risk — a
 * caller doesn't need write access to burn CPU/memory if the read path
 * accepts arbitrarily large input unbounded.
 *
 * This is opt-in and, deliberately, only ever targets tools the server has
 * self-declared read-only. It never calls a destructive or unannotated
 * tool, and never runs unless the caller explicitly asks for it — this
 * scenario invokes the target's tools for real, unlike the other two,
 * which only list tools. Only run this against a system you are
 * authorized to test.
 */
export async function runOversizedPayload(
  client: Client,
  opts: { payloadBytes?: number; timeoutMs?: number } = {},
): Promise<Finding[]> {
  const payloadBytes = opts.payloadBytes ?? DEFAULT_PAYLOAD_BYTES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const tools = await listToolSnapshots(client);
  const readOnlyTools = tools.filter((t) => t.annotations?.readOnlyHint === true);
  const findings: Finding[] = [];

  for (const tool of readOnlyTools) {
    const argName = firstStringArgName(tool.inputSchema);
    if (!argName) continue; // no string field to probe on this tool's schema

    const oversized = "A".repeat(payloadBytes);
    const start = Date.now();
    try {
      await client.callTool(
        { name: tool.name, arguments: { [argName]: oversized } },
        undefined,
        { timeout: timeoutMs },
      );
      // Server accepted and returned within the timeout — not itself a
      // finding; a bounded server can legitimately still answer a large
      // read. Absence of a crash/hang is the pass case here.
    } catch (err) {
      const elapsed = Date.now() - start;
      const isTimeout = err instanceof McpError && err.code === ErrorCode.RequestTimeout;
      if (isTimeout) {
        findings.push({
          scenario: SCENARIO_NAME,
          severity: "medium",
          tool: tool.name,
          message: `Tool did not respond within ${timeoutMs}ms to a ${payloadBytes}-byte argument on '${argName}' — no argument-size bound observed before the timeout`,
          detail: `elapsed: ${elapsed}ms`,
        });
      }
      // A clean rejection (server-side validation error) before the
      // timeout is the server correctly bounding input — not a finding.
    }
  }

  return findings;
}

/** Finds the first top-level string-typed property name in a JSON Schema object, if any. */
function firstStringArgName(inputSchema: unknown): string | undefined {
  if (
    typeof inputSchema !== "object" ||
    inputSchema === null ||
    !("properties" in inputSchema)
  ) {
    return undefined;
  }
  const properties = (inputSchema as { properties?: unknown }).properties;
  if (typeof properties !== "object" || properties === null) return undefined;

  for (const [name, schema] of Object.entries(properties as Record<string, unknown>)) {
    if (
      typeof schema === "object" &&
      schema !== null &&
      (schema as { type?: unknown }).type === "string"
    ) {
      return name;
    }
  }
  return undefined;
}
