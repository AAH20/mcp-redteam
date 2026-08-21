import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ToolSnapshot } from "./types.js";

export interface TargetServerParams {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * Connects to a target MCP server over stdio and returns a ready client
 * plus a disconnect function. The caller owns the client's lifecycle.
 */
export async function connectToTarget(
  params: TargetServerParams,
): Promise<{ client: Client; disconnect: () => Promise<void> }> {
  const transport = new StdioClientTransport({
    command: params.command,
    args: params.args ?? [],
    env: params.env,
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

export async function listToolSnapshots(client: Client): Promise<ToolSnapshot[]> {
  const result = await client.listTools();
  return result.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
  }));
}
