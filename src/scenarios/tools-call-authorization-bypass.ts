import type { Finding } from "../types.js";
import { connectToHttpTarget } from "../http-client.js";

export const SCENARIO_NAME = "tools-call-authorization-bypass";

/**
 * Modeled on a pattern that shows up independently across several real,
 * currently-open issues: authorization enforced on one MCP operation isn't
 * carried through to another. wso2/api-platform#2869 found GET/DELETE
 * simply weren't gated while other methods were; litellm#31977 and
 * litellm#36358 both show tools/list behaving correctly while the actual
 * tools/call path silently breaks or skips the real credential. Three
 * independent, funded organizations, same underlying shape: the operation
 * that actually matters (invoking a tool) isn't checked as rigorously as
 * the one that merely enumerates them.
 *
 * This makes an independent, credential-free connection and attempts a
 * direct tools/call on a tool name already known to be real (learned from
 * the primary, legitimately-connected client — this scenario can't do
 * anything useful without at least one known tool name, since guessing
 * tool names isn't a meaningful security test). It deliberately does not
 * call tools/list first on this connection: the point is to test the call
 * path's own enforcement, not to re-derive what unauthenticated-tool-
 * exposure already checks.
 *
 * If the target has no known tool name (e.g. the primary connection also
 * failed), this scenario has nothing to probe and reports no findings —
 * it does not guess.
 */
export async function runToolsCallAuthorizationBypass(
  url: string,
  knownToolNames: string[],
): Promise<Finding[]> {
  const toolName = knownToolNames[0];
  if (!toolName) return [];

  let client;
  let disconnect: (() => Promise<void>) | undefined;
  try {
    ({ client, disconnect } = await connectToHttpTarget(url, { headers: {} }));
  } catch {
    // Even the connection itself was rejected without credentials — the
    // call path can't be less strict than a connection that never
    // happened. Pass case.
    return [];
  }

  try {
    const result = await client.callTool({ name: toolName, arguments: {} });
    return [
      {
        scenario: SCENARIO_NAME,
        severity: "critical",
        tool: toolName,
        message: `Server accepted an unauthenticated tools/call for a known tool ('${toolName}') with no credentials presented`,
        detail: `result: ${JSON.stringify(result).slice(0, 300)}`,
      },
    ];
  } catch {
    // Rejected — the call path enforces at least as strictly as expected.
    return [];
  } finally {
    await disconnect();
  }
}
