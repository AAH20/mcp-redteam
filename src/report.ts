import type { ScenarioResult, Severity } from "./types.js";

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export function formatConsole(results: ScenarioResult[]): string {
  const lines: string[] = [];
  let totalFindings = 0;

  for (const result of results) {
    if (result.error) {
      lines.push(`[${result.scenario}] ERROR: ${result.error}`);
      continue;
    }
    if (result.findings.length === 0) {
      lines.push(`[${result.scenario}] no findings`);
      continue;
    }
    const sorted = [...result.findings].sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
    );
    for (const finding of sorted) {
      totalFindings += 1;
      const toolPart = finding.tool ? ` (${finding.tool})` : "";
      lines.push(`[${result.scenario}] ${finding.severity.toUpperCase()}${toolPart}: ${finding.message}`);
      if (finding.detail) {
        lines.push(
          finding.detail
            .split("\n")
            .map((l) => `    ${l}`)
            .join("\n"),
        );
      }
    }
  }

  lines.push("");
  lines.push(`${totalFindings} finding(s) across ${results.length} scenario(s).`);
  return lines.join("\n");
}

export function formatJson(results: ScenarioResult[]): string {
  return JSON.stringify(results, null, 2);
}

export function hasHighSeverityFinding(results: ScenarioResult[]): boolean {
  return results.some((r) =>
    r.findings.some((f) => f.severity === "critical" || f.severity === "high"),
  );
}
