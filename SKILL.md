---
name: mcp-redteam
version: 0.3.0
description: Runs adversarial scenarios against a live MCP server — over stdio or HTTP — covering tool description "rug pulls", unannotated destructive tools, oversized-payload handling, unauthenticated tool exposure, and wrong-audience token acceptance. Reports real findings, not simulated ones.
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
- The user mentions MCP tool poisoning, "rug pull" tools, unannotated
  destructive tools, an MCP server reachable without authentication, or
  token/audience validation for MCP.

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
4. **Unauthenticated tool exposure** (HTTP targets only) — makes an
   independent, credential-free connection attempt and checks whether the
   server returns tools anyway. Modeled on RufRoot (CVE-2026-59726, CVSS
   10.0): Ruflo's MCP bridge exposed 233 tools with zero authentication.
5. **Token audience validation** (HTTP targets only) — makes an
   independent connection attempt with a syntactically JWT-shaped, unsigned
   bearer token whose `aud` claim names an unrelated resource, and checks
   whether the server accepts it anyway. Tests whether the target enforces
   the MCP spec's own MUST-validate-audience requirement, or just checks
   that some Authorization header is present.

## How to run it

```bash
npx mcp-redteam scan -- <command to start the target MCP server>
# e.g.
npx mcp-redteam scan -- node ./my-server.js
npx mcp-redteam scan -- npx -y @modelcontextprotocol/server-everything

# add --allow-tool-calls to also run the invasive oversized-payload scenario
npx mcp-redteam scan --allow-tool-calls -- node ./my-server.js

# HTTP target — also runs unauthenticated-tool-exposure and
# token-audience-validation automatically
npx mcp-redteam scan --url http://localhost:3001/mcp
npx mcp-redteam scan --url http://localhost:3001/mcp --header "Authorization: Bearer sk-..."

# --json for machine-readable output
npx mcp-redteam scan --json -- node ./my-server.js
```

Exit code is 1 if any high/critical-severity finding was reported, 0
otherwise — safe to wire into CI.

## Honest scope

This checks 5 specific, real attack classes, each modeled on a named,
disclosed incident or a live spec requirement: general MCP tool-poisoning
research (rug pull), the MCP spec's own tool-annotation design intent
(unannotated destructive tools), a real open finding on a live litellm PR
adding MCP guardrails (oversized payloads), RufRoot/CVE-2026-59726
(unauthenticated exposure), and the MCP authorization spec's own
MUST-validate-audience requirement (token audience validation — note this
uses an unsigned probe token, so it catches missing validation entirely,
not full RFC 9068 signature+audience conformance). It does not check
prompt injection, cross-session tool-scope isolation, or anything not
listed above. A clean report means these 5 things weren't found — it is
not a certification that the server is safe.
