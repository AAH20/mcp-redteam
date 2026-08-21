#!/usr/bin/env node
import { runAgainstTarget } from "./runner.js";
import { formatConsole, formatJson, hasHighSeverityFinding } from "./report.js";

function printUsage(): void {
  console.error(
    [
      "Usage: mcp-redteam scan [--json] [--allow-tool-calls] -- <command> [args...]",
      "",
      "Runs adversarial scenarios against a target MCP server over stdio.",
      "",
      "  --json               Print machine-readable JSON instead of a console report.",
      "  --allow-tool-calls   Also run the oversized-payload scenario, which invokes",
      "                       the target's read-only-annotated tools for real. Only",
      "                       use this against a system you are authorized to test.",
      "",
      "Example:",
      "  mcp-redteam scan -- node ./my-server.js",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] !== "scan") {
    printUsage();
    process.exit(args.length === 0 ? 1 : 1);
  }

  const rest = args.slice(1);
  const dashDashIndex = rest.indexOf("--");
  if (dashDashIndex === -1) {
    printUsage();
    process.exit(1);
    return;
  }

  const flags = rest.slice(0, dashDashIndex);
  const targetCommand = rest.slice(dashDashIndex + 1);
  if (targetCommand.length === 0) {
    printUsage();
    process.exit(1);
    return;
  }

  const asJson = flags.includes("--json");
  const allowToolCalls = flags.includes("--allow-tool-calls");

  const [command, ...targetArgs] = targetCommand;
  const results = await runAgainstTarget(
    { command: command!, args: targetArgs },
    { allowToolCalls },
  );

  console.log(asJson ? formatJson(results) : formatConsole(results));
  process.exit(hasHighSeverityFinding(results) ? 1 : 0);
}

main().catch((err) => {
  console.error("mcp-redteam: fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
