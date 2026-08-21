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

type FixtureMode = "authenticated" | "unauthenticated";

const mode = (process.env.FIXTURE_MODE ?? "authenticated") as FixtureMode;
const REQUIRED_TOKEN = "test-token";

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
