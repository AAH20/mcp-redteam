import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Finding, ScenarioResult } from "./types.js";
import { connectToTarget, type TargetServerParams } from "./client.js";
import { connectToHttpTarget } from "./http-client.js";
import { runToolDescriptionStability, SCENARIO_NAME as STABILITY_NAME } from "./scenarios/tool-description-stability.js";
import { runUnannotatedDestructiveTools, SCENARIO_NAME as DESTRUCTIVE_NAME } from "./scenarios/unannotated-destructive-tools.js";
import { runOversizedPayload, SCENARIO_NAME as PAYLOAD_NAME } from "./scenarios/oversized-payload.js";
import { runUnauthenticatedToolExposure, SCENARIO_NAME as EXPOSURE_NAME } from "./scenarios/unauthenticated-tool-exposure.js";

export type Target =
  | ({ kind: "stdio" } & TargetServerParams)
  | { kind: "http"; url: string; headers?: Record<string, string> };

export interface RunOptions {
  /** Also run the oversized-payload scenario. Invokes the target's read-only-annotated tools for real. */
  allowToolCalls?: boolean;
}

/**
 * Connects to a target MCP server and runs the applicable scenarios,
 * returning one result per scenario. A scenario that throws does not abort
 * the run — its failure is recorded and the rest proceed.
 *
 * unauthenticated-tool-exposure only applies to HTTP targets: it makes its
 * own independent, credential-free connection attempt to the same URL,
 * separate from the (possibly authenticated) connection used for the other
 * scenarios — and runs regardless of whether that primary connection
 * succeeds. If the caller didn't supply working credentials, the primary
 * connection failing is expected, not a reason to also skip the one
 * scenario that doesn't need it (arguably the most relevant result to get
 * in exactly that situation).
 */
export async function runAgainstTarget(
  target: Target,
  opts: RunOptions = {},
): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];

  let primary: { client: Client; disconnect: () => Promise<void> } | undefined;
  try {
    primary =
      target.kind === "stdio"
        ? await connectToTarget(target)
        : await connectToHttpTarget(target.url, { headers: target.headers });
  } catch (err) {
    results.push({
      scenario: "connection",
      findings: [],
      error: `Could not establish the primary connection: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  if (primary) {
    try {
      results.push(...(await runAgainstClient(primary.client, opts)));
    } finally {
      await primary.disconnect();
    }
  }

  if (target.kind === "http") {
    results.push(await safeRun(EXPOSURE_NAME, () => runUnauthenticatedToolExposure(target.url)));
  }

  return results;
}

export async function runAgainstClient(
  client: Client,
  opts: RunOptions = {},
): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];

  results.push(await safeRun(STABILITY_NAME, () => runToolDescriptionStability(client)));
  results.push(await safeRun(DESTRUCTIVE_NAME, () => runUnannotatedDestructiveTools(client)));

  if (opts.allowToolCalls) {
    results.push(await safeRun(PAYLOAD_NAME, () => runOversizedPayload(client)));
  }

  return results;
}

async function safeRun(scenario: string, fn: () => Promise<Finding[]>): Promise<ScenarioResult> {
  try {
    return { scenario, findings: await fn() };
  } catch (err) {
    return {
      scenario,
      findings: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
