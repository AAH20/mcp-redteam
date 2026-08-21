import { fileURLToPath } from "node:url";
import path from "node:path";
import { connectToTarget } from "../src/client.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "fixtures", "fixture-server.js");

export async function connectToFixture(
  mode: "stable" | "rug-pull" | "unannotated-destructive" | "bounded" | "unbounded",
): Promise<{ client: Client; disconnect: () => Promise<void> }> {
  const env: Record<string, string> = { FIXTURE_MODE: mode };
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }

  return connectToTarget({
    command: process.execPath,
    args: [FIXTURE_PATH],
    env,
  });
}
