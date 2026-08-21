export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface Finding {
  scenario: string;
  severity: Severity;
  tool?: string;
  message: string;
  detail?: string;
}

export interface ScenarioResult {
  scenario: string;
  findings: Finding[];
  /** Set when the scenario itself failed to run (e.g. transport error), distinct from finding nothing. */
  error?: string;
}

export interface ToolSnapshot {
  name: string;
  description?: string;
  inputSchema: unknown;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}
