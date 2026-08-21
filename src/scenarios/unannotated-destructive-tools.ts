import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Finding } from "../types.js";
import { listToolSnapshots } from "../client.js";

export const SCENARIO_NAME = "unannotated-destructive-tools";

/**
 * MCP tool annotations (readOnlyHint, destructiveHint, idempotentHint,
 * openWorldHint) exist precisely so a client/gateway can make policy
 * decisions (e.g. "escalate before running anything destructive") without
 * parsing free-text descriptions. A tool whose name or description reads as
 * destructive but has no `destructiveHint` at all (and isn't explicitly
 * `readOnlyHint: true`) gives policy layers nothing to key off of — they
 * either trust a hint that isn't there, or fall back to pattern-matching
 * english, which is exactly the class of gap this checks for. A tool that
 * explicitly declares `destructiveHint: false` is not flagged — whether
 * that claim is *accurate* is a different question this text heuristic
 * can't answer.
 *
 * This is a heuristic on tool name/description text, not proof the tool is
 * actually destructive — false positives on cautious/defensively-named
 * read tools (e.g. "check_delete_eligibility") are possible and expected.
 * Keywords are matched on word boundaries specifically because naive
 * substring matching flags things like "format" inside "information" —
 * caught by running this against a real public MCP server during
 * development (@modelcontextprotocol/server-everything's
 * "simulate-research-query" tool), not a hypothetical.
 */
const DESTRUCTIVE_KEYWORDS = [
  "delete",
  "remove",
  "drop",
  "destroy",
  "wipe",
  "purge",
  "truncate",
  "revoke",
  "terminate",
  "transfer",
  "execute",
  "exec",
  "format",
  "overwrite",
];

const DESTRUCTIVE_KEYWORD_PATTERN = new RegExp(
  `\\b(${DESTRUCTIVE_KEYWORDS.join("|")})\\b`,
  "i",
);

export async function runUnannotatedDestructiveTools(client: Client): Promise<Finding[]> {
  const tools = await listToolSnapshots(client);
  const findings: Finding[] = [];

  for (const tool of tools) {
    const haystack = `${tool.name} ${tool.description ?? ""}`;
    const match = haystack.match(DESTRUCTIVE_KEYWORD_PATTERN);
    if (!match) continue;
    const matched = match[1];

    if (tool.annotations?.readOnlyHint === true) continue; // server explicitly declares this safe
    // Any explicit destructiveHint (true or false) means the server already
    // gave policy layers something to key off of — "unannotated" means
    // absent, not present-and-false. Whether a false claim is *accurate* is
    // a different question this text heuristic can't answer.
    if (tool.annotations?.destructiveHint !== undefined) continue;

    findings.push({
      scenario: SCENARIO_NAME,
      severity: "medium",
      tool: tool.name,
      message: `Tool name/description suggests a destructive action ('${matched}') but has no destructiveHint annotation`,
      detail: `description: ${JSON.stringify(tool.description)}\nannotations: ${JSON.stringify(tool.annotations)}`,
    });
  }

  return findings;
}
