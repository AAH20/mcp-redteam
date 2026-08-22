import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { connectToTarget } from "../src/client.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "fixtures", "fixture-server.js");
const HTTP_FIXTURE_PATH = path.join(__dirname, "fixtures", "http-fixture-server.js");

function inheritedEnv(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = { ...extra };
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !(key in env)) env[key] = value;
  }
  return env;
}

export async function connectToFixture(
  mode: "stable" | "rug-pull" | "unannotated-destructive" | "bounded" | "unbounded",
): Promise<{ client: Client; disconnect: () => Promise<void> }> {
  return connectToTarget({
    command: process.execPath,
    args: [FIXTURE_PATH],
    env: inheritedEnv({ FIXTURE_MODE: mode }),
  });
}

/**
 * Spawns the HTTP fixture server and resolves once it has printed its
 * assigned port. Caller is responsible for killing the returned process.
 */
export async function startHttpFixture(
  mode:
    | "authenticated"
    | "unauthenticated"
    | "audience-blind"
    | "audience-validating"
    | "call-not-gated"
    | "call-gated",
): Promise<{ baseUrl: string; stop: () => void }> {
  const child: ChildProcess = spawn(process.execPath, [HTTP_FIXTURE_PATH], {
    env: inheritedEnv({ FIXTURE_MODE: mode }),
    stdio: ["ignore", "pipe", "inherit"],
  });

  const port = await new Promise<number>((resolve, reject) => {
    if (!child.stdout) {
      reject(new Error("http fixture: no stdout"));
      return;
    }
    const rl = createInterface({ input: child.stdout });
    const timeout = setTimeout(() => {
      rl.close();
      reject(new Error("http fixture: timed out waiting for PORT= line"));
    }, 5000);
    rl.on("line", (line) => {
      const match = /^PORT=(\d+)$/.exec(line.trim());
      if (match?.[1]) {
        clearTimeout(timeout);
        rl.close();
        resolve(Number(match[1]));
      }
    });
    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  return {
    baseUrl: `http://127.0.0.1:${port}/mcp`,
    stop: () => {
      child.kill();
    },
  };
}
