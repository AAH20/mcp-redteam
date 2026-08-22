/**
 * A real MCP-over-HTTP server used only by the test suite, mode-switched by
 * FIXTURE_MODE like fixture-server.ts. Listens on an OS-assigned free port
 * and prints "PORT=<n>" to stdout once ready, so the test harness (which
 * spawns this as a child process) knows where to connect.
 *
 * A fresh StreamableHTTPServerTransport (and McpServer) is constructed per
 * request, per the SDK's own documented stateless pattern
 * (examples/server/simpleStatelessStreamableHttp.ts). Reusing one
 * transport instance across requests hits a real, confirmed SDK
 * regression as of this SDK version — every non-initialize request after
 * the first returns a bare 500 with no catchable error
 * (modelcontextprotocol/typescript-sdk#1994). Found the hard way during
 * development: reproduced with both raw node:http and Express before
 * tracing it to a known, open upstream issue.
 */
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

type FixtureMode =
  | "authenticated"
  | "unauthenticated"
  | "audience-blind"
  | "audience-validating"
  | "call-not-gated"
  | "call-gated";

const mode = (process.env.FIXTURE_MODE ?? "authenticated") as FixtureMode;
const REQUIRED_TOKEN = "test-token";
const EXPECTED_AUDIENCE = "https://mcp-redteam-fixture.example.com";

/** Decodes a bearer token's payload segment without verifying its signature. */
function decodeJwtPayload(bearerToken: string): Record<string, unknown> | undefined {
  const parts = bearerToken.split(".");
  if (parts.length !== 3 || !parts[1]) return undefined;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
}

function buildServer(): McpServer {
  const mcpServer = new McpServer({ name: "mcp-redteam-http-fixture", version: "0.1.0" });
  mcpServer.registerTool(
    "get_status",
    {
      description: "Report service status",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => ({ content: [{ type: "text", text: "ok" }] }),
  );
  return mcpServer;
}

const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  if (mode === "authenticated") {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${REQUIRED_TOKEN}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
  }

  if (mode === "audience-blind") {
    // Shallow, real-world-shaped bug: checks a header is present, never
    // looks at what it actually contains.
    if (!req.headers.authorization) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
  }

  if (mode === "audience-validating") {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    const claims = bearerToken ? decodeJwtPayload(bearerToken) : undefined;
    if (!claims || claims.aud !== EXPECTED_AUDIENCE) {
      res.status(401).json({ error: "unauthorized", detail: "token audience mismatch" });
      return;
    }
  }

  if (mode === "call-not-gated" || mode === "call-gated") {
    // initialize is never gated — the connection itself must succeed for
    // either method to even be reachable. call-gated checks tools/list AND
    // tools/call consistently; call-not-gated checks tools/list but skips
    // the same check for tools/call, mirroring wso2/api-platform#2869
    // (GET/DELETE not gated while other methods were) and the general
    // shape of litellm#31977/#36358 (list-path auth doesn't carry through
    // to the call path).
    const method = req.body?.method;
    const gatedMethods = mode === "call-gated" ? ["tools/list", "tools/call"] : ["tools/list"];
    if (gatedMethods.includes(method) && req.headers.authorization !== `Bearer ${REQUIRED_TOKEN}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
  }

  // "unauthenticated" mode: no check at all, mirroring RufRoot's actual bug.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
  });
  const mcpServer = buildServer();
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const server = app.listen(0, "127.0.0.1", () => {
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  console.log(`PORT=${port}`);
});
