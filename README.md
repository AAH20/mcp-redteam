# mcp-redteam

**Adversarial scenario runner for MCP servers — real checks against a live server, not a static scan of source code.**

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

---

## What this is

`mcp-redteam` connects to a live MCP server over stdio and runs three
scenarios modeled on real, disclosed MCP incidents:

1. **`tool-description-stability`** — lists the target's tools twice, a
   short delay apart, and diffs them by name. A tool whose description or
   input schema changes after it's already been inspected/approved is a
   documented real attack pattern ("rug pull") — this doesn't prove
   malice (a legitimately hot-reloading server will also trigger it), but
   it's worth a human look every time it fires.
2. **`unannotated-destructive-tools`** — flags tools whose name or
   description reads as destructive (`delete`, `drop`, `transfer`,
   `execute`, ...) but carry no `destructiveHint` annotation at all. MCP's
   tool annotations exist so a policy/gateway layer can make decisions
   without parsing English; a destructive-sounding tool with no hint gives
   that layer nothing to key off of.
3. **`oversized-payload`** *(opt-in via `--allow-tool-calls`)* — sends a
   large string argument to a tool the server itself declared
   `readOnlyHint: true`, and checks whether the server bounds it (clean
   rejection) or hangs past a timeout (no bound observed). This is the one
   scenario that actually invokes the target's tools — never run it
   against a system you aren't authorized to test.

## What this is not

- **Not a static scanner.** It doesn't read source code; it drives the
  real MCP protocol against a running server, the same way an agent would.
- **Not authentication or OAuth testing.** It doesn't validate token
  audiences, test confused-deputy credential forwarding, or check auth at
  all in this version — that's a real, separate, harder-to-safely-automate
  problem, deliberately out of scope for v0.1.
- **Not prompt-injection testing.** Out of scope; existing tools (garak,
  PyRIT, promptfoo) already cover that surface well.
- **Not a certification.** A clean report means these 3 specific things
  weren't found on this run — nothing more.

## Install

```bash
npx mcp-redteam scan -- <command to start the target server>
```

Or install locally:

```bash
git clone https://github.com/AAH20/mcp-redteam.git
cd mcp-redteam
npm install && npm run build
node dist/src/cli.js scan -- <command to start the target server>
```

## Usage

```bash
# Against your own server
mcp-redteam scan -- node ./my-server.js

# Against a real published server (tested during development)
mcp-redteam scan -- npx -y @modelcontextprotocol/server-everything

# Also run the invasive oversized-payload scenario
mcp-redteam scan --allow-tool-calls -- node ./my-server.js

# Machine-readable output, e.g. for CI
mcp-redteam scan --json -- node ./my-server.js
```

Exit code is `1` if any high/critical-severity finding was reported, `0`
otherwise.

## Why these three, specifically

Each scenario traces to a real, disclosed incident, not a hypothetical:

- **Rug-pull tools**: the general pattern behind documented MCP "tool
  poisoning" research (a tool that behaves differently once trusted).
- **Unannotated destructive tools**: the MCP spec added tool annotations
  (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`)
  specifically so gateways don't have to guess from English — a tool
  that skips them is a gap real MCP gateways (e.g. IBM's `mcp-context-forge`)
  are built to close.
- **Oversized payloads**: a version of the "unbounded work from MCP
  arguments" gap independently flagged by an automated reviewer on a real,
  in-progress litellm PR (`BerriAI/litellm#35142`) adding MCP guardrails —
  confirmed as a real, currently-open concern in production MCP tooling,
  not invented for this project.

## Tested against a real server, not just fixtures

Development caught one real false-positive: `unannotated-destructive-tools`
initially matched the substring `"format"` inside `"information"` when run
against the official `@modelcontextprotocol/server-everything` reference
server — fixed with word-boundary matching, with a regression test for it.
A second real bug — an explicit `destructiveHint: false` being treated the
same as "no annotation at all" — was found and fixed the same way.

## Tests

```bash
npm test
```

8/8 pass, exercising both the positive and negative case for each
scenario against a real MCP server (built for the test suite using the
official `@modelcontextprotocol/sdk`), plus the default-vs-opt-in scenario
selection in the runner itself.

## Architecture

```
mcp-redteam/
├── src/
│   ├── client.ts               # connects to a target MCP server over stdio
│   ├── runner.ts                # orchestrates scenarios, collects results
│   ├── report.ts                # console/JSON formatting
│   ├── cli.ts                   # mcp-redteam scan ...
│   └── scenarios/
│       ├── tool-description-stability.ts
│       ├── unannotated-destructive-tools.ts
│       └── oversized-payload.ts
└── tests/
    ├── fixtures/fixture-server.ts   # real MCP server, mode-switched for each scenario
    └── *.test.ts
```

## Roadmap

Not shipped in v0.1, deliberately: OAuth token-audience / confused-deputy
validation, cross-session tool-scope isolation, and HTTP/SSE transport
support (stdio only for now). These need more careful safety design before
being invasive-by-default the way `oversized-payload` already is opt-in.

## License

Apache-2.0

## Author

**Ahmed Hassan**
* LinkedIn: [Ahmed Hassan](https://eg.linkedin.com/in/ahmed-hassan-f11)
* Platform: [A2Z SOC](https://a2zsoc.com)
