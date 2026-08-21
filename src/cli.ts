#!/usr/bin/env node
import { runAgainstTarget, type Target } from "./runner.js";
import { formatConsole, formatJson, hasHighSeverityFinding } from "./report.js";

function printUsage(): void {
  console.error(
    [
      "Usage:",
      "  mcp-redteam scan [--json] [--allow-tool-calls] -- <command> [args...]",
      "  mcp-redteam scan [--json] [--allow-tool-calls] --url <http-url> [--header \"Name: Value\"]...",
      "",
      "Runs adversarial scenarios against a target MCP server, over stdio or",
      "Streamable HTTP.",
      "",
      "  --json               Print machine-readable JSON instead of a console report.",
      "  --allow-tool-calls   Also run the oversized-payload scenario, which invokes",
      "                       the target's read-only-annotated tools for real. Only",
      "                       use this against a system you are authorized to test.",
      "  --url <url>          Target an HTTP(S) MCP server instead of spawning one",
      "                       over stdio. Also runs unauthenticated-tool-exposure and",
      "                       token-audience-validation, each of which makes its own",
      "                       independent connection attempt to the same URL",
      "                       regardless of --header.",
      "  --header \"K: V\"      Header to send on the primary HTTP connection (used by",
      "                       the non-independent scenarios). Repeatable.",
      "",
      "Examples:",
      "  mcp-redteam scan -- node ./my-server.js",
      "  mcp-redteam scan --url http://localhost:3001/mcp --header \"Authorization: Bearer sk-...\"",
    ].join("\n"),
  );
}

function parseHttpTarget(flags: string[]): Target | undefined {
  const urlIndex = flags.indexOf("--url");
  if (urlIndex === -1) return undefined;
  const url = flags[urlIndex + 1];
  if (!url) return undefined;

  const headers: Record<string, string> = {};
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] !== "--header") continue;
    const raw = flags[i + 1];
    if (!raw) continue;
    const colon = raw.indexOf(":");
    if (colon === -1) continue;
    headers[raw.slice(0, colon).trim()] = raw.slice(colon + 1).trim();
  }

  return { kind: "http", url, headers };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] !== "scan") {
    printUsage();
    process.exit(1);
    return;
  }

  const rest = args.slice(1);
  const dashDashIndex = rest.indexOf("--");
  const flags = dashDashIndex === -1 ? rest : rest.slice(0, dashDashIndex);

  const asJson = flags.includes("--json");
  const allowToolCalls = flags.includes("--allow-tool-calls");

  let target = parseHttpTarget(flags);
  if (!target) {
    if (dashDashIndex === -1) {
      printUsage();
      process.exit(1);
      return;
    }
    const targetCommand = rest.slice(dashDashIndex + 1);
    if (targetCommand.length === 0) {
      printUsage();
      process.exit(1);
      return;
    }
    const [command, ...targetArgs] = targetCommand;
    target = { kind: "stdio", command: command!, args: targetArgs };
  }

  const results = await runAgainstTarget(target, { allowToolCalls });

  console.log(asJson ? formatJson(results) : formatConsole(results));
  process.exit(hasHighSeverityFinding(results) ? 1 : 0);
}

main().catch((err) => {
  console.error("mcp-redteam: fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
