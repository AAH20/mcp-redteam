import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/**
 * Connects to a target MCP server over Streamable HTTP. `headers` are sent
 * as-is via the transport's requestInit — pass none to test how the server
 * behaves with no credentials at all.
 */
export async function connectToHttpTarget(
  url: string,
  opts: { headers?: Record<string, string> } = {},
): Promise<{ client: Client; disconnect: () => Promise<void> }> {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: opts.headers ? { headers: opts.headers } : undefined,
  });

  const client = new Client(
    { name: "mcp-redteam", version: "0.1.0" },
    { capabilities: {} },
  );

  await client.connect(transport);

  return {
    client,
    disconnect: async () => {
      await client.close();
    },
  };
}
