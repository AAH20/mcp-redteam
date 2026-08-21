# mcp-redteam

**Adversarial scenario runner for MCP servers — real checks against a live server, not a static scan of source code.**

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

---

## What this is

`mcp-redteam` connects to a live MCP server — over stdio, or over
Streamable HTTP — and runs scenarios modeled on real, disclosed MCP
incidents:

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
4. **`unauthenticated-tool-exposure`** *(HTTP targets only)* — makes an
   independent, credential-free connection attempt to the target and
   checks whether it returns tools from `tools/list` anyway. Modeled
   directly on RufRoot (CVE-2026-59726): Ruflo's MCP bridge exposed 233
   tools over HTTP with zero authentication, giving full command execution
   from a single unauthenticated request. Runs alongside — and
   independently of — the scenarios above, including when the primary
   (credentialed) connection fails.
5. **`token-audience-validation`** *(HTTP targets only)* — makes another
   independent connection attempt, this time presenting a syntactically
   JWT-shaped but unsigned bearer token whose `aud` claim names an
   unrelated resource, and checks whether the server accepts it. The MCP
   authorization spec requires servers to validate that a token was
   actually issued for them (RFC 9068's audience claim) — this checks the
   floor of that: does the server look at the token's claims at all, or
   does it just check that *some* Authorization header is present?

## What this is not

- **Not a static scanner.** It doesn't read source code; it drives the
  real MCP protocol against a running server, the same way an agent would.
- **Not full OAuth conformance testing.** `token-audience-validation`
  doesn't forge a token a real issuer would sign — it can't, without a
  trusted signing key it has no business having. A server that checks the
  audience claim but not the signature would incorrectly pass this check.
  It catches the shallower, more common failure (no meaningful validation
  at all), not full RFC 9068 conformance.
- **Not prompt-injection testing.** Out of scope; existing tools (garak,
  PyRIT, promptfoo) already cover that surface well.
- **Not a certification.** A clean report means these specific things
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

# HTTP target — also runs unauthenticated-tool-exposure automatically
mcp-redteam scan --url http://localhost:3001/mcp

# HTTP target with credentials for the other scenarios (exposure always
# connects with none, regardless of --header)
mcp-redteam scan --url http://localhost:3001/mcp --header "Authorization: Bearer sk-..."
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
- **Unauthenticated tool exposure**: RufRoot (CVE-2026-59726, CVSS 10.0) —
  Noma Security disclosed that Ruflo's MCP bridge accepted tool calls with
  zero authentication on port 3001, giving unauthenticated remote command
  execution. Disclosed June 30, 2026; fixed within 24 hours.
- **Token audience validation**: the MCP spec's own confused-deputy issue
  (`modelcontextprotocol/modelcontextprotocol#333`) closed in 2025 with an
  explicit MUST-validate-audience requirement — but the requirement being
  in the spec doesn't mean real servers enforce it. No automated tool
  checked whether they actually do before this.

## Tested against a real server, not just fixtures

Development caught several real bugs, not hypotheticals:

- `unannotated-destructive-tools` initially matched the substring
  `"format"` inside `"information"` when run against the official
  `@modelcontextprotocol/server-everything` reference server — fixed with
  word-boundary matching, with a regression test.
- An explicit `destructiveHint: false` was being treated the same as "no
  annotation at all" — fixed the same way.
- Building the HTTP fixture server hit a real, currently-open regression
  in `@modelcontextprotocol/sdk`'s stateless `StreamableHTTPServerTransport`
  (`modelcontextprotocol/typescript-sdk#1994`): reusing one transport
  instance across requests makes every request after the first return a
  bare `500` with no catchable error. Reproduced with both raw `node:http`
  and Express before tracing it to the known issue; worked around by
  following the SDK's own documented pattern — a fresh transport per
  request in stateless mode.
- A rug-pull fixture used a fixed 50ms timer to mutate a tool's
  description mid-test; under real system load, process spawn + MCP
  handshake + the first `listTools()` call sometimes took longer than
  that, so the mutation landed before the "before" snapshot was even
  taken — a real, observed intermittent test failure, not a hypothetical
  one. Fixed by widening the margin (200ms fixture timer, 500ms test
  delay) rather than leaving it flaky.

## Tests

```bash
npm test
```

15/15 pass, exercising both the positive and negative case for every
scenario against real MCP servers (stdio and HTTP, both built for the
test suite using the official `@modelcontextprotocol/sdk`), plus scenario
selection in the runner — including that the HTTP-only scenarios still run
when the primary credentialed connection fails.

## Architecture

```
mcp-redteam/
├── src/
│   ├── client.ts                    # connects to a target MCP server over stdio
│   ├── http-client.ts               # connects to a target MCP server over Streamable HTTP
│   ├── unsigned-jwt.ts              # builds a syntactically JWT-shaped, unsigned probe token
│   ├── runner.ts                    # orchestrates scenarios, collects results
│   ├── report.ts                    # console/JSON formatting
│   ├── cli.ts                       # mcp-redteam scan ...
│   └── scenarios/
│       ├── tool-description-stability.ts
│       ├── unannotated-destructive-tools.ts
│       ├── oversized-payload.ts
│       ├── unauthenticated-tool-exposure.ts
│       └── token-audience-validation.ts
└── tests/
    ├── fixtures/fixture-server.ts        # real stdio MCP server, mode-switched
    ├── fixtures/http-fixture-server.ts   # real HTTP MCP server, mode-switched
    └── *.test.ts
```

## Roadmap

Not shipped yet, deliberately: cross-session tool-scope isolation (does a
compromised or manipulated response in one session ever leak trust into
another), and real signed-token audience validation (needs a trusted test
issuer, not just an unsigned probe). These need more careful safety design
before being invasive-by-default the way `oversized-payload` already is
opt-in.

## License

Apache-2.0

## Author

**Ahmed Hassan**
* LinkedIn: [Ahmed Hassan](https://eg.linkedin.com/in/ahmed-hassan-f11)
* Platform: [A2Z SOC](https://a2zsoc.com)
