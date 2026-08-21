---
name: mcp-redteam
version: 0.1.0
description: Runs adversarial scenarios against a live MCP server (tool description "rug pulls", unannotated destructive tools, oversized-payload handling) and reports real findings, not simulated ones.
author: Ahmed Hassan
tags: [mcp, model-context-protocol, security, red-team, agentic-ai]
agents: [claude-code, codex-cli, cursor]
---

# mcp-redteam

Use this skill when the user wants to check whether an MCP server they're
running or connecting to is safe to trust — before wiring it into an agent,
or as part of reviewing someone else's server.

## When to use it

- The user asks to "red team," "audit," or "check the security of" an MCP
  server.
- The user is about to connect an agent to a third-party or newly-written
  MCP server and wants a sanity check first.
- The user mentions MCP tool poisoning, "rug pull" tools, or unannotated
  destructive tools.

## What it actually checks

1. **Tool description/schema stability** — lists the target's tools twice a
   short delay apart and diffs them. A tool that changes what it does after
   being inspected once is a documented real attack pattern.
2. **Unannotated destructive tools** — flags tools whose name/description
   reads as destructive (delete, drop, transfer, execute, ...) but carry no
   `destructiveHint` annotation, so a policy/gateway layer has nothing to
   key off of.
3. **Oversized-payload handling** (opt-in only) — sends a large argument to
   a tool the server itself declared `readOnlyHint: true`, and checks
   whether it's bounded rather than hanging. This one calls the target's
   tools for real; only run it against a system you're authorized to test.

## How to run it

```bash
npx mcp-redteam scan -- <command to start the target MCP server>
# e.g.
npx mcp-redteam scan -- node ./my-server.js
npx mcp-redteam scan -- npx -y @modelcontextprotocol/server-everything

# add --allow-tool-calls to also run the invasive oversized-payload scenario
npx mcp-redteam scan --allow-tool-calls -- node ./my-server.js

# --json for machine-readable output
npx mcp-redteam scan --json -- node ./my-server.js
```

Exit code is 1 if any high/critical-severity finding was reported, 0
otherwise — safe to wire into CI.

## Honest scope

This checks 3 specific, real attack classes modeled on disclosed MCP
incidents (CVE-2025-49596, the Invariant Labs GitHub MCP exfiltration
disclosure, and the April 2026 OX Security MCP SDK supply-chain advisory).
It does not check authentication, OAuth token-audience validation, prompt
injection, or anything not listed above. A clean report means these 3
things weren't found — it is not a certification that the server is safe.
