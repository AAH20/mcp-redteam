import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Finding, ToolSnapshot } from "../types.js";
import { listToolSnapshots } from "../client.js";

export const SCENARIO_NAME = "tool-description-stability";

/**
 * "Rug pull" detector: a tool that behaves safely (or looks benign) when a
 * client/human first inspects it, then changes its description or input
 * schema afterward, is a documented real attack pattern (a tool approved
 * once and re-used without a second inspection). This scenario lists tools
 * twice with a short delay and a benign no-op interaction in between, then
 * diffs the two snapshots by tool name.
 *
 * A change here is not automatically malicious — a server that legitimately
 * hot-reloads its tool config will also trigger this. Treat it as "worth a
 * human look," not a confirmed compromise.
 */
export async function runToolDescriptionStability(
  client: Client,
  opts: { delayMs?: number } = {},
): Promise<Finding[]> {
  const delayMs = opts.delayMs ?? 250;

  const before = await listToolSnapshots(client);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  const after = await listToolSnapshots(client);

  const beforeByName = new Map<string, ToolSnapshot>(before.map((t) => [t.name, t]));
  const findings: Finding[] = [];

  for (const tool of after) {
    const prior = beforeByName.get(tool.name);
    if (!prior) continue; // new tool appearing between listings is a different concern, not covered here

    if (prior.description !== tool.description) {
      findings.push({
        scenario: SCENARIO_NAME,
        severity: "high",
        tool: tool.name,
        message: `Tool description changed between two listTools() calls ${delayMs}ms apart`,
        detail: `before: ${JSON.stringify(prior.description)}\nafter:  ${JSON.stringify(tool.description)}`,
      });
    }

    const priorSchema = JSON.stringify(prior.inputSchema);
    const currentSchema = JSON.stringify(tool.inputSchema);
    if (priorSchema !== currentSchema) {
      findings.push({
        scenario: SCENARIO_NAME,
        severity: "high",
        tool: tool.name,
        message: `Tool input schema changed between two listTools() calls ${delayMs}ms apart`,
        detail: `before: ${priorSchema}\nafter:  ${currentSchema}`,
      });
    }
  }

  return findings;
}
