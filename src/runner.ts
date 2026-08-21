import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { ScenarioResult } from "./types.js";
import { connectToTarget, type TargetServerParams } from "./client.js";
import { runToolDescriptionStability, SCENARIO_NAME as STABILITY_NAME } from "./scenarios/tool-description-stability.js";
import { runUnannotatedDestructiveTools, SCENARIO_NAME as DESTRUCTIVE_NAME } from "./scenarios/unannotated-destructive-tools.js";
import { runOversizedPayload, SCENARIO_NAME as PAYLOAD_NAME } from "./scenarios/oversized-payload.js";

export interface RunOptions {
  /** Also run the oversized-payload scenario. Invokes the target's read-only-annotated tools for real. */
  allowToolCalls?: boolean;
}

/**
 * Connects to a target MCP server, runs the default (read-only, non-invasive)
 * scenarios, plus the invasive oversized-payload scenario if explicitly opted
 * into, and returns one result per scenario. A scenario that throws does not
 * abort the run — its failure is recorded and the rest proceed.
 */
export async function runAgainstTarget(
  params: TargetServerParams,
  opts: RunOptions = {},
): Promise<ScenarioResult[]> {
  const { client, disconnect } = await connectToTarget(params);
  try {
    return await runAgainstClient(client, opts);
  } finally {
    await disconnect();
  }
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

async function safeRun(
  scenario: string,
  fn: () => Promise<import("./types.js").Finding[]>,
): Promise<ScenarioResult> {
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
